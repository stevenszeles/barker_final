# Barker Portfolio Workstation

Barker is a shared portfolio dashboard for a student investment group. An administrator uploads the three Schwab exports the group already receives—positions, balance history, and realized lot detail—and every member sees the same validated portfolio from any browser.

It is intentionally a small system:

- one React application;
- one FastAPI service;
- one relational database;
- one Docker image;
- one supported production target.

The database is authoritative. The browser never reconstructs the portfolio, parses brokerage files, or synchronizes a private JSON copy.

## What members can do

- Review total and account-level NAV, cash, exposure, daily P/L, and allocations.
- Search holdings and maintain sector classifications.
- Compare imported NAV history with cached benchmark history.
- Review realized activity and portfolio risk diagnostics.
- Share a read-only login while limiting imports and settings to administrators.

Order placement is compiled into the API for future use but disabled by default with `BARKER_TRADING_ENABLED=0`.

## How data moves

```text
Schwab CSV files
      |
      v
validate and normalize
      |
      v
single database transaction ----> import audit history
      |
      +--> accounts / positions / instruments
      +--> NAV snapshots
      +--> realized trades
      |
      v
read-only portfolio projections
      |
      v
React Query cache --> workstation views
```

All files in an upload are committed together. A malformed file rolls the whole batch back. File hashes make repeated uploads idempotent.

Imported balance history is displayed as `nav_change_only` unless independently recorded cash flows support a true time-weighted return. This avoids presenting deposits or withdrawals as investment performance.

## Architecture

| Boundary | Responsibility |
| --- | --- |
| `backend/app/importing.py` | Brokerage detection, parsing, normalization, atomic persistence, duplicate protection |
| `backend/app/migrations.py` | Versioned operational schema changes |
| `backend/app/db.py` | SQLite/PostgreSQL adapter, PostgreSQL pool, transaction and health boundaries |
| `backend/app/routers/` | Role-protected HTTP contracts |
| `backend/app/services/` | Portfolio projections, market adapters, analytics, and risk calculations |
| `frontend/src/pages/` | Lazy-loaded workstation modules |
| `frontend/src/hooks/` | Query ownership and caching policy |
| `frontend/src/services/api.ts` | The single browser/API transport |

`legacy_engine.py` remains the compatibility analytics core behind the service boundary. New product features should enter through a focused service and typed route rather than adding UI logic or another import path.

### Core tables

- `accounts`, `instruments`, `positions`
- `nav_snapshots`, `cash_flows`, `trades`
- `price_cache`, `daily_positions`, `risk_metrics`
- `schema_migrations`
- `import_batches`, `import_files`
- `jobs`, `calculation_runs`

SQLite is suitable for one local instance. Production requires PostgreSQL; the application fails startup instead of silently falling back to an ephemeral database.

## Run locally

Docker is the shortest path:

```bash
cp .env.template .env
docker compose up --build -d
```

Open <http://localhost:8080>. Local data is kept in the `barker-data` Docker volume. Authentication is off in the local template.

For separate backend/frontend development:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python -m backend.migrate
uvicorn backend.app.main:app --reload
```

```bash
cd frontend
npm ci
npm run dev
```

The Vite server runs at <http://localhost:5173> and proxies `/api` to the backend.

## First portfolio update

1. Sign in with the administrator password.
2. Open **Import & Admin**.
3. Select the positions, balances, and realized lot CSVs together.
4. Review the parsed account and row counts, then import.
5. Re-uploading the same exports is safe; they are reported as duplicates.

The sample `...562` exports were verified as one atomic batch: 41 positions, 731 balance points, and 195 realized lots, reconciling to $107,159.46 cash and $373,434.99 account value.

## Production on Render

`render.yaml` is the supported deployment definition. It provisions:

- a non-sleeping Starter web service;
- a private paid PostgreSQL database;
- generated session-signing material;
- readiness checks against the database;
- manual deployments after CI passes.

Before the first deploy, set `BARKER_ADMIN_PASSWORD`. Set `BARKER_VIEWER_PASSWORD` to provide a read-only group login. The Docker entrypoint applies migrations before starting the API, so a migration failure prevents the release from becoming healthy.

The API and frontend share an origin; broad production CORS is neither required nor enabled.

## Verification

```bash
pip install -r requirements-dev.txt
python -m compileall -q backend
pytest backend/tests -q
pip-audit -r requirements.txt

cd frontend
npm ci
npm run typecheck
npm run build
npm audit --audit-level=high
```

Readiness is `GET /health/ready`; liveness is `GET /health/live`.

## Adding a feature

Use the existing boundaries:

1. Add or version the database shape in `migrations.py`.
2. Implement calculation or domain behavior in a small service.
3. expose a role-appropriate typed route;
4. add a query hook and lazy page/component;
5. cover the financial invariant and API authorization in tests.

Do not add a second browser-side source of truth, file parser, deployment platform, or implicit live-data dependency.

## Persistence and recovery

Production refuses database access unless DATABASE_URL uses PostgreSQL and
WS_DB_FALLBACK_TO_SQLITE=0. A database outage therefore fails requests instead of
accepting writes into temporary storage. Local SQLite and Docker volumes still work.

The Blueprint selects paid Render Postgres, which includes automatic point-in-time
recovery: https://render.com/docs/postgresql-backups . Check the Recovery page for
the available recovery window and export backups there for longer retention.

Before changing an existing deployment's DATABASE_URL, export its existing data.
A new database starts empty; this configuration does not transfer existing records.
Set an administrator password of at least 12 characters before deploying. A viewer
password is optional and must differ from the administrator password.

Deployment acceptance: import a known CSV batch, record account values and import
history, restart and redeploy, and confirm both remain unchanged from another
browser. Test recovery by restoring to a separate database and verifying the same
records before switching connections. Retain original brokerage exports separately.
These hosted checks require access to the live Render account and are not implied
by passing local tests.
