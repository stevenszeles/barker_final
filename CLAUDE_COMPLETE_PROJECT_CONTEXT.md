# Claude Complete Project Context

Last updated: 2026-03-08
Repository: `/Users/stevenszeles/Downloads/barker_final`

This is the best single-file handoff for Claude or any repo-aware coding assistant.

If this document conflicts with the code, trust the code. The main goal of this file is to make the codebase legible quickly and to explain the actual intent of the dashboard, not just the file layout.

## 1. Project Intent

This project is a full-stack portfolio workstation for multi-account portfolio monitoring, import-driven bookkeeping, performance charting, sector decomposition, risk analytics, and optional live trading integrations.

The current real-world intention of the dashboard is:

- ingest Schwab-style exports for positions, balances, and realized trades;
- treat imported account balances as the authoritative source of historical performance in the primary workflow;
- show current holdings, account-level and aggregate portfolio NAV, SPX-relative performance, and risk metrics;
- support sector attribution and portfolio-manager review workflows;
- optionally support live quotes, options data, order preview, and order submission when broker credentials are configured.

This is not just a generic charting UI. It is a portfolio operations dashboard with a strong bias toward "import broker files, reconcile NAV, then analyze."

## 2. Product Mental Model

The cleanest way to understand the system is to separate current-state data from historical performance data.

Current-state truth:

- `positions` holds current holdings.
- `accounts` holds current cash, as-of date, and anchor account value.
- `quotes` and broker/market integrations enrich current pricing and live-trade UX.

Historical truth:

- In the intended static workflow, `nav_snapshots` is the source of truth for historical account and portfolio performance.
- `price_cache` stores benchmark and symbol history used for benchmark overlays, risk analytics, sector series, and dynamic-mode reconstruction.

Analytics truth:

- `trades` and `cash_flows` drive realized analytics, trade blotter views, and dynamic-mode NAV reconstruction.
- Sector performance and attribution depend on consistent sector tagging in positions and trades.

Configuration truth:

- `settings` stores app-level configuration such as benchmark symbol and benchmark start date.

The single most important operational point:

- The current preferred workflow is balance-authoritative static mode, not trade-reconstructed dynamic mode.

## 3. Operating Modes

There are multiple modes in the codebase, but one is primary.

### 3.1 Static mode

Backend flag: `WS_STATIC_MODE=1`
Frontend flag: `VITE_STATIC_MODE=1`

This is the intended workflow for the current dashboard.

Behavior:

- historical returns come from imported `nav_snapshots`;
- positions and balances are imported manually;
- market snapshot APIs are reduced or disabled;
- realized imports affect analytics and trade history, but should not replace imported balance history as the source of portfolio-level return truth.

### 3.2 Dynamic mode

Backend flag: `WS_STATIC_MODE=0`

Behavior:

- historical NAV is reconstructed from trades, cash flows, and historical price data;
- more live broker and market functionality is active;
- useful if the system is trade-led and fully reconstructed from events.

This mode exists, but it is not the safest assumption for current use unless explicitly configured.

### 3.3 Market-data-only mode

Backend flag: `WS_MARKETDATA_ONLY=1`

Behavior:

- market data can still work;
- broker trading paths are limited;
- useful when broker auth is unavailable but market APIs are still allowed.

## 4. What Is Actually "Live" vs Secondary

Primary runtime paths:

- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/db.py`
- `backend/app/routers/*.py`
- `backend/app/services/legacy_engine.py`
- `backend/app/services/risk.py`
- `backend/app/services/trades.py`
- `frontend/src/App.tsx`
- `frontend/src/store/index.ts`
- `frontend/src/components/PortfolioChart.tsx`

Support or secondary modules:

- `backend/app/bootstrap_seed.py` seeds demo data when `WS_SEED_DEMO=1` and the DB is empty.
- `backend/app/analytics.py`, `backend/app/chart_data.py`, `backend/app/data_store.py`, and `backend/app/market_data.py` mainly support demo seeding and deterministic fallback/demo behavior.
- They are not the primary path for imported production workflows.

Important naming trap:

- `legacy_engine.py` is not dead code. It is the central business-logic engine.

## 5. High-Level Architecture

This is a monorepo with a Python API/backend and a React frontend.

### 5.1 Backend

Framework:

- FastAPI

Responsibilities:

- configuration and startup;
- DB schema creation and migrations;
- broker auth, quotes, orders, and market integrations;
- NAV and benchmark history assembly;
- risk metrics;
- CSV imports and admin workflows;
- serving the built frontend.

### 5.2 Frontend

Framework:

- React 18 + TypeScript + Vite

Responsibilities:

- workstation UI shell;
- tabbed monitoring and analytics views;
- import controls;
- charting and comparison UX;
- polling and WebSocket wiring;
- inline editing for positions/trades/sector labels.

### 5.3 Delivery model

- single Docker image;
- frontend is built into `frontend/dist`;
- FastAPI serves both API routes and static frontend assets.

## 6. Repository Layout

Top-level files and folders that matter most:

- `README.md`: quick start and high-level summary.
- `SYSTEM_CONTEXT_GUIDE.md`: earlier architecture and workflow notes.
- `CODEBASE_CONTEXT_FOR_CLAUDE_VSCODE.md`: earlier Claude/VS Code context pack.
- `CLAUDE_RENDER_IMPORT_CONTEXT_2026-03-07.md`: import-timeout and Render behavior notes.
- `DEBUGGING_GUIDE.md`, `DEBUGGING_CHEATSHEET.md`: debugging workflow notes.
- `backend/`: API, services, DB.
- `frontend/`: React app.
- `data/portfolio_data.json`: demo dataset only.
- `scripts/`: one-off audit and rebuild helpers.
- `backend/tests/test_csv_import.py`: the main targeted regression test file in this repo.

## 7. Backend Startup Flow

Primary entry point: `backend/app/main.py`

Startup sequence:

1. Configure logging.
2. Instantiate FastAPI app with docs disabled.
3. Configure CORS using env vars and static-mode fallbacks.
4. Register routers under `settings.api_prefix` (normally `/api`).
5. Expose `/health` and `/version`.
6. On startup:
   - run `ensure_schema()`;
   - optionally seed demo data if `WS_SEED_DEMO=1`;
   - start background warmup/workers.
7. If `frontend/dist` exists, mount it at `/`.

Important deployment detail:

- `/health` is the health probe path.
- `/version` is a lightweight build verification endpoint.
- FastAPI docs are intentionally disabled in production-style runs.

## 8. Configuration Model

Primary file: `backend/app/config.py`

Important behavior:

- `.env` is loaded automatically for local/dev unless `ENVIRONMENT` is production-like.
- placeholder secrets are stripped so template values are not accidentally treated as real config.
- SQLite is the default DB mode via `WS_DB_PATH`.
- Postgres is enabled when `DATABASE_URL` or `WS_DATABASE_URL` is set.

Most important env vars:

- `WS_API_PREFIX`
- `WS_DB_PATH`
- `DATABASE_URL`
- `WS_STATIC_MODE`
- `WS_LIVE_QUOTES`
- `WS_MARKETDATA_ONLY`
- `WS_ALLOW_ALL_ORIGINS`
- `ALLOWED_ORIGINS`
- `WS_SEED_DEMO`
- `CACHE_TTL` / `WS_CACHE_TTL`
- `WS_QUOTE_TIMEOUT`
- `WS_QUOTE_MAX_SYMBOLS`
- `WS_QUOTE_BATCH`
- `WS_SCHWAB_REFRESH_COOLDOWN`
- `WS_SCHWAB_TIMEOUT`
- `SCHWAB_CLIENT_ID`
- `SCHWAB_CLIENT_SECRET`
- `SCHWAB_REDIRECT_URI`
- `POLYGON_API_KEY`
- `OPENFIGI_API_KEY`
- `VITE_API_BASE_URL`
- `VITE_STATIC_MODE`

## 9. Database Layer

Primary file: `backend/app/db.py`

Key design points:

- supports both SQLite and Postgres;
- SQL is adapted so SQLite-style `INSERT OR REPLACE` / `INSERT OR IGNORE` can map to Postgres `ON CONFLICT`;
- uses a wrapper layer (`_DBConn`, `_DBCursor`, `_RowProxy`) so the rest of the code can read rows by name in a consistent way;
- uses a process-level lock around DB work via `with_conn`.

The DB layer is simple and pragmatic, not ORM-driven.

### 9.1 Key tables

- `settings`: benchmark symbol, benchmark start date, sector baseline and target-weight values, and other key-value config.
- `accounts`: one row per account with cash, as-of date, and account anchor value.
- `instruments`: normalized instrument metadata.
- `positions`: current holdings by account and instrument.
- `nav_snapshots`: historical NAV and benchmark values by account and date.
- `price_cache`: cached historical closes for symbols and benchmarks.
- `trades`: normalized trade / realized / transaction rows.
- `cash_flows`: external and internal cash events.
- `daily_positions`: historical daily position cache.
- `quotes`: cached quote data.
- `risk_limits`: thresholds for risk metrics.
- `risk_metrics`: stored risk outputs.
- `audit_log`: operational audit entries.
- `oauth_tokens`: broker OAuth storage.
- `strategies`: multi-leg or named strategy metadata.
- `import_event_keys`: idempotency keys to avoid duplicate imports.

### 9.2 Sources of truth by concern

Use this when deciding where a bug probably lives.

- Current portfolio card values: `positions` + `accounts` + latest pricing path.
- Historical returns in static mode: `nav_snapshots`.
- Benchmark history: `price_cache`.
- Trade blotter and realized analytics: `trades`.
- Sector history: `positions`, `trades`, `price_cache`, and settings-driven sector metadata.

## 10. Backend Routers

### 10.1 `portfolio.py`

Thin router exposing:

- `GET /portfolio/snapshot`
- `GET /portfolio/nav`
- `GET /portfolio/sector`

Calls into `services.portfolio`, which is itself a thin wrapper over `legacy_engine.py`.

### 10.2 `risk.py`

Exposes:

- `GET /risk/summary`
- `GET /risk/profile`

Uses `services.risk.py`.

### 10.3 `trades.py`

Exposes:

- blotter;
- preview;
- submit;
- submit multi-leg;
- cancel;
- replace.

The router mostly validates payloads and maps errors. Core behavior lives in `services.trades.py` and `legacy_engine.py`, with Schwab order translation in live paths.

### 10.4 `status.py`

Exposes system/component health, Schwab status, and market-data status. This is used heavily by the frontend for status banners and stale/live labels.

### 10.5 `positions.py`

Exposes CRUD-ish position and cash endpoints for manual edits and batch upserts.

### 10.6 `admin.py`

This is one of the most important and largest files in the repo.

Responsibilities:

- portfolio reset;
- benchmark config;
- NAV rebuild / clear;
- import pasted NAV or benchmark history;
- CSV position import;
- CSV balance import;
- CSV transaction / realized import;
- sector classification and sector performance inputs.

This router is where much of the operational complexity lives.

Important practical rule:

- if a bug involves imports, account resolution, sector assignment, NAV rebuild side effects, or deduping, start in `admin.py`.

### 10.7 `auth.py`, `broker.py`, `market.py`

These are the live integration routers.

- `auth.py`: Schwab OAuth entry/callback/token status/logout.
- `broker.py`: broker account, positions, balances, and order paths.
- `market.py`: snapshots, aggregates, options chain, option marks, futures ladder, and WebSocket stream support.

## 11. Service Layer

### 11.1 `services/portfolio.py`

Thin façade around `legacy_engine.py`.

Purpose:

- keep router imports clean;
- avoid exposing `legacy_engine.py` directly everywhere.

### 11.2 `services/risk.py`

Builds risk outputs from:

- current snapshot;
- NAV history;
- sector series.

Outputs include:

- summary metrics;
- correlation matrix payload;
- rolling volatility / tracking error / drawdown payloads.

### 11.3 `services/trades.py`

Trade façade:

- gets blotter;
- previews trades;
- routes live order submissions or local trade application;
- builds Schwab order payloads.

### 11.4 `services/schwab.py`

Key responsibilities:

- OAuth code exchange and token refresh;
- guarded access-token retrieval;
- account / positions / balances / orders;
- quotes and option-chain reads;
- price history fetches;
- market-data eligibility checks.

This service includes refresh-cooldown logic to avoid repeated failed token refresh attempts.

### 11.5 `services/polygon.py`

Used for market snapshot, aggregates, previous close, options chain, and some quote/history paths.

### 11.6 `services/stooq.py`

Fallback pricing/history provider with rate-limit detection and a suppression window.

### 11.7 `services/openfigi.py`

Identifier resolution helper, especially when symbols originate from FIGIs or broker-specific aliases.

### 11.8 `services/options.py` and `services/futures.py`

Instrument utilities for:

- OSI parsing/building;
- option chain demo support;
- future-symbol parsing and demo ladder generation.

### 11.9 `services/cache.py`

Optional Redis-backed cache abstraction used for quote and portfolio cache keys.

## 12. The Central Engine: `legacy_engine.py`

This file is the heart of the project.

It handles:

- benchmark normalization and settings access;
- NAV start-date logic;
- historical price fetching and cache maintenance;
- live position valuation;
- NAV-series construction;
- snapshot assembly;
- trade application and trade preview;
- sector-series construction;
- NAV rebuild and snapshot storage;
- background price update loop.

It is large because the system evolved by accreting portfolio logic in one place. When Claude makes changes here, it should be conservative and trace call sites first.

### 12.1 Important conceptual clusters in `legacy_engine.py`

Settings and date helpers:

- benchmark symbol normalization;
- benchmark start date;
- earliest portfolio date and earliest balance-history date;
- effective NAV start.

Pricing and history:

- cached history sanitation and corruption detection;
- fetch history from Schwab, yfinance, Stooq;
- incremental refresh into `price_cache`;
- benchmark series assembly.

Positions and cash:

- load current positions;
- compute cash balance total;
- compute account value;
- derive instrument metadata;
- live mark-to-market build.

NAV:

- dynamic NAV build via `build_daily_nav_series`;
- snapshot-backed NAV via `_get_nav_series_from_snapshots`;
- public `get_nav_series`.

Trading:

- `apply_trade`;
- `preview_trade`;
- multi-leg submission support;
- strategy tracking.

Snapshots and sectors:

- `get_snapshot`;
- `get_sector_series`.

History maintenance:

- `rebuild_nav_history`;
- `store_nav_snapshot`;
- `clear_nav_history`.

### 12.2 Static-mode vs dynamic-mode behavior

This is the single most important domain distinction.

Static mode:

- prefers imported `nav_snapshots`;
- does not require trade-led reconstruction to show portfolio returns;
- better matches current PM workflow.

Dynamic mode:

- reconstructs NAV from history, positions, and cash flows;
- more sensitive to missing historical prices and missing trade context;
- powerful but more operationally fragile.

### 12.3 All-account aggregation behavior

The aggregate `ALL` NAV series is not a naive sum across all dates from all accounts.

It:

- forward-fills each account from its own available data;
- starts the aggregate at the latest common start date across multi-point accounts;
- excludes one-off accounts from choosing the shared start date, but includes them once they appear.

This avoids artificial jumps when one account has only a late or single-row history.

### 12.4 Benchmark behavior

Benchmark history is generally stored in `price_cache`, usually under `^GSPC` or its aliases.

Recent important behavior:

- snapshot-backed NAV responses now prefer benchmark data from `price_cache`;
- stored per-snapshot benchmark values are only a fallback;
- aggregate `ALL` chart responses use live cached benchmark history rather than relying on stale or incorrect stored values.

If Claude touches chart or benchmark logic, it should inspect:

- `get_nav_series`
- `_get_nav_series_from_snapshots`
- `get_bench_series`
- `store_nav_snapshot`
- `rebuild_nav_history`
- `frontend/src/components/PortfolioChart.tsx`

## 13. Import Workflows

Import behavior is central to this dashboard.

### 13.1 Positions import

Endpoint:

- `POST /api/admin/import-positions`

Expected source:

- Schwab CUSTACCS positions CSV or compatible positions export.

Effects:

- updates current holdings;
- updates account cash and account value anchors;
- in static mode, does not rely on synthetic trades for historical NAV.

### 13.2 Balance history import

Endpoint:

- `POST /api/admin/import-balances`

Expected format:

- `Date,Amount`

Effects:

- resolves the target account, often from account suffix in the filename;
- writes historical NAV snapshots;
- may trigger NAV rebuild or reconciliation logic;
- is the main source of truth for historical performance in the primary workflow.

### 13.3 Realized / transactions import

Endpoints:

- `POST /api/admin/import-transactions`

Expected source:

- realized gain/loss or related transaction exports.

Effects:

- writes trade rows and cash-flow analytics data;
- powers the Activity tab and sector analytics;
- should not displace imported balance history in static mode.

### 13.4 Manual paste imports

Admin also supports:

- pasted NAV history;
- pasted benchmark history.

These are important fallback tools when no clean CSV source exists.

## 14. Frontend Architecture

### 14.1 `frontend/src/main.tsx`

Creates the React root and wraps the app in a simple top-level error boundary.

### 14.2 `frontend/src/services/api.ts`

Axios client with:

- base URL from `VITE_API_BASE_URL` or `/api`;
- 30-second global timeout;
- error interceptor that rewrites messages from backend detail payloads.

This timeout matters operationally because slow imports or slow snapshot/nav requests appear as frontend failures quickly.

### 14.3 `frontend/src/store/index.ts`

Zustand store for:

- snapshot;
- nav;
- risk;
- blotter;
- component status;
- accounts;
- Schwab status;
- live quotes and trade ticks;
- selected account persistence;
- polling fetch methods;
- market WebSocket lifecycle.

Important frontend rule:

- the selected account is persisted in local storage via `ws_selected_account`.

### 14.4 `frontend/src/App.tsx`

This is a large monolithic workstation shell.

Responsibilities include:

- tab structure;
- most UI state;
- chart filters and comparison selections;
- import handlers;
- trade ticket;
- sector assignment controls;
- layout and hotkeys;
- polling orchestration;
- glue code across all backend endpoints.

This is not a highly componentized frontend. Claude should expect local state and cross-tab interactions to be concentrated here.

Recent important behavior:

- chart preferences and comparison selections are now persisted via `ws_chart_prefs` so a browser refresh does not clear the active comparison chart state.

### 14.5 `frontend/src/components/PortfolioChart.tsx`

Wraps `lightweight-charts`.

Capabilities:

- portfolio NAV series;
- SPX benchmark overlay;
- sector-series lines;
- extra account comparison series;
- spread shading between portfolio and benchmark.

The chart expects the backend to provide raw NAV and raw benchmark values. It normalizes them in the browser for display.

## 15. Frontend Tabs and Intent

### 15.1 Monitor

Purpose:

- current operational view.

Contains:

- account summary;
- positions table;
- comparison chart.

### 15.2 Analyze

Purpose:

- broader chart comparison and visual analytics.

Contains:

- larger comparison chart;
- sector/portfolio comparison controls;
- risk visual summaries.

### 15.3 Risk

Purpose:

- inspect risk metrics and exposures.

Contains:

- risk cards;
- matrix-style analytics;
- rolling risk series.

### 15.4 Activity

Purpose:

- inspect blotter and realized trade history;
- edit sectors and realized values.

### 15.5 Admin

Purpose:

- data operations and reconciliation.

Contains:

- reset tools;
- benchmark config;
- rebuild / clear NAV tools;
- CSV and batch imports;
- sector performance input controls;
- manual NAV and benchmark paste tools.

### 15.6 Trade

Only shown when not in static mode.

Purpose:

- live order entry and preview.

Supports:

- equities;
- options;
- futures;
- multi-leg option flows.

## 16. Chart and Return Semantics

This is a frequent source of confusion.

### 16.1 What the backend returns

`/portfolio/nav` returns points like:

- `date`
- `nav`
- `bench`
- optional `twr`

Interpretation:

- `nav` is raw NAV or a TWR-like index value depending on the path and context;
- when `twr` is present and nonzero, the frontend prefers that for portfolio normalization;
- `bench` is raw benchmark price, not pre-normalized percentage return.

### 16.2 What the chart does

`PortfolioChart.tsx`:

- normalizes portfolio and benchmark from their first visible valid value;
- displays percent change from the visible base;
- supports benchmark spread shading;
- can render sector lines and extra account lines simultaneously.

### 16.3 Timeframe handling

Frontend `timeframe` changes the requested NAV limit and also filters the visible date window. `bench_start` is also respected, so chart windows may be truncated to avoid plotting before the benchmark start date.

## 17. Risk Model

Primary file: `backend/app/services/risk.py`

Risk outputs are computed from:

- current snapshot;
- NAV history from `get_nav_series`;
- sector series from `get_sector_series`.

Metrics include:

- return;
- volatility;
- Sharpe;
- Sortino;
- drawdown;
- VaR;
- beta;
- benchmark correlation;
- tracking error;
- information ratio;
- exposure and greek summaries.

Risk is only as good as the underlying NAV and benchmark data, so many "risk bugs" are actually NAV or benchmark-history bugs.

## 18. Broker and Market Integrations

### 18.1 Schwab

Used for:

- OAuth;
- account details;
- positions;
- balances;
- orders;
- quotes;
- options chain;
- historical prices.

Key constraint:

- token refresh can enter cooldown after failures, which temporarily blocks marketdata paths.

### 18.2 Polygon

Used for:

- snapshots;
- aggregates;
- market status;
- options chain;
- optional WebSocket stream behavior.

### 18.3 Stooq

Fallback history and quote provider.

### 18.4 yfinance

Optional history fallback inside `legacy_engine.py`.

### 18.5 OpenFIGI

Identifier mapping only, not live pricing.

## 19. Demo and Seed Data

Seed behavior is easy to misunderstand.

- `data/portfolio_data.json` is not the main production datastore.
- It is only used by `bootstrap_seed.py` when `WS_SEED_DEMO=1` and the DB is empty.
- Demo support modules (`analytics.py`, `data_store.py`, `market_data.py`) primarily exist for that seed path and deterministic fallback/demo calculations.

Do not assume edits to `data/portfolio_data.json` affect an import-driven deployment unless demo seeding is explicitly enabled.

## 20. Deployment Model

Primary deployment artifacts:

- `Dockerfile`
- `docker-compose.yml`
- `render.yaml`
- `railway.json`

### 20.1 Docker

Builds frontend first, then installs Python deps, copies backend/data, and serves everything via uvicorn.

### 20.2 Local Docker run

```bash
cd /Users/stevenszeles/Downloads/barker_final
docker compose down --remove-orphans
docker compose up --build -d
```

App URL:

- `http://localhost:8080`

### 20.3 Render notes

`render.yaml` currently sets:

- `ENVIRONMENT=production`
- `WS_SEED_DEMO=0`
- `WS_STATIC_MODE=0`
- `WS_LIVE_QUOTES=0`
- `WS_ALLOW_ALL_ORIGINS=1`

That combination matters. If the intended deployment is balance-authoritative static mode, production env and frontend env must match that intention.

## 21. Testing and Debugging

Primary backend regression file:

- `backend/tests/test_csv_import.py`

This file covers:

- CSV detection;
- account resolution;
- snapshot aggregation behavior;
- sector-series behavior;
- risk profile behavior.

Useful commands:

```bash
cd /Users/stevenszeles/Downloads/barker_final
PYTHONPATH=/Users/stevenszeles/Downloads/barker_final .venv-nav/bin/pytest backend/tests/test_csv_import.py
cd /Users/stevenszeles/Downloads/barker_final/frontend
npm run build
```

Supporting debugging docs:

- `DEBUGGING_GUIDE.md`
- `DEBUGGING_CHEATSHEET.md`

## 22. Known High-Risk Areas

These are the places Claude should treat carefully.

### 22.1 `legacy_engine.py`

Large blast radius. A small change here can affect snapshot, risk, chart, sector, import, and trade behavior at once.

### 22.2 `admin.py`

Imports, reconciliation, and dedupe logic are concentrated here. Bugs here often look like data corruption later.

### 22.3 `App.tsx`

Large monolithic React component. UI behavior is often the product of multiple interacting `useEffect` blocks and local state variables rather than isolated child components.

### 22.4 Mode mismatch

If backend is static but frontend is not, or vice versa, the UI can look "wrong" even when each side is individually working.

### 22.5 Request-path performance

The repo already has evidence that some import and snapshot paths can do too much synchronous work in request handlers, especially on small Render instances. Read `CLAUDE_RENDER_IMPORT_CONTEXT_2026-03-07.md` before touching import performance.

### 22.6 Benchmark logic

Benchmark values can come from both `nav_snapshots` and `price_cache`, and the chart normalizes benchmark data client-side. Bugs in this area often look like chart bugs but are really data-source or normalization bugs.

### 22.7 Account ALL behavior

The `ALL` portfolio is not just "sum every row blindly." It has custom aggregation behavior, custom chart selection behavior, and special handling in both frontend and backend.

## 23. Recommended Reading Order for Claude

If Claude has limited context window, use this order:

1. this file;
2. `backend/app/main.py`;
3. `backend/app/config.py`;
4. `backend/app/db.py`;
5. `backend/app/services/legacy_engine.py`;
6. `backend/app/routers/admin.py`;
7. `backend/app/services/risk.py`;
8. `frontend/src/store/index.ts`;
9. `frontend/src/App.tsx`;
10. `frontend/src/components/PortfolioChart.tsx`;
11. `CLAUDE_RENDER_IMPORT_CONTEXT_2026-03-07.md` if the issue involves imports or hosted deployment behavior.

## 24. Change Guide by Problem Type

If the request is about:

- imports or account mapping: read `backend/app/routers/admin.py` first.
- wrong chart lines or benchmark values: read `legacy_engine.py`, then `PortfolioChart.tsx`, then `App.tsx`.
- wrong risk metrics: read `services/risk.py`, then trace the NAV series source.
- live-trading/auth issues: read `auth.py`, `broker.py`, `services/schwab.py`, and `services/token_store.py`.
- missing or stale quotes: read `market.py`, `services/polygon.py`, `services/stooq.py`, and `store/index.ts`.
- layout/state reset bugs: read `App.tsx` and `store/index.ts`.
- startup/deploy problems: read `main.py`, `config.py`, `Dockerfile`, and `render.yaml`.

## 25. Supporting Documents in This Repo

Use these as supplements, not replacements for this file.

- `README.md`: quick start and deployment summary.
- `SYSTEM_CONTEXT_GUIDE.md`: earlier system summary with workflow emphasis.
- `CODEBASE_CONTEXT_FOR_CLAUDE_VSCODE.md`: earlier Claude/VS Code context pack.
- `CLAUDE_RENDER_IMPORT_CONTEXT_2026-03-07.md`: hosted import timeout context and remediation notes.
- `DEBUGGING_GUIDE.md`: debugging setup and workflows.
- `CHANGES.md`: notes on several earlier fixes, especially around benchmarks and static-mode behavior.

## 26. Bottom-Line Summary

The simplest correct summary of this repository is:

- it is a full-stack portfolio workstation;
- the current intended workflow is import-driven and balance-authoritative;
- historical performance truth usually comes from `nav_snapshots`;
- benchmark truth usually comes from `price_cache`;
- `legacy_engine.py` is the operational core;
- `admin.py` controls the most operationally sensitive workflows;
- `App.tsx` is the main frontend shell and state coordinator;
- static-mode correctness matters more than generic live-trading completeness for the current dashboard intent.
