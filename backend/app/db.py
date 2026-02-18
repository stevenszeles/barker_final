import sqlite3
import threading
import re
import os
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except Exception:  # pragma: no cover - optional dependency
    psycopg2 = None
from .config import settings

_LOCK = threading.RLock()


def _is_postgres() -> bool:
    return bool(settings.db_url)


def _table_columns(conn, table_name: str) -> list[str]:
    cur = conn.cursor()
    if _is_postgres():
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s
            """,
            (table_name.lower(),),
        )
        rows = cur.fetchall()
        return [row["column_name"] if isinstance(row, dict) else row[0] for row in rows]
    cur.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cur.fetchall()]


_PK_MAP = {
    "settings": ["key"],
    "accounts": ["account"],
    "instruments": ["id"],
    "positions": ["account", "instrument_id"],
    "nav_snapshots": ["account", "date"],
    "price_cache": ["symbol", "date"],
    "last_prices": ["instrument_id"],
    "daily_positions": ["account", "date", "instrument_id"],
    "trades": ["trade_id"],
    "risk_limits": ["metric"],
    "risk_metrics": ["metric"],
    "oauth_tokens": ["provider"],
    "quotes": ["symbol"],
}


def _rewrite_insert(sql: str) -> str:
    match = re.match(
        r"\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return sql
    action = match.group(1).upper()
    table = match.group(2)
    cols = [c.strip() for c in match.group(3).split(",")]
    values = match.group(4).strip()
    pk = _PK_MAP.get(table.lower())
    if not pk:
        return sql.replace("INSERT OR", "INSERT", 1)
    if action == "IGNORE":
        return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({values}) ON CONFLICT ({', '.join(pk)}) DO NOTHING"
    update_cols = [c for c in cols if c not in pk]
    if not update_cols:
        return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({values}) ON CONFLICT ({', '.join(pk)}) DO NOTHING"
    set_clause = ", ".join([f"{col}=EXCLUDED.{col}" for col in update_cols])
    return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({values}) ON CONFLICT ({', '.join(pk)}) DO UPDATE SET {set_clause}"


def _replace_placeholders(sql: str) -> str:
    out = []
    in_single = False
    in_double = False
    for ch in sql:
        if ch == "'" and not in_double:
            in_single = not in_single
            out.append(ch)
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            out.append(ch)
            continue
        if ch == "?" and not in_single and not in_double:
            out.append("%s")
        else:
            out.append(ch)
    return "".join(out)


def _adapt_sql(sql: str) -> str:
    if not _is_postgres():
        return sql
    rewritten = _rewrite_insert(sql)
    return _replace_placeholders(rewritten)


class _RowProxy:
    def __init__(self, data: dict, columns: list[str]):
        self._data = data
        self._columns = columns

    def __getitem__(self, key):
        if isinstance(key, int):
            if key < 0 or key >= len(self._columns):
                raise IndexError(key)
            return self._data.get(self._columns[key])
        return self._data.get(key)

    def get(self, key, default=None):
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def items(self):
        return self._data.items()

    def __iter__(self):
        return iter(self._data)


class _DBCursor:
    def __init__(self, cursor):
        self._cursor = cursor
        self._columns = None

    def _wrap_row(self, row):
        if row is None:
            return None
        if isinstance(row, dict):
            if self._columns is None and self._cursor.description:
                self._columns = [col[0] for col in self._cursor.description]
            return _RowProxy(row, self._columns or list(row.keys()))
        return row

    def execute(self, sql, params=None):
        res = self._cursor.execute(_adapt_sql(sql), params or [])
        if self._cursor.description:
            self._columns = [col[0] for col in self._cursor.description]
        return res

    def executemany(self, sql, seq):
        return self._cursor.executemany(_adapt_sql(sql), seq)

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [self._wrap_row(row) for row in rows]

    def fetchone(self):
        return self._wrap_row(self._cursor.fetchone())

    def __getattr__(self, item):
        return getattr(self._cursor, item)


class _DBConn:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return _DBCursor(self._conn.cursor())

    def commit(self):
        return self._conn.commit()

    def close(self):
        return self._conn.close()

    def execute(self, *args, **kwargs):
        cur = self.cursor()
        return cur.execute(*args, **kwargs)


def ensure_schema() -> None:
    conn = connect()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            account TEXT PRIMARY KEY,
            cash REAL,
            asof TEXT,
            account_value REAL
        )
        """
    )
    # Backfill accounts.account_value if missing
    try:
        columns = _table_columns(conn, "accounts")
        if "account_value" not in [c.lower() for c in columns]:
            cur.execute("ALTER TABLE accounts ADD COLUMN account_value REAL")
    except Exception:
        pass
    # Default benchmark start (year start) if not set
    bench_start = f"{datetime.now().year:04d}-01-01"
    cur.execute("INSERT OR IGNORE INTO settings(key, value) VALUES('bench_start', ?)", (bench_start,))
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS instruments (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            underlying TEXT,
            expiry TEXT,
            strike REAL,
            option_type TEXT,
            multiplier REAL NOT NULL,
            exchange TEXT,
            currency TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS positions (
            account TEXT NOT NULL DEFAULT 'Primary',
            instrument_id TEXT NOT NULL,
            qty REAL,
            price REAL,
            market_value REAL,
            avg_cost REAL,
            day_pnl REAL,
            total_pnl REAL,
            day_pnl_pct REAL,
            total_pnl_pct REAL,
            sector TEXT,
            owner TEXT,
            entry_date TEXT,
            strategy TEXT,
            strategy_id TEXT,
            strategy_name TEXT,
            delta REAL,
            gamma REAL,
            theta REAL,
            vega REAL
            ,
            PRIMARY KEY(account, instrument_id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS nav_snapshots (
            account TEXT NOT NULL DEFAULT 'ALL',
            date TEXT NOT NULL,
            nav REAL,
            bench REAL,
            PRIMARY KEY(account, date)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS cash_flows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account TEXT NOT NULL DEFAULT 'ALL',
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS price_cache (
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            close REAL NOT NULL,
            PRIMARY KEY(symbol, date)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS last_prices (
            instrument_id TEXT PRIMARY KEY,
            price REAL NOT NULL,
            asof TEXT,
            source TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS quotes (
            symbol TEXT PRIMARY KEY,
            bid REAL,
            ask REAL,
            last REAL,
            asof TEXT,
            source TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_positions (
            account TEXT NOT NULL DEFAULT 'Primary',
            date TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            qty REAL,
            price REAL,
            market_value REAL,
            avg_cost REAL,
            day_pnl REAL,
            total_pnl REAL,
            sector TEXT,
            strategy_id TEXT,
            strategy_name TEXT,
            PRIMARY KEY(account, date, instrument_id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trades (
            trade_id TEXT PRIMARY KEY,
            ts TEXT,
            trade_date TEXT,
            account TEXT,
            instrument_id TEXT,
            symbol TEXT,
            side TEXT,
            qty REAL,
            price REAL,
            trade_type TEXT,
            status TEXT,
            source TEXT,
            asset_class TEXT,
            underlying TEXT,
            expiry TEXT,
            strike REAL,
            option_type TEXT,
            multiplier REAL,
            strategy_id TEXT,
            strategy_name TEXT,
            sector TEXT,
            realized_pl REAL,
            cost_basis REAL,
            cash_flow REAL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS strategies (
            strategy_id TEXT PRIMARY KEY,
            ts TEXT,
            underlying TEXT,
            name TEXT,
            kind TEXT,
            entry_net_price REAL,
            entry_units REAL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS risk_limits (
            metric TEXT PRIMARY KEY,
            limit_value REAL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS risk_metrics (
            metric TEXT PRIMARY KEY,
            value REAL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            ts TEXT,
            actor TEXT,
            action TEXT,
            details_json TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS oauth_tokens (
            provider TEXT PRIMARY KEY,
            access_token TEXT,
            refresh_token TEXT,
            expires_at INTEGER,
            scope TEXT
        )
        """
    )
    cur.execute("SELECT value FROM settings WHERE key='start_cash'")
    if not cur.fetchone():
        cur.execute("SELECT value FROM settings WHERE key='cash'")
        cash_row = cur.fetchone()
        default_cash = cash_row[0] if cash_row else "5000000"
        cur.execute(
            "INSERT OR REPLACE INTO settings(key, value) VALUES('start_cash', ?)",
            (default_cash,),
        )
    cur.execute("SELECT value FROM settings WHERE key='benchmark'")
    if not cur.fetchone():
        cur.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('benchmark', ?)", ("^GSPC",))

    if not _is_postgres():
        # Legacy migration: old positions table with symbol column
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='positions'")
            if cur.fetchone():
                columns = _table_columns(conn, "positions")
                if "account" not in columns:
                    cur.execute("ALTER TABLE positions RENAME TO positions_legacy_account")
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS positions (
                            account TEXT NOT NULL DEFAULT 'Primary',
                            instrument_id TEXT NOT NULL,
                            qty REAL,
                            price REAL,
                            market_value REAL,
                            avg_cost REAL,
                            day_pnl REAL,
                            total_pnl REAL,
                            day_pnl_pct REAL,
                            total_pnl_pct REAL,
                            sector TEXT,
                            owner TEXT,
                            entry_date TEXT,
                            strategy TEXT,
                            strategy_id TEXT,
                            strategy_name TEXT,
                            delta REAL,
                            gamma REAL,
                            theta REAL,
                            vega REAL,
                            PRIMARY KEY(account, instrument_id)
                        )
                        """
                    )
                    owner_src = "owner" if "owner" in columns else "NULL"
                    entry_src = "entry_date" if "entry_date" in columns else "NULL"
                    strategy_src = "strategy" if "strategy" in columns else "NULL"
                    strategy_id_src = "strategy_id" if "strategy_id" in columns else "NULL"
                    strategy_name_src = "strategy_name" if "strategy_name" in columns else "NULL"
                    delta_src = "delta" if "delta" in columns else "NULL"
                    gamma_src = "gamma" if "gamma" in columns else "NULL"
                    theta_src = "theta" if "theta" in columns else "NULL"
                    vega_src = "vega" if "vega" in columns else "NULL"
                    cur.execute(
                        f"""
                        INSERT INTO positions(
                            account, instrument_id, qty, price, market_value, avg_cost, day_pnl, total_pnl,
                            day_pnl_pct, total_pnl_pct, sector, owner, entry_date, strategy, strategy_id, strategy_name, delta, gamma, theta, vega
                        )
                        SELECT
                            'Primary', instrument_id, qty, price, market_value, avg_cost, day_pnl, total_pnl,
                            day_pnl_pct, total_pnl_pct, sector, {owner_src}, {entry_src}, {strategy_src}, {strategy_id_src}, {strategy_name_src}, {delta_src}, {gamma_src}, {theta_src}, {vega_src}
                        FROM positions_legacy_account
                        """
                    )
                    cur.execute("DROP TABLE positions_legacy_account")
                if "instrument_id" not in columns and "symbol" in columns:
                    cur.execute("ALTER TABLE positions RENAME TO positions_legacy")
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS positions (
                            account TEXT NOT NULL DEFAULT 'Primary',
                            instrument_id TEXT NOT NULL,
                            qty REAL,
                            price REAL,
                            market_value REAL,
                            avg_cost REAL,
                            day_pnl REAL,
                            total_pnl REAL,
                            day_pnl_pct REAL,
                            total_pnl_pct REAL,
                            sector TEXT,
                            owner TEXT,
                            entry_date TEXT,
                            strategy TEXT,
                            strategy_id TEXT,
                            strategy_name TEXT,
                            delta REAL,
                            gamma REAL,
                            theta REAL,
                            vega REAL,
                            PRIMARY KEY(account, instrument_id)
                        )
                        """
                    )
                    cur.execute("SELECT symbol, qty, price, market_value, sector FROM positions_legacy")
                    legacy_rows = cur.fetchall()
                    for row in legacy_rows:
                        symbol = row[0]
                        instrument_id = f"{symbol}:EQ"
                        cur.execute(
                            """
                            INSERT OR IGNORE INTO instruments(id, symbol, asset_class, underlying, expiry, strike, option_type, multiplier, exchange, currency)
                            VALUES(?,?,?,?,?,?,?,?,?,?)
                            """,
                            (instrument_id, symbol, "equity", symbol, None, None, None, 1.0, None, "USD"),
                        )
                        cur.execute(
                            """
                            INSERT OR REPLACE INTO positions(account, instrument_id, qty, price, market_value, sector)
                            VALUES(?,?,?,?,?,?)
                            """,
                            ("Primary", instrument_id, row[1], row[2], row[3], row[4]),
                        )
        except Exception:
            pass

        # Legacy migration: old trades table without instrument metadata
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trades'")
            if cur.fetchone():
                columns = _table_columns(conn, "trades")
                if "account" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN account TEXT")
                if "trade_date" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN trade_date TEXT")
                if "sector" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN sector TEXT")
                if "realized_pl" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN realized_pl REAL")
                if "cost_basis" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN cost_basis REAL")
                if "cash_flow" not in columns:
                    cur.execute("ALTER TABLE trades ADD COLUMN cash_flow REAL")
                if "instrument_id" not in columns and "symbol" in columns:
                    cur.execute("ALTER TABLE trades RENAME TO trades_legacy")
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS trades (
                            trade_id TEXT PRIMARY KEY,
                            ts TEXT,
                            trade_date TEXT,
                            account TEXT,
                            instrument_id TEXT,
                            symbol TEXT,
                            side TEXT,
                            qty REAL,
                            price REAL,
                            trade_type TEXT,
                            status TEXT,
                            source TEXT,
                            asset_class TEXT,
                            underlying TEXT,
                            expiry TEXT,
                            strike REAL,
                            option_type TEXT,
                            multiplier REAL,
                            strategy_id TEXT,
                            strategy_name TEXT,
                            sector TEXT,
                            realized_pl REAL,
                            cost_basis REAL,
                            cash_flow REAL
                        )
                        """
                    )
                    cur.execute("SELECT trade_id, ts, symbol, side, qty, price, trade_type, status, source FROM trades_legacy")
                    legacy_rows = cur.fetchall()
                    for row in legacy_rows:
                        symbol = row[2]
                        instrument_id = f"{symbol}:EQ"
                        cur.execute(
                            """
                            INSERT OR REPLACE INTO trades(
                                trade_id, ts, trade_date, account, instrument_id, symbol, side, qty, price, trade_type, status, source,
                                asset_class, underlying, expiry, strike, option_type, multiplier
                            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                            """,
                            (
                                row[0],
                                row[1],
                                row[1][:10] if row[1] else None,
                                "Primary",
                                instrument_id,
                                symbol,
                                row[3],
                                row[4],
                                row[5],
                                row[6],
                                row[7],
                                row[8],
                                "equity",
                                symbol,
                                None,
                                None,
                                None,
                                1.0,
                            ),
                        )
        except Exception:
            pass

        # Legacy migration: nav_snapshots without account
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nav_snapshots'")
            if cur.fetchone():
                columns = _table_columns(conn, "nav_snapshots")
                if "account" not in columns:
                    cur.execute("ALTER TABLE nav_snapshots RENAME TO nav_snapshots_legacy_account")
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS nav_snapshots (
                            account TEXT NOT NULL DEFAULT 'ALL',
                            date TEXT NOT NULL,
                            nav REAL,
                            bench REAL,
                            PRIMARY KEY(account, date)
                        )
                        """
                    )
                    cur.execute(
                        """
                        INSERT INTO nav_snapshots(account, date, nav, bench)
                        SELECT 'ALL', date, nav, bench FROM nav_snapshots_legacy_account
                        """
                    )
                    cur.execute("DROP TABLE nav_snapshots_legacy_account")
        except Exception:
            pass

        # Legacy migration: daily_positions without account
        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_positions'")
            if cur.fetchone():
                columns = _table_columns(conn, "daily_positions")
                if "account" not in columns:
                    cur.execute("ALTER TABLE daily_positions RENAME TO daily_positions_legacy_account")
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS daily_positions (
                            account TEXT NOT NULL DEFAULT 'Primary',
                            date TEXT NOT NULL,
                            instrument_id TEXT NOT NULL,
                            qty REAL,
                            price REAL,
                            market_value REAL,
                            avg_cost REAL,
                            day_pnl REAL,
                            total_pnl REAL,
                            sector TEXT,
                            strategy_id TEXT,
                            strategy_name TEXT,
                            PRIMARY KEY(account, date, instrument_id)
                        )
                        """
                    )
                    cur.execute(
                        """
                        INSERT INTO daily_positions(
                            account, date, instrument_id, qty, price, market_value, avg_cost,
                            day_pnl, total_pnl, sector, strategy_id, strategy_name
                        )
                        SELECT
                            'Primary', date, instrument_id, qty, price, market_value, avg_cost,
                            day_pnl, total_pnl, sector, strategy_id, strategy_name
                        FROM daily_positions_legacy_account
                        """
                    )
                    cur.execute("DROP TABLE daily_positions_legacy_account")
        except Exception:
            pass

    # Add missing columns (strategy fields)
    try:
        columns = _table_columns(conn, "positions")
        if "owner" not in columns:
            cur.execute("ALTER TABLE positions ADD COLUMN owner TEXT")
        if "entry_date" not in columns:
            cur.execute("ALTER TABLE positions ADD COLUMN entry_date TEXT")
        if "strategy_id" not in columns:
            cur.execute("ALTER TABLE positions ADD COLUMN strategy_id TEXT")
        if "strategy_name" not in columns:
            cur.execute("ALTER TABLE positions ADD COLUMN strategy_name TEXT")
    except Exception:
        pass

    try:
        columns = _table_columns(conn, "trades")
        if "strategy_id" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN strategy_id TEXT")
        if "strategy_name" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN strategy_name TEXT")
        if "sector" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN sector TEXT")
        if "realized_pl" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN realized_pl REAL")
        if "cost_basis" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN cost_basis REAL")
        if "cash_flow" not in columns:
            cur.execute("ALTER TABLE trades ADD COLUMN cash_flow REAL")
    except Exception:
        pass

    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_price_cache_symbol_date ON price_cache(symbol, date)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades(trade_date)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_trades_symbol_date ON trades(symbol, trade_date)")
    except Exception:
        pass

    # Cleanup: ALL is not a real account (aggregate only)
    try:
        cur.execute("DELETE FROM positions WHERE account='ALL'")
        cur.execute("DELETE FROM trades WHERE account='ALL'")
        cur.execute("DELETE FROM cash_flows WHERE account='ALL'")
        cur.execute("DELETE FROM nav_snapshots WHERE account='ALL'")
        cur.execute("DELETE FROM daily_positions WHERE account='ALL'")
        cur.execute("DELETE FROM accounts WHERE account='ALL'")
    except Exception:
        pass

    conn.commit()
    conn.close()


def connect():
    if _is_postgres():
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is required for Postgres. Install backend requirements.")
        conn = psycopg2.connect(settings.db_url, cursor_factory=psycopg2.extras.RealDictCursor)
        return _DBConn(conn)
    db_path = settings.db_path
    db_dir = os.path.dirname(os.path.abspath(db_path))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    return _DBConn(conn)


def with_conn(fn):
    with _LOCK:
        conn = connect()
        try:
            return fn(conn)
        finally:
            conn.close()
