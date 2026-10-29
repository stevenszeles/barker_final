"""Build a read-only website snapshot using the existing portfolio calculations."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--as-of', required=True, help='Actual portfolio data date/time (ISO 8601)')
    parser.add_argument('--output', type=Path, default=Path('frontend/public/data/portfolio.json'))
    args = parser.parse_args()
    from datetime import datetime, timezone
    datetime.fromisoformat(args.as_of.replace('Z', '+00:00'))
    if not args.database.is_file():
        parser.error('Source database does not exist')
    # Work on a consistent copy, preserving the original including WAL contents.
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / 'portfolio.db'
        with sqlite3.connect(f'file:{args.database.resolve()}?mode=ro', uri=True) as source:
            with sqlite3.connect(database) as target:
                source.backup(target)
        os.environ.update(ENVIRONMENT='development', DATABASE_URL='', WS_DATABASE_URL='',
                          WS_DB_PATH=str(database), BARKER_AUTH_ENABLED='0',
                          WS_STATIC_MODE='1', WS_LIVE_QUOTES='0', WS_MARKETDATA_ONLY='0',
                          BARKER_MIGRATE_ON_STARTUP='1')
        for key in ('RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RENDER_EXTERNAL_HOSTNAME'):
            os.environ.pop(key, None)
        from fastapi.testclient import TestClient
        from backend.app.main import app
        from backend.app.config import settings
        settings.db_url = None
        settings.db_path = str(database)
        settings.auth_enabled = False
        settings.static_mode = True
        settings.live_quotes = False
        settings.migrate_on_startup = True
        responses = {}
        def capture(client, path, params=None):
            response = client.get('/api' + path, params=params)
            response.raise_for_status()
            return response.json()
        with TestClient(app) as client:
            accounts = capture(client, '/portfolio/accounts')
            if not accounts['accounts']:
                raise RuntimeError('Refusing to publish an empty portfolio')
            responses['/portfolio/accounts'] = accounts
            responses['/risk/profile'] = capture(client, '/risk/profile')
            for account in ['ALL'] + [row['account'] for row in accounts['accounts']]:
                for path, limit in [('/portfolio/snapshot', None), ('/positions', None),
                                    ('/portfolio/nav', 1000000), ('/trade/blotter', 1000000)]:
                    params = {'account': account}
                    if limit:
                        params['limit'] = limit
                    responses[f'{path}?account={account}'] = capture(client, path, params)
        payload = {'as_of': args.as_of, 'published_at': datetime.now(timezone.utc).isoformat(),
                   'responses': responses}
        encoded = json.dumps(payload, allow_nan=False, separators=(',', ':'))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix('.tmp')
        temporary.write_text(encoded)
        temporary.replace(args.output)
        print(f'Exported {len(accounts["accounts"])} accounts to {args.output}; data as of {args.as_of}')


if __name__ == '__main__':
    main()
