"""Stage browser-prepared update bundles, preserving the previous source folder."""
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path


def stage_bundle(folder, downloads=None):
    downloads = downloads or Path.home() / 'Downloads'
    bundles = [p for p in downloads.glob('barker-update*.zip') if re.fullmatch(r'barker-update(?:-\d+| \(\d+\))?\.zip', p.name) and p.is_file() and not p.is_symlink()]
    if not bundles: return folder
    newest = max(bundles, key=lambda p: p.stat().st_mtime_ns)
    digest = hashlib.sha256(newest.read_bytes()).hexdigest()
    receipt = folder / 'last-update-bundle.json'
    if receipt.exists() and json.loads(receipt.read_text()).get('sha256') == digest: return folder
    stage = folder / 'incoming' / digest
    stage.mkdir(parents=True, exist_ok=True)
    for p in stage.iterdir():
        if p.is_file(): p.unlink()
    for p in folder.iterdir():
        if p.is_file() and (p.suffix.lower() in {'.csv', '.json'}): shutil.copy2(p, stage / p.name)
    with zipfile.ZipFile(newest) as archive:
        entries = archive.infolist()
        if len(entries) > 100 or sum(p.file_size for p in entries) > 100_000_000: raise ValueError('Update bundle is too large')
        if len({p.filename for p in entries}) != len(entries): raise ValueError('Duplicate file names in update bundle')
        for item in entries:
            if '/' in item.filename or '\\' in item.filename or item.filename in {'.', '..'}: raise ValueError('Invalid update bundle path')
            if not re.fullmatch(r'[A-Za-z0-9_ .()\-]+\.(?:csv|CSV|json)', item.filename): raise ValueError('Unexpected update bundle file')
        meta = json.loads(archive.read('barker-update.json'))
        if meta.get('format') != 'barker-update-v1': raise ValueError('Unsupported update bundle')
        incoming = [p.filename for p in entries if p.filename != 'barker-update.json']
        families=set()
        for name in incoming:
            suffix=re.search(r'_X{3,4}(\d+)_(Balances|Transactions)_',name,re.I)
            family=(suffix[2].lower(),suffix[1]) if suffix else ('positions',) if 'Positions-' in name else ('realized',) if 'Realized' in name else (name,)
            if family in families: raise ValueError('Select exactly one export per type and account')
            families.add(family)
        if ('positions',) not in families: raise ValueError('Update bundle must contain positions')
        # Replace the supplied export type/account, retain older realized history when omitted.
        for name in incoming:
            if 'Positions-' in name: pattern = '*Positions-*.csv'
            elif '_Balances_' in name: pattern = name.split('_Balances_')[0] + '_Balances_*'
            elif '_Transactions_' in name: pattern = name.split('_Transactions_')[0] + '_Transactions_*'
            elif 'Realized' in name: pattern = '*Realized*.csv'
            elif name == 'publication-settings.json': pattern = name
            else: raise ValueError(f'Unsupported input file: {name}')
            for p in stage.glob(pattern): p.unlink()
            (stage / name).write_bytes(archive.read(name))
    (stage / 'bundle-receipt.json').write_text(json.dumps({'sha256': digest, 'source': newest.name}))
    print(f'Using update bundle {newest.name}; previous exports retained until validation passes.', flush=True)
    return stage


def accept_bundle(stage, folder):
    if stage == folder: return
    receipt = json.loads((stage / 'bundle-receipt.json').read_text())
    archive = folder / 'archive' / ('before-bundle-' + receipt['sha256'][:12])
    archive.mkdir(parents=True, exist_ok=True)
    for p in folder.iterdir():
        if p.is_file() and p.suffix.lower() in {'.csv', '.json'} and p.name != 'last-update-bundle.json':
            shutil.copy2(p, archive / p.name)
            p.unlink()
    for p in stage.iterdir():
        if p.is_file() and p.suffix.lower() in {'.csv', '.json'} and p.name != 'bundle-receipt.json': shutil.copy2(p, folder / p.name)
    (folder / 'last-update-bundle.json').write_text(json.dumps(receipt, indent=2))
