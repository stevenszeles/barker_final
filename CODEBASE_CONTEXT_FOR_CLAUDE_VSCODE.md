# Codebase Context For Claude / VS Code

This document is a full working context pack for the repository at:
`/Users/stevenszeles/Downloads/barker_final`

It is intended to be uploaded into Claude or used as project context in VS Code so an assistant can make correct, safe, repo-aware changes.

---

## 1) Project Snapshot

- App type: single-service portfolio/trading workstation.
- Backend: FastAPI (Python 3.11).
- Frontend: React + TypeScript + Vite + Zustand + Lightweight Charts.
- Storage:
- SQLite by default (`WS_DB_PATH`, default `~/workstation.db`).
- Postgres when `DATABASE_URL` (or `WS_DATABASE_URL`) is set.
- Optional Redis cache when `REDIS_URL` is set.
- External data/broker integrations:
- Schwab (OAuth + account/quotes/options/trading).
- Polygon (snapshots, aggregates, websocket stream, options chain).
- Stooq (fallback quotes/history).
- yfinance optional fallback for some historical series.

This is effectively a monorepo with:
- `backend/` API + pricing/trade/NAV logic.
- `frontend/` UI app.
- Docker image that builds frontend and serves it through FastAPI static hosting.

---

## 2) Repository Layout

- `backend/app/main.py`: FastAPI app creation, CORS, router registration, static mount.
- `backend/app/config.py`: environment/config loading and runtime settings.
- `backend/app/db.py`: DB connection abstraction, schema creation, migrations.
- `backend/app/routers/`: HTTP API routes.
- `backend/app/services/`: core domain/data logic.
- `backend/app/services/legacy_engine.py`: main portfolio/trade/NAV engine (central logic).
- `backend/app/workers.py`: startup background warmup + price updates.
- `backend/app/bootstrap_seed.py`: optional demo seed from JSON dataset.
- `backend/tests/test_csv_import.py`: targeted regression tests around CSV imports and related logic.
- `frontend/src/App.tsx`: primary UI (large, multi-tab workstation shell).
- `frontend/src/store/index.ts`: Zustand state, fetch functions, websocket/poll handling.
- `frontend/src/services/api.ts`: Axios API client.
- `frontend/src/components/PortfolioChart.tsx`: chart rendering and overlays.
- `data/portfolio_data.json`: static/demo portfolio seed dataset.
- `Dockerfile`: multi-stage build (frontend -> Python runtime).
- `docker-compose.yml`: local container run (`8080 -> 8000`).

---

## 3) How To Run

### Docker (primary path)

```bash
cd /Users/stevenszeles/Downloads/barker_final
docker compose down --remove-orphans
docker compose up --build -d
```

Open: `http://localhost:8080`

### Local dev (split frontend/backend)

Backend:
```bash
cd /Users/stevenszeles/Downloads/barker_final
pip install -r requirements.txt
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd /Users/stevenszeles/Downloads/barker_final/frontend
npm ci
npm run dev
```

Notes:
- Vite proxies `/api` to `http://localhost:8000` by default (`frontend/vite.config.ts`).
- Backend auto-runs `ensure_schema()` on startup.

---

## 4) Build + Deploy Model

