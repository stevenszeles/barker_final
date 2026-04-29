# Frontend Function Index

This index focuses on the frontend code that exists today, with special emphasis on the active mounted dashboard.

## `frontend/src/main.tsx`

- inline `ErrorBoundary` class: catches render-time UI failures and prints stack/message.

There are no other major functions here. The key fact is that it imports `App` from `./portfolio-dashboard.jsx`.

## `frontend/src/portfolio-dashboard.jsx`

This is the active UI and the most important frontend file.

## Constants And Lookup State

These constants define product behavior more than styling:

- `SP500_SECTORS`, `MANUAL_ONLY_SECTORS`, `ALL_SECTORS`
- `UNCLASSIFIED_SECTOR`, `SECTOR_OVERRIDE_AUTO`
- `POSITION_ATTRIBUTION_HELD`, `FUTURES_STATEMENT_ACCOUNT_AUTO`
- `FUTURES_CLEARING_ACCOUNT`, `DEFAULT_FUTURES_HELD_ACCOUNT_SUFFIX`
- `POSITION_SOURCE_STANDARD`, `POSITION_SOURCE_FUTURES`
- `SECTOR_TO_ETF`, `ETF_TO_SECTOR`
- `DEFAULT_SECTOR_BENCHMARK_WEIGHTS`
- `SYMBOL_TO_SECTOR`, `FUTURES_ROOT_TO_SECTOR`
- `SECTOR_COLORS`, `PALETTE`, `ACCOUNT_COLORS`
- `APP_BUILD_VERSION`
- `APP_STATE_STORAGE_KEY`, `LEGACY_APP_STATE_STORAGE_KEYS`
- `MARKET_CACHE_STORAGE_KEY`, `SECURITY_HISTORY_STORAGE_KEY`
- `SHARED_DASHBOARD_STATE_ENDPOINT`, poll/debounce constants

These values affect:

- classification,
- benchmark mapping,
- persistence,
- shared-state sync,
- UI coloring,
- and storage invalidation behavior.

## Storage / State Normalization Helpers

- `todayIsoLocal()`: local ISO date helper.
- `loadJSONStorage(key, fallback)`: safe localStorage JSON read.
- `saveJSONStorage(key, value)`: safe localStorage JSON write.
- `clearJSONStorage(key)`: localStorage delete helper.
- `loadPersistedAppState()`: reads current or legacy saved app state.
- `buildInitialSectorTargets()`: default sector target map builder.
- `normalizeSectorTargets(rawTargets)`: sanitizes target map.
- `normalizeSectorTargetsByAccount(rawTargetsByAccount, accountNames)`: account-scoped target normalization.
- `getSectorOverrideKey(accountName, symbol)`: sector override key builder.
- `formatOverrideNumber(value)`: override-number formatter.
- `getLegacyRealizedTradeOverrideKey(trade)`: older realized-trade override key builder.
- `getRealizedTradeOverrideKeys(trade)`: current candidate override keys.
- `getRealizedTradeOverrideMatch(trade, sectorOverrides)`: resolves matching realized-trade override.
- `normalizeAccountName(value)`: account-name cleanup.
- `normalizePerformanceChartSelection(rawSelection, accountNames, fallbackShowSPX)`: chart-selection normalizer.
- `asPlainObject(value)`: safe object coercion.
- `normalizeDateMap(rawMap)`: map-of-dates cleanup.
- `normalizeFuturesPnlSnapshots(rawSnapshots)`: snapshot normalization.
- `normalizeSharedDashboardState(rawState)`: full shared-state normalization.
- `buildSharedDashboardStatePayload(rawState)`: canonical shared-state payload builder.
- `getSharedDashboardStateSignature(rawState)`: JSON-signature helper.
- `hasSharedDashboardStateContent(rawState)`: checks if remote state is effectively empty.
- `cloneJSONValue(value)`: deep-ish clone helper.
- `deepEqualJSON(a, b)`: JSON-structure equality helper.
- `isMergeableObject(value)`: merge helper.
- `mergeSharedStateValues(baseValue, localValue, remoteValue, path)`: recursive three-way merge helper.
- `mergeSharedDashboardStates(baseState, localState, remoteState)`: workspace merge orchestrator.

## Classification / Parsing Helpers

