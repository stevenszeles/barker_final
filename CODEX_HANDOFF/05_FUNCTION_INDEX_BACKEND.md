# Backend Function Index

This is a practical index of the backend functions that matter, grouped by file and responsibility. It is meant to be read as an orientation map, not as API reference prose.

## App Boot And Infrastructure

### `backend/app/main.py`

- `_is_local_origin(origin)`: checks whether an origin is localhost-like for CORS decisions.
- `health()`: reports backend/db/fallback health for deployments.
- `version()`: exposes build metadata and startup/storage status.
- `_startup()`: runs schema init, optional demo seed, and worker boot.

### `backend/app/db.py`

- `_is_postgres()`: tells the app whether Postgres is configured.
- `storage_diagnostics()`: reports active storage backend and fallback state.
- `_table_columns(conn, table_name)`: introspects columns for schema migration/backfill work.
- `_rewrite_insert(sql)`: rewrites SQLite `INSERT OR ...` semantics into Postgres conflict syntax.
- `_replace_placeholders(sql)`: converts SQLite placeholders to Postgres parameter placeholders.
- `_adapt_sql(sql)`: applies SQL compatibility transforms when needed.
- `_auto_increment_pk_sql()`: chooses SQLite vs Postgres PK syntax.
- `ensure_schema()`: creates and backfills all required tables and indexes.
- `connect()`: opens a DB connection, handling backend choice and fallback.
- `with_conn(fn)`: wrapped DB execution helper used throughout the backend.

### `backend/app/workers.py`

- `_warmup_background()`: warms history cache and starts price update background behavior.
- `start_workers(interval_seconds)`: non-blocking worker launcher called on startup.

## Analytics / Support Modules

### `backend/app/analytics.py`

- `trading_days_for_range(range_key)`: turns chart ranges into trading-day spans.
- `value_series_for_scope(...)`: computes scope-specific value series.
- `points_from_values(dates, values, digits)`: converts arrays into chart point payloads.
- `indexed_points(dates, values, base)`: normalizes values into indexed performance series.
- `_returns(values)`: computes simple returns.
- `_max_drawdown(values)`: computes max drawdown from a value series.
- `_covariance(a, b)`: covariance helper.
- `performance_metrics(values, dates, benchmark_values)`: summary performance math.
- `holdings_snapshot(...)`: build holdings snapshot payloads.

### `backend/app/chart_data.py`

- `_symbol_seed(symbol)`: stable seed for synthetic/demo chart generation.
- `_iter_trading_days(start, bars)`: trading-day iterator.
- `_round_price(value)`: normalizes generated price precision.
- `generate_candles(symbol, range_key)`: generates synthetic candle data.
- `moving_average(candles, period)`: computes moving-average overlays.

### `backend/app/market_data.py`

- `_stable_seed(symbol)`: deterministic seed for fallback series.
- `_business_days(start, end)`: returns business-day list.
- `_generate_fallback_history(symbol, years)`: synthetic history fallback.
- `_normalize_rows(rows)`: normalizes fetched rows into internal tuples.
- `get_symbol_history(symbol)`: loads history through fallback/normalized paths.
- `get_prices_for_dates(symbol, dates)`: aligns prices to requested dates.

### `backend/app/data_store.py`

- `_safe_float(value, fallback)`: numeric coercion helper.
- `_normalize_position(position)`: sanitizes raw dataset positions.
- `_normalize_dataset(raw)`: normalizes demo/static dataset structure.
- `get_dataset()`: returns the packaged dataset.
- `list_scopes(dataset)`: lists scope definitions.
- `_aggregate_positions(positions)`: merges or collapses position rows.
- `resolve_scope(dataset, scope_id)`: returns a scoped dataset slice.

### `backend/app/bootstrap_seed.py`

- `_account_positions_and_cash(account)`: prepares seed rows per account.
- `_store_price_series(symbol, dates, prices)`: writes seed price data.
- `seed_demo_portfolio_if_empty()`: populates demo portfolio state when enabled.

## Routers

### `backend/app/routers/portfolio.py`

