# Executive Summary

## Purpose

This project is a portfolio/workstation dashboard for monitoring positions, balances, performance, sector exposure, risk, and imported brokerage history. It supports three broad operating styles:

- live broker-assisted mode through Schwab,
- static/manual mode driven by imported positions and balances,
- and partial market-data mode with local state and fallback quote/history sources.

## Current Reality

The repo contains two overlapping frontend systems:

- `frontend/src/portfolio-dashboard.jsx`
  This is the active UI. It is mounted by `frontend/src/main.tsx`. It performs client-side CSV parsing, local persistence, shared workspace sync, benchmark loading, sector analytics, performance modeling, and legal-vs-desk comparison logic.

- `frontend/src/App.tsx`
  This is an alternate TypeScript workstation shell. It uses `frontend/src/store/index.ts`, the axios API layer, and server-side admin import endpoints. It appears more structured in some places, but it is not the UI currently booted by the app.

That split is the single most important thing to understand before changing anything.

## Backend Shape

The backend looks layered, but in practice much of the real behavior collapses into a few large files:

- `backend/app/main.py`
  FastAPI startup, router registration, CORS, health/version endpoints, and static-file mounting.

- `backend/app/routers/admin.py`
  Shared dashboard state, CSV imports, NAV rebuild entrypoints, sector assignment, balance import logic, and several data-repair utilities.

- `backend/app/services/legacy_engine.py`
  The actual portfolio engine: positions, cash, NAV, price history, benchmark logic, option/futures helpers, trade application, risk inputs, and background price updates.

- `backend/app/services/portfolio.py`
  Mostly a thin wrapper over `legacy_engine.py`.

This means the repo looks more modular than it really is. Many "service" and "router" layers are slim facades over a few overloaded modules.

## End-To-End Runtime Flow

1. Render or local Docker starts the backend via `backend/app/main.py`.
2. Startup calls `ensure_schema()`, optionally seeds demo data, and starts workers.
3. If `frontend/dist` exists, FastAPI serves it at `/`.
4. The browser loads `frontend/src/main.tsx`, which mounts `portfolio-dashboard.jsx`.
5. The active dashboard hydrates local persisted state and shared workspace state.
6. The dashboard fetches benchmark history, polls shared workspace state, and fetches legal NAV data from `/api/portfolio/nav`.
7. User uploads are parsed in the browser, not sent to backend import endpoints in the active UI.
8. Parsed client-side state is stored in local storage and synced to `/api/admin/shared-dashboard-state`.

That is very different from the alternate `App.tsx` path, where files are uploaded to backend `/api/admin/import-*` endpoints and persisted into the database-backed import pipeline.

## What The Project Is Good At

- handling portfolio/position/risk calculations from imported or cached data,
- providing a rich single-screen dashboard with extensive derived analytics,
- preserving workspace-like UI state across sessions,
- and degrading across multiple market data sources instead of hard failing immediately.

## What Makes The Project Fragile

- two competing frontend workflows,
- stale documentation that still points to the inactive UI,
- heavy business logic in oversized files,
- duplicated analytics between frontend and backend,
- limited coverage for the currently mounted frontend,
- and environment/config drift between local docs and Render production settings.

## What A New Codex Session Should Assume

- The repo is not cleanly refactored.
- The active path is the monolithic JSX dashboard.
- The TypeScript path is real, useful, and potentially a future direction, but it is not currently the runtime truth.
- Any change to imports, persistence, or performance should be evaluated against both the active UI and the dormant server-driven workflow.
