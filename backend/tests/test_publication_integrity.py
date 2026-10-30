"""A publication is successful only when the live files and frontend match."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('publication',Path(__file__).resolve().parents[2]/'scripts/publication.py')
publication=importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


def test_confirms_assets_manifest_and_each_file(monkeypatch):
    payload=b'{"accounts":12}'
    release={'id':'test','files':{'workspace.json':hashlib.sha256(payload).hexdigest()}}
    seen=[]
    def fetch(request,timeout):
        path=request.full_url.split('?')[0];seen.append(path)
        return io.BytesIO(json.dumps(release).encode() if path.endswith('publication.json') else payload if path.endswith('workspace.json') else b'<script src="/assets/current.js"></script>')
    monkeypatch.setattr(publication,'urlopen',fetch)
    publication.wait_for_deployment('https://test',release,'<script src="/assets/current.js"></script>',timeout=1,interval=0)
    assert 'https://test/data/workspace.json' in seen


@pytest.mark.parametrize('live_index,payload',[(b'<script src="/assets/old.js"></script>',b'correct'),(b'<script src="/assets/current.js"></script>',b'corrupted')])
def test_does_not_claim_success_for_stale_assets_or_mixed_data(monkeypatch,live_index,payload):
    release={'id':'test','files':{'workspace.json':hashlib.sha256(b'correct').hexdigest()}}
    def fetch(request,timeout):
        path=request.full_url.split('?')[0]
        return io.BytesIO(json.dumps(release).encode() if path.endswith('publication.json') else payload if path.endswith('workspace.json') else live_index)
    monkeypatch.setattr(publication,'urlopen',fetch)
    with pytest.raises(RuntimeError,match='not confirmed'):
        publication.wait_for_deployment('https://test',release,'<script src="/assets/current.js"></script>',timeout=.01,interval=0)
