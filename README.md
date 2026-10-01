# Barker Portfolio Workstation

Barker is a shared portfolio dashboard for a student investment group. Schwab exports—positions (single-account or All-Accounts), balance history, and realized lot detail—are uploaded once, and every member sees the same validated portfolio from any browser.

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
- Optionally share a read-only login while limiting imports and settings to administrators (see [Access control](#access-control)).

Barker does not place orders. The optional Schwab API connection is read-only: accounts, positions, balances, and existing orders. `BARKER_TRADING_ENABLED` is still read and reported in admin settings but no longer controls any endpoint.

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

All files in an upload are committed together. All-Accounts positions exports are split into one block per account; cash-only accounts and futures summary rows (`--` in every numeric column) are skipped. A malformed file rolls the whole batch back. File hashes make repeated uploads idempotent.

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

When `DATABASE_URL` is set the app uses PostgreSQL. Without it the app boots on SQLite with no other configuration; on a host without persistent disk (such as Render's free plan) that database, and every upload in it, is lost on restart, and a warning is logged at startup. Set `DATABASE_URL` whenever uploads must survive a restart.

## Run locally

Docker is the shortest path:

```bash
cp .env.template .env
docker compose up --build -d
```

Open <http://localhost:8080>. Local data is kept in the `barker-data` Docker volume. Authentication is off by default.

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

1. If authentication is enabled, sign in with the administrator password.
2. Open **Import & Admin**.
3. Select the positions, balances, and realized lot CSVs together.
4. Review the parsed account and row counts, then import.
5. Re-uploading the same exports is safe; they are reported as duplicates.

The sample `...562` exports were verified as one atomic batch: 41 positions, 731 balance points, and 195 realized lots, reconciling to $107,159.46 cash and $373,434.99 account value.

## Production on Render

`render.yaml` is the supported deployment definition. It provisions one Docker web service on the free plan with `autoDeploy: true`; deploys are not gated on CI. Render's health check uses `GET /health`.

The service needs no environment variables to boot. The one optional variable in `render.yaml` is `DATABASE_URL`: point it at a PostgreSQL instance so uploads survive restarts. Without it the service runs on SQLite, which the free plan wipes whenever the service restarts or redeploys, so data must be re-uploaded.

The Docker entrypoint applies migrations before starting the API, so a migration failure prevents the release from becoming healthy.

The API and frontend share an origin; broad production CORS is neither required nor enabled.

## Access control

Authentication is off unless `BARKER_AUTH_ENABLED=1`. While it is off there is no sign-in step and every visitor is treated as an administrator, including access to imports, settings, and the Schwab connection routes.

To enable it, set:

- `BARKER_AUTH_ENABLED=1`;
- `BARKER_AUTH_SECRET` (at least 32 characters);
- `BARKER_ADMIN_PASSWORD` (at least 12 characters);
- optionally `BARKER_VIEWER_PASSWORD` (at least 12 characters, different from the admin password) for a read-only group login.

Startup fails if authentication is enabled and any of these requirements are not met. Sessions last `BARKER_SESSION_HOURS` (default 12).

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
