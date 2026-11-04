"""List or restore complete local release archives, with checks before publication."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from publication_history import archive_release, list_releases
from publication import wait_for_deployment

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'frontend/public/data'
RELEASES=ROOT/'.ledger/releases'


def validate_release(source):
    manifest=json.loads((source/'publication.json').read_text())
    for name, expected in manifest['files'].items():
        if Path(name).name!=name or hashlib.sha256((source/name).read_bytes()).hexdigest()!=expected:
            raise ValueError('Release archive is incomplete or changed')
    return manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release',help='Full saved release id to restore; omit to list available releases')
    parser.add_argument('--prepare-only',action='store_true',help='Verify restore and build, then put current data back without publishing')
    parser.add_argument('--interactive',action='store_true',help='Choose a saved release from a numbered list')
    args=parser.parse_args()
    if args.interactive and not args.release:
        releases=list_releases(RELEASES)
        if not releases: print('No saved releases on this computer yet.');return
        for number,item in enumerate(releases,1): print(f"{number}. {item['as_of']} — {item['id'][:12]}")
        choice=input('Choose a release number to restore, or press Return to cancel: ').strip()
        if not choice: return
        if not choice.isdigit() or not 1<=int(choice)<=len(releases): parser.error('Choose a number from the list')
        args.release=releases[int(choice)-1]['id']
    if not args.release:
        for item in list_releases(RELEASES): print(item['as_of'], item['id'])
        return
    if not re.fullmatch('[a-f0-9]{64}',args.release): parser.error('Use the complete release ID from the list')
    source=RELEASES/args.release
    release=validate_release(source)
    if subprocess.check_output(['git','diff','--cached','--name-only'],cwd=ROOT,text=True).strip(): raise RuntimeError('Finish staged changes first')
    archive_release(DATA,RELEASES)
    names=set(release['files'])|{'publication.json','tracking.json'}
    backup={name:(DATA/name).read_bytes() if (DATA/name).exists() else None for name in names}
    succeeded=False
    try:
        for name in names:
            if (source/name).exists(): shutil.copy2(source/name,DATA/name)
            else:(DATA/name).unlink(missing_ok=True)
        # The frontend understands older releases without tracking metadata.
        subprocess.run(['npm','run','test:analytics'],cwd=ROOT/'frontend',check=True)
        subprocess.run(['npm','run','typecheck'],cwd=ROOT/'frontend',check=True)
        subprocess.run(['npm','run','build:static'],cwd=ROOT/'frontend',check=True)
        if args.prepare_only:return
        paths=['frontend/public/data/'+name for name in names]
        subprocess.run(['git','add','--',*paths],cwd=ROOT,check=True)
        subprocess.run(['git','commit','-m',f'Restore verified release {args.release[:12]}'],cwd=ROOT,check=True)
        subprocess.run(['git','push','origin','main'],cwd=ROOT,check=True)
        succeeded=True
        wait_for_deployment('https://barker-portfolio-static.onrender.com',release,(ROOT/'frontend/dist/index.html').read_text())
    finally:
        if not succeeded:
            for name,content in backup.items():
                if content is None:(DATA/name).unlink(missing_ok=True)
                else:(DATA/name).write_bytes(content)


if __name__=='__main__':main()
