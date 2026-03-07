# System Context Guide

Last updated: 2026-03-05

## 1) What this system is
This repository is a full-stack portfolio analytics dashboard:
- Backend: FastAPI (`backend/app`)
- Frontend: React + TypeScript + Vite (`frontend/src`)
- Storage: SQLite by default (or Postgres via `DATABASE_URL`)
- Delivery: single Docker service serving API + built frontend on `:8080`

Primary use case in current configuration is institutional portfolio monitoring with CSV imports from Schwab exports.

## 2) Operating model (critical)
The app currently supports two return engines:

1. Static mode (`WS_STATIC_MODE=1`, `VITE_STATIC_MODE=1`):
- Account and portfolio NAV/return are driven by imported balance history (`nav_snapshots`).
- This is the correct mode for your current workflow.
- Transactions/realized imports are used for analytics/sector decomposition but do not overwrite balance snapshots.

2. Dynamic mode (`WS_STATIC_MODE=0`):
- NAV is reconstructed from trades, cash flows, and historical prices.
- Useful for backbuilt trade-led systems, but not desired for your balance-authoritative setup.

## 3) High-level architecture

### Backend startup
`backend/app/main.py`
- Initializes schema (`ensure_schema()`)
- Starts workers (`start_workers()`)
- Mounts API routers under `WS_API_PREFIX` (default `/api`)
- Serves built frontend from `frontend/dist`

### Core routers
- `portfolio.py`: snapshot, nav, sector series
- `admin.py`: imports, reset, benchmark config
- `positions.py`: position CRUD + cash operations
- `trades.py`: trade preview/submit/blotter
- `risk.py`: risk summary/profile (metrics + correlation/rolling)
- `market.py`: quotes/options/futures helpers
- `status.py`: health/component quality status

### Core engine
`backend/app/services/legacy_engine.py`
- Position valuation and NAV construction
- Time-weighted return (TWR) calculations
- Sector sleeve and ETF series
- Snapshot assembly for dashboard cards

### Frontend
`frontend/src/App.tsx`, `frontend/src/store/index.ts`, `frontend/src/components/PortfolioChart.tsx`
- Ingests API data
- Handles CSV routing/import detection
- Renders portfolio/account/sector comparison charts
- Renders risk metrics, correlation matrix, rolling analytics

## 4) Return methodology used

### 4.1 Static mode account and portfolio returns
Source of truth: `nav_snapshots` imported from Date/Amount balance files.

- Account chart: uses that account’s snapshot history directly.
- All-account chart: aggregates per-account snapshots by date with per-account forward fill.
- Aggregate starts at the latest common start date across multi-point accounts (one-off snapshot accounts are excluded from determining start date, but included from their first available date onward).
- TWR index for snapshot mode is represented as normalized NAV (`nav / base_nav`) within the plotted window.

This prevents incorrect return drift from synthetic reconstruction and avoids jump artifacts when some accounts have sparse timelines.

### 4.2 Dynamic mode (for reference)
`build_daily_nav_series` computes daily TWR as:
- `r_t = (NAV_t - NAV_{t-1} - external_flow_t) / NAV_{t-1}`
- cumulative index multiplies `(1 + r_t)` daily
- only external contributions/withdrawals are neutralized

This behavior mirrors Schwab-style time-weighted treatment of external cash flow timing.

## 5) Import pipeline and how files are used

### Recommended import order
1. Positions CSV (`-Positions-...csv`)
2. Balance history CSVs (`Date,Amount`) for each account
3. Realized gain/loss CSV (optional for analytics)

### Positions import
Endpoint: `POST /api/admin/import-positions`
- Parses Schwab CUSTACCS multi-account positions dumps.
- Updates current holdings/cash/account_value anchors.
- In static mode, does not create synthetic import trades.

### Balance import
Endpoint: `POST /api/admin/import-balances`
- Detects `Date,Amount` format.
- Resolves account from filename mask (e.g., `XXXX013`) even if account didn’t previously exist.
- Accepts one-day lead to tolerate Schwab timezone/export timing.
- In static mode, writes full NAV snapshot timeline directly to `nav_snapshots`.

