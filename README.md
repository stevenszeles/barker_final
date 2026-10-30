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

- a free web service that wakes on requests;
- an externally supplied PostgreSQL connection (for example, Neon Free);
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

The Blueprint keeps Render hosting free and does not provision a paid database.
Create a free Neon PostgreSQL project and set its TLS connection string as Render's
DATABASE_URL secret. Keep WS_DB_FALLBACK_TO_SQLITE=0. Database storage survives
Render restarts; both services may sleep and have free-tier quotas. Review current
limits at https://neon.com/pricing and retain exports independently for recovery.

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

## Static website (no running API or database)

The existing analysis pages can use a published snapshot instead of API requests.
Export from the authoritative local database using Python 3.11 and the installed
backend requirements:

```sh
python -m backend.export_static --database /absolute/path/portfolio.db --as-of 2026-10-29
cd frontend
npm ci
npm run build:static
```

Use the actual portfolio data date for `--as-of`, not the publication date. The
exporter copies the source database consistently before running existing analysis;
it does not modify the original. It fails rather than replace the published file
if an analysis endpoint fails. It exports every account plus the aggregate view,
positions, NAV/benchmark history, realized activity, and portfolio risk. No quotes
are refreshed during export. Keep cached benchmark history in the source database.

The header shows the fixed portfolio date. Browser searches, account filters and
charts remain interactive. Static mode is read-only: import/admin and sector editing
are unavailable, and no session API or background API is required. Missing data
shows an error and prevents a static production build.

Create a **Render Static Site** using `render-static.yaml` as the Blueprint path,
or set build command `cd frontend && npm ci && npm run build:static` and publish
folder `frontend/dist`. It is a separate service type from the existing Docker app;
leave the old site intact until the static site is verified. Hash navigation needs
no server rewrite. Publish new data by exporting and committing
`frontend/public/data/portfolio.json`, then deploying again.

Published JSON is accessible to website visitors. Do not commit credentials or raw
brokerage files. Review account identifiers and portfolio contents before publishing;
static mode does not provide private access or a meaningful browser-only login.
No real portfolio snapshot is included automatically.

## Daily publication — original dashboard

Place the current brokerage exports in `Desktop/Dashboard CSV`, replacing older
copies of the same export. Double-click `Publish Barker Dashboard.command` in this
repository. The first run installs its local publishing dependencies. Subsequent
runs parse the CSVs with the original dashboard's parsers, reconcile all holdings,
account totals/cash/cost, balance histories and realized gains independently,
refresh frozen market history through the data date, build, commit only the four
published data files, and push to GitHub. Render automatically deploys the update.
A failed preparation restores the prior data files and does not push.

The original styles, chart components and portfolio calculations are retained.
The website's upload/edit controls provide temporary browser previews. They do
not save centrally; the Upload Data explanation states this explicitly. Reloading
loads the published snapshot. The publication date stays fixed until a new update.

The data verification report is `frontend/public/data/verification.json`.
Positions totals are intraday brokerage values; the latest balance-history point
is the separate end-of-day history value. Differences between these two exports
are retained, not silently forced to agree. Published JSON is public to visitors.

## Sector settings and cash flows

Sector assignment uses a manual override first, the brokerage Sector column next,
and the underlying-symbol mapping last. Unresolved holdings stay unclassified.
In Upload Data, export sector settings as `publication-settings.json`, move that
file into Desktop/Dashboard CSV, and run the publishing shortcut. Published settings
are retained on later imports. Website edits remain session previews.

Actual weight is signed sector market value divided by NAV. Invested weight divides
by gross invested market value excluding cash. Active weight is actual NAV weight
minus benchmark weight, in percentage points. Cash underweights remain visible;
option premiums are not delta-adjusted exposures. Incomplete derivative history
is not treated as a measured sector return.

The recorded October 28 journal moves $10,000 from ...662 to ...288 and nets to zero
for the combined portfolio. Cash flows can also be supplied as `cash-flows.json`
in Desktop/Dashboard CSV. Each entry requires account, date and signed amount;
internal transfer legs share a transfer_id and must net to zero. Calculations assume
end-of-day flows. The dataset is explicitly labeled partial: other deposits,
withdrawals or in-kind flows must be supplied before claiming complete TWR accuracy.

## Static interface cleanup

The static dashboard keeps a single updated-as-of date and removes the market
clocks, build labels, duplicate portfolio/status tiles, live/shared badges and
redundant Desk/Legal NAV controls. A single account-based NAV view remains, with
Focus/Line/Bar views, account overlays, analysis pages and exports intact.
Cash-flow completeness is explained in Performance rather than in the header.
Data & Settings retains session previews and sector-settings export; Reload
Published Data restores the shared snapshot. Static server polling is disabled.
Unused legacy frontend entry points, styling, adapters and duplicate data files
have been removed after verifying they were not imported by the active dashboard.

## Account return charts

In Performance, Clear All deselects every account, Aggregate and SPX in all views.
Click account buttons to add/remove lines; selected buttons have checkmarks, filled
colors, accessible pressed states, and their return for the selected period.
Select All Accounts selects accounts without adding aggregate or benchmark lines.
Focus, Line and Bar views use the same selection; no best/worst accounts are added
automatically. Use a timeframe preset or enter From/To dates and click Apply Dates.
Custom dates and selections are retained in browser preferences. Details and NAV
follow the selected account or selected-account group, not another page's scope.
Missing returns remain unavailable rather than being presented as zero.