- Docker stage 1 builds frontend (`npm run build`) into `frontend/dist`.
- Docker stage 2 installs Python deps, copies backend/data, copies built frontend dist.
- Runtime command:
`uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- FastAPI mounts frontend static files at `/` when `frontend/dist` exists.
- Health endpoint for platform probes: `/health`.
- Deploy descriptors:
- `render.yaml`
- `railway.json`

---

## 5) Environment Variables (Important)

Core:
- `ENVIRONMENT`: affects `.env` loading behavior (`production` disables dotenv loading).
- `WS_API_PREFIX` default `/api`.
- `DATABASE_URL` or `WS_DATABASE_URL`: enables Postgres mode.
- `WS_DB_PATH` default `~/workstation.db` for SQLite mode.

Mode flags:
- `WS_DEMO_MODE` (`0`/`1`)
- `WS_MARKETDATA_ONLY` (`0`/`1`)
- `WS_STATIC_MODE` (`0`/`1`)
- `WS_LIVE_QUOTES` (`0`/`1`) separate quote toggle.

Market/broker integrations:
- `SCHWAB_CLIENT_ID`
- `SCHWAB_CLIENT_SECRET`
- `SCHWAB_REDIRECT_URI`
- `SCHWAB_OAUTH_BASE` default `https://api.schwabapi.com/v1/oauth`
- `SCHWAB_API_BASE` default `https://api.schwabapi.com/trader/v1`
- `SCHWAB_MARKET_BASE` default `https://api.schwabapi.com/marketdata/v1`
- `SCHWAB_SCOPES`
- `POLYGON_API_KEY`
- `POLYGON_REST_BASE`
- `POLYGON_WS_BASE`

Cache + performance:
- `REDIS_URL` / `WS_REDIS_URL`
- `CACHE_TTL` / `WS_CACHE_TTL`
- `WS_QUOTE_TIMEOUT`
- `WS_QUOTE_MAX_SYMBOLS`
- `WS_QUOTE_BATCH`
- `WS_SCHWAB_REFRESH_COOLDOWN`
- `WS_SCHWAB_TIMEOUT`

CORS / hosting:
- `ALLOWED_ORIGINS`
- `WS_ALLOW_ALL_ORIGINS` (`1` allows all)
- `RENDER_EXTERNAL_URL`, `RENDER_EXTERNAL_HOSTNAME` are auto-added to allowed origins when present.

Logging/meta:
- `WS_LOG_PATH` default `workstation.log`
- `WS_METHOD_VERSION` default `v1.0.0`
- `WS_SEED_DEMO` (`1` seeds demo data on startup if DB empty)

Frontend build-time variables:
- `VITE_API_BASE_URL` (defaults to `/api`).
- `VITE_API_PROXY_TARGET` (dev proxy target).
- `VITE_BASE_PATH` (Vite base path).
- `VITE_STATIC_MODE` (UI static gating; note behavior below in gotchas).

---

## 6) Runtime Modes + Data Source Behavior

### Static mode (`WS_STATIC_MODE=1`)
- No live market data.
- `market/snapshot` returns empty tickers.
- Market websocket disabled.
- Used for imported/manual balances/positions workflows.

### Market-data-only mode (`WS_MARKETDATA_ONLY=1`)
- Quotes/snapshots prefer Schwab, then Stooq.
- Polygon websocket path is disabled.
- Portfolio/risk still available.

### Full live mode (defaults with credentials)
- Snapshot path preference:
1) Polygon (if configured),
2) Schwab fallback,
3) Stooq fallback.

### Quote/history fallbacks
- Historical prices are cached in DB (`price_cache`) and refreshed incrementally.
- Stooq has built-in rate-limit detection and temporary suppression window.
- Deterministic fallback history can be generated when source history is insufficient.

---

## 7) Backend API Surface

Base prefix is `WS_API_PREFIX` (normally `/api`).

Non-prefixed endpoints:
- `GET /health`
- `GET /version`

### Portfolio routes (`/api/portfolio`)
- `GET /snapshot?account=...`
- `GET /nav?limit=...&account=...`
- `GET /sector?sector=...&limit=...&source=auto|etf|sleeve&account=...`

### Risk routes (`/api/risk`)
- `GET /summary`

### Trade routes (`/api/trade`)
- `GET /blotter?limit=...`
- `POST /preview`
- `POST /submit`
- `POST /submit-multi`
- `POST /cancel`
- `POST /replace`

### Status routes (`/api/status`)
- `GET /components`
- `GET /schwab`
- `GET /market-data`

### Auth routes (`/api/auth`)
- `GET /schwab/start`
- `GET /schwab/callback`
- `POST /schwab/exchange`
- `GET /schwab/status`
- `GET /schwab/diagnostics`
- `POST /schwab/logout`

