from __future__ import annotations

import time
import re
from datetime import datetime
from typing import Any, Dict, List, Iterable, Optional, Tuple

import httpx

from ..config import settings
from .token_store import get_token, save_token, clear_token
from . import options as options_service


PROVIDER = "schwab"
_LAST_REFRESH_ERROR_AT = 0.0


def _in_refresh_cooldown() -> bool:
    cooldown = max(0, int(getattr(settings, "schwab_refresh_cooldown", 60)))
    if cooldown <= 0:
        return False
    return time.time() < (_LAST_REFRESH_ERROR_AT + cooldown)


def can_use_marketdata() -> bool:
    if not settings.schwab.client_id:
        return False
    token = get_token(PROVIDER)
    if not token:
        return False
    if _in_refresh_cooldown():
        return False
    # Allow use if refresh token exists, even if access token is expired.
    if token.get("refresh_token"):
        return True
    expires_at = token.get("expires_at", 0) or 0
    return bool(token.get("access_token")) and time.time() < (float(expires_at) - 30)

def sanitize_auth_code(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    if "http://" in value or "https://" in value or "code=" in value:
        try:
            parsed = httpx.URL(value)
            params = parsed.params
            if "code" in params:
                value = params.get("code") or value
            else:
                match = re.search(r"[?&]code=([^&]+)", value)
                if match:
                    value = match.group(1)
        except Exception:
            match = re.search(r"[?&]code=([^&]+)", value)
            if match:
                value = match.group(1)
    try:
        value = httpx.URL(f"http://x?code={value}").params.get("code") or value
    except Exception:
        pass
    value = value.strip().strip('"').strip("'")
    if re.fullmatch(r"[A-Za-z0-9\\-_]+", value or ""):
        pad = (-len(value)) % 4
        if pad:
            value = value + ("=" * pad)
    return value.strip()


def _bearer_headers(access_token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def get_auth_url(state: str) -> str:
    params = {
        "client_id": settings.schwab.client_id,
        "redirect_uri": settings.schwab.redirect_uri,
        "response_type": "code",
    }
    if settings.schwab.scopes:
        params["scope"] = settings.schwab.scopes
    if state:
        params["state"] = state
    return f"{settings.schwab.oauth_base}/authorize?" + str(httpx.QueryParams(params))


def exchange_code(code: str) -> Dict[str, Any]:
    if not settings.schwab.client_id or not settings.schwab.client_secret:
        raise RuntimeError("Missing Schwab client id/secret")
    redirect_uri = (settings.schwab.redirect_uri or "").strip()
    if not redirect_uri:
        raise RuntimeError("Missing Schwab redirect URI")
    clean_code = sanitize_auth_code(code)
    if not clean_code:
        raise RuntimeError("Missing auth code")
    data = {
        "grant_type": "authorization_code",
        "code": clean_code,
        "redirect_uri": redirect_uri,
        "client_id": settings.schwab.client_id,
    }
    with httpx.Client(timeout=settings.schwab_timeout) as client:
        resp = client.post(
            f"{settings.schwab.oauth_base}/token",
            data=data,
            auth=(settings.schwab.client_id, settings.schwab.client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = resp.text
            raise RuntimeError(f"Schwab token exchange failed: {detail}") from exc
        payload = resp.json()
    access = payload.get("access_token") or ""
    refresh = payload.get("refresh_token") or ""
    expires_in = payload.get("expires_in", 1800) or 0
    if not access or not refresh:
        raise RuntimeError("Token response missing access or refresh token")
    save_token(PROVIDER, access, refresh, expires_in, payload.get("scope"))
    return payload


def refresh_token() -> Dict[str, Any]:
    token = get_token(PROVIDER)
    if not token or not token.get("refresh_token"):
        raise RuntimeError("No refresh token available")
    if _in_refresh_cooldown():
        raise RuntimeError("Schwab token refresh in cooldown")
    data = {
        "grant_type": "refresh_token",
        "refresh_token": token["refresh_token"],
        "client_id": settings.schwab.client_id,
    }
    with httpx.Client(timeout=settings.schwab_timeout) as client:
        resp = client.post(
            f"{settings.schwab.oauth_base}/token",
            data=data,
            auth=(settings.schwab.client_id, settings.schwab.client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = resp.text
            global _LAST_REFRESH_ERROR_AT
            _LAST_REFRESH_ERROR_AT = time.time()
            raise RuntimeError(f"Schwab token refresh failed: {detail}") from exc
        payload = resp.json()
    save_token(PROVIDER, payload["access_token"], payload.get("refresh_token", token.get("refresh_token")), payload.get("expires_in", 1800), payload.get("scope"))
    return payload


def get_access_token() -> str:
    token = get_token(PROVIDER)
    if not token:
        raise RuntimeError("Schwab not authenticated")
    expires_at = token.get("expires_at", 0) or 0
    if time.time() > expires_at - 60:
        if _in_refresh_cooldown():
            raise RuntimeError("Schwab token refresh in cooldown")
        refresh_token()
        token = get_token(PROVIDER)
    access = token.get("access_token")
    if not access:
        raise RuntimeError("Schwab not authenticated")
    return access


def _request_json(method: str, url: str, params: Optional[Dict[str, Any]] = None, json: Any = None) -> Any:
    access = get_access_token()
    headers = _bearer_headers(access)
    with httpx.Client(timeout=settings.schwab_timeout) as client:
        resp = client.request(method, url, headers=headers, params=params, json=json)
        if resp.status_code == 401:
            try:
                refresh_token()
            except Exception:
                clear_token(PROVIDER)
                raise
            access = get_access_token()
            headers = _bearer_headers(access)
            resp = client.request(method, url, headers=headers, params=params, json=json)
        resp.raise_for_status()
        return resp.json()


def get_accounts() -> List[Dict[str, Any]]:
    payload = _request_json("GET", f"{settings.schwab.api_base}/accounts")
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("accounts"), list):
            return payload["accounts"]
        if payload.get("securitiesAccount"):
            return [payload["securitiesAccount"]]
        if payload.get("account"):
            return [payload["account"]]
    return []


def _iter_accounts(payload: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item
        return
    if isinstance(payload, dict):
        if isinstance(payload.get("accounts"), list):
            for item in payload["accounts"]:
                if isinstance(item, dict):
                    yield item
            return
        if isinstance(payload.get("securitiesAccount"), dict):
            yield payload["securitiesAccount"]
            return
        if isinstance(payload.get("account"), dict):
            yield payload["account"]
            return


def _extract_account_id(account: Dict[str, Any]) -> Optional[str]:
    if account.get("securitiesAccount") and isinstance(account["securitiesAccount"], dict):
        account = account["securitiesAccount"]
    if account.get("account") and isinstance(account["account"], dict):
        account = account["account"]
    for key in ("accountId", "accountNumber", "hashValue", "accountHash", "account_id", "account_number"):
        val = account.get(key)
        if val:
            return str(val)
    return None


def resolve_account_number(preferred: Optional[str] = None) -> str:
    if preferred:
        return preferred
    accounts = get_accounts()
    for account in _iter_accounts(accounts):
        account_id = _extract_account_id(account)
        if account_id:
            return account_id
    raise RuntimeError("Unable to determine Schwab account id. Ensure Schwab authorization is complete and an account is available.")


def get_account_details(account_number: Optional[str] = None) -> Dict[str, Any]:
    account_number = resolve_account_number(account_number)
    return _request_json("GET", f"{settings.schwab.api_base}/accounts/{account_number}")


def get_orders(account_number: Optional[str] = None) -> List[Dict[str, Any]]:
    account_number = resolve_account_number(account_number)
    return _request_json("GET", f"{settings.schwab.api_base}/accounts/{account_number}/orders")


def preview_order(account_number: Optional[str], payload: Dict[str, Any]) -> Dict[str, Any]:
    account_number = resolve_account_number(account_number)
    return _request_json("POST", f"{settings.schwab.api_base}/accounts/{account_number}/orders/preview", json=payload)


def place_order(account_number: Optional[str], payload: Dict[str, Any]) -> Dict[str, Any]:
    account_number = resolve_account_number(account_number)
    return _request_json("POST", f"{settings.schwab.api_base}/accounts/{account_number}/orders", json=payload)


def get_positions(account_number: Optional[str] = None) -> List[Dict[str, Any]]:
    details = get_account_details(account_number)
    # Attempt to normalize common Schwab response structures
    account = details.get("securitiesAccount") or details.get("account") or details
    return account.get("positions") or []


def get_balances(account_number: Optional[str] = None) -> Dict[str, Any]:
    details = get_account_details(account_number)
    account = details.get("securitiesAccount") or details.get("account") or details
    return account.get("currentBalances") or account.get("balances") or {}


def get_quotes(symbols: List[str], as_map: bool = False):
    if not symbols:
        return {} if as_map else []
    mapped: Dict[str, str] = {}
    symbols_out: List[str] = []
    for sym in symbols:
        key = (sym or "").strip().upper()
        if not key:
            continue
        req = "$SPX" if key in {"^GSPC", "^SPX", "SPX"} else key
        mapped[req] = key
        symbols_out.append(req)
    params = {"symbols": ",".join(symbols_out)}
    payload = _request_json("GET", f"{settings.schwab.market_base}/quotes", params=params)
    tickers: List[Dict[str, Any]] = []
    if isinstance(payload, dict):
        for symbol, data in payload.items():
            if not isinstance(data, dict):
                continue
            quote = data.get("quote") or data
            bid = quote.get("bidPrice") or quote.get("bid") or quote.get("bidPriceInDouble") or 0
            ask = quote.get("askPrice") or quote.get("ask") or quote.get("askPriceInDouble") or 0
            bid_size = quote.get("bidSize") or quote.get("bidSizeInLong") or 0
            ask_size = quote.get("askSize") or quote.get("askSizeInLong") or 0
            last = quote.get("lastPrice") or quote.get("last") or 0
            ts = quote.get("quoteTimeInLong") or quote.get("quoteTime") or 0
            symbol_key = mapped.get(str(symbol).upper(), str(symbol).upper())
            tickers.append(
                {
                    "ticker": symbol_key,
                    "lastQuote": {
                        "bid": bid,
                        "ask": ask,
                        "bidSize": bid_size,
                        "askSize": ask_size,
                        "timestamp": ts,
                    },
                    "lastTrade": {"price": last},
                }
            )
    if not as_map:
        return tickers
    quote_map: Dict[str, Dict[str, Any]] = {}
    for row in tickers:
        symbol = row.get("ticker") or row.get("sym") or row.get("symbol")
        if not symbol:
            continue
        quote = row.get("lastQuote") or row.get("last_quote") or row.get("quote") or {}
        trade = row.get("lastTrade") or row.get("last_trade") or row.get("trade") or {}
        bid = float(quote.get("bid") or quote.get("bp") or 0)
        ask = float(quote.get("ask") or quote.get("ap") or 0)
        last = float(trade.get("price") or trade.get("p") or 0)
        price = last or (bid + ask) / 2 if bid and ask else bid or ask
        if not price:
            continue
        quote_map[str(symbol).upper()] = {
            "price": float(price),
            "bid": float(bid) if bid else float(price),
            "ask": float(ask) if ask else float(price),
            "source": "schwab_realtime",
            "timestamp": quote.get("timestamp") or trade.get("timestamp"),
        }
    return quote_map


def get_option_chain(underlying: str, contract_type: str = "ALL") -> Dict[str, Any]:
    params = {
        "symbol": underlying,
        "contractType": contract_type,
        "strategy": "SINGLE",
    }
    return _request_json("GET", f"{settings.schwab.market_base}/chains", params=params)


def _parse_osi(symbol: str) -> Optional[Tuple[str, str, str, float]]:
    parsed = options_service.parse_osi_symbol(symbol)
    if not parsed:
        return None
    root, expiry, right, strike = parsed
    return (root, expiry, right, strike)


def get_option_marks(symbols: List[str]) -> Dict[str, float]:
    groups: Dict[Tuple[str, str, str], List[Tuple[str, float]]] = {}
    for sym in symbols:
        parsed = _parse_osi(sym)
        if not parsed:
            continue
        underlying, expiry, right, strike = parsed
        groups.setdefault((underlying, expiry, right), []).append((sym, strike))

    marks: Dict[str, float] = {}
    for (underlying, expiry, right), items in groups.items():
        params = {
            "symbol": underlying,
            "contractType": "CALL" if right == "C" else "PUT",
            "strategy": "SINGLE",
            "fromDate": expiry,
            "toDate": expiry,
            "includeUnderlyingQuote": "FALSE",
        }
        data = _request_json("GET", f"{settings.schwab.market_base}/chains", params=params)

        exp_key = "callExpDateMap" if right == "C" else "putExpDateMap"
        exp_map = data.get(exp_key) if isinstance(data, dict) else None
        if not isinstance(exp_map, dict):
            continue

        needed = {float(strike) for _, strike in items}
        found: Dict[float, float] = {}
        for exp_bucket, strike_map in exp_map.items():
            exp_bucket_date = str(exp_bucket).split(":")[0]
            if exp_bucket_date != expiry:
                continue
            if not isinstance(strike_map, dict):
                continue
            for strike_key, contracts in strike_map.items():
                try:
                    strike = float(strike_key)
                except Exception:
                    continue
                if strike not in needed:
                    continue
                contract = None
                if isinstance(contracts, list) and contracts and isinstance(contracts[0], dict):
                    contract = contracts[0]
                elif isinstance(contracts, dict):
                    contract = contracts
                if not isinstance(contract, dict):
                    continue
                price = None
                for field in ("mark", "last", "lastPrice", "closePrice"):
                    if contract.get(field):
                        price = float(contract.get(field))
                        break
                if price is None:
                    bid = contract.get("bid") or contract.get("bidPrice")
                    ask = contract.get("ask") or contract.get("askPrice")
                    if bid and ask:
                        price = (float(bid) + float(ask)) / 2.0
                if price:
                    found[strike] = price
            break

        for sym, strike in items:
            if strike in found:
                marks[sym] = float(found[strike])

    return marks


def _normalize_history_symbol(symbol: str) -> str:
    base = (symbol or "").strip().upper()
    if base in {"^GSPC", "^SPX", "SPX"}:
        return "$SPX"
    return base


def get_price_history(symbol: str, start_date: str) -> List[Dict[str, Any]]:
    """
    Fetch price history from Schwab.
    Maps ^GSPC -> $SPX for Schwab API.
    """
    if not can_use_marketdata():
        return []
    fetch_symbol = _normalize_history_symbol(symbol)
    if not fetch_symbol:
        return []

    try:
        start_ms = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp() * 1000)
    except Exception:
        return []
    end_ms = int(datetime.now().timestamp() * 1000)

    url = f"{settings.schwab.market_base}/pricehistory"
    params = {
        "symbol": fetch_symbol,
        "frequencyType": "daily",
        "frequency": "1",
        "startDate": start_ms,
        "endDate": end_ms,
        "needExtendedHoursData": "false",
    }

    try:
        data = _request_json("GET", url, params=params)

        candles = data.get("candles", []) if isinstance(data, dict) else []
        results = []
        for candle in candles:
            ts = candle.get("datetime")
            if not ts:
                continue
            date = datetime.fromtimestamp(ts / 1000).date().isoformat()
            close = candle.get("close")
            if close:
                results.append({"date": date, "close": float(close)})
        return results
    except Exception:
        return []
