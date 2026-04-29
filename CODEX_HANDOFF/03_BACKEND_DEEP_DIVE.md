# Backend Deep Dive

## Overview

The backend is a FastAPI application that looks modular but concentrates a large amount of real behavior into `legacy_engine.py` and `admin.py`.

Think of the backend in five layers:

1. app boot and configuration,
2. storage and schema utilities,
3. routers and HTTP surface,
4. thin service wrappers,
5. the legacy portfolio engine.

## Boot And Configuration

### `backend/app/main.py`

Responsibilities:

- configure logging,
- build the FastAPI app,
- configure CORS,
- register all routers,
- expose `/health` and `/version`,
- run schema init and worker boot on startup,
- serve `frontend/dist` if present.

Operational note:

- if database startup fails, the app can enter a degraded mode instead of hard crashing.

### `backend/app/config.py`

Responsibilities:

- load `.env` outside production,
- normalize environment flags,
- create config objects for Schwab, Polygon, OpenFIGI, and cache,
- expose runtime switches such as `static_mode`, `marketdata_only`, and `live_quotes`.

Important effect:

- this file decides whether the app behaves like a live broker dashboard, a static uploaded-history dashboard, or a mostly local market-data dashboard.

## Storage Layer

### `backend/app/db.py`

Responsibilities:

- connect to SQLite or Postgres,
- adapt SQL between SQLite and Postgres styles,
- create and evolve schema through `ensure_schema()`,
- provide `with_conn()` convenience access,
- expose storage diagnostics.

Important design choices:

- SQLite is still treated as a first-class backend.
- Postgres support is implemented by SQL adaptation rather than by a true ORM.
- A global re-entrant lock serializes DB access.

Implications:

- simpler portability,
- but higher risk of contention on import-heavy or rebuild-heavy workloads,
- and schema evolution remains hand-managed.

## Router Surface

### `backend/app/routers/portfolio.py`

Thin wrapper over portfolio service:

- `/portfolio/snapshot`
- `/portfolio/nav`
- `/portfolio/sector`

Purpose:

- expose snapshot, NAV history, and sector-series data to the UI.

### `backend/app/routers/positions.py`

Responsibilities:

- list positions,
- upsert a position,
- bulk upsert positions,
- delete a position,
- read and set cash.

This router is more CRUD-like than the admin importer and is useful for direct editing or tests.

### `backend/app/routers/trades.py`

Responsibilities:

- blotter fetch,
- preview order,
- submit order,
- submit multileg order,
- cancel,
- replace.

It translates router payloads into service-layer calls and handles Schwab-related error shaping.

### `backend/app/routers/risk.py`

Responsibilities:

- expose risk summary,
- expose richer risk profile payload.

The heavy computations still happen in `backend/app/services/risk.py`.

### `backend/app/routers/status.py`

Responsibilities:

- expose component health,
- expose Schwab auth/availability status,
- expose market-data status.

This is more of an operational introspection surface than a core business router.

### `backend/app/routers/auth.py`

Responsibilities:

- start Schwab OAuth,
- handle callback,
- exchange auth code,
- show auth status,
- logout,
- expose diagnostics.

It orchestrates auth flow but delegates token storage and Schwab API calls to services.

### `backend/app/routers/broker.py`

Responsibilities:

- expose live broker accounts,
- positions,
- balances,
- orders,
- order preview,
- order placement.

This is the live Schwab broker surface and is distinct from the local portfolio engine.

### `backend/app/routers/market.py`

Responsibilities:

- market snapshots,
- aggregates/history,
- previous close,
- market status,
- options chains,
- option marks,
- futures ladder,
- Polygon quote stream websocket.

This router contains mode branching and fallback routing based on static/live/market-data settings.

### `backend/app/routers/stooq_proxy.py`

Responsibilities:

- normalize benchmark/history symbol requests,
- prefer cached history where possible,
- directly fetch fallback history when cache misses happen,
- expose a Stooq-like daily history endpoint used by the frontend benchmark loader.

### `backend/app/routers/admin.py`

This is one of the two most important backend files.

Responsibilities:

- shared dashboard workspace read/write,
- benchmark config,
- account listing,
- reset behavior,
- NAV rebuild/clear,
- positions import,
- transactions import,
- balances import,
- benchmark text import,
- NAV text import,
- trade sector assignment,
- trade realized value updates,
- sector-performance input storage.

This file is a real subsystem, not a normal router.

## Service Layer

### Thin wrappers

`backend/app/services/portfolio.py`

- mostly forwards calls to `legacy_engine.py`.
- use it as a seam, but do not mistake it for the actual core logic layer.

