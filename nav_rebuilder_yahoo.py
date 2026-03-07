"""
nav_rebuilder_yahoo.py

Rebuilds daily NAV for one or more Schwab/TOS accounts using:
- A multi-account Positions export (current snapshot)
- A multi-account Realized Gain/Loss Lot Details export (YTD or custom window)
- Yahoo Finance daily close prices via yfinance

Two rebuild modes:
1) approx: assumes current equity/ETF holdings were held for the entire period
2) lot: uses realized lots (opened_date -> closed_date) as holdings during that window

Important limitation:
- Yahoo does not provide reliable historical prices for specific option contracts.
  This script treats options as realized cash flows only (PnL realized at closed date).
  Open option positions at end are excluded from daily marks unless you set include_open_options_end_value=True,
  which will hold their end value constant across the series (not realistic, but sometimes useful for dashboards).

Output:
- Excel workbook with daily NAV series per account and diagnostics.

Author: ChatGPT
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except Exception as e:
    raise SystemExit(
        "Missing dependency: yfinance\n"
        "Install with: pip install yfinance pandas openpyxl\n"
        f"Original error: {e}"
    )

# ----------------------------
# Console status banners
# ----------------------------
def banner(ok: bool, msg: str) -> None:
    tag = "SUCCESS" if ok else "FAILED"
    print(f"[{tag}] {msg}")

# ----------------------------
# Parsing helpers
# ----------------------------
def parse_money(x) -> float:
    if pd.isna(x):
        return 0.0
    s = str(x).strip()
    if s in ["", "--", "N/A", "nan", "NaN", "-"]:
        return 0.0
    s = s.replace("$", "").replace(",", "")
    s = s.replace("(", "-").replace(")", "")
    try:
        return float(s)
    except Exception:
        return 0.0

def parse_qty(x) -> float:
    if pd.isna(x):
        return 0.0
    s = str(x).strip().replace(",", "")
    if s in ["", "--", "N/A", "nan", "NaN", "-"]:
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0

def parse_date_any(x) -> Optional[pd.Timestamp]:
    if pd.isna(x):
        return None
    s = str(x).strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return pd.to_datetime(s, format=fmt)
        except Exception:
            pass
    try:
        return pd.to_datetime(s)
    except Exception:
        return None

def is_option_symbol(sym: str) -> bool:
    # Schwab exports options as strings like:
    # "DIS 03/20/2026 110.00 C" or "NBIS 02/06/2026 100.00 P"
    if sym is None:
        return False
    s = str(sym)
    return bool(re.search(r"\b\d{2}/\d{2}/\d{4}\b", s)) and (" C" in s or " P" in s)

def base_ticker_from_option(sym: str) -> str:
    # Takes "DIS 03/20/2026 110.00 C" -> "DIS"
    return str(sym).split(" ")[0].strip()

def normalize_ticker(sym: str) -> str:
    # Yahoo uses BRK-B, BF-B etc
    s = str(sym).strip().upper()
    s = s.replace("/", "-")
    return s

# ----------------------------
# Read multi-account Positions export
# ----------------------------
@dataclass
class AccountPositions:
    account_name: str
    rows: pd.DataFrame  # parsed holdings rows (including cash line and account total line)
    nav_end: float      # Account Total market value
    cash_end: float     # Cash & Cash Investments market value

def read_positions_multiaccount(path: str) -> Dict[str, AccountPositions]:
    lines = Path(path).read_text(errors="ignore").splitlines()

    accounts: Dict[str, List[str]] = {}
    current_acct = None
    buffer: List[str] = []

    # Heuristic: account header lines look like "Limit_Liability_Company ...013"
    # followed by a CSV header row starting with "Symbol","Description",...
    for i, line in enumerate(lines):
        raw = line.strip()
        if raw and not raw.startswith('"') and "..." in raw:
            # starting a new account section
            if current_acct and buffer:
                accounts[current_acct] = buffer
            current_acct = raw
            buffer = []
            continue

        if current_acct:
            buffer.append(line)

    if current_acct and buffer:
        accounts[current_acct] = buffer

    out: Dict[str, AccountPositions] = {}

    for acct, block in accounts.items():
        # find the first real CSV header row
        header_idx = None
        for j, ln in enumerate(block):
            if ln.strip().startswith('"Symbol"'):
                header_idx = j
                break
        if header_idx is None:
            continue

        # Build a mini CSV string
        csv_text = "\n".join(block[header_idx:])
        from io import StringIO
        df = pd.read_csv(StringIO(csv_text), engine="python")

        # Some exports include an empty trailing column "Unnamed: x"
        df = df.loc[:, ~df.columns.astype(str).str.contains("^Unnamed")]

        # Clean numeric columns we need
        if "Mkt Val (Market Value)" in df.columns:
            df["MktVal"] = df["Mkt Val (Market Value)"].apply(parse_money)
        else:
            df["MktVal"] = 0.0

        if "Qty (Quantity)" in df.columns:
            df["Qty"] = df["Qty (Quantity)"].apply(parse_qty)
        else:
            df["Qty"] = 0.0

        # Identify cash and total
        cash = float(df.loc[df["Symbol"] == "Cash & Cash Investments", "MktVal"].sum())
        total = float(df.loc[df["Symbol"] == "Account Total", "MktVal"].sum())

        out[acct] = AccountPositions(
            account_name=acct,
            rows=df,
            nav_end=total,
            cash_end=cash
        )

    if not out:
        banner(False, "No account sections parsed from Positions export.")
    else:
        banner(True, f"Parsed {len(out)} account(s) from Positions export.")
    return out

# ----------------------------
# Read multi-account Realized Lot Details export
# ----------------------------
@dataclass
class AccountRealized:
    account_name: str
    lots: pd.DataFrame  # standardized columns: symbol, opened, closed, qty, proceeds, cost, pnl

def read_realized_multiaccount(path: str) -> Dict[str, AccountRealized]:
    lines = Path(path).read_text(errors="ignore").splitlines()

    accounts: Dict[str, List[str]] = {}
    current_acct = None
    buffer: List[str] = []

    # Account sections start with a line like: "Limit Liability Company ...013", then header row "Symbol","Name","Closed Date",...
    for line in lines:
        raw = line.strip().strip('"')
        if raw and "..." in raw and not raw.startswith("Realized Gain/Loss"):
            if current_acct and buffer:
                accounts[current_acct] = buffer
            current_acct = raw
            buffer = []
            continue
        if current_acct:
            buffer.append(line)

    if current_acct and buffer:
        accounts[current_acct] = buffer

    out: Dict[str, AccountRealized] = {}

    for acct, block in accounts.items():
        header_idx = None
        for j, ln in enumerate(block):
            if ln.strip().startswith('"Symbol"') and "Closed Date" in ln and "Opened Date" in ln:
                header_idx = j
                break
        if header_idx is None:
            # could be "There are no transactions..." section
            continue

        csv_text = "\n".join(block[header_idx:])
        from io import StringIO
        df = pd.read_csv(StringIO(csv_text), engine="python")

        # drop empty rows
        df = df.dropna(how="all")

        required = ["Symbol", "Opened Date", "Closed Date", "Quantity", "Proceeds", "Cost Basis (CB)", "Gain/Loss ($)"]
        for col in required:
            if col not in df.columns:
                # tolerate alternate naming if any
                pass

        # Standardize
        df_std = pd.DataFrame()
        df_std["symbol_raw"] = df.get("Symbol", "")
        df_std["symbol_is_option"] = df_std["symbol_raw"].apply(is_option_symbol)
        df_std["ticker"] = df_std["symbol_raw"].apply(lambda s: normalize_ticker(base_ticker_from_option(s)) if is_option_symbol(str(s)) else normalize_ticker(s))

        df_std["opened"] = df.get("Opened Date", "").apply(parse_date_any)
        df_std["closed"] = df.get("Closed Date", "").apply(parse_date_any)
        df_std["qty"] = df.get("Quantity", 0).apply(parse_qty)

        df_std["proceeds"] = df.get("Proceeds", 0).apply(parse_money)
        df_std["cost"] = df.get("Cost Basis (CB)", 0).apply(parse_money)
        df_std["pnl"] = df.get("Gain/Loss ($)", 0).apply(parse_money)

        # keep only rows with closed date
        df_std = df_std.dropna(subset=["closed"])

        out[acct] = AccountRealized(account_name=acct, lots=df_std)

    if not out:
        banner(False, "No account sections parsed from Realized export.")
    else:
        banner(True, f"Parsed realized lots for {len(out)} account(s).")
    return out

# ----------------------------
# Yahoo price fetch
# ----------------------------
def fetch_prices_yahoo(tickers: List[str], start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """
    Returns dataframe indexed by date with columns as tickers, using Adj Close if available else Close.
    """
    tickers = sorted({t for t in tickers if t and t != "N/A"})
    if not tickers:
        return pd.DataFrame()

    banner(True, f"Fetching Yahoo daily prices for {len(tickers)} ticker(s): {', '.join(tickers[:15])}{'...' if len(tickers) > 15 else ''}")

    data = yf.download(
        tickers=tickers,
        start=(start - pd.Timedelta(days=5)).strftime("%Y-%m-%d"),
        end=(end + pd.Timedelta(days=2)).strftime("%Y-%m-%d"),
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=True,
    )

    if data is None or data.empty:
        banner(False, "Yahoo download returned no data.")
        return pd.DataFrame()

    # yfinance returns:
    # - single ticker: columns like ["Open","High","Low","Close","Adj Close","Volume"]
    # - multi ticker: columns MultiIndex (ticker, field)
    if isinstance(data.columns, pd.MultiIndex):
        # prefer Adj Close, else Close
        fields = data.columns.get_level_values(1).unique().tolist()
        use_field = "Adj Close" if "Adj Close" in fields else "Close"
        px = data.xs(use_field, axis=1, level=1, drop_level=True).copy()
    else:
        use_field = "Adj Close" if "Adj Close" in data.columns else "Close"
        px = data[[use_field]].copy()
        # rename column to ticker
        px.columns = [tickers[0]]

    px.index = pd.to_datetime(px.index).normalize()
    px = px.sort_index()
    px = px.loc[(px.index >= start.normalize()) & (px.index <= end.normalize())]

    # forward fill missing trading days within the range
    all_days = pd.date_range(start.normalize(), end.normalize(), freq="D")
    px = px.reindex(all_days)
    px = px.ffill()

    banner(True, "Yahoo prices fetched and aligned to daily calendar.")
    return px

# ----------------------------
# NAV rebuild
# ----------------------------
def nav_rebuild_account(
    acct_pos: AccountPositions,
    acct_real: Optional[AccountRealized],
    start: pd.Timestamp,
    end: pd.Timestamp,
    mode: str,
    include_open_options_end_value: bool = False,
) -> pd.DataFrame:
    """
    Returns daily NAV dataframe with columns:
    date, holdings_value, realized_pnl_cum, nav, cash_est, notes
    """

    pos = acct_pos.rows.copy()

    # Identify equity/ETF holdings we can price from Yahoo
    pos_holdings = pos[
        ~pos["Symbol"].isin(["Cash & Cash Investments", "Account Total"])
    ].copy()

    pos_holdings["is_option"] = pos_holdings["Symbol"].astype(str).apply(is_option_symbol)
    pos_holdings["ticker"] = pos_holdings["Symbol"].astype(str).apply(
        lambda s: normalize_ticker(base_ticker_from_option(s)) if is_option_symbol(str(s)) else normalize_ticker(s)
    )

    # Current holdings quantities
    # Note: options qty is contracts. We cannot price contracts historically from Yahoo.
    equity_like = pos_holdings[~pos_holdings["is_option"]].copy()
    options_like = pos_holdings[pos_holdings["is_option"]].copy()

    equity_like = equity_like[equity_like["Qty"] != 0].copy()

    # Realized pnl series (options included, realized only)
    days = pd.date_range(start.normalize(), end.normalize(), freq="D")
    daily_realized = pd.Series(0.0, index=days)

    realized_diag = pd.DataFrame()
    if acct_real is not None and not acct_real.lots.empty:
        lots = acct_real.lots.copy()
        lots = lots[(lots["closed"] >= start) & (lots["closed"] <= end)].copy()

        # Realized pnl booked on closed date
        tmp = lots.groupby(lots["closed"].dt.normalize())["pnl"].sum()
        daily_realized.loc[tmp.index] = daily_realized.loc[tmp.index].add(tmp, fill_value=0.0)
        realized_diag = lots

    realized_cum = daily_realized.cumsum()

    # Price data for equity tickers
    tickers = equity_like["ticker"].dropna().unique().tolist()
    px = fetch_prices_yahoo(tickers, start, end) if tickers else pd.DataFrame(index=days)

    # Build holdings value path
    holdings_value = pd.Series(0.0, index=days)

    if mode == "approx":
        # Assume current equity holdings were held all period at current qty
        for _, row in equity_like.iterrows():
            t = row["ticker"]
            q = float(row["Qty"])
            if t in px.columns:
                holdings_value += q * px[t]
            else:
                # no price, hold at 0 to avoid fake numbers
                pass

        # Handle open options end value if requested
        if include_open_options_end_value and not options_like.empty:
            opt_end_mv = float(options_like["MktVal"].sum())
            holdings_value += opt_end_mv

        # Solve for start NAV consistent with end NAV, realized pnl, and holdings move
        end_holdings = float(holdings_value.loc[end.normalize()])
        start_holdings = float(holdings_value.loc[start.normalize()])

        nav_end = float(acct_pos.nav_end)
        realized_end = float(realized_cum.loc[end.normalize()])

        nav_start = nav_end - realized_end - (end_holdings - start_holdings)
        cash_est = nav_start - start_holdings

        nav = nav_start + realized_cum + (holdings_value - start_holdings)

        notes = "approx: current equity/ETF holdings assumed held entire period; realized pnl booked on closed date; options realized only"
        out = pd.DataFrame({
            "Date": days,
            "Holdings Value (Equity/ETF)": holdings_value.values,
            "Cumulative Realized PnL": realized_cum.values,
            "Estimated Cash (constant)": cash_est,
            "Estimated NAV": nav.values,
            "Notes": notes
        })

        return out

    if mode == "lot":
        # Use realized lots as holdings during their open->close window, plus current holdings assumed held entire period
        # For equities/ETFs: we mark those lots daily with Yahoo prices.
        # Options: realized only.
        holdings_value[:] = 0.0

        # Current open equity holdings held all period (still an assumption without full transactions)
        for _, row in equity_like.iterrows():
            t = row["ticker"]
            q = float(row["Qty"])
            if t in px.columns:
                holdings_value += q * px[t]

        # Add realized equity lots as separate exposures between opened and closed
        if acct_real is not None and not acct_real.lots.empty:
            lots = acct_real.lots.copy()
            # only non-options, since we cannot price options
            lots = lots[~lots["symbol_is_option"]].copy()
            lots = lots.dropna(subset=["opened", "closed"])
            lots = lots[(lots["closed"] >= start) & (lots["opened"] <= end)].copy()

            for _, lot in lots.iterrows():
                t = lot["ticker"]
                q = float(lot["qty"])
                o = max(lot["opened"].normalize(), start.normalize())
                c = min(lot["closed"].normalize(), end.normalize())
                if t not in px.columns:
                    continue

                # Active on [o, c], inclusive. This is a simplification.
                active_days = pd.date_range(o, c, freq="D")
                holdings_value.loc[active_days] += q * px.loc[active_days, t]

        if include_open_options_end_value and not options_like.empty:
            opt_end_mv = float(options_like["MktVal"].sum())
            holdings_value += opt_end_mv

        end_holdings = float(holdings_value.loc[end.normalize()])
        start_holdings = float(holdings_value.loc[start.normalize()])

        nav_end = float(acct_pos.nav_end)
        realized_end = float(realized_cum.loc[end.normalize()])

        nav_start = nav_end - realized_end - (end_holdings - start_holdings)
        cash_est = nav_start - start_holdings
        nav = nav_start + realized_cum + (holdings_value - start_holdings)

        notes = "lot: realized equity lots held opened->closed window; current equity/ETF assumed held entire period; options realized only"
        out = pd.DataFrame({
            "Date": days,
            "Holdings Value (Equity/ETF)": holdings_value.values,
            "Cumulative Realized PnL": realized_cum.values,
            "Estimated Cash (constant)": cash_est,
            "Estimated NAV": nav.values,
            "Notes": notes
        })
        return out

    raise ValueError(f"Unknown mode: {mode}")

# ----------------------------
# Main
# ----------------------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--positions", required=True, help="Path to multi-account Positions CSV export")
    ap.add_argument("--realized", required=True, help="Path to multi-account Realized Gain/Loss lot details CSV export")
    ap.add_argument("--start", required=True, help="Start date YYYY-MM-DD (ex: 2026-01-01)")
    ap.add_argument("--end", required=True, help="End date YYYY-MM-DD (ex: 2026-02-18)")
    ap.add_argument("--mode", choices=["approx", "lot", "both"], default="both", help="Rebuild mode")
    ap.add_argument("--account_contains", default="", help="Only include accounts whose name contains this text")
    ap.add_argument("--include_open_options_end_value", action="store_true",
                    help="If set, add current open option market value as a constant across the period (not realistic).")
    ap.add_argument("--out", default="NAV_Rebuild_Yahoo.xlsx", help="Output Excel file")
    args = ap.parse_args()

    start = pd.to_datetime(args.start).normalize()
    end = pd.to_datetime(args.end).normalize()
    if end < start:
        raise SystemExit("End date must be on or after start date.")

    positions = read_positions_multiaccount(args.positions)
    realized = read_realized_multiaccount(args.realized)

    # Filter accounts if needed
    acct_names = sorted(positions.keys())
    if args.account_contains:
        acct_names = [a for a in acct_names if args.account_contains.lower() in a.lower()]

    if not acct_names:
        banner(False, "No accounts matched your filter.")
        raise SystemExit(1)

    modes = ["approx", "lot"] if args.mode == "both" else [args.mode]

    out_path = Path(args.out)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        summary_rows = []

        for acct in acct_names:
            acct_pos = positions[acct]
            acct_real = realized.get(acct)

            for mode in modes:
                df_nav = nav_rebuild_account(
                    acct_pos=acct_pos,
                    acct_real=acct_real,
                    start=start,
                    end=end,
                    mode=mode,
                    include_open_options_end_value=args.include_open_options_end_value
                )

                sheet_name = f"{acct[-6:].strip()}_{mode}".replace(" ", "_").replace(".", "")
                sheet_name = sheet_name[:31]  # Excel limit

                df_nav.to_excel(writer, sheet_name=sheet_name, index=False)

                nav_start = float(df_nav.loc[df_nav["Date"] == start, "Estimated NAV"].iloc[0])
                nav_end = float(df_nav.loc[df_nav["Date"] == end, "Estimated NAV"].iloc[0])

                summary_rows.append({
                    "Account": acct,
                    "Mode": mode,
                    "Start": start.strftime("%Y-%m-%d"),
                    "End": end.strftime("%Y-%m-%d"),
                    "NAV Start": nav_start,
                    "NAV End": nav_end,
                    "NAV Change": nav_end - nav_start,
                    "End NAV (broker snapshot)": float(acct_pos.nav_end),
                    "End Cash (broker snapshot)": float(acct_pos.cash_end),
                })

            # Diagnostics: realized lots for account
            if acct_real is not None and not acct_real.lots.empty:
                acct_real.lots.to_excel(writer, sheet_name=f"{acct[-6:].strip()}_realized"[:31], index=False)

        df_summary = pd.DataFrame(summary_rows)
        df_summary.to_excel(writer, sheet_name="SUMMARY", index=False)

    banner(True, f"Excel written: {out_path.resolve()}")
    banner(True, "Note: options are realized-only unless you enabled constant end-value inclusion.")

if __name__ == "__main__":
    main()

