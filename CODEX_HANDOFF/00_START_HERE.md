# Codex Handoff Pack

This folder is the source-of-truth onboarding pack for `/Users/stevenszeles/Downloads/barker_final`.

If you upload this project into a new Codex workspace, read the files in this order:

1. `00_START_HERE.md`
2. `01_EXECUTIVE_SUMMARY.md`
3. `02_ARCHITECTURE_AND_WORKFLOWS.md`
4. `03_BACKEND_DEEP_DIVE.md`
5. `04_FRONTEND_DEEP_DIVE.md`
6. `05_FUNCTION_INDEX_BACKEND.md`
7. `06_FUNCTION_INDEX_FRONTEND.md`
8. `07_KNOWN_ISSUES_AND_IMPROVEMENTS.md`
9. `08_FILE_MAP_AND_UPLOAD_GUIDE.md`

## The Most Important Truths First

- The active mounted frontend is `frontend/src/portfolio-dashboard.jsx`.
- `frontend/src/main.tsx` imports `./portfolio-dashboard.jsx`, not `./App.tsx`.
- `frontend/src/App.tsx` is a second, richer TypeScript UI path that exists in the repo but is not the currently mounted app.
- The backend entrypoint is `backend/app/main.py`.
- Most real portfolio logic lives in `backend/app/services/legacy_engine.py`.
- Most admin/import/shared-workspace behavior lives in `backend/app/routers/admin.py`.
- Existing repo docs are partially stale. When a document disagrees with the code, trust the code.

## What This Project Actually Is

This repo is a single Render-deployable portfolio dashboard that bundles:

- a FastAPI backend,
- a built frontend served by the backend,
- a large client-side dashboard for imported brokerage data,
- optional Schwab and Polygon integrations,
- fallback market-history logic through Stooq/Yahoo/cache layers,
- and a separate but currently unmounted TypeScript frontend architecture.

The repo is functional, but it has architectural drift:

- two frontend architectures,
- two import workflows,
- stale documentation that still describes the inactive path as primary,
- and several monolithic files that now carry too much responsibility.

## What To Upload To A New Codex Project

Upload the entire `barker_final` repo, not just this folder.

This `CODEX_HANDOFF` directory is meant to travel with the repo so the next Codex instance can:

- understand which code path is live,
- avoid following stale docs,
- see the workflow end to end,
- and know where the weak points are before making changes.

## Quick Orientation

- Backend runtime: `backend/app/main.py`
- Active frontend runtime: `frontend/src/main.tsx` -> `frontend/src/portfolio-dashboard.jsx`
- Inactive alternate frontend: `frontend/src/App.tsx`
- Shared API client for inactive TS app: `frontend/src/services/api.ts`
- State store for inactive TS app: `frontend/src/store/index.ts`
- Main backend engine: `backend/app/services/legacy_engine.py`
- Main admin/import router: `backend/app/routers/admin.py`
- Deployment config: `render.yaml`, `Dockerfile`, `docker-compose.yml`
- Tests worth trusting most: `backend/tests/test_csv_import.py`, `backend/tests/test_balance_import_sync.py`, `backend/tests/test_benchmark_extension.py`

## If You Only Read One More File

Read `02_ARCHITECTURE_AND_WORKFLOWS.md` next. It explains what runs, what does not, and how data actually moves through the system.
