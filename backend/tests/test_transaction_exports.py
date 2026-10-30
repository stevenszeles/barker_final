import importlib.util
from pathlib import Path
import json
import pytest

path=Path(__file__).resolve().parents[2]/'scripts/transactions.py'
spec=importlib.util.spec_from_file_location('transactions',path)
tx=importlib.util.module_from_spec(spec);spec.loader.exec_module(tx)

@pytest.mark.parametrize('action',['Buy','Sell','Cash Dividend','Credit Interest','Margin Interest','Futures MM Sweep','Reverse Split'])
def test_investment_activity_is_not_external_cash(action):
    assert tx.classify({'Action':action,'Description':''})[0] not in {'external','journal'}


def test_journal_counterparty_is_extracted():
    assert tx.classify({'Action':'Journal','Description':'JOURNAL FRM ...662'})==('journal','662')


def test_overlapping_exports_do_not_duplicate_manual_journal(tmp_path):
    data=tmp_path/'data';data.mkdir();folder=tmp_path/'csv';folder.mkdir()
    account='Limit_Liability_Company ...288'
    (data/'workspace.json').write_text(json.dumps({'as_of':'2026-10-29','state':{'accounts':{account:{}}}}))
    (data/'cash-flows.json').write_text(json.dumps({'flows':[{'account':account,'date':'2026-10-28','amount':10000}]}))
    row={'Date':'10/28/2026','Action':'Journal','Description':'JOURNAL FRM ...662','Amount':'$10,000.00'}
    payload={'FromDate':'04/30/2026','ToDate':'10/30/2026','BrokerageTransactions':[row,{'Date':'10/30/2026','Action':'Deposit','Amount':'$50.00'}]}
    for name in ['one','two']:(folder/f'Company_XXX288_Transactions_{name}.json').write_text(json.dumps(payload))
    audit=tx.prepare(folder,data)
    assert len(json.loads((data/'cash-flows.json').read_text())['flows'])==1
    assert sum(row['included_records'] for row in audit['files'])==1
    assert audit['cash_flow_coverage']=='partial'


def test_date_annotation_is_not_silently_confused_with_posting_date():
    assert tx.iso('10/19/2026 as of 10/16/2026')=='2026-10-19'
    with pytest.raises(ValueError):tx.iso('not a date')


def test_identical_real_deposits_are_retained_but_overlapping_file_is_not(tmp_path):
    data=tmp_path/'data';data.mkdir();folder=tmp_path/'csv';folder.mkdir()
    account='Company ...288'
    (data/'workspace.json').write_text(json.dumps({'as_of':'2026-10-29','state':{'accounts':{account:{}}}}))
    (data/'cash-flows.json').write_text(json.dumps({'flows':[]}))
    row={'Date':'10/28/2026','Action':'Deposit','Amount':'$50.00'}
    payload={'FromDate':'04/30/2026','ToDate':'10/30/2026','BrokerageTransactions':[row,row]}
    for name in ['one','two']:(folder/f'Company_XXX288_Transactions_{name}.json').write_text(json.dumps(payload))
    tx.prepare(folder,data)
    assert len(json.loads((data/'cash-flows.json').read_text())['flows'])==2
    tx.prepare(folder,data)
    assert len(json.loads((data/'cash-flows.json').read_text())['flows'])==2