### Broker routes (`/api/broker`)
- `GET /accounts`
- `GET /positions`
- `GET /balances`
- `GET /orders`
- `POST /orders/preview`
- `POST /orders/place`

### Market routes (`/api/market`)
- `GET /snapshot?symbols=...`
- `GET /aggregates?symbol=...&multiplier=...&timespan=...&from_date=...&to_date=...`
- `GET /previous-close?symbol=...`
- `GET /status`
- `GET /options-chain?underlying=...`
- `GET /option-marks?symbols=...`
- `GET /futures-ladder`
- `WS /stream?symbols=...`

### Positions routes (`/api/positions`)
- `GET /positions?account=...`
- `POST /positions`
- `DELETE /positions/{instrument_id}?account=...`
- `GET /positions/cash`
- `POST /positions/cash`
- `POST /positions/bulk`

### Admin routes (`/api/admin`)
- `GET /benchmark`
- `GET /accounts`
- `POST /reset`
- `POST /benchmark`
- `POST /rebuild-nav`
- `POST /clear-nav`
- `POST /import-nav-text`
- `POST /import-benchmark-text`
- `POST /import-positions` (multipart CSV)
- `POST /import-transactions` (multipart CSV)
- `POST /import-balances` (multipart CSV)

---

## 8) Key Backend Modules

### `legacy_engine.py` (central domain engine)
Owns most logic for:
- account normalization (`ALL` handling),
- instruments/position upsert semantics,
- trade application + preview,
- cash math + short exposure handling,
- NAV time-series construction,
- benchmark series alignment,
- drawdown/Sharpe/Sortino/VaR metrics,
- sector series generation,
- historical price retrieval/caching/fallback,
- background price updates.

This is the highest-impact file for behavior changes.

### `services/portfolio.py`
Thin wrappers over `legacy_engine` for snapshot, NAV, sector, positions, cash, rebuild/clear NAV.

### `services/trades.py`
Blotter query + submit/replace/cancel wrappers. Uses `legacy_engine.apply_trade`.

### `services/risk.py`
Risk summary composition from snapshot + NAV-derived metrics.

### `services/schwab.py`
Schwab OAuth/token refresh and API wrappers:
- account endpoints,
- quote normalization,
- options chain/marks,
- price history.

### `services/polygon.py`
Polygon REST wrappers for snapshots, aggregates, previous close, status, options chain, history.

### `services/stooq.py`
Fallback quote/history provider with rate-limit detection.

### `services/cache.py`
Redis-backed cache with in-memory fallback. Global `cache` instance used by engine.

### `workers.py`
Startup thread performs:
- history cache warmup,
- background price update loop start.

---

## 9) Database Model (from `ensure_schema`)

Primary tables:
- `settings(key, value)`
- `accounts(account, cash, asof, account_value)`
- `instruments(id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier, exchange, currency)`
- `positions(account, instrument_id, qty, price, market_value, avg_cost, pnl fields, sector, owner, entry_date, strategy fields, greeks)`
- `nav_snapshots(account, date, nav, bench)`
- `cash_flows(id, account, date, amount, note)`
- `price_cache(symbol, date, close)`
- `last_prices(instrument_id, price, asof, source)`
- `quotes(symbol, bid, ask, last, asof, source)`
- `daily_positions(account, date, instrument_id, qty, price, market_value, avg_cost, pnl, sector, strategy fields)`
- `trades(trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, trade_type, status, source, asset metadata, strategy metadata, sector, realized_pl, cost_basis, cash_flow)`
- `strategies(strategy_id, ts, underlying, name, kind, entry_net_price, entry_units)`
- `risk_limits(metric, limit_value)`
- `risk_metrics(metric, value)`
- `audit_log(ts, actor, action, details_json)`
- `oauth_tokens(provider, access_token, refresh_token, expires_at, scope)`

Migration behavior:
- Includes backward-compatible migrations from legacy schemas.
- Cleans out `ALL` as a persisted account in concrete tables (aggregate only).
- Creates useful indexes on price/trade date columns.

---

