"""Read Schwab transaction exports without treating trading cash as external flows."""
from collections import Counter
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re


def iso(value):
    match=re.fullmatch(r'(\d{1,2}/\d{1,2}/\d{4})(?:\s+as of\s+\d{1,2}/\d{1,2}/\d{4})?',value.strip(),re.I)
    if not match: raise ValueError(f'Unsupported transaction date: {value}')
    return datetime.strptime(match[1], '%m/%d/%Y').date().isoformat()


def amount(value):
    text=str(value or '').replace('$','').replace(',','').strip()
    if not text: return 0.0
    if text.startswith('(') and text.endswith(')'): text='-'+text[1:-1]
    return float(Decimal(text))


def classify(row):
    action=row.get('Action','').strip().lower()
    description=row.get('Description','')
    if action=='journal':
        counter=re.search(r'\.{3}(\d+)',description)
        return ('journal',counter[1] if counter else None)
    if action in {'cash deposit','deposit','withdrawal','cash withdrawal','wire received','wire sent','moneylink transfer','ach deposit','ach withdrawal'}:
        return ('external',None)
    if action in {'futures mm sweep','reinvest dividend','reinvest shares'}: return ('internal',None)
    if action in {'cash dividend','non-qualified div','qualified dividend','credit interest','margin interest','cash in lieu'}: return ('income_or_expense',None)
    if action in {'buy','sell','buy to open','sell to open','buy to close','sell to close','sell short','buy to cover','expired','assigned','assignment','exercise'}: return ('trade',None)
    if action in {'reverse split','stock split','spin-off','stock dividend','name change'}: return ('corporate_action',None)
    return ('review',None)


def prepare(folder, data):
    workspace=json.loads((data/'workspace.json').read_text())
    asof=workspace['as_of']; accounts=workspace['state']['accounts']
    names={name.rsplit('...',1)[-1]:name for name in accounts}
    config_path=data/'cash-flows.json'
    config=json.loads(config_path.read_text())
    local=folder/'cash-flows.json'
    if local.exists(): config=json.loads(local.read_text())
    # A prior generated import is replaced, while manually supplied flows survive.
    flows=[flow for flow in config.get('flows',[]) if flow.get('source')!='transaction_export']
    manual_matches=Counter((flow["account"],flow["date"],round(flow["amount"],2)) for flow in flows)
    seen=set(); summaries=[]; review=[]; categories=Counter()
    for path in sorted(folder.glob('*Transactions*.json')):
        suffix=re.search(r'_X{3,4}(\d+)_',path.name,re.I)
        if not suffix or suffix[1] not in names: raise ValueError(f'Transaction account not recognized: {path.name}')
        account=names[suffix[1]]; export=json.loads(path.read_text())
        rows=export.get('BrokerageTransactions')
        if not isinstance(rows,list): raise ValueError(f'Unsupported transaction structure: {path.name}')
        occurrences=Counter(); included=0; future=0; file_categories=Counter()
        for row in rows:
            day=iso(row['Date']); cash=amount(row.get('Amount'))
            fingerprint=json.dumps(row,sort_keys=True)
            occurrences[fingerprint]+=1
            key=(account,fingerprint,occurrences[fingerprint])
            if key in seen: continue
            seen.add(key)
            if day>asof: future+=1;continue
            if day<iso(export['FromDate']) or day>iso(export['ToDate']): raise ValueError('Transaction outside export coverage')
            included+=1;kind,counter=classify(row); categories[kind]+=1;file_categories[kind]+=1
            if kind=='external' or (kind=='journal' and counter):
                if 'as of' in row['Date'].lower():
                    review.append({'account':account,'date':day,'action':row['Action'],'reason':'Posting and effective dates differ; confirm cash-flow date before adjustment'})
                    continue
                if abs(cash)<.000001:
                    review.append({'account':account,'date':day,'action':row['Action'],'reason':'Transfer lacks a cash valuation; in-kind movement needs review'})
                    continue
                manual_key=(account,day,round(cash,2))
                if manual_matches[manual_key]:
                    manual_matches[manual_key]-=1
                    continue
                flow={'account':account,'date':day,'amount':cash,'source':'transaction_export','timing':'end_of_day_assumed'}
                if counter:
                    flow['counterparty_account']=names.get(counter,'...'+counter)
                    flow['internal']=counter in names
                flows.append(flow)
            elif kind in {'journal','review','corporate_action'}:
                review.append({'account':account,'date':day,'action':row['Action'],'reason':'Review classification or corporate-action valuation; not automatically counted as a cash flow'})
        summaries.append({'account':account,'from':iso(export['FromDate']),'through':min(iso(export['ToDate']),asof),'included_records':included,'excluded_after_snapshot':future,'categories':dict(file_categories),'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    for flow in flows:
        if flow.get('internal'):
            match=any(other['account']==flow['counterparty_account'] and other['date']==flow['date'] and abs(other['amount']+flow['amount'])<.005 for other in flows)
            if not match: review.append({'account':flow['account'],'date':flow['date'],'action':'Journal','reason':'Counterparty leg is not verified; aggregate adjustment excludes this internal movement'})
    config.update(coverage='partial',timing='end_of_day_assumed',flows=flows)
    config_path.write_text(json.dumps(config,indent=2)+'\n')
    audit={'as_of':asof,'cash_flow_coverage':'partial','files':summaries,'categories':dict(categories),'review':review,'note':'Transaction files do not cover every account or the full valuation history. Income, fees, trades and futures sweeps are not external flows.'}
    (data/'transaction-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(f'Transactions: {sum(row["included_records"] for row in summaries)} records through {asof}; {len(review)} review items')
    return audit
