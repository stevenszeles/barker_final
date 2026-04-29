# File Map And Upload Guide

## What To Upload

Upload the entire `/Users/stevenszeles/Downloads/barker_final` repository, including this `CODEX_HANDOFF` folder.

Do not upload only `CODEX_HANDOFF`. The docs here are meant to explain the repo, not replace it.

## Suggested Top-Level Reading Map

### Core runtime files

- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/db.py`
- `frontend/src/main.tsx`
- `frontend/src/portfolio-dashboard.jsx`

### Core business logic

- `backend/app/routers/admin.py`
- `backend/app/services/legacy_engine.py`
- `backend/app/services/risk.py`
- `backend/app/services/schwab.py`

### Alternate/inactive frontend path

- `frontend/src/App.tsx`
- `frontend/src/store/index.ts`
- `frontend/src/services/api.ts`
- `frontend/src/components/PortfolioChart.tsx`
- `frontend/src/styles.css`

### Deploy/runtime config

- `render.yaml`
- `Dockerfile`
- `docker-compose.yml`
- `requirements.txt`
- `start.sh`

### Tests

- `backend/tests/test_csv_import.py`
- `backend/tests/test_balance_import_sync.py`
- `backend/tests/test_benchmark_extension.py`

## Directory Map

### `/backend/app`

- `main.py`: FastAPI app boot.
- `config.py`: environment and mode flags.
- `db.py`: schema and DB abstraction.
- `routers/`: HTTP endpoints.
- `services/`: integration and core business services.
- `legacy_engine.py`: actual portfolio engine core.
- support modules such as `analytics.py`, `market_data.py`, `chart_data.py`, `bootstrap_seed.py`.

### `/frontend/src`

- `main.tsx`: active mount point.
- `portfolio-dashboard.jsx`: active dashboard app.
- `render-dashboard.css`: active dashboard styling.
- `App.tsx`: alternate inactive UI shell.
- `store/index.ts`: alternate app state store.
- `services/api.ts`: shared axios client.
- `components/PortfolioChart.tsx`: alternate app chart component.
- `styles.css`: alternate app styling.

### `/backend/tests`

- backend-heavy regression coverage for imports, balances, benchmarks, and worker behavior.

## Existing Context Files In Repo

The repo already contains multiple context or handoff style documents outside this folder. Treat them carefully.

Rule of thumb:

- if a doc says `App.tsx` is the main UI, it is stale relative to current runtime.
- if a doc disagrees with `frontend/src/main.tsx`, trust `main.tsx`.

## Best Prompt To Give A New Codex Session

Use something like:

`Read /Users/stevenszeles/Downloads/barker_final/CODEX_HANDOFF/00_START_HERE.md first, then treat frontend/src/main.tsx -> frontend/src/portfolio-dashboard.jsx as the active UI path unless you find evidence otherwise.`

## Best Initial Sanity Checks In A New Session

1. Confirm `frontend/src/main.tsx` still imports `./portfolio-dashboard.jsx`.
2. Confirm `render.yaml` still reflects current deployment mode flags.
3. Confirm no newer frontend entrypoint replaced the active boot path.
4. Confirm whether recent work happened in `portfolio-dashboard.jsx` or `App.tsx`.
5. Confirm whether imports are currently expected to be client-side or backend-driven.

## Fast Navigation Plan For Future Debugging

### If the issue is dashboard behavior

Read:

- `frontend/src/main.tsx`
- `frontend/src/portfolio-dashboard.jsx`
- `backend/app/routers/admin.py`
- `backend/app/routers/portfolio.py`

### If the issue is imports or missing data

Read:

- `frontend/src/portfolio-dashboard.jsx`
- `backend/app/routers/admin.py`
- `backend/app/services/legacy_engine.py`
- backend tests

### If the issue is broker connectivity

Read:

- `backend/app/routers/auth.py`
- `backend/app/routers/broker.py`
- `backend/app/services/schwab.py`
- `backend/app/services/token_store.py`

### If the issue is risk or performance

Read:

- `frontend/src/portfolio-dashboard.jsx`
- `backend/app/services/legacy_engine.py`
- `backend/app/services/risk.py`
- `backend/app/routers/portfolio.py`
- `backend/app/routers/risk.py`