- `_raise_portfolio_error(exc)`: maps engine/fetch errors into HTTP responses.
- `snapshot(response, account)`: snapshot endpoint.
- `nav(response, limit, account)`: NAV series endpoint.
- `sector_series(sector, limit, source, account)`: sector history endpoint.

### `backend/app/routers/positions.py`

- `list_positions(account)`: returns current local positions.
- `upsert(payload)`: writes one position.
- `delete(instrument_id, account)`: removes one position.
- `get_cash()`: returns current cash.
- `set_cash(payload)`: sets cash value.
- `bulk_upsert(payload)`: bulk position import/update helper.

### `backend/app/routers/trades.py`

- `_raise_trade_error(exc)`: shapes trade-related exceptions.
- `blotter(limit, account)`: returns trade blotter payload.
- `preview(payload)`: previews a trade.
- `submit(payload)`: submits a single trade.
- `submit_multi_legs(payload)`: submits a strategy/multileg trade.
- `cancel(payload)`: cancels a trade or live order.
- `replace(payload)`: replaces a trade or live order.

### `backend/app/routers/risk.py`

- `summary()`: returns risk summary.
- `profile()`: returns richer risk profile payload.

### `backend/app/routers/status.py`

- `_safe_schwab_token()`: safe token probe for status endpoints.
- `components()`: component health endpoint.
- `schwab_status()`: auth/connectivity status endpoint.
- `market_data_status()`: market-data mode/status endpoint.

### `backend/app/routers/auth.py`

- `_normalize_code(raw)`: auth-code cleanup.
- `schwab_start()`: builds redirect/start flow.
- `schwab_callback(code, request)`: browser callback landing route.
- `schwab_exchange(payload)`: explicit code exchange endpoint.
- `schwab_status()`: current auth status endpoint.
- `schwab_diagnostics()`: config/debug endpoint.
- `schwab_logout()`: removes stored auth state.

### `backend/app/routers/broker.py`

- `_require_config()`: ensures broker config is present.
- `_raise_schwab_error(exc)`: maps Schwab service errors to HTTP.
- `accounts()`: broker accounts endpoint.
- `positions()`: broker positions endpoint.
- `balances()`: broker balances endpoint.
- `orders()`: broker orders endpoint.
- `preview_order(payload)`: broker preview route.
- `place_order(payload)`: broker submit route.

### `backend/app/routers/market.py`

- `_map_tickers_to_requested(tickers, symbol_map)`: remaps quote responses to requested symbols.
- `_require_polygon()`: enforces Polygon availability where needed.
- `snapshot(symbols)`: quote snapshot endpoint with mode branching.
- `aggregates(symbol, multiplier, timespan, from_date, to_date)`: bar history endpoint.
- `previous_close(symbol)`: previous-close endpoint.
- `market_status()`: market status endpoint.
- `options_chain(underlying)`: options chain endpoint.
- `option_marks(symbols)`: per-option mark endpoint.
- `futures_ladder()`: futures ladder endpoint.
- `stream(websocket)`: live market websocket stream.

### `backend/app/routers/stooq_proxy.py`

- `_normalize_history_symbol(raw_symbol)`: normalizes requested history symbol.
- `_history_candidates(symbol, is_benchmark)`: builds fallback symbol candidates.
- `_claim_refresh_slot(symbol, cooldown_seconds)`: throttles repeated refreshes.
- `_load_cached_history(symbols, start_iso)`: loads history from DB cache.
- `_direct_history_fallback(raw_symbol, normalized_symbol, start_iso)`: direct fetch fallback.
- `stooq_daily_history(...)`: frontend-facing daily history proxy.

## Services

### `backend/app/services/portfolio.py`

