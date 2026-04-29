from typing import Any, Dict, List, Optional

from . import legacy_engine as engine

DEFAULT_SECTORS = engine.DEFAULT_SECTORS
SECTOR_ETF = engine.SECTOR_ETF


# Snapshot + NAV

def get_snapshot(account: Optional[str] = None) -> Dict[str, Any]:
    return engine.get_snapshot(account=account)


def get_nav_series(limit: int = 120, account: Optional[str] = None) -> List[Dict[str, Any]]:
    return engine.get_nav_series(limit=limit, account=account)


def get_sector_series(sector: str, limit: int = 120, source: str = "auto", account: Optional[str] = None) -> List[Dict[str, Any]]:
    return engine.get_sector_series(sector=sector, limit=limit, source=source, account=account)


# Positions + cash

def get_positions_local(account: Optional[str] = None, use_cache: bool = True) -> List[Dict[str, Any]]:
    return engine.get_positions_local(account=account, use_cache=use_cache)


def get_positions(account: Optional[str] = None) -> List[Dict[str, Any]]:
    return engine.get_positions(account=account)


def upsert_position(data: Dict[str, Any]) -> None:
    engine.upsert_position(data)


def delete_position(instrument_id: str, account: Optional[str] = None) -> None:
    engine.delete_position(instrument_id, account=account)


def get_cash(account: Optional[str] = None) -> float:
    return engine.get_cash(account=account)


def set_cash(value: float) -> None:
    engine.set_cash(value)


def set_account_cash(account: str, cash: float, asof: Optional[str] = None, account_value: Optional[float] = None) -> None:
    engine.set_account_cash(account, cash, asof=asof, account_value=account_value)


# Accounts

def get_accounts() -> List[Dict[str, Any]]:
    return engine.get_accounts()


# Trades + import helpers

def record_trade(trade: Dict[str, Any]) -> None:
    engine.record_trade(trade)


def clear_positions_for_accounts(accounts: List[str]) -> None:
    engine.clear_positions_for_accounts(accounts)


def clear_trades_for_account(account: Optional[str] = None) -> None:
    engine.clear_trades_for_account(account=account)


# NAV history maintenance

def rebuild_nav_history(limit: int = 1500, account: Optional[str] = None) -> Dict[str, Any]:
    return engine.rebuild_nav_history(limit=limit, account=account)


def store_nav_snapshot(account: Optional[str], date: str, nav: float, bench: Optional[float] = None) -> None:
    engine.store_nav_snapshot(account, date, nav, bench=bench)


def clear_nav_history(account: Optional[str] = None) -> Dict[str, Any]:
    return engine.clear_nav_history(account=account)


# Background updates

def start_background_price_updates() -> None:
    engine.start_background_price_updates()
