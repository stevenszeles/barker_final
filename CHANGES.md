# Barker Dashboard — Changes & Fixes

## Summary of Changes

All changes are focused on making the system work reliably in **static mode** (no external APIs), with correct CSV → DB → API → UI data flow.

---

## Backend Changes

### `backend/app/services/legacy_engine.py`

#### 1. `store_nav_snapshot()` — Benchmark NULL preservation
**Problem:** When no benchmark (SPX) data existed, `bench or nav` stored the NAV dollar value as the benchmark. This made the chart show portfolio = benchmark always.

**Fix:** Store `NULL` when bench is not available. The chart and query code treat NULL correctly.

```python
# Before:
cur.execute("INSERT OR REPLACE INTO nav_snapshots...", (..., float(bench or nav)))

# After:
bench_val = float(bench) if bench is not None and bench > 0 else None
cur.execute("INSERT OR REPLACE INTO nav_snapshots...", (..., bench_val))
```

#### 2. `_get_nav_series_from_snapshots()` — Bench data priority
**Problem:** Stored bench values (which could be stale or incorrect nav values) were preferred over live benchmark price cache.

**Fix:** Always prefer `bench_map` (live SPX data from `price_cache` table) over stored bench column. Forward-fill last known bench price. Fall back to `nav` only if no bench data at all.

```python
# Priority: bench_map[date] > last known bench_map price > nav (last resort)
bench_raw = bench_map.get(d)
if bench_raw and bench_raw > 0:
    last_bench_raw = bench_raw
effective_bench = last_bench_raw if last_bench_raw and last_bench_raw > 0 else None
```

#### 3. `_get_nav_series_from_snapshots()` — Today's point bench
**Fix:** Use raw SPX price from `bench_map` for today's appended point, not `account_value`.

---

## Frontend Changes

### `frontend/src/store/index.ts`

#### 4. `fetchNav()` — Default limit parameter
**Problem:** `fetchNav()` was called without arguments after portfolio reset, causing a TypeScript error and potentially passing `undefined` as limit.

**Fix:** Added default value `limit = 365`.

```typescript
// Before:
fetchNav: (limit: number) => Promise<void>;
fetchNav: async (limit: number) => {

// After:
fetchNav: (limit?: number) => Promise<void>;
fetchNav: async (limit: number = 365) => {
```

### `frontend/src/App.tsx`

#### 5. `resetPortfolio()` — Pass navLimit to fetchNav
**Fix:** Changed `fetchNav()` → `fetchNav(navLimit)` after reset.

---

## How Data Flows (Static Mode)

```
1. User imports Schwab positions CSV
   → Admin.importPositions()
   → _parse_custaccs_positions() parses accounts, positions, cash, account_values
   → clear_positions_for_accounts() removes old positions
   → clear_nav_history() removes old chart data
   → upsert_position() for each row
   → set_account_cash() with account_value
   → store_nav_snapshot(account, asof, nav=account_value, bench=SPX_price_or_NULL)

2. User imports Schwab balances CSV
   → Admin.importBalances()
   → Parses "cash & cash investments" and "account value" per account
   → Updates accounts table with cash and account_value
   → store_nav_snapshot(account, asof, nav=account_value, bench=SPX_price_or_NULL)

3. Frontend requests /api/portfolio/nav
   → get_nav_series() → _get_nav_series_from_snapshots()
   → Returns {date, nav, bench} where nav=raw$ and bench=raw SPX$ (or nav$ if no SPX)
   → Chart normalizes both to % return from first point

4. Frontend requests /api/portfolio/snapshot
   → get_snapshot() → build_positions_live()
   → Returns positions with prices from CSV import
   → Returns nlv=account_value (or cash+positions_mv)

5. Chart renders:
   → Portfolio line: nav/first_nav - 1 (% return)
   → SPX line: bench/first_bench - 1 (% return)
   → Both lines start at 0%
```

---

## Acceptance Criteria Status

| Requirement | Status | Notes |
|-------------|--------|-------|
| Positions load offline | ✅ | CSV import → upsert_position |
| /api/positions works | ✅ | Static mode uses DB positions |
| /api/admin/accounts works | ✅ | No external deps |
| /api/portfolio/snapshot works | ✅ | Uses cached prices from CSV |
| Positions CSV import | ✅ | Schwab format fully parsed |
| Balances CSV import | ✅ | Cash + account_value stored |
| NAV chart renders | ✅ | From nav_snapshots table |
| Benchmark chart | ✅ | From price_cache; NULL-safe |
| No network errors in static | ✅ | Warning banners suppressed |
| No error banners on load | ✅ | 4xx errors suppressed in static |

---

## Known Limitations

- **Benchmark data**: SPX benchmark requires either (a) prior network fetch cached in `price_cache`, or (b) manual paste via Admin → "Paste Benchmark (SPX) History". Without SPX data, the benchmark line overlaps the portfolio line.

- **Historical NAV**: Without transaction history, the chart only shows data points from CSV imports (typically just one or two dates). Use Admin → "Paste NAV History" to add historical points.

- **Price staleness**: In static mode, prices come from the most recent CSV import. There is no live price updating.
