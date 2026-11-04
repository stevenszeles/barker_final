"""Retain source events and independent snapshots; never infer missing opening holdings."""
import csv
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal
from transactions import iso, amount, classify, canonical_transaction


def transaction_rows(path):
    if path.suffix.lower() == '.json':
        return json.loads(path.read_text())['BrokerageTransactions']
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return [row for row in csv.DictReader(stream) if row.get('Date', '').strip()]


def normalize_symbol(symbol):
    return re.sub(r'\s+', ' ', str(symbol or '').strip().upper())


def reconcile_quantities(opening, closing, events, start, end):
    """Compare independent snapshots. Intraday boundaries cannot establish daily reconciliation."""
    expected = defaultdict(Decimal)
    actual = defaultdict(Decimal)
    for state, target in [(opening, expected), (closing, actual)]:
        for name, account in state['accounts'].items():
            for position in account.get('positions', []):
                target[(name, normalize_symbol(position['symbol']))] += Decimal(str(position['qty']))
    unsupported = []
    signs = {'buy': 1, 'buy to open': 1, 'buy to close': 1, 'buy to cover': 1,
             'sell': -1, 'sell to open': -1, 'sell to close': -1, 'sell short': -1}
    for event in events:
        if not start < event['date'] <= end:
            continue
        action = event['action'].lower()
        if action in signs and event['symbol']:
            expected[(event['account'], event['symbol'])] += abs(Decimal(str(event['quantity']))) * signs[action]
        elif event['classification'] in {'trade', 'corporate_action', 'review', 'journal'}:
            unsupported.append({key: event[key] for key in ('account', 'date', 'action', 'symbol')})
    differences = []
    for key in sorted(set(expected) | set(actual)):
        if abs(expected[key] - actual[key]) > Decimal('0.000001'):
            differences.append({'account': key[0], 'symbol': key[1], 'expected': float(expected[key]),
                                'actual': float(actual[key]), 'difference': float(actual[key] - expected[key])})
    return {'from': start, 'through': end, 'quantity_differences': differences,
            'unresolved_events': unsupported, 'matched_positions': sum(abs(expected[k] - actual[k]) <= Decimal('0.000001') for k in set(expected) | set(actual)),
            'status': 'needs_review' if differences or unsupported else 'quantities_match',
            'note': 'Snapshots are intraday. Export times and trade posting cutoffs are not verified; matching quantities alone does not verify cash or performance.'}