- `resolveMainSector(symbol, cleanSym, assetType)`: sector classification lookup.
- `parseCSVLine(line)`: line parser.
- `parseCSVRows(text)`: CSV row splitter.
- `normalizeHeader(value)`: header normalization.
- `parseStatementNumber(value)`: numeric parser for statements.
- `parseStatementMultiplier(value)`: futures/options multiplier parser.
- `extractStatementDate(text, accountHint)`: statement-date extractor.
- `getFutureRootSymbol(symbol)`: futures root extraction.
- `resolveStatementFutureSector(symbol, description)`: sector mapping for futures.
- `buildEmptyAccountData()`: blank account payload.
- `findDefaultFuturesHeldAccount(knownAccounts)`: default futures held-account chooser.
- `chooseFuturesStatementAccount(...)`: determines which account gets a futures statement import.
- `mergeStandardPositionAccounts(existingAccounts, parsedAccounts)`: merges parsed standard positions into workspace.
- `mergeSupplementalFuturesAccounts(existingAccounts, parsedAccounts)`: merges futures statement data.
- `mergeFuturesPnlSnapshots(existingSnapshots, incomingSnapshots)`: snapshot merge helper.
- `migrateLegacyFuturesClearingAccount(accounts, sectorOverrides, positionAttributionOverrides)`: legacy futures-account migration helper.
- `parsePositionsCSV(text)`: active positions upload parser.
- `parseFuturesStatementCSV(text, options)`: active futures statement parser.
- `parseBalancesCSV(text, accountHint)`: active balances parser.
- `parseRealizedCSV(text)`: active realized gain/loss parser.

## Performance / Series Helpers

- `computeNormalizedSeries(data)`: rebases series for comparison.
- `computeReturns(data)`: calculates returns from value series.
- `computePeriodReturn(data)`: summary return over a window.
- `computeDailyFlowFromTwr(prevNav, nextNav, prevTwr, nextTwr)`: inferred daily flow helper.
- `buildPerformanceModelFromNavPoints(points, fallbackSeries)`: builds modeled performance payload.
- `buildAggregatePerformanceModel(models, accountNames)`: aggregates account performance models.
- `buildReturnStatsFromSeries(returnSeries, navSeries)`: summary stat helper.
- `getLatestSeriesDate(seriesList)`: latest date extraction.
- `filterByTimeframe(data, tf, anchorDateISO)`: timeframe filtering.
- `buildAggregateHistory(histories, accountNames)`: account-history aggregation.
- `expandHistoryToDates(series, dates)`: aligns sparse series to a target date list.

## Position / Transfer / Attribution Helpers

- `getPositionPnlValue(position)`: picks best PnL value.
- `getPositionEffectiveMultiplier(position)`: resolves position multiplier.
- `clampAttributedCarryValue(value, finalValue)`: carry-series clamp helper.
- `buildCarryWeightsFromSourceHistory(dates, sourceHistory)`: weighting helper for attribution.
- `buildMonotonicCarrySeries(dates, finalValue, options)`: monotonic interpolation helper.
- `buildTransferDeltaSeries(rawSeries, dates, effectiveDate, finalValue)`: transfer delta allocator.
- `normalizePriceBackedCarrySeries(series, finalValue)`: carry cleanup helper.
- `estimateAttributedPositionPnlSeries(position, dates, sourceHistory, priceSeries, options)`: estimates per-position contribution over time.
- `estimateAttributedRealizedTradeCarrySeries(trade, dates, sourceHistory, priceSeries)`: realized-trade contribution estimator.
- `getPerformanceSeriesKey(accountName, index)`: chart-series key builder.
- `getSectorStance(activeWeight)`: overweight/underweight/neutral label helper.
- `normalizeDateInput(value)`: flexible date normalizer.
- `getFirstValueOnOrAfter(series, targetDate)`: forward date lookup.
- `getLastValueOnOrBefore(series, targetDate)`: backward date lookup.
- `getValueOnOrBefore(series, targetDate)`: wrapper alias for backward lookup.
- `isOptionPosition(position)`: option detector.
- `isFuturePosition(position)`: future detector.
- `isEtfPosition(position)`: ETF detector.
- `getPositionUnderlying(position)`: underlying extractor.
- `getPositionSnapshotKey(position)`: snapshot cache key builder.
- `getPositionHeldAccount(position)`: custody account resolver.
- `getPositionAttributedAccount(position, positionAttributionOverrides)`: attribution resolver.
- `getRealizedTradeAttributedAccount(trade, realizedTradeAttributionOverrides)`: realized-trade attribution resolver.
- `getPositionDisplayAccount(position)`: display account helper.
- `getRealizedTradeDisplayAccount(trade)`: display account helper for realized trades.
- `getPositionAttributionKey(position)`: attribution key builder.
- `getFuturesSnapshotSeries(position, futuresPnlSnapshots)`: fetches futures PnL history.
- `getPositionTransferEffectiveDate(position, positionTransferEffectiveDates, futuresPnlSnapshots)`: effective-date resolver.
- `getPositionGroupKey(position, accountScope)`: grouping key builder.
- `getPositionOverrideCandidates(position)`: possible sector override keys.
- `getPositionOverrideValue(position, sectorOverrides)`: resolved override value.
- `summarizeGroupedPositionTypes(rows)`: grouped-position summary text.
- `formatPositionQty(qty)`: quantity formatter.
- `formatShortAccountName(accountName)`: short account label helper.
- `summarizeAccountNames(accountNames)`: summary label helper.
- `filterTradesByDateRange(trades, startDate, endDate)`: realized-trade date filter.
- `formatDateLocalISO(value)`: date formatter.
- `getTimeframeBounds(tf, anchorDateISO)`: timeframe boundary calculation.