- `get_snapshot(account)`: thin wrapper to engine snapshot.
- `get_nav_series(limit, account)`: thin wrapper to engine NAV.
- `get_sector_series(sector, limit, source, account)`: thin wrapper to engine sector series.
- `get_positions_local(account, use_cache)`: local positions through engine.
- `get_positions(account)`: positions fetch through engine.
- `upsert_position(data)`: delegates position write.
- `delete_position(instrument_id, account)`: delegates delete.
- `get_cash(account)`: delegates cash read.
- `set_cash(value)`: delegates cash set.
- `set_account_cash(account, cash, asof, account_value)`: delegates account cash anchor update.
- `get_accounts()`: delegates account list.
- `record_trade(trade)`: delegates trade record.
- `clear_positions_for_accounts(accounts)`: delegates account position clear.
- `clear_trades_for_account(account)`: delegates trade clear.
- `rebuild_nav_history(limit, account)`: delegates NAV rebuild.
- `store_nav_snapshot(account, date, nav, bench)`: delegates snapshot store.
- `clear_nav_history(account)`: delegates NAV clear.
- `start_background_price_updates()`: delegates background updates.

### `backend/app/services/trades.py`

- `_stamp()`: returns source/asof metadata.
- `get_blotter(limit, account)`: returns blotter rows with metadata.
- `preview_trade(payload)`: trade preview via engine.
- `submit_trade(payload)`: single-trade submit wrapper.
- `submit_multi(payload)`: multileg submit wrapper.
- `cancel_trade(trade_id)`: cancels a stored/local trade or live order flow.
- `replace_trade(original_trade_id, payload)`: replace helper.
- `build_schwab_order(payload)`: builds Schwab-compatible order payload.

### `backend/app/services/risk.py`

- `_stamp()`: risk payload metadata.
- `_safe_float(value, default)`: numeric coercion.
- `_position_exposure_breakdown(positions)`: gross/net/long/short exposure analysis.
- `_greek_exposures(positions)`: options Greek aggregation.
- `_build_nav_frame(limit)`: NAV dataframe builder.
- `_return_stats(nav_df)`: return statistic helper.
- `_metric_row(metric, value, limit)`: formats one risk metric row.
- `_build_metrics(snapshot, nav_df)`: constructs summary risk metrics.
- `_top_sector_labels(positions, max_count)`: sector selection helper.
- `_series_from_sector(sector, limit)`: sector return series fetcher.
- `_correlation_payload(nav_df, positions)`: correlation-matrix payload builder.
- `_rolling_payload(nav_df, max_points)`: rolling metric series builder.
- `get_risk_summary()`: main summary endpoint service.
- `get_risk_profile()`: fuller risk profile service.

### `backend/app/services/status.py`

- `get_status()`: component status list.

### `backend/app/services/cache.py`

- `get_quote_cache_key(symbol)`: quote cache key helper.
- `get_portfolio_cache_key(account)`: portfolio cache key helper.
- `get_positions_cache_key(account)`: positions cache key helper.
- `get_market_status_cache_key()`: market-status cache key helper.

The `CacheService` class also exposes `get`, `set`, `delete`, `delete_pattern`, `clear_all`, and `health_check`.

### `backend/app/services/token_store.py`

- `get_token(provider)`: reads stored OAuth token bundle.
- `save_token(provider, access_token, refresh_token, expires_in, scope)`: upserts OAuth token bundle.
- `clear_token(provider)`: deletes stored token bundle.

### `backend/app/services/openfigi.py`

- `configured()`: tells whether OpenFIGI is configured.
- `is_figi_symbol(symbol)`: checks if a symbol looks FIGI-like.
- `_mapping_url()`: builds mapping endpoint URL.
- `_normalize_alias_symbol(symbol)`: normalizes FIGI resolution aliases.
- `_resolve_figi_batch(figis)`: batch-resolves FIGIs to symbols.
- `resolve_symbol(symbol)`: resolves one symbol or passes it through.
- `resolve_symbols(symbols)`: resolves many symbols and returns alias map.

### `backend/app/services/options.py`

- `is_osi_symbol(symbol)`: OSI-format detector.
- `parse_osi_symbol(symbol)`: OSI parser.
- `_normalize_expiry(expiry)`: expiry normalization.
- `build_osi_symbol(underlying, expiry, option_type, strike)`: OSI builder.
- `normalize_option_fields(...)`: harmonizes option attributes.
- `get_option_chain_demo(underlying)`: demo options chain generator.

