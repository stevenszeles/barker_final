# Portfolio Dashboard (Simplified, Reliable Build)

This build focuses on what matters most:

- Track total, account-level, and portfolio-level performance
- Compare portfolios against each other and benchmark indices
- Show practical risk metrics (volatility, Sharpe, drawdown, VaR, beta)
- Keep the codebase readable and maintainable

## Stack

- Backend: FastAPI (`/Users/stevenszeles/Downloads/barker_final/backend/app`)
- Frontend: React + TypeScript + Lightweight Charts (`/Users/stevenszeles/Downloads/barker_final/frontend/src`)
- Data source: JSON file (`/Users/stevenszeles/Downloads/barker_final/data/portfolio_data.json`)

## Run locally

```bash
cd /Users/stevenszeles/Downloads/barker_final
docker compose down --remove-orphans
docker compose up --build -d
```

Open: `http://localhost:8080`

## Key API endpoints

- `GET /api/health`
- `GET /api/options`
- `GET /api/dashboard?scope=total&range=1Y&compare=account:taxable,portfolio:retirement:equity&benchmarks=SPY,QQQ`

## Data model

Edit `/Users/stevenszeles/Downloads/barker_final/data/portfolio_data.json`:

- `benchmarks`: default benchmark symbols for overlay
- `accounts[]`: top-level account containers
- `portfolios[]`: logical sleeves/strategies within each account
- `positions[]`: `{symbol, shares, avg_cost}` for each holding
- `cash`: cash balance per portfolio

After data edits, refresh the page. The backend auto-reloads file contents on file change.

## Reliability approach

- Market history uses Stooq where available
- If a symbol history is unavailable or throttled, deterministic fallback history is used so dashboard remains functional
- Portfolio analytics still render even during data-source issues

## Deployment

Current Docker image serves both API and frontend in one service. Deploy this container to Railway/Render and expose container port `8000`.
