import sys
from pathlib import Path
import json
import zipfile
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from tracking_ledger import reconcile_quantities
from transactions import canonical_transaction
from update_bundle import stage_bundle, accept_bundle
from publication_history import archive_release
from restore_dashboard import validate_release


def state(qty):return {'accounts':{'Company ...123':{'positions':[{'symbol':'ABC','qty':qty}]}}}


def test_independent_snapshots_reconcile_shorts_and_expose_missing_activity():
    event={'date':'2026-11-04','action':'Buy to Cover','account':'Company ...123','symbol':'ABC','quantity':2,'classification':'trade'}
    assert reconcile_quantities(state(-5),state(-3),[event],'2026-11-02','2026-11-04')['status']=='quantities_match'
    assert reconcile_quantities(state(-5),state(-2),[event],'2026-11-02','2026-11-04')['quantity_differences'][0]['difference']==1


def test_expiry_needs_review_instead_of_inventing_performance():
    event={'date':'2026-11-04','action':'Expired','account':'Company ...123','symbol':'ABC','quantity':2,'classification':'trade'}
    result=reconcile_quantities(state(2),state(0),[event],'2026-11-02','2026-11-04')
    assert result['status']=='needs_review' and len(result['unresolved_events'])==1


def test_csv_json_formats_deduplicate():
    row={'Date':'11/04/2026','Action':'Buy','Symbol':'ABC','Quantity':'1','Price':'$20.00','Amount':'-$20.01','Fees & Comm':'$0.01'}
    other={**row,'Quantity':'1.000','Price':'20','FeesAndComm':'.01'};del other['Fees & Comm']
    assert canonical_transaction(row)==canonical_transaction(other)


def test_bundle_staging_preserves_originals_and_repeat_import_is_skipped(tmp_path):
    folder=tmp_path/'inputs';folder.mkdir();downloads=tmp_path/'downloads';downloads.mkdir()
    old=folder/'All-Accounts-Positions-old.csv';old.write_text('old')
    with zipfile.ZipFile(downloads/'barker-update.zip','w') as a:
        a.writestr('barker-update.json',json.dumps({'format':'barker-update-v1'}));a.writestr('All-Accounts-Positions-new.csv','new')
    stage=stage_bundle(folder,downloads);assert old.read_text()=='old';accept_bundle(stage,folder)
    assert not old.exists();assert (folder/'All-Accounts-Positions-new.csv').read_text()=='new'
    assert stage_bundle(folder,downloads)==folder
    assert list((folder/'archive').glob('*/All-Accounts-Positions-old.csv'))


def test_zip_path_traversal_rejected(tmp_path):
    folder=tmp_path/'inputs';folder.mkdir();downloads=tmp_path/'downloads';downloads.mkdir()
    with zipfile.ZipFile(downloads/'barker-update.zip','w') as a:a.writestr('../bad.csv','bad')
    with pytest.raises(ValueError,match='path'):stage_bundle(folder,downloads)
    assert not (tmp_path/'bad.csv').exists()


def test_saved_release_is_verified_before_restoring(tmp_path):
    import hashlib
    data=tmp_path/'data';data.mkdir();(data/'workspace.json').write_text('{}')
    release={'id':'a'*64,'as_of':'2026-11-04','files':{'workspace.json':hashlib.sha256(b'{}').hexdigest()}}
    (data/'publication.json').write_text(json.dumps(release));archive_release(data,tmp_path/'releases');source=tmp_path/'releases'/release['id']
    assert validate_release(source)==release
    (source/'workspace.json').write_text('changed')
    with pytest.raises(ValueError):validate_release(source)


def test_ledger_keeps_repeated_real_trades_without_duplicating_reimports(tmp_path):
    from tracking_ledger import prepare
    folder=tmp_path/'input';folder.mkdir();data=tmp_path/'data';data.mkdir()
    current={'as_of':'2026-11-04','state':{'accounts':{'Company ...123':{'positions':[],'cash':100,'total':100}},'balanceHistory':{},'sectorOverrides':{}}}
    (data/'workspace.json').write_text(json.dumps(current));(data/'transaction-audit.json').write_text(json.dumps({'review':[],'cash_flow_coverage':'partial'}))
    row={'Date':'11/04/2026','Action':'Buy','Symbol':'ABC','Quantity':'1','Amount':'-$5'}
    (folder/'Company_XXX123_Transactions_a.json').write_text(json.dumps({'BrokerageTransactions':[row,row]}))
    database=tmp_path/'events.sqlite3'
    assert prepare(folder,data,database)['transaction_records']==2
    assert prepare(folder,data,database)['transaction_records']==2


def test_external_bundle_cannot_silently_pick_one_of_two_positions_files(tmp_path):
    folder=tmp_path/'inputs';folder.mkdir();downloads=tmp_path/'downloads';downloads.mkdir()
    with zipfile.ZipFile(downloads/'barker-update.zip','w') as a:
        a.writestr('barker-update.json',json.dumps({'format':'barker-update-v1'}))
        a.writestr('All-Accounts-Positions-one.csv','one');a.writestr('All-Accounts-Positions-two.csv','two')
    with pytest.raises(ValueError,match='one export'):stage_bundle(folder,downloads)
