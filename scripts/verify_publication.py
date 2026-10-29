"""Independently reconcile the published workspace against the brokerage CSVs."""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path


def money(value):
    value=(value or '').replace('$','').replace(',','').replace('%','').strip()
    return Decimal(value) if value not in ('','--','N/A') else Decimal(0)


def account(value):
    match=re.search(r'(Limit(?:_| )Liability(?:_| )Company|Individual)\s+\.\.\.(\d+)',value)
    return (('Individual' if match[1]=='Individual' else 'Limit_Liability_Company')+' ...'+match[2]) if match else None


def verify(folder, data):
    workspace=json.loads((data/'workspace.json').read_text())
    state=workspace['state']; expected={}; histories={}; trades=defaultdict(list)
    for path in sorted(folder.iterdir()):
        if path.suffix.lower()!='.csv': continue
        rows=list(csv.reader(path.open(encoding='utf-8-sig')))
        if 'positions' in path.name.lower():
            current=None; headers=None
            for row in rows:
                if not row: continue
                found=account(row[0])
                if found:
                    current=found;expected[current]={'positions':[],'cash':0,'total':0,'cost':0};headers=None;continue
                if row[0]=='Symbol': headers=row;continue
                if not current or not headers: continue
                record=dict(zip(headers,row))
                if row[0].startswith('Cash'):
                    expected[current]['cash']=float(money(record.get('Mkt Val (Market Value)')))
                elif row[0] in ('Positions Total','Account Total'):
                    expected[current]['total']=float(money(record.get('Mkt Val (Market Value)')))
                    expected[current]['cost']=float(money(record.get('Cost Basis')))
                elif money(record.get('Qty (Quantity)')):
                    expected[current]['positions'].append((row[0],float(money(record.get('Qty (Quantity)'))),float(money(record.get('Mkt Val (Market Value)'))),float(money(record.get('Cost Basis')))))
        elif 'balances' in path.name.lower():
            suffix=re.search(r'XXXX(\d+)',path.name)[1]
            histories['Limit_Liability_Company ...'+suffix]=[[datetime.strptime(r[0],'%m/%d/%Y').strftime('%Y-%m-%d'),float(money(r[1]))] for r in rows[1:] if r and r[0].strip()]
        elif 'realized' in path.name.lower():
            current=None;headers=None
            for row in rows:
                if not row: continue
                found=account(row[0])
                if found: current=found;headers=None;continue
                if row[0]=='Symbol': headers=row;continue
                if not current or not headers: continue
                record=dict(zip(headers,row))
                try: datetime.strptime(record.get('Closed Date',''),'%m/%d/%Y')
                except ValueError: continue
                trades[current].append(float(money(record.get('Gain/Loss ($)'))))
    assert set(expected)==set(state['accounts']), 'Account list mismatch'
    report=[]
    for name, truth in expected.items():
        actual=state['accounts'][name]
        for field in ('cash','total','cost'):
            assert abs(actual[field]-truth[field])<.011, f'{name}: {field} mismatch'
        actual_positions=Counter((p['symbol'],p['qty'],p['mktVal'],p['costBasis']) for p in actual['positions'])
        assert actual_positions==Counter(truth['positions']), f'{name}: holdings mismatch'
        if name in histories:
            histories[name].sort(key=lambda row: row[0])
            assert state['balanceHistory'][name]==histories[name], f'{name}: history mismatch'
        actual_trades=[t for t in state['realizedTrades'] if t['account']==name]
        assert len(actual_trades)==len(trades[name]), f'{name}: realized count mismatch'
        assert abs(sum(t['gain'] for t in actual_trades)-sum(trades[name]))<.011, f'{name}: realized P/L mismatch'
        report.append({'account':name,'positions':len(truth['positions']),'position_value':truth['total'],'latest_balance':histories.get(name,[[None,None]])[-1][1],'realized_lots':len(actual_trades),'realized_pl':round(sum(trades[name]),2)})
    payload={'as_of':workspace['as_of'],'verified_accounts':len(report),'positions':sum(r['positions'] for r in report),'realized_lots':sum(r['realized_lots'] for r in report),'accounts':report}
    (data/'verification.json').write_text(json.dumps(payload,indent=2)+'\n')
    lines=['# Portfolio publication verification', '', f'Data as of {workspace["as_of"]}. All source comparisons passed.', '', '| Account | Holdings | Position export value | Latest balance | Realized lots | Realized P/L |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for row in report:
        balance='—' if row['latest_balance'] is None else f"${row['latest_balance']:,.2f}"
        lines.append(f"| {row['account']} | {row['positions']} | ${row['position_value']:,.2f} | {balance} | {row['realized_lots']} | ${row['realized_pl']:,.2f} |")
    lines.extend(['', 'Position exports are intraday; balance exports are end-of-day history. Their differences are retained.', 'All holdings quantities, market values and cost bases, complete balance histories, and realized totals were independently reconciled.', '', 'Existing analytics limitations: NAV-based returns can include deposits and withdrawals because these exports do not identify cash flows. The original overview unrealized G/L formula subtracts position cost from account NAV and therefore includes cash; this audit does not certify that figure as investment profit. Sector overrides, entry dates and attribution settings are not supplied by these CSVs.'])
    (data/'verification.md').write_text('\n'.join(lines)+'\n')
    print(f"Reconciled {len(report)} accounts, {payload['positions']} positions, {payload['realized_lots']} realized lots")
    return payload


if __name__=='__main__':
    import sys
    verify(Path(sys.argv[1]),Path(sys.argv[2]))
