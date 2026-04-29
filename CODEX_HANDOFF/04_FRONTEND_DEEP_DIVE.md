# Frontend Deep Dive

## Active Boot Path

The active frontend starts in `frontend/src/main.tsx`.

What it does:

- imports React and ReactDOM,
- imports `App` from `./portfolio-dashboard.jsx`,
- imports `render-dashboard.css`,
- wraps the app in a small inline error boundary,
- mounts under `#root`.

That means `portfolio-dashboard.jsx` is not a side file or legacy artifact. It is the product.

## Active App: `frontend/src/portfolio-dashboard.jsx`

This file is a monolithic dashboard application with three major layers in one file:

1. constants and lookup maps,
2. parsing/modeling/helpers,
3. the main React component and upload/UI handlers.

## File Style And Formatting

The file is structured in a classic "big single-file dashboard" pattern:

- large constant blocks at the top,
- many pure helper functions,
- a big exported `App()` component,
- a final reusable `UploadCard()` subcomponent.

It mixes:

- React hooks,
- inline style objects,
- Recharts components,
- local helper formatters,
- direct `fetch`,
- an imported axios instance for one part of the API path,
- and browser storage management.

The code is dense but surprisingly systematic. Most helpers are pure or near-pure and are placed above the component so they can be reused across derived calculations.

## State Model

The active dashboard manages several state categories at once:

### Persisted local UI state

- selected tab,
- timeframe selections,
- selected account,
- benchmark visibility,
- risk matrix mode,
- performance chart settings.

### Shared workspace state

- accounts and position groups,
- balance history,
- realized trades,
- sector targets,
- sector overrides,
- attribution overrides,
- transfer dates,
- futures PnL snapshots.

### Market/benchmark cache state

- S&P data,
- sector ETF benchmark history,
- cached security history.

### Derived analytics state

- legal NAV by account,
- aggregated positions,
- transferred positions/trades,
- sector exposures,
- performance models,
- risk/correlation matrices.

## Persistence Strategy

The active app persists aggressively in the browser.

Key patterns:

- build-versioned app state storage key,
- legacy storage key migration support,
- dedicated market cache key,
- dedicated security history key.

Consequence:

- changing `APP_BUILD_VERSION` can intentionally invalidate prior local saved state.
- this is useful for migrations, but it can also make older local workspace data appear to vanish after a version bump.

## Shared Workspace Sync

The active dashboard treats the workspace as mergeable JSON.

Core behavior:

- build shared payload from local state,
- fetch current server snapshot,
- compare state signatures,
- debounce writes,
- poll for remote changes,
- attempt non-conflicting merge on version mismatch,
- fall back to local cache when sync is unavailable.

This is one of the most sophisticated frontend subsystems in the repo.

It is also a place where subtle bugs can appear because:

- state is large,
- signatures are JSON-derived,
- merges are structural rather than semantic,
- and not every user edit conflict can be merged safely.

## Upload Workflow In The Active UI

The active dashboard does not primarily upload files to the backend import endpoints.

Instead:

- positions CSVs are parsed in-browser,
- futures statements are parsed in-browser,
- balance history CSVs are parsed in-browser,
- realized gain/loss CSVs are parsed in-browser.

After parsing:

- React state is updated,
- workspace is marked dirty,
- shared sync eventually persists the workspace,
- benchmarks may be refreshed,
- charts rerender from client-side derived models.

This is why the active UI can feel disconnected from the backend import logic even though both coexist in the repo.

## Performance Modeling

The active frontend builds performance data itself.

Important helper groups:

- NAV/return normalization,
- daily flow estimation,
- aggregate performance model construction,
- return statistics,
- benchmark chart composition,
- comparison row building,
- carry/transfer attribution,
- realized-trade carry estimation,
- sector series transformation,
- correlation calculations.

This gives the UI a lot of flexibility, but it also duplicates logic that partly exists on the backend side.

## Legal Vs Desk Performance

One especially important distinction:

- desk performance is derived from workspace data in the browser,
- legal performance comes from backend `/api/portfolio/nav`.

The dashboard can compare the two.

That is powerful for reconciliation, but it also means discrepancies can be caused by:

- different source data,
- different import workflows,
- or different benchmark histories.

## Benchmarks And History

The frontend benchmark subsystem:

- loads SPX and sector ETF data,
- caches it locally,
- uses a Stooq-like history endpoint,
- refreshes SPX on an interval and on tab visibility changes,
- detects some Render wake/hibernate edge cases.

This subsystem is operationally important because many charts depend on it.

## Account And Attribution Logic

The active UI has unusually rich account-attribution behavior:

- custody account versus attributed account,
- position transfer effective dates,
- realized-trade attribution overrides,
- futures PnL snapshots,
- legacy futures-account migration logic,
- sector override resolution at multiple symbol levels.

This is where a lot of business nuance lives.

## Inactive Alternate App: `frontend/src/App.tsx`

This file is a separate UI shell with a more conventional structure:

- formatting helpers,
- chart preference helpers,
- OSI/futures helpers,
- a large `App()` component,
- axios-backed API calls,
- server-driven import handlers.

It pairs with:

- `frontend/src/store/index.ts`
- `frontend/src/services/api.ts`
- `frontend/src/components/PortfolioChart.tsx`
- `frontend/src/styles.css`

It appears to represent either:

- an earlier workstation architecture,
- a migration target,
- or a parallel app that was never fully retired.

## Styling

There are two styling systems in the repo:

- `render-dashboard.css` for the active mounted JSX dashboard,
- `styles.css` for the inactive TS workstation shell.

This matches the two-frontend split and is another sign of architectural drift.

## What A Frontend Change Usually Affects

### If you change helper functions above `App()`

You often affect many derived charts and summaries at once.

### If you change storage keys

You can invalidate saved browser state or strand prior user workspaces.

### If you change shared workspace payload shape

You must update both frontend normalization/merge logic and backend shared-state read/write handling.

### If you change upload parsing

You are changing the currently active user import experience, even if the backend import endpoints still exist untouched.

### If you change `App.tsx`

You are changing a non-mounted path unless you also repoint `main.tsx`.

## Frontend Weak Spots

- the active dashboard is too large for confident local reasoning,
- there is no strong type system around the active JSX file,
- analytics logic is duplicated and easy to diverge from backend truth,
- upload parsing in the browser limits reuse of the backend import pipeline,
- and the existence of two frontend systems makes maintenance harder than it should be.
