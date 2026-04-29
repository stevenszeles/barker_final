# Portfolio Dashboard (Simplified, Reliable Build)

This build focuses on what matters most:

- Track total, account-level, and portfolio-level performance
- Compare portfolios against each other and benchmark indices
- Show practical risk metrics (volatility, Sharpe, drawdown, VaR, beta)
- Keep the codebase readable and maintainable

## Stack

- Backend: FastAPI (`/Users/stevenszeles/Downloads/barker_final/backend/app`)
- Frontend: React + TypeScript + Lightweight Charts (`/Users/stevenszeles/Downloads/barker_final/frontend/src`)
- Primary storage: SQLite by default or Postgres via `DATABASE_URL`
- Demo seed data only: `/Users/stevenszeles/Downloads/barker_final/data/portfolio_data.json`

## Run locally

```bash
cd /Users/stevenszeles/Downloads/barker_final
docker compose down --remove-orphans
docker compose up --build -d
```

Open: `http://localhost:8080`

## Closed/Realized Sector Categorization

1. Import positions and balance history first (so account + sector context exists).
2. Import realized gain/loss CSVs in Admin.
3. In **Admin → Closed / Realized Categorization**:
   - choose account,
   - choose sector (and optional symbol),
   - click **Assign Sector to Realized Trades**.
4. Use **Auto-Classify from Position Labels** to tag unassigned realized rows from existing position sector mappings.
5. In **Activity**, keep `Closed` enabled and use each trade row’s **Sector** dropdown for one-off overrides.

## Key API endpoints

- `GET /health`
- `GET /version`
- `GET /api/portfolio/snapshot`
- `GET /api/portfolio/nav?limit=120&account=ALL`
- `GET /api/risk/summary`
- `GET /api/status/components`
- `POST /api/admin/import-positions`
- `POST /api/admin/import-balances`
- `POST /api/admin/import-transactions`

## Data model

Primary app data lives in the database, not in a JSON file:

- `accounts`: current cash / account anchors
- `positions`: current holdings
- `nav_snapshots`: historical NAV and benchmark values
- `price_cache`: cached benchmark and symbol history
- `trades`: blotter / realized / transaction analytics

Edit `/Users/stevenszeles/Downloads/barker_final/data/portfolio_data.json` only if you are using demo seeding via `WS_SEED_DEMO=1`:

- `benchmarks`: default benchmark symbols for overlay
- `accounts[]`: top-level account containers
- `portfolios[]`: logical sleeves/strategies within each account
- `positions[]`: `{symbol, shares, avg_cost}` for each holding
- `cash`: cash balance per portfolio

For the primary import-driven workflow, use the Admin tab to import positions, balances, and realized trades.

## Reliability approach

- Market history uses Stooq where available
- If a symbol history is unavailable or throttled, deterministic fallback history is used so dashboard remains functional
- Portfolio analytics still render even during data-source issues

## Deployment

Current Docker image serves both API and frontend in one service. Deploy this container to Railway/Render and expose container port `8000`.

For Render production stability:
- Set `DATABASE_URL` to your Render Postgres connection string (required for persistent imports).
- Set `WS_LIVE_QUOTES=0` (reduces background market-data load).

## Full System Context

For the best single-file handoff for Claude or any repo-aware coding assistant, start with:

`/Users/stevenszeles/Downloads/barker_final/CLAUDE_COMPLETE_PROJECT_CONTEXT.md`

Supporting context docs:

- `/Users/stevenszeles/Downloads/barker_final/SYSTEM_CONTEXT_GUIDE.md`
- `/Users/stevenszeles/Downloads/barker_final/CODEBASE_CONTEXT_FOR_CLAUDE_VSCODE.md`
- `/Users/stevenszeles/Downloads/barker_final/CLAUDE_RENDER_IMPORT_CONTEXT_2026-03-07.md`
