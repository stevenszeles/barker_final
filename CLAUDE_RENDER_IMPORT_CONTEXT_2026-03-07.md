# Render CSV Import Failure Context (for Claude)

Generated: 2026-03-07 (America/Los_Angeles)
Workspace: `/Users/stevenszeles/Downloads/barker_final`

## 1) Executive Summary
The import system has two distinct failure classes in Render:

1. **Imports can succeed server-side but UI still shows "No positions"**
   - Because subsequent `snapshot/nav` API calls time out, so UI refresh never gets updated state.

2. **Some import endpoints stall/timeout in request path**
   - `import-balances` and `import-transactions` can block for >120s due synchronous NAV/price-history rebuild work.

There is also a frontend account-selection bug already patched in git (not currently live), which can make a valid all-accounts file be submitted as an invalid single-account import.

## 2) Current Live State Observed
- Live build at time of testing: `c525beb14e641602b1adc6935fd672d4ce99545d`
- Newer fix commit exists in repo: `9166f95` (not yet reflected in `/version`)

## 3) Direct Reproductions (Live Render)

### A) Positions import endpoint works
```bash
curl -F file=@All-Accounts-Positions-2026-03-06-192209.csv \
  "https://barker-dashboard.onrender.com/api/admin/import-positions?account=ALL"
```
Result: `HTTP 200`, `positions_count: 137`, account list returned.

### B) Snapshot endpoint times out after import
```bash
curl -m 30 "https://barker-dashboard.onrender.com/api/portfolio/snapshot?account=ALL"
```
Result: timeout (`HTTP 000`, 30s, no bytes).

### C) NAV endpoint times out
```bash
curl -m 30 "https://barker-dashboard.onrender.com/api/portfolio/nav?limit=120&account=ALL"
```
Result: timeout (`HTTP 000`, 30s, no bytes).

### D) Balance import endpoint stalls
```bash
curl -m 120 -F file=@"Limit Liability Company_XXXX013_Balances_20260306-191950.CSV" \
  "https://barker-dashboard.onrender.com/api/admin/import-balances?account=ALL"
```
Result: timeout (`HTTP 000`, 120s).

### E) Realized import endpoint stalls
```bash
curl -m 120 -F file=@All_Accounts_GainLoss_Realized_Details_20260306-192117.csv \
  "https://barker-dashboard.onrender.com/api/admin/import-transactions?account=Limit_Liability_Company%20...013&replace=false"
```
Result: timeout (`HTTP 000`, 120s).

### F) Render cold-start intermittency
Observed `503` with `x-render-routing: hibernate-wakeup-error` during wake.

## 4) Confirmed High-Impact Code Paths

### 4.1 `snapshot` path does heavy synchronous work
- `backend/app/services/legacy_engine.py:2764` `def get_snapshot(...)`
- At `legacy_engine.py:2781`, snapshot calls `get_nav_series(limit=1, account=account)` when trade/entry data exists.
- `get_nav_series` triggers expensive history rebuild behavior and can block >30s.

### 4.2 NAV rebuild/historical price fetch is synchronous and expensive
- `backend/app/services/legacy_engine.py:1354` `def build_daily_nav_series(...)`
- Repeated `ensure_symbol_history(...)` calls (`legacy_engine.py:1548`) fetch history symbol-by-symbol.
- `backend/app/services/legacy_engine.py:3263` `def rebuild_nav_history(...)` builds full nav and writes snapshots synchronously.

### 4.3 Import endpoints call rebuild logic in request thread
- `backend/app/routers/admin.py:2497` in `import-transactions`: `rebuild_nav_history(limit=2000, account=acct)`
- `backend/app/routers/admin.py:2985` in `import-balances`: `rebuild_nav_history(limit=4000, account=target_account)`
- `backend/app/routers/admin.py:2889` in `import-balances`: `build_daily_nav_series(...)` also runs inline.

