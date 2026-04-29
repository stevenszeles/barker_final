# Architecture And Workflows

## Runtime Truth Map

### Active frontend path

`frontend/src/main.tsx`
-> imports `frontend/src/portfolio-dashboard.jsx`
-> imports `frontend/src/render-dashboard.css`
-> mounts the monolithic dashboard under a local error boundary

### Inactive alternate frontend path

`frontend/src/App.tsx`
-> uses `frontend/src/store/index.ts`
-> uses `frontend/src/services/api.ts`
-> uses `frontend/src/components/PortfolioChart.tsx`
-> not imported by `main.tsx`

### Backend path

`backend/app/main.py`
-> loads settings
-> configures CORS
-> registers routers
-> initializes schema and workers
-> mounts `frontend/dist` if present

## Startup Workflow

1. Environment variables are loaded through `backend/app/config.py`.
2. `backend/app/main.py` creates the FastAPI app.
3. Startup runs `ensure_schema()` from `backend/app/db.py`.
4. If enabled, demo seed data is written.
5. Worker startup kicks off cache/history warmup and background price updates.
6. If a built frontend exists, it is served from `frontend/dist`.

## Deployment Workflow

### Render

- `render.yaml` defines a single Docker web service.
- The service health checks `/health`.
- Render currently sets `WS_STATIC_MODE=0`.
- Render currently sets `WS_LIVE_QUOTES=0`.
- Render currently allows all origins.

### Docker

- `Dockerfile` builds the frontend and then runs the Python backend.
- `docker-compose.yml` maps host `8080` to container `8000`.
- `start.sh` is the simple local boot helper.

## Active Dashboard Workflow

The live mounted dashboard behaves like a browser-resident workspace application.

### On load

1. Local state is loaded from build-versioned local storage.
2. Shared workspace seed state is derived.
3. Benchmark history is loaded or refreshed.
4. Shared workspace state is requested from `/api/admin/shared-dashboard-state`.
5. Legal NAV series are fetched from `/api/portfolio/nav` for `ALL` and per-account views.

### On upload

The active dashboard parses uploads in the browser:

- `parsePositionsCSV()` for positions reports,
- `parseFuturesStatementCSV()` for futures statements,
- `parseBalancesCSV()` for balance history,
- `parseRealizedCSV()` for realized gain/loss exports.

Those parsed objects are merged into local React state and then synced to the shared workspace endpoint. This means the active dashboard mostly treats the backend as:

- a persistence/sync target for workspace JSON,
- a benchmark/history proxy,
- and a legal NAV source for comparison charts.

It does not primarily use the backend CSV import endpoints.

## Alternate Server-Driven Import Workflow

The inactive `App.tsx` path works differently:

- uploads are posted to `/api/admin/import-positions`,
- balances are posted to `/api/admin/import-balances`,
- transactions are posted to `/api/admin/import-transactions`,
- the backend persists positions, trades, cash flows, and nav snapshots,
- and the UI refreshes from API-backed state.

This workflow is more server-centric and better aligned with the backend import machinery, but it is not the current mounted path.

## Shared Workspace Sync Workflow

Active dashboard shared state includes:

- accounts,
- balance history,
- realized trades,
- sector targets,
- sector overrides,
- position attribution overrides,
- realized trade attribution overrides,
- position transfer dates,
- futures PnL snapshots.

The sync flow is:

1. fetch remote workspace state,
2. compare signatures,
3. merge local and remote state if needed,
4. debounce save on dirty changes,
5. poll periodically for remote updates,
6. fall back to local cache if sync fails.

The server stores this shared state in the `settings` table and also mirrors it to a fallback file under the user home directory. That fallback helps local resilience but is weak for multi-instance deployments.

## Performance / NAV Workflow

There are two performance concepts in the active UI:

- desk performance, derived from uploaded account/balance/trade state in the browser,
- legal performance, fetched from backend `/api/portfolio/nav`.

The dashboard compares or overlays these models. This is powerful, but it also means frontend and backend can diverge if:

- imported data differs between the browser workspace and backend tables,
- benchmark history differs,
- or one workflow has been used while the other has not.

## Market Data Workflow

The backend market stack can use:

- Polygon,
- Schwab,
- Stooq,
- Yahoo fallback,
- cached price history,
- and static/demo fallbacks depending on mode and availability.

This is robust in principle, but it creates many branches and several subtle modes:

- `static_mode` short-circuits live data behavior,
- `marketdata_only` changes source labeling and expectations,
- `live_quotes` affects quote freshness and background updates.

## Data Model Workflow

Main persisted concepts include:

- `accounts`
- `positions`
- `trades`
- `cash_flows`
- `nav_snapshots`
- `price_cache`
- `settings`
- `oauth_tokens`
- `import_event_keys`

The core engine uses those tables to rebuild or infer:

- snapshot state,
- account cash,
- daily NAV,
- benchmark-relative performance,
- risk metrics,
- and sector series.

## What A Change Usually Impacts

### If you change `frontend/src/main.tsx`

You can switch the active UI architecture for the entire app.

### If you change `frontend/src/portfolio-dashboard.jsx`

You are changing the currently mounted product behavior.

### If you change `frontend/src/App.tsx`

You are changing a dormant or alternate UI path unless you also switch the mount target.

### If you change `backend/app/routers/admin.py`

You may affect shared workspace sync, import behavior, NAV rebuilds, sector metadata, and balance-history reconciliation.

### If you change `backend/app/services/legacy_engine.py`

You may affect nearly everything: positions, pricing, cash, NAV, risk inputs, imports, benchmark handling, and derived metrics.

### If you change environment flags

You may completely change runtime behavior. `WS_STATIC_MODE`, `WS_LIVE_QUOTES`, and `WS_MARKETDATA_ONLY` are not cosmetic flags; they materially change code paths.

## Practical Rule

Before modifying this repo, always answer these three questions first:

1. Am I changing the active mounted dashboard or the inactive TS path?
2. Am I changing client-side import behavior or server-side import behavior?
3. Am I changing static-mode behavior, live-mode behavior, or both?