### `backend/app/services/futures.py`

- `parse_future_symbol(symbol)`: parses root/month/year.
- `get_future_spec(symbol)`: returns contract spec metadata.
- `normalize_future_quote_symbol(symbol)`: maps UI symbol to quote symbol.
- `get_futures_ladder_demo()`: synthetic ladder.
- `get_futures_ladder()`: live/demo ladder wrapper.

### `backend/app/services/polygon.py`

- `_auth_params()`: auth params helper.
- `get_snapshot(symbols)`: snapshot fetch.
- `get_quotes(symbols)`: quote fetch.
- `get_aggregates(symbol, multiplier, timespan, from_date, to_date)`: bars fetch.
- `get_previous_close(symbol)`: previous close fetch.
- `get_market_status()`: market status fetch.
- `get_options_chain(underlying)`: options chain fetch.
- `get_price_history(symbol, start_date)`: price history fetch.

### `backend/app/services/stooq.py`

- `_to_stooq_symbol(symbol)`: Stooq symbol normalization.
- `_to_yahoo_symbol(symbol)`: Yahoo symbol normalization.
- `_rate_limited()`: cached rate-limit state check.
- `_mark_rate_limited(window_sec)`: records rate-limit cooldown.
- `_looks_rate_limited(text)`: response-content detector.
- `_strip_html(fragment)`: HTML cleanup helper.
- `_parse_history_date(value)`: date parser.
- `_extract_history_rows(text)`: parses response text into history rows.
- `_history_page_limit(start_dt)`: limits large history pulls.
- `get_quotes(symbols, timeout)`: quote fetch.
- `get_history(symbol, start_date)`: Stooq history fetch.
- `get_history_yahoo(symbol, start_date, timeout)`: Yahoo fallback history fetch.

### `backend/app/services/schwab.py`

- `_in_refresh_cooldown()`: guards repeated token refreshes.
- `can_use_marketdata()`: whether Schwab market data is available.
- `sanitize_auth_code(raw)`: cleans broker auth code.
- `_bearer_headers(access_token)`: auth headers helper.
- `get_auth_url(state)`: start URL builder.
- `exchange_code(code)`: OAuth exchange.
- `refresh_token()`: OAuth refresh.
- `get_access_token()`: access-token retrieval, potentially refreshing.
- `_request_json(method, url, params, json)`: generic request helper.
- `get_accounts()`: broker account list.
- `_iter_accounts(payload)`: account payload iterator.
- `_extract_account_id(account)`: account-id extraction.
- `resolve_account_number(preferred)`: chooses account to act against.
- `get_account_details(account_number)`: broker details fetch.
- `get_orders(account_number)`: order list fetch.
- `preview_order(account_number, payload)`: broker order preview.
- `place_order(account_number, payload)`: broker submit.
- `get_positions(account_number)`: broker positions fetch.
- `get_balances(account_number)`: broker balances fetch.
- `get_quotes(symbols, as_map)`: broker quote fetch.
- `get_option_chain(underlying, contract_type)`: option chain fetch.
- `_parse_osi(symbol)`: OSI parser helper.
- `get_option_marks(symbols)`: option mark extraction.
- `_normalize_history_symbol(symbol)`: history symbol normalization.
- `get_price_history(symbol, start_date)`: broker price history fetch.

## `backend/app/routers/admin.py`

This file is big enough that the cleanest way to understand it is by subsystem.

### Shared dashboard state helpers

- `_decode_shared_dashboard_state(raw_state)`: parses stored shared-state JSON.
- `_coerce_shared_dashboard_state_version(raw_version)`: normalizes stored version.
- `_read_shared_dashboard_state_fallback()`: reads home-directory fallback copy.
- `_write_shared_dashboard_state_fallback(state, base_version)`: writes fallback copy and increments metadata.
- `_mirror_shared_dashboard_state_fallback(state, updated_at, version)`: mirrors DB state to fallback file.
- `get_shared_dashboard_state(response)`: returns shared workspace payload to frontend.
- `save_shared_dashboard_state(payload, response)`: saves workspace JSON with version handling.