## 10) Frontend Architecture

Main shell:
- `frontend/src/App.tsx` (single large component with tabs and modal workflows).
- Tabs:
- Live mode: `Monitor`, `Trade`, `Analyze`, `Risk`, `Activity`, `Admin`.
- Static mode: `Monitor`, `Analyze`, `Activity`, `Admin` (no `Trade`).

State:
- `frontend/src/store/index.ts` uses Zustand.
- Central fetch methods:
- `fetchSnapshot`, `fetchNav`, `fetchRisk`, `fetchBlotter`, `fetchStatus`, `fetchQuotes`.
- `refreshAll()` runs the major data fetches concurrently.
- Handles websocket market stream reconnect logic and fallback polling.

Charting:
- Lightweight Charts wrapper in `PortfolioChart.tsx`.
- Portfolio, benchmark, sector overlays, extra account series support.
- Normalizes to percent-return view.

---

## 11) Frontend API Usage Map

Directly used by UI:
- Auth: `/auth/schwab/start`, `/auth/schwab/exchange`, `/auth/schwab/diagnostics`
- Status: `/status/components`, `/status/schwab`
- Portfolio: `/portfolio/snapshot`, `/portfolio/nav`, `/portfolio/sector`
- Market: `/market/snapshot`, `/market/option-marks`, websocket `/market/stream`
- Risk: `/risk/summary`
- Trades: `/trade/blotter`, `/trade/preview`, `/trade/submit`, `/trade/submit-multi`
- Positions: `/positions`, `/positions/bulk`, `/positions/cash`
- Admin:
- `/admin/accounts`
- `/admin/benchmark`
- `/admin/reset`
- `/admin/rebuild-nav`
- `/admin/clear-nav`
- `/admin/import-positions`
- `/admin/import-transactions`
- `/admin/import-balances`
- `/admin/import-nav-text`
- `/admin/import-benchmark-text`

---

## 12) CSV + Import Workflows (critical)

UI import routing heuristics in `App.tsx`:
- Detects balances reports by header text like `Balances for All-Accounts`.
- Detects Schwab positions reports via text patterns and filename patterns like `positions_YYYY_MM_DD`.
- Detects transactions CSV via headers including `action`, `amount`, `quantity`, and fees.
- Detects account statements via `account statement` marker.
- Falls back to generic CSV-to-positions bulk import with flexible alias map.

Backend import endpoints:
- `POST /api/admin/import-positions`
- Parses Schwab-style multi-account export.
- Can remap imported account names to existing accounts.
- Clears/rebuilds relevant account state before reimport.
- `POST /api/admin/import-transactions`
- Requires a specific account (not `ALL`).
- Supports standard CSV and Schwab realized-lot format.
- Can rebuild NAV after import.
- Static mode uses special static NAV reconstruction path.
- `POST /api/admin/import-balances`
- Parses balances report sections and updates account cash/account_value.
- In static mode can also store NAV snapshots from imported balances.

Text paste import endpoints:
- `POST /api/admin/import-nav-text` for account NAV history.
- `POST /api/admin/import-benchmark-text` for benchmark history (stored as `^GSPC` in `price_cache`).

---

## 13) Trade + Instrument Semantics

Supported asset classes in practice:
- `EQUITY`
- `OPTION`
- `FUTURE`

Options:
- OSI symbol support (parse/build).
- Multi-leg option submit path writes grouped strategy metadata.
- Option marks can be fetched from Schwab (`/market/option-marks`) or demo fallback in demo mode.

Futures:
- Futures contract specs and multipliers in `services/futures.py`.
- Ladder endpoint provides metadata and mark quotes when available.

Positions write constraints:
- Bulk upsert with `account=ALL` requires each row to include a specific account.
- Cash update endpoint requires specific account, not `ALL`.

---

## 14) UI Behavior Highlights