### Realized import
Endpoint: `POST /api/admin/import-transactions`
- Parses "Realized Gain/Loss - Lot Details".
- In static mode, stores trades/cash-flow analytics records with de-dup keys.
- Preserves existing NAV snapshots (`snapshots_preserved=true`).

## 6) Data model (key tables)
Defined in `backend/app/db.py`:
- `accounts`: anchor cash, as-of, account_value, anchor_mode
- `positions`: current holdings by account/instrument
- `trades`: normalized transaction records with `cash_flow`, `sector`, strategy fields
- `cash_flows`: external/internal cash adjustments
- `nav_snapshots`: historical NAV and benchmark values by account/date
- `price_cache`: historical close prices
- `import_event_keys`: idempotency guard against duplicate imports
- `settings`, `risk_metrics`, `risk_limits`, `audit_log`, `oauth_tokens`, others

## 7) Frontend behavior relevant to PM workflow
- All-accounts view no longer auto-charts a total line unless accounts are selected for compare overlays.
- Account compare mode supports adding specific accounts including `ALL` as an option.
- Sector compare mode supports multiple sector lines and additional series overlays.
- Batch balance upload is supported from Admin import UI.
- CSV file type is auto-detected (positions/balances/realized/transactions).

## 8) Risk and analytics outputs
Risk profile includes:
- Exposure matrix (gross/net/long/short, by asset class)
- Annualized return/volatility, Sharpe, Sortino, Calmar
- Drawdowns, VaR/CVaR, beta/correlation/tracking error/information ratio
- Concentration metrics, options greek exposure
- Correlation matrix and rolling volatility/tracking/drawdown series

Sector series behavior:
- `source=etf`: ETF proxy series
- `source=sleeve`: position/trade-derived sector sleeve series
- `source=auto`: sleeve if sector-tagged data exists, otherwise ETF fallback

## 9) What data is required for accurate outputs

For account/portfolio-level return accuracy:
- Required: historical account balances (`Date,Amount`) per account
- Not required: realized lots, transaction history

For sector sleeve accuracy:
- Required: sector labels on positions/trades and sufficient historical trade/cost context
- Helpful: realized/transaction history for historical sleeve composition

If only current positions + balances are available:
- Portfolio/account returns can still be accurate (balance-driven).
- Sector sleeve history can be approximate due to missing historical holdings evolution.

## 10) Local run / deploy commands

### Local Docker run
```bash
cd /Users/stevenszeles/Downloads/barker_final
docker compose up -d --build app
```
Open: `http://localhost:8080`

### Health checks
```bash
curl -s http://localhost:8080/api/status/components
curl -s http://localhost:8080/api/portfolio/nav?limit=10
curl -s http://localhost:8080/api/portfolio/snapshot
```

## 11) Environment settings that matter most
- `WS_STATIC_MODE=1` (backend balance-authoritative mode)
- `VITE_STATIC_MODE=1` (frontend static-mode UX)
- `WS_API_PREFIX=/api`
- `WS_DB_PATH` (if using SQLite file location)
- `DATABASE_URL` (if using Postgres)

## 12) Known constraints and caveats
- All-account aggregate timeline starts at shared multi-point history start to avoid false jumps from late-start accounts.
- One-off/single-row accounts are still included once they appear.
- Sector sleeves require good sector tagging discipline for historical comparability.
- If benchmark history is missing for dates, chart normalization uses available forward-filled points.

## 13) Handoff checklist for portfolio managers
1. Confirm static mode is enabled in both backend/frontend env.
2. Import positions file.
3. Import all account balance history files (batch).
4. (Optional) Import realized gain/loss file for trade analytics.
5. Validate each account’s last NAV matches broker statement.
6. Validate all-account NAV equals sum of account NAVs for same date.
7. Review sector labels and fill unassigned positions before sector attribution reviews.

## 14) Most important code files to read first
- `backend/app/main.py`
- `backend/app/routers/admin.py`
- `backend/app/services/legacy_engine.py`
- `backend/app/services/risk.py`
- `backend/app/db.py`
- `frontend/src/App.tsx`
- `frontend/src/store/index.ts`
- `frontend/src/components/PortfolioChart.tsx`

