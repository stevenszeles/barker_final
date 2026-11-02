"""Pick up the dashboard's settings download without moving files by hand."""
import json
from pathlib import Path
import re

FIELDS = {'sectorOverrides', 'sectorTargetsByAccount', 'accountDisplayNames'}
DOWNLOAD_NAME = re.compile(r'^publication-settings(?: \(\d+\)|-\d+)?\.json$')


def validate_settings(payload):
    if not isinstance(payload, dict) or not FIELDS.issubset(payload):
        raise ValueError('Settings download must contain sector assignments, targets and account names')
    if payload.get('format', 'barker-sector-settings-v1') != 'barker-sector-settings-v1':
        raise ValueError('Unsupported sector settings format')
    if any(not isinstance(payload[key], dict) for key in FIELDS):
        raise ValueError('Invalid settings download: expected settings objects')
    for key in ('sectorOverrides', 'accountDisplayNames'):
        if any(not isinstance(value, str) for value in payload[key].values()):
            raise ValueError('Invalid settings download: expected text assignments')
    for targets in payload['sectorTargetsByAccount'].values():
        if not isinstance(targets, dict):
            raise ValueError('Invalid sector targets')
        for values in targets.values():
            if not isinstance(values, dict) or any(
                type(value) not in (int, float) or not -1000 <= value <= 1000
                for value in values.values()
            ):
                raise ValueError('Invalid sector target weights')
    return {key: payload[key] for key in sorted(FIELDS)}


def import_download(folder, downloads=None):
    downloads = Path.home() / 'Downloads' if downloads is None else downloads
    destination = folder / 'publication-settings.json'
    candidates = [path for path in downloads.glob('publication-settings*.json')
                  if path.is_file() and not path.is_symlink() and DOWNLOAD_NAME.fullmatch(path.name)]
    if not candidates:
        return None
    newest = max(candidates, key=lambda path: (path.stat().st_mtime_ns, path.name))
    if destination.exists() and newest.stat().st_mtime_ns <= destination.stat().st_mtime_ns:
        return None
    if newest.stat().st_size > 5_000_000:
        raise ValueError('Settings download is unexpectedly large')
    try:
        settings = validate_settings(json.loads(newest.read_text()))
    except (ValueError, TypeError) as exc:
        raise ValueError(f'Cannot import {newest.name}: {exc}. Save sector assignments again.') from exc
    # Replace atomically; retain the source download and the previous settings on validation failure.
    temporary = destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(settings, indent=2, allow_nan=False) + '\n')
    temporary.replace(destination)
    print(f'Using saved sector assignments from Downloads: {newest.name}', flush=True)
    return newest