- Watchlist persisted in localStorage key: `ws_watchlist`.
- Keyboard shortcuts:
- `/` focus symbol input
- `M` Monitor
- `T` Trade (if not static mode)
- `A` Analyze
- `R` Risk
- `Y` Activity
- `D` Admin
- `F` chart fullscreen in Monitor
- `Esc` exit chart fullscreen
- Market data connection strategy:
- use websocket stream if source is polygon and healthy,
- fallback to REST quote polling every 15s otherwise.

---

## 15) Tests + Quality

Current tests are targeted (not full-suite broad):
- File: `backend/tests/test_csv_import.py`
- Focus:
- CSV type detection and parsing behavior,
- ALL-account bulk upsert safeguards,
- worker startup non-blocking behavior,
- action/close mapping helpers.

Run:
```bash
cd /Users/stevenszeles/Downloads/barker_final
pytest -q backend/tests/test_csv_import.py
```

---

## 16) Operational Gotchas

1) Docs drift
- Some docs in `QUICK_REFERENCE.md` reference endpoints that no longer match current routers.
- Treat code in `backend/app/routers/` and `frontend/src/store/index.ts` as source of truth.

2) `VITE_STATIC_MODE` behavior
- Frontend computes static mode as `import.meta.env.VITE_STATIC_MODE !== "0"`.
- If unset, this evaluates to `true`, which can hide Trade tab/features unexpectedly.

3) ALL account semantics
- `ALL` is aggregate/read context, not a real persisted account for writes.
- Many mutating flows require specific account context.

4) Large central files
- `frontend/src/App.tsx` and `backend/app/services/legacy_engine.py` are large and tightly coupled.
- Make focused edits and avoid broad refactors unless explicitly requested.

5) Token refresh cooldown
- Schwab refresh errors trigger cooldown (`WS_SCHWAB_REFRESH_COOLDOWN`) that can temporarily block marketdata use.

---

## 17) Safe Change Workflow For AI Assistants

When editing this codebase:

1) Check mode flags first:
- `WS_STATIC_MODE`, `WS_MARKETDATA_ONLY`, `WS_DEMO_MODE`.

2) For backend behavior:
- confirm whether change belongs in router (transport) or `legacy_engine` (domain logic).

3) For UI behavior:
- verify state source in `store/index.ts` before changing UI logic in `App.tsx`.

4) For imports:
- preserve account-specific safeguards; do not weaken `ALL` account protections.

5) For DB changes:
- implement via `ensure_schema()` additive migration style.

6) For new endpoints:
- add router function,
- wire into `main.py` if new router file,
- update frontend store/client usage.

7) Always regression-check:
- CSV imports,
- snapshot/nav/risk responses,
- static mode vs live mode tab behavior.

---

## 18) Suggested Prompt Header To Use With This File

Use this at the top of Claude/VS Code sessions:

```text
You are working on the repository at /Users/stevenszeles/Downloads/barker_final.
Use CODEBASE_CONTEXT_FOR_CLAUDE_VSCODE.md as canonical architecture/runtime guidance.
Before coding, identify which runtime mode is active (static, marketdata-only, demo, live).
Preserve ALL-account safety rules and existing import workflows.
Prefer minimal, targeted changes in legacy_engine.py and App.tsx.
When adding/changing APIs, update both backend router contracts and frontend callers.
```

---

## 19) Most Important Files To Read First

If context window is limited, read in this order:

1) `backend/app/main.py`
2) `backend/app/config.py`
3) `backend/app/db.py`
4) `backend/app/services/legacy_engine.py`
5) `backend/app/routers/admin.py`
6) `frontend/src/store/index.ts`
7) `frontend/src/App.tsx`
8) `backend/tests/test_csv_import.py`

---

## 20) Dependencies

Python (`requirements.txt`):
- fastapi, uvicorn, pydantic, pydantic-settings
- psycopg2-binary
- redis, hiredis
- numpy, pandas
- httpx, websockets, yfinance
- python-dotenv
- gunicorn

Frontend (`frontend/package.json`):
- react, react-dom
- axios
- zustand
- lightweight-charts
- @tanstack/react-table
- vite + typescript + @vitejs/plugin-react

---

End of context file.