## Benchmark / History Helpers

- `getSecurityHistoryCacheKey(symbol)`: symbol history cache key.
- `toStooqSymbol(symbol)`: Stooq symbol normalization.
- `parseStooqHistory(text, days)`: parses Stooq proxy history text.
- `isRenderHibernateWakeResponse(response, text)`: detects Render wake edge case.
- `warmBenchmarkService()`: lightweight warmup request.
- `loadBenchmarkHistorySeries(symbol, options)`: benchmark history loader with retry/cache logic.

## Formatting / UI Helpers

- `fmt$`, `fmtPct`, `fmtNum`: common numeric formatters.
- `getTickInterval(length, targetTicks)`: chart x-axis density helper.
- `getCategoryAxisWidth(labels, minWidth, maxWidth)`: bar-axis sizing helper.
- `S`: inline style object map used throughout the UI.
- `hexToRgba(hex, alpha)`: color helper.
- `signalPanelStyle(color)`: status panel styling helper.
- `buildDailyReturnMap(series)`: return-map helper for correlations.
- `computeCorrelation(aMap, bMap)`: correlation calculator.
- `correlationColor(value)`: matrix cell color picker.
- `formatDeskTime(timeZone, options)`: display-time formatter.
- `CustomTooltip(...)`: chart tooltip renderer.

## Main App Component

- `App()`: the active dashboard application.

Inside `App()`, the major internal callback/effect responsibilities are:

- local workspace application,
- shared snapshot commit/apply,
- dirty-state marking,
- benchmark loading and refresh,
- shared state fetch and save,
- persistence to local storage,
- reset flow,
- positions upload handling,
- futures statement upload handling,
- balances upload handling,
- realized trade upload handling,
- legal NAV fetches,
- all account/position/trade/sector/performance derived models.

This component is responsible for:

- tab state,
- sync orchestration,
- parsing entry points,
- chart inputs,
- attribution logic,
- and most screen-level behavior.

## Final Subcomponent

- `UploadCard({ ... })`: reusable upload UI block for the dashboard.

## `frontend/src/App.tsx`

This file is not mounted today, but it is still meaningful.

### Utility helpers

- `loadChartPrefs()`: reads saved chart prefs.
- `saveChartPrefs(value)`: writes chart prefs.
- `safeNumber(value)`: numeric guard.
- `formatMoney(value, digits)`: money formatter.
- `formatSignedMoney(value, digits)`: signed money formatter.
- `formatNumber(value, digits)`: number formatter.
- `formatSignedNumber(value, digits)`: signed number formatter.
- `formatSignedPct(value, digits)`: signed percent formatter.
- `parseOsiSymbol(symbol)`: OSI parser.
- `buildOsiSymbol(underlying, expiry, right, strike)`: OSI builder.
- `normalizeExpiryInput(value)`: expiry input cleanup.
- `isFutureSymbol(value)`: futures detector.
- `sparklinePath(values, width, height, pad)`: sparkline SVG path builder.
- `filterPointsByStart(points, startDate)`: point filtering helper.
- `combineAccountNavSeries(...)`: account NAV aggregation helper.

### Main component

- `App()`: alternate TypeScript workstation shell.

Important behavior inside this inactive path:

- calls `/portfolio/nav`,
- posts files to `/admin/import-balances`,
- posts files to `/admin/import-positions`,
- posts files to `/admin/import-transactions`,
- relies on Zustand store updates and server-backed data refreshes.

## `frontend/src/store/index.ts`

This file is the state layer for the inactive TypeScript app.

Key exposed actions:

- `setAccount(account)`: persist selected account.
- `fetchAccounts()`: load account list.
- `fetchSchwabStatus()`: load auth status.
- `connectMarketStream(symbols)`: open websocket stream.
- `fetchSnapshot()`: load snapshot.
- `fetchBlotter()`: load blotter.
- `fetchRisk()`: load risk summary.
- `fetchStatus()`: load status payload.
- `fetchQuotes(symbols)`: load current quotes.
- `refreshAll()`: refresh core data.
- `fetchNav(limit)`: load nav series.

## Other Frontend Files

### `frontend/src/services/api.ts`

- creates the shared axios instance.
- response interceptor rewrites error messages from backend detail payloads.

### `frontend/src/components/PortfolioChart.tsx`

- `PortfolioChart(...)`: lightweight-charts based chart component for the inactive TS app.

### `frontend/src/components/ErrorBoundary.tsx`

- class-based error boundary for the alternate TS architecture.

## Reading Order For Frontend Reasoning

1. `frontend/src/main.tsx`
2. `frontend/src/portfolio-dashboard.jsx`
3. `frontend/src/render-dashboard.css`
4. `frontend/src/App.tsx`
5. `frontend/src/store/index.ts`
6. `frontend/src/services/api.ts`
