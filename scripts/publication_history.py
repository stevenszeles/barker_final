"""Keep complete, checksum-verified releases for restoration on this computer."""
import hashlib
import json
import shutil
from pathlib import Path


def archive_release(data, directory):
    manifest_path=data/'publication.json'
    if not manifest_path.exists(): return
    manifest=json.loads(manifest_path.read_text())
    for name, expected in manifest['files'].items():
        if hashlib.sha256((data/name).read_bytes()).hexdigest()!=expected:
            # A locally prepared draft is not a recoverable published release.
            return
    destination=directory/manifest['id']
    destination.mkdir(parents=True,exist_ok=True)
    for name in [*manifest['files'],'publication.json']: shutil.copy2(data/name,destination/name)
    return manifest['id']


def list_releases(directory):
    return sorted([{'id':path.parent.name,'as_of':json.loads(path.read_text())['as_of']} for path in directory.glob('*/publication.json')],key=lambda row:(row['as_of'],row['id']),reverse=True)