### NAV / benchmark / admin controls

- `_balance_history_mode()`: reads balance-history strategy mode.
- `_queue_nav_rebuild(account, limit)`: queue/background intent helper.
- `_rebuild_nav_with_fallback(account, limit)`: rebuilds NAV directly when queue not available.
- `get_benchmark()`: returns configured benchmark symbol.
- `list_accounts()`: returns account list for admin UI.
- `reset_portfolio(payload)`: clears portfolio/imported data.
- `set_benchmark(payload)`: changes benchmark symbol.
- `rebuild_nav(limit, account)`: explicit NAV rebuild endpoint.
- `clear_nav(account)`: clears NAV snapshots.

### Parsing / normalization helpers

- `_parse_money(raw)`, `_parse_float(raw)`, `_parse_money_value(raw)`: number parsing helpers.
- `_normalize_symbol_token(raw)`: normalizes imported symbol tokens.
- `_normalize_account_name(raw)`, `_normalize_account_key(raw)`, `_account_identity(raw)`: account identity normalization.
- `_match_existing_account(name, existing_accounts)`: alias matcher for imported account names.
- `_normalize_sector_value(raw)`: sector normalization.
- `_event_key_token(value)`, `_build_import_event_key(counters, *parts)`: stable import dedupe keys.
- `_parse_txn_date(raw)`: transaction-date parser.
- `_parse_option_symbol(raw)`: option symbol parser for imported rows.
- `_extract_account_digits(raw)`: account-id digit extraction helper.

### Position metadata / alias helpers

- `_position_meta_key(account, symbol, asset_class)`: key for preserved position metadata.
- `_expand_account_aliases(...)`: maps imported aliases to canonical accounts.
- `_load_position_metadata(...)`: loads sector/owner/entry-date metadata for reuse.
- `_get_account_record(account)`: reads account anchor record.

### Sector baseline/weight helpers

- `_sector_baseline_key(account, sector)`: settings-table key builder.
- `_sector_target_weight_key(account, sector)`: settings-table key builder.
- `_load_symbol_sector_map_for_account(conn, account)`: reads symbol-to-sector mapping.

### Balance import helpers

- `_resolve_balance_history_account(...)`: determines target account for balance-history CSV.
- `_parse_balance_history_rows(rows)`: parses Date/Amount balance-history CSV.

### Transaction import helpers

- `_action_cash_only(action_lower)`: identifies cash-only actions.
- `_action_to_side(action_lower, qty)`: maps action text to BUY/SELL side.
- `_action_is_close(action_lower)`: detects close/expire actions.
- `_apply_qty_delta(side, current_qty, trade_qty)`: updates position quantity.
- `_cap_close_qty(side, current_qty, requested_qty)`: prevents position flips during close import.
- `_parse_realized_lot_details_rows(text, target_account)`: parses realized-lot exports.
- `_create_import_trade(position_data, import_timestamp, asof)`: synthesizes import trades from positions data.
- `_store_transactions_static(...)`: static-mode transaction replay/import pipeline.

### Positions import parsing

- `_parse_custaccs_positions(text)`: main Schwab positions CSV parser.
- `import_positions(file, account)`: endpoint for backend positions import.

### NAV / benchmark text import

- `import_nav_text(payload)`: imports raw NAV text data.
- `import_benchmark_text(payload)`: imports raw benchmark text data.
- `_build_nav_from_transactions_static(rows, account)`: builds NAV from transaction rows in static flow.

### Transactions endpoint

- `import_transactions(file, account, replace, allow_overlap)`: main backend transaction import endpoint.

### Trade sector / realized admin controls

- `assign_trade_sector(payload)`: bulk-assigns sector to trades.
- `auto_classify_trade_sectors(payload)`: maps trades from symbol-sector metadata.
- `update_trade_sector(payload)`: sets sector on one trade.
- `update_trade_realized(payload)`: sets realized P/L on one trade.

### Sector performance input endpoints

- `get_sector_performance_inputs(account)`: reads baseline/target sector settings.
- `set_sector_performance_input(payload)`: writes baseline/target sector settings.