def prepare(folder, data, database, seed_paths=()):
    database.parent.mkdir(parents=True, exist_ok=True)
    current = json.loads((data / 'workspace.json').read_text())
    asof = current['as_of']
    account_names = {name.rsplit('...', 1)[-1]: name for name in current['state']['accounts']}
    with sqlite3.connect(database) as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, account TEXT, date TEXT, payload TEXT);
        CREATE TABLE IF NOT EXISTS sources(hash TEXT PRIMARY KEY, name TEXT, imported_at TEXT);
        CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, asof TEXT, payload TEXT, imported_at TEXT);
        CREATE TABLE IF NOT EXISTS sector_assignments(snapshot_id TEXT, key TEXT, sector TEXT, effective_date TEXT, PRIMARY KEY(snapshot_id,key));''')
        now = datetime.now(timezone.utc).isoformat()
        for path in sorted(folder.glob('*Transactions*')):
            if path.suffix.lower() not in {'.csv', '.json'}: continue
            suffix = re.search(r'_X{3,4}(\d+)_', path.name, re.I)
            if not suffix or suffix[1] not in account_names: raise ValueError(f'Unknown transaction account: {path.name}')
            account = account_names[suffix[1]]
            counts = Counter()
            for row in transaction_rows(path):
                fingerprint = canonical_transaction(row)
                counts[fingerprint] += 1
                identity = hashlib.sha256(json.dumps([account, fingerprint, counts[fingerprint]]).encode()).hexdigest()
                event = {'id': identity, 'account': account, 'date': iso(row['Date']), 'action': row['Action'].strip(),
                         'symbol': normalize_symbol(row.get('Symbol')), 'quantity': amount(row.get('Quantity')),
                         'amount': amount(row.get('Amount')), 'fees': amount(row.get('Fees & Comm') or row.get('FeesAndComm')),
                         'classification': classify(row)[0], 'raw': row}
                if event['date'] <= asof:
                    db.execute('INSERT OR IGNORE INTO events VALUES (?,?,?,?)', (identity, account, event['date'], json.dumps(event)))
            db.execute('INSERT OR IGNORE INTO sources VALUES (?,?,?)', (hashlib.sha256(path.read_bytes()).hexdigest(), path.name, now))
        for snapshot in [*(json.loads(path.read_text()) for path in seed_paths if path.exists()), current]:
            identity = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
            db.execute('INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?)', (identity, snapshot['as_of'], json.dumps(snapshot), now))
            for key, sector in snapshot['state'].get('sectorOverrides', {}).items():
                db.execute('INSERT OR IGNORE INTO sector_assignments VALUES (?,?,?,?)', (identity, key, sector, snapshot['as_of']))
        events = [json.loads(row[0]) for row in db.execute('SELECT payload FROM events WHERE date<=? ORDER BY date,id', (asof,))]
        # Classification is derived from immutable source rows so rule fixes apply to retained events.
        for event in events: event['classification'] = classify(event['raw'])[0]
        snapshots = [(row[0], row[1], json.loads(row[2])) for row in db.execute('SELECT id,asof,payload FROM snapshots WHERE asof<=? ORDER BY asof,imported_at,id', (asof,))]
        prior = next((item for item in reversed(snapshots) if item[1] < asof), None)
        reconciliation = reconcile_quantities(prior[2]['state'], current['state'], events, prior[1], asof) if prior else {
            'status': 'opening_snapshot_missing', 'quantity_differences': [], 'unresolved_events': [],
            'note': 'An earlier independent positions snapshot is needed to reconcile transactions.'}
        audit = json.loads((data / 'transaction-audit.json').read_text())
        sources = list(db.execute('SELECT name,hash FROM sources ORDER BY name'))
    latest_balances = {name: rows[-1][1] for name, rows in current['state'].get('balanceHistory', {}).items() if rows and rows[-1][0] == asof}
    checks = []
    for name, account in current['state']['accounts'].items():
        holdings_total = sum(float(p.get('mktVal') or 0) for p in account.get('positions', [])) + float(account.get('cash') or 0)
        if 'futuresMarketValue' in account:
            holdings_total -= sum(float(p.get('mktVal') or 0) for p in account.get('positions', []) if p.get('source') == 'futures_statement')
        futures_balances = float(account.get('futuresCash') or 0) + float(account.get('futuresMarketValue') or 0)
        holdings_total += futures_balances
        difference = round(holdings_total - float(account.get('total') or 0), 2)
        checks.append({'account': name, 'holdings_plus_cash': round(holdings_total, 2), 'reported_total': account.get('total'),
                       'futures_balances': futures_balances, 'difference': difference, 'status': 'matched' if abs(difference) <= .02 else 'needs_review',
                       'balance_value': latest_balances.get(name), 'balance_note': 'Balance history and positions may have different valuation times.'})
    review_count = len(audit.get('review', []))
    payload = {'as_of': asof, 'status': 'needs_attention', 'source_comparisons': 'passed',
               'holdings_checks': checks, 'transaction_records': len(events), 'transaction_review_count': review_count,
               'cash_flow_coverage': audit.get('cash_flow_coverage', 'partial'), 'reconciliation': reconciliation,
               'sector_performance_status': 'unavailable',
               'performance_reason': 'Daily sector valuations, cash reconciliation, derivative settlements and transaction cutoffs are not yet verified. Target weights are never used to calculate measured returns.',
               'realized_source_date': next((re.search(r'(\d{8})-', p.name)[1] for p in folder.glob('*Realized*.csv') if re.search(r'(\d{8})-', p.name)), None),
               'history': [{'id': identity, 'as_of': day, 'accounts': len(snapshot['state']['accounts'])} for identity, day, snapshot in reversed(snapshots)],
               'source_files': [{'name': name, 'sha256': hash_} for name, hash_ in sources],
               'classification_policy': 'Sector assignments are retained with each imported snapshot. Earlier snapshots are not rewritten; changes first apply on the import date.'}
    (data / 'tracking.json').write_text(json.dumps(payload, indent=2) + '\n')
    print(f'Ledger: {len(events)} unique events; {len(snapshots)} retained snapshots; reconciliation {reconciliation["status"]}', flush=True)
    return payload
