# Known Issues And Improvements

This file is intentionally blunt. These are the places where the project is misaligned, fragile, incomplete, or leaving capability on the table.

## Highest-Impact Issues

### 1. Two frontend architectures are living in the same repo

- `frontend/src/portfolio-dashboard.jsx` is the active mounted UI.
- `frontend/src/App.tsx` is a different UI with a different data flow.

Why this matters:

- new contributors can work on the wrong app,
- documentation can describe the wrong flow,
- feature parity drifts,
- bug fixes can land in the inactive path and never affect production.

Improvement:

- explicitly retire one path or promote one path to canonical status,
- then remove the other or quarantine it behind a clear feature branch or legacy directory.

### 2. Two import systems coexist and do not represent the same source of truth

Active UI import flow:

- parse CSV in browser,
- store/merge workspace JSON,
- sync workspace JSON to shared state endpoint.

Alternate TS flow:

- upload CSVs to backend admin endpoints,
- persist positions/trades/cash_flows/nav_snapshots in DB.

Why this matters:

- the UI can show state not reflected in backend tables,
- backend NAV can disagree with frontend-modeled performance,
- support/debugging becomes much harder.

Improvement:

- choose one canonical import pipeline,
- ideally move active UI imports onto the backend import services or wrap backend parsing with typed client contracts.

### 3. Existing docs are partially stale

Several legacy context docs still imply that `frontend/src/App.tsx` is the main UI even though `main.tsx` mounts `portfolio-dashboard.jsx`.

Why this matters:

- assistants and humans alike can misdiagnose issues,
- work gets done in the wrong files,
- the repo feels more coherent on paper than it is in runtime.

Improvement:

- replace or archive stale docs,
- point all onboarding docs to the active boot path,
- keep this `CODEX_HANDOFF` folder with the repo.

### 4. `legacy_engine.py` and `admin.py` are oversized

Why this matters:

- too much behavior is hidden in files that are difficult to reason about,
- changes have wide blast radius,
- testing and refactoring are harder,
- onboarding cost stays high.

Improvement:

- split by domain:
  pricing/history,
  portfolio accounting,
  imports,
  account reconciliation,
  sector analytics,
  shared workspace state,
  nav maintenance.

### 5. Active frontend has little direct test coverage

Most tests target backend import logic. There is very little confidence coverage around:

- the active mounted dashboard,
- shared workspace merge behavior,
- client-side CSV parsing edge cases in the live UI,
- or legal-vs-desk reconciliation flows.

Improvement:

- add browser-level tests around the active UI,
- especially upload parsing, shared-state sync, and performance chart correctness.

## Backend Mechanics That Are Inadequate Or Need Improvement

### Global DB lock in `db.py`

Issue:

- simple and safe, but serializes expensive operations.

Why it underperforms:

- imports, NAV rebuilds, and cache refresh work can queue behind one another.

Improvement:

- reduce lock scope,
- separate read-heavy from write-heavy paths,
- or move to a cleaner connection/session model.

### Plain token storage

Issue:

- OAuth access and refresh tokens are stored in DB-managed plain values.

Improvement:

- encrypt at rest,
- or move sensitive token storage into a secrets-backed mechanism.

### In-memory cache fallback does not honor TTL semantics

Issue:

- `CacheService` stores fallback items forever until overwritten or cleared.

Improvement:

- implement expiry metadata in memory mode so behavior matches Redis more closely.

### Shared workspace fallback file is weak for multi-instance deployment

Issue:

- mirroring shared state to a local home-directory file is useful on a single machine but not robust in horizontally scaled or ephemeral environments.

Improvement:

- rely on DB or dedicated object storage only,
- or make the file mirror explicitly local-dev only.

### Mode branching is too implicit

Issue:

- `static_mode`, `marketdata_only`, and `live_quotes` interact across many files without one obvious mode matrix.

Improvement:

- create explicit mode documentation and perhaps an enum-like derived runtime mode object.

### SQL adaptation is clever but brittle

Issue:

- SQLite/Postgres compatibility is handled with custom string rewriting.

Improvement:

- move repeated SQL behaviors behind cleaner repository helpers,
- or adopt a lightweight query layer for conflict semantics and migrations.

## Frontend Mechanics That Are Inadequate Or Need Improvement

### Active dashboard is too large and weakly typed

Issue:

- `portfolio-dashboard.jsx` contains state sync, import parsing, analytics, chart prep, attribution, and view logic all together.

Improvement:

- split into:
  storage/sync hooks,
  import parsers,
  analytics utilities,
  account attribution helpers,
  chart components,
  tab modules.

### Browser-only import parsing leaves backend import system underused

Issue:

- active user flow bypasses stronger backend persistence and dedupe logic.

Improvement:

- move the active app toward server-validated imports,
- or at minimum share parsing/validation schemas across client and server.

### Frontend and backend both compute related analytics

Issue:

- performance and attribution logic live in both places.

Consequence:

- disagreement risk,
- hard-to-debug reconciliation gaps,
- duplicated maintenance cost.

Improvement:

- choose where truth lives for each metric and make the other side a renderer, not a second engine.

### Versioned local storage can make prior workspace state appear lost

Issue:

- `APP_BUILD_VERSION` is part of the storage key.

Improvement:

- keep a migration ledger and explicit upgrade path,
- or use a stable key with internal schema versioning.

## Features That Do Not Fully Work Or Do Not Reach Their Potential

### Active UI does not fully leverage backend import power

- backend has richer import dedupe, trade replay, NAV rebuild, and sector persistence behavior than the active UI uses.

### Alternate TS app is not clearly retired or promoted

- it has real features, but because it is unmounted, it is easy to neglect and easy to misread as current.

### Legal-vs-desk reconciliation is valuable but fragile

- it depends on two pipelines staying close enough to compare meaningfully.

### Live quotes are effectively dialed down in deployed config

- Render config currently sets `WS_LIVE_QUOTES=0`, so live behavior is intentionally constrained.

### Render wake handling is ad hoc

- benchmark history loading has special-case wake detection rather than a more formal warmup/readiness strategy.

### Shared merge conflict handling is structural, not semantic

- JSON merge logic helps, but it cannot deeply understand business intent conflicts.

## Suggested Refactor Order

1. Decide which frontend is canonical.
2. Consolidate imports into one pipeline.
3. Split shared-state sync into its own typed module.
4. Break `legacy_engine.py` into domain modules.
5. Break `admin.py` into shared-state, positions import, balances import, and transaction import routers/services.
6. Add active UI tests.
7. Clean stale docs and remove misleading duplicates.