### Balances endpoint

- `import_balances(file, account)`: main balance-history import endpoint with static/fast/adjustment branches.

## `backend/app/services/legacy_engine.py`

This file contains the actual portfolio engine. The functions below are grouped by concern.

### Dates, settings, and account context

- `today_str()`: current local ISO date.
- `now_ts_str()`: timestamp string helper.
- `year_start_date()`: first day of current year.
- `parse_iso_date(value)`: safe ISO-date parser.
- `normalize_benchmark_symbol(symbol)`: standardizes benchmark aliases.
- `_fetch_rows(cur)`: cursor-row helper.
- `_account_label(account)`: canonical account label normalizer.
- `_exclude_all_account(conn)`: helper for account filtering logic.
- `_account_where(conn, account, alias)`: query filter builder.
- `_get_setting(key, default)`: reads a settings-table value.
- `_set_setting(key, value)`: writes a settings-table value.
- `_get_benchmark()`: benchmark symbol getter.
- `_get_bench_start()`: benchmark start-date getter.
- `_earliest_portfolio_date(account)`: earliest portfolio date finder.
- `_earliest_balance_history_date(account)`: earliest balance-history date finder.
- `_effective_nav_start(account)`: effective NAV-series anchor date.
- `_has_trade_or_entry_data(account)`: whether trade/entry data exists.
- `_has_non_import_trades(account)`: whether account has real non-import trade data.
- `_symbol_start_map_from_positions_df(pos_df, default_start)`: position-start map builder.
- `_position_symbol_start_map(account, default_start)`: account start-map loader.
- `_get_start_cash(account)`: start cash anchor helper.
- `_normalize_asof(value)`: as-of date normalization.
- `_normalize_anchor_mode(value)`: anchor-mode normalization.
- `_get_anchor_mode(account)`: account anchor mode lookup.
- `_get_cash_anchor_info(account)`: reads cash anchor info.

### Instrument parsing and normalization

- `is_option_symbol(symbol)`: option-symbol detector.
- `build_option_symbol(underlying, expiry_iso, right, strike)`: option symbol builder.
- `parse_osi_option(symbol)`: option parser.
- `infer_underlying_from_symbol(symbol)`: underlying inference.
- `contract_multiplier(symbol, asset_class)`: multiplier lookup.
- `_derive_instrument_fields(instrument_id)`: derives instrument metadata from ID.
- `_ensure_instrument(conn, instrument_id, fields)`: upserts instrument record.
- `_ensure_account(conn, account)`: ensures account row exists.

### Price history and benchmark cache

- `_sanitize_price_df(df, is_bench)`: normalizes price dataframe shape.
- `_detect_cached_corruption(symbol, start_date, is_bench)`: cache sanity check.
- `_overwrite_price_cache(symbol, start_date, history)`: cache rewrite helper.
- `_get_last_price_date(symbol)`: last cached price date lookup.
- `get_price_on_or_before(symbol, date_iso)`: historical price lookup.
- `last_cached_close(symbol)`: latest cached close lookup.
- `_benchmark_candidates(bench_symbol)`: benchmark alias candidates.
- `_store_price_point(symbol, date_iso, close)`: one-point price-cache upsert.
- `_refresh_benchmark_quote(bench_symbol)`: benchmark refresh helper.
- `ensure_benchmark_cache_current(bench_symbol, start_date)`: benchmark cache maintainer.
- `_fetch_history_schwab(symbol, start_date)`: Schwab history fetch.
- `_fetch_history_yfinance(symbol, start_date)`: Yahoo history fetch.
- `_fetch_history_stooq(symbol, start_date)`: Stooq history fetch.
- `_fetch_history_primary(symbol, start_date, is_bench)`: prioritized fetch chain.
- `ensure_symbol_history(symbol, start_date, is_bench)`: ensures symbol history exists in cache.
- `fetch_prices_incremental(symbol, lookback_iso, is_bench)`: incremental price updater.
- `get_bench_series(bench_symbol, start_date)`: benchmark dataframe builder.
- `warm_position_history_cache(account)`: prewarms history needed for current positions.
- `_get_cached_quote(symbol)`: in-memory quote cache read.
- `_cache_quote(symbol, price)`: in-memory quote cache write.
- `snapshot_quotes_into_cache(symbols, date_iso)`: saves quote snapshot into cache.

