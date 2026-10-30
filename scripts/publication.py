"""Content identities and bounded deployment confirmation for a static publication."""
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import URLError,HTTPError
from urllib.request import Request,urlopen


def write_manifest(data):
    names=['workspace.json','nav-history.json','market.json','cash-flows.json','transaction-audit.json','analytics-config.json','verification.json','verification.md']
    files={name:hashlib.sha256((data/name).read_bytes()).hexdigest() for name in names}
    identity=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()
    asof=json.loads((data/'workspace.json').read_text())['as_of']
    manifest={'id':identity,'as_of':asof,'files':files}
    (data/'publication.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest


def wait_for_deployment(base, manifest, local_index, timeout=300, interval=5):
    assets=re.findall(r'(?:src|href)="(/assets/[^\"]+)"',local_index)
    deadline=time.monotonic()+timeout;last_error='not yet checked';last_progress=0
    while time.monotonic()<deadline:
        try:
            nonce=str(time.time_ns())
            def fetch(path):
                request=Request(base+path+('&' if '?' in path else '?')+'check='+nonce,headers={'Cache-Control':'no-cache'})
                with urlopen(request,timeout=15) as response:return response.read()
            live=json.loads(fetch('/data/publication.json'))
            index=fetch('/').decode()
            if live.get('id')==manifest['id'] and all(asset in index for asset in assets):
                for name,expected in manifest['files'].items():
                    if hashlib.sha256(fetch('/data/'+name)).hexdigest()!=expected: raise ValueError(f'Published file differs: {name}')
                print('Verified live deployment: '+base,flush=True);return
            last_error='Render is still serving the previous publication'
        except (URLError,HTTPError,ValueError,TimeoutError) as exc:last_error=str(exc)
        if time.monotonic()-last_progress>=30:
            print('Waiting for Render to publish the verified snapshot...',flush=True);last_progress=time.monotonic()
        time.sleep(min(interval,max(0,deadline-time.monotonic())))
    raise RuntimeError('Push succeeded but live deployment was not confirmed: '+last_error)
