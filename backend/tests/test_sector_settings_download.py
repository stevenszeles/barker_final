import importlib.util
import json
import os
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('sector_settings', Path(__file__).resolve().parents[2] / 'scripts/sector_settings.py')
settings = importlib.util.module_from_spec(spec)
spec.loader.exec_module(settings)


def payload(sector='Energy'):
    return {'sectorOverrides': {'...288::ABC': sector}, 'sectorTargetsByAccount': {'ALL': {'Energy': {'benchmarkWeight': 3.5, 'targetWeight': 4}}}, 'accountDisplayNames': {}}


def test_newest_numbered_download_is_retained_for_future_publications(tmp_path):
    folder=tmp_path/'CSV';folder.mkdir();downloads=tmp_path/'Downloads';downloads.mkdir()
    first=downloads/'publication-settings.json';first.write_text(json.dumps(payload('Financials')))
    newer=downloads/'publication-settings (1).json';newer.write_text(json.dumps(payload()))
    os.utime(first,(100,100));os.utime(newer,(200,200))
    assert settings.import_download(folder,downloads)==newer
    target=folder/'publication-settings.json'
    assert json.loads(target.read_text())==payload()
    assert settings.import_download(folder,downloads) is None
    assert newer.exists()


def test_manual_settings_newer_than_download_are_not_overwritten(tmp_path):
    downloads=tmp_path/'Downloads';downloads.mkdir()
    source=downloads/'publication-settings.json';source.write_text(json.dumps(payload('Financials')));os.utime(source,(100,100))
    target=tmp_path/'publication-settings.json';target.write_text(json.dumps(payload()))
    assert settings.import_download(tmp_path,downloads) is None
    assert json.loads(target.read_text())==payload()


def test_invalid_download_leaves_previous_assignments_intact(tmp_path):
    downloads=tmp_path/'Downloads';downloads.mkdir()
    target=tmp_path/'publication-settings.json';target.write_text(json.dumps(payload()));os.utime(target,(100,100))
    (downloads/'publication-settings.json').write_text('{broken')
    with pytest.raises(ValueError,match='Save sector assignments again'):
        settings.import_download(tmp_path,downloads)
    assert json.loads(target.read_text())==payload()


def test_partial_download_and_unrelated_json_are_ignored(tmp_path):
    downloads=tmp_path/'Downloads';downloads.mkdir()
    (downloads/'publication-settings.json.crdownload').write_text('partial')
    (downloads/'publication-settings-backup.json').write_text('{}')
    assert settings.import_download(tmp_path,downloads) is None


def test_extra_fields_cannot_replace_portfolio_data():
    assert settings.validate_settings({**payload(),'accounts':{'fake':{}},'format':'barker-sector-settings-v1'})==payload()