### Cash and position loading

- `compute_cash_balance_total(account)`: computes cash total from account/cash-flow state.
- `_compute_short_market_value(positions)`: short exposure helper.
- `compute_cash_available(cash_total, positions)`: buying-power style helper.
- `_cash_flow_is_external(note)`: external-flow detector.
- `_load_positions_df(account)`: loads positions into dataframe.
- `build_positions_live(pricing_date_iso, start_date_iso, account)`: live-valued positions dataframe.

### NAV caching and daily series

- `_nav_cache_key(limit, account)`: NAV cache key.
- `_get_nav_cache(limit, account)`: NAV cache read.
- `_set_nav_cache(limit, account, data)`: NAV cache write.
- `_clear_nav_cache()`: NAV cache clear.
- `_extend_nav_points_with_benchmark(...)`: joins benchmark data onto NAV points.
- `_fallback_business_dates(start_iso, end_iso)`: business-date fallback generator.
- `build_daily_nav_series(start_iso, bench_series, account)`: daily NAV dataframe builder.
- `get_nav_series(limit, account)`: main NAV-series API service.
- `_get_nav_series_from_snapshots(limit, account)`: snapshot-based NAV retrieval path.

### Risk-stat helpers

- `compute_var_metrics_from_nav(nav_series, current_nav)`: VaR metrics.
- `compute_drawdown_mdd(nav_series)`: drawdown helper.
- `compute_sharpe_sortino(nav_series)`: Sharpe/Sortino helper.

### Strategy and trade handling

- `record_strategy(strategy_id, underlying, name, kind, entry_net_price, entry_units)`: stores strategy metadata.
- `get_strategy_meta_map()`: reads strategy metadata map.
- `_upsert_position_row(...)`: internal position write helper.
- `apply_trade(payload)`: core trade replay/application function.
- `preview_trade(payload)`: trade-preview engine.
- `submit_multi(legs, strategy_id, strategy_name)`: multileg strategy application.
- `_stamp()`: metadata stamp helper.

### Position/account CRUD wrappers

- `get_positions_local(account, use_cache)`: local positions list.
- `get_positions(account)`: positions list wrapper.
- `get_accounts()`: account list.
- `get_cash(account)`: cash getter.
- `set_cash(value)`: global cash setter.
- `set_account_cash(account, cash, asof, account_value)`: account cash anchor write.
- `_get_account_value(account)`: account-value lookup.
- `clear_positions_for_accounts(accounts)`: position delete by accounts.
- `clear_trades_for_account(account)`: trade delete by account.
- `upsert_position(data)`: inserts or updates one position.
- `record_trade(trade)`: stores one trade.
- `delete_position(instrument_id, account)`: deletes one position.
- `close_expired_options(account)`: auto-closes expired options.

### Snapshot and sector analytics

- `get_snapshot(account)`: main portfolio snapshot builder.
- `_get_sector_baseline_value(account, sector)`: baseline lookup.
- `_get_sector_target_weight(account, sector)`: target weight lookup.
- `get_sector_series(sector, limit, source, account)`: sector series builder.

### NAV history maintenance and background updates

- `rebuild_nav_history(limit, account)`: rebuilds historical NAV snapshots.
- `store_nav_snapshot(account, date_str, nav, bench)`: writes one NAV snapshot.
- `clear_nav_history(account)`: clears NAV snapshots.
- `start_background_price_updates()`: launches background quote/history updates.
- `stop_background_price_updates()`: stops background updater.

## Reading Order For Backend Reasoning

If you need to understand behavior quickly, use this order:

1. `backend/app/main.py`
2. `backend/app/config.py`
3. `backend/app/routers/admin.py`
4. `backend/app/services/legacy_engine.py`
5. the specific router or support service you are debugging