This is the likely reason imports appear to “do nothing” in Render: request hangs/timeouts before frontend receives success + fresh snapshot.

## 5) Frontend Constraints That Amplify the Problem

### 5.1 Client timeout is 30s globally
- `frontend/src/services/api.ts:5` -> `timeout: 30000`
- So any snapshot/nav >30s fails hard in UI.

### 5.2 Import workflows immediately call full refresh
- Many import handlers call `refreshAll()` right after upload.
- Relevant lines in `frontend/src/App.tsx` include around `1937`, `1971`, `2019`, `2070`, `2275`.
- If `refreshAll()` hits timing-out `snapshot/nav`, user sees no updated data.

### 5.3 Stale account selection bug (patched but not live)
- Patch in commit `9166f95`:
  - `frontend/src/App.tsx`: force `account=ALL` for all-accounts positions files and reset to `ALL` post-import.
  - `frontend/src/store/index.ts`: if stored account key is no longer valid, auto-fallback to `ALL`.
- Without this, uploads can be routed to an invalid account context and appear empty.

## 6) All Plausible Root Causes in Render (Prioritized)

### Confirmed / strongly evidenced
1. Synchronous, heavy NAV rebuild and price-history fetch in API request path -> endpoint timeouts.
2. Snapshot endpoint doing expensive nav computation inline after imports.
3. Frontend 30s timeout + immediate refresh pattern masks successful writes.
4. Stale account filter state in browser (fixed in `9166f95`, not live yet).
5. Render cold-start/hibernate 503s.

### Also plausible and should be checked
6. `DATABASE_URL` not actually set/active in Render service env (would cause non-persistent SQLite behavior).
7. Single-process contention: long request monopolizes resources; subsequent API calls queue/time out.
8. External market-data provider latency/rate-limit in history fetch (`stooq`, optional `yfinance` fallback) slows rebuilds.
9. Background worker plus request-path history fetch increases load on small Render instance.
10. Global DB lock (`with_conn` lock in `backend/app/db.py`) can serialize database work under heavy request load.

## 7) Recommended Fix Plan (for Claude)

### P0: make imports return fast and deterministic
1. Remove/reduce synchronous `rebuild_nav_history` from import endpoints.
   - Use deferred/background task or explicit admin action.
2. In import endpoints, write raw imported data first and return success immediately.
3. Add progress/status endpoint for long rebuild jobs.

### P0: make snapshot fast regardless of rebuild state
4. In `get_snapshot`, stop calling heavy `get_nav_series(limit=1)` inline.
   - Use cached/nav_snapshots last point if available.
   - Fallback to `cash + mv` immediately.
5. Add hard time budget to history/network fetch in request paths.

### P1: constrain expensive market/history calls
6. Batch/cap history refresh work (symbol count cap, short timeout, graceful fallback).
7. Avoid forcing full-symbol historical fetch on every snapshot/nav request.

### P1: frontend resilience
8. After import success, show success from server response first; defer full refresh or retry with backoff.
9. Surface explicit timeout messages in import modal/banner.
10. Deploy `9166f95` (stale account fix).

## 8) Quick Validation Checklist After Fix
1. Upload positions CSV -> HTTP 200 within <10s.
2. `GET /api/portfolio/snapshot?account=ALL` responds <3s.
3. `GET /api/portfolio/nav?limit=120&account=ALL` responds <5s.
4. Upload one balance CSV -> response <15s (or async job accepted quickly).
5. Upload realized CSV for one account -> response <15s (or async job accepted quickly).
6. UI shows non-zero positions immediately after import without manual re-import/reload loops.

## 9) Relevant Files
- `backend/app/routers/admin.py`
- `backend/app/services/legacy_engine.py`
- `backend/app/db.py`
- `frontend/src/App.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/store/index.ts`
- `render.yaml`

## 10) Git State
- Live observed build: `c525beb`
- Latest local main includes account/import UI fix: `9166f95`