`backend/app/services/trades.py`

- wraps `legacy_engine` trade preview/submit flows,
- builds order payloads,
- can also call Schwab order endpoints.

`backend/app/services/status.py`

- synthesizes component health.

### Richer support services

`backend/app/services/risk.py`

- computes exposure breakdowns,
- Greeks summaries,
- rolling stats,
- drawdown and return metrics,
- correlation payloads.

`backend/app/services/schwab.py`

- OAuth exchange and refresh,
- access-token retrieval,
- broker account and position fetches,
- quotes and option chains,
- order preview/place,
- price history fetches.

`backend/app/services/stooq.py`

- history and quote fallback layer,
- rate-limit detection,
- symbol normalization,
- Yahoo fallback history fetch.

`backend/app/services/polygon.py`

- quote and history wrappers against Polygon REST,
- options chain,
- market status helpers.

`backend/app/services/openfigi.py`

- resolves FIGI-like identifiers to symbols.

`backend/app/services/options.py`

- parses and builds OSI option symbols,
- provides demo chain helpers.

`backend/app/services/futures.py`

- parses futures roots/month codes,
- resolves futures specs,
- builds demo/live futures ladders.

`backend/app/services/cache.py`

- Redis-backed if available,
- otherwise in-memory fallback.

`backend/app/services/token_store.py`

- stores OAuth tokens in the database.

## The Real Core: `legacy_engine.py`

This file is effectively the application kernel.

It handles:

- time/date normalization,
- account label normalization,
- benchmark selection,
- price-cache maintenance,
- symbol history fetch/storage,
- quote caching,
- live position valuation,
- cash calculation,
- NAV series building,
- risk metric helpers,
- trade application,
- position persistence,
- snapshot assembly,
- sector series,
- NAV rebuilds,
- background price updates.

If the project were ever refactored properly, `legacy_engine.py` would likely be split into:

- pricing/history,
- portfolio accounting,
- imports/reconciliation,
- options/futures instrument logic,
- analytics/risk,
- and background job orchestration.

## Data Tables And Their Roles

### `settings`

- benchmark config,
- shared dashboard state,
- sector baselines and target weights,
- misc configuration values.

### `accounts`

- per-account cash anchor,
- account value,
- anchor mode,
- account-level temporal state.

### `positions`

- current holdings snapshot by account and instrument.

### `trades`

- trade ledger,
- imported rows,
- realized values,
- synthetic/import-generated activity.

### `cash_flows`

- non-trade cash adjustments,
- fees,
- balance-history adjustments.

### `nav_snapshots`

- persisted NAV points used to avoid recomputing from scratch.

### `price_cache`

- cached historical closes.

### `oauth_tokens`

- Schwab token storage.

### `import_event_keys`

- deduplication support for repeated imports.

## Import Mechanics

There are two backend-heavy import paths:

### Positions import

- parses Schwab positions exports,
- preserves some existing metadata,
- normalizes account aliases,
- clears or preserves prior data based on mode,
- upserts positions and cash,
- stores initial NAV snapshot when possible.

### Transactions import

- requires a specific account,
- parses normal transaction exports or realized-lot exports,
- deduplicates with event keys,
- stores trades and cash flows,
- may infer start cash,
- queues NAV rebuild.

### Balances import

- parses Date/Amount history,
- resolves target account,
- can write direct NAV snapshots in static or fast mode,
- or use adjustment logic to reconcile historical balances against trading activity.

## What A Backend Change Usually Touches

- import logic changes often touch `admin.py`, `legacy_engine.py`, schema assumptions, and tests.
- pricing/history changes often touch `legacy_engine.py`, `stooq.py`, `schwab.py`, `market.py`, and cache behavior.
- account/portfolio changes often touch `legacy_engine.py`, `portfolio.py`, `risk.py`, and `/portfolio/*` routes.
- auth/broker changes mainly touch `auth.py`, `broker.py`, `schwab.py`, and token storage.

## Backend Weak Spots

### Monoliths

- `admin.py` and `legacy_engine.py` are too large and too cross-cutting.

### Locking

- `db.py` uses a global lock that simplifies consistency but limits concurrency.

### Persistence split

- active frontend workspace data can live mostly outside the main import tables.

### Mode complexity

- `static_mode`, `marketdata_only`, and `live_quotes` create many code branches that are hard to reason about together.

### Token security

- OAuth tokens are stored plainly in DB-managed storage.

### Multi-instance sync risk

- shared workspace file mirroring under the home directory is not robust for scaled deployments.
