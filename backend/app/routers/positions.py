from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from ..services import portfolio
from ..security import Identity, require_admin

router = APIRouter(prefix="/positions", tags=["positions"])


class PositionPayload(BaseModel):
    account: Optional[str] = None
    symbol: str
    qty: float
    price: float
    avg_cost: Optional[float] = None
    asset_class: Optional[str] = "equity"
    underlying: Optional[str] = None
    expiry: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None
    multiplier: Optional[float] = None
    owner: Optional[str] = None
    label: Optional[str] = None
    entry_date: Optional[str] = None
    sector: Optional[str] = None
    strategy: Optional[str] = None
    instrument_id: Optional[str] = None


class CashPayload(BaseModel):
    cash: float
    account: Optional[str] = None


class BulkPayload(BaseModel):
    positions: list[PositionPayload]
    cash: Optional[float] = None
    account: Optional[str] = None


class SectorPayload(BaseModel):
    sector: str = Field(max_length=80)


@router.get("")
def list_positions(account: Optional[str] = None):
    try:
        return portfolio.get_positions_local(account=account, use_cache=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("")
def upsert(payload: PositionPayload, _identity: Identity = Depends(require_admin)):
    try:
        data = payload.model_dump(exclude_unset=True)
        if (not data.get("owner")) and data.get("label"):
            data["owner"] = data.get("label")
        portfolio.upsert_position(data)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/{instrument_id}")
def delete(instrument_id: str, account: Optional[str] = None, _identity: Identity = Depends(require_admin)):
    try:
        portfolio.delete_position(instrument_id, account=account)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/cash")
def get_cash():
    try:
        return {"cash": portfolio.get_cash()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/cash")
def set_cash(payload: CashPayload, _identity: Identity = Depends(require_admin)):
    try:
        if payload.account and payload.account.upper() != "ALL":
            portfolio.set_account_cash(payload.account, payload.cash)
        else:
            raise ValueError("Select a specific account (not ALL) to update cash.")
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/bulk")
def bulk_upsert(payload: BulkPayload, _identity: Identity = Depends(require_admin)):
    try:
        account_override = payload.account
        use_override = bool(account_override) and account_override.upper() != "ALL"
        for row in payload.positions:
            data = row.model_dump(exclude_unset=True)
            if (not data.get("owner")) and data.get("label"):
                data["owner"] = data.get("label")
            if use_override:
                data["account"] = account_override
            row_account = str(data.get("account") or "").strip()
            if not row_account or row_account.upper() == "ALL":
                raise ValueError(
                    "Each row must include a specific account. Select one account or provide an account column."
                )
            portfolio.upsert_position(data)
        if payload.cash is not None:
            if use_override:
                portfolio.set_account_cash(account_override, payload.cash)
            else:
                raise ValueError("Cannot update cash when account is ALL.")
        return {"ok": True, "count": len(payload.positions)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/{instrument_id}/sector")
def update_sector(
    instrument_id: str,
    payload: SectorPayload,
    account: str,
    _identity: Identity = Depends(require_admin),
):
    sector = payload.sector.strip() or "Unassigned"

    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            SELECT instruments.symbol
            FROM positions
            JOIN instruments ON instruments.id=positions.instrument_id
            WHERE positions.account=? AND positions.instrument_id=?
            """,
            (account, instrument_id),
        )
        row = cur.fetchone()
        if not row:
            return 0
        symbol = row[0]
        cur.execute(
            "UPDATE positions SET sector=? WHERE account=? AND instrument_id=?",
            (sector, account, instrument_id),
        )
        updated = int(cur.rowcount or 0)
        cur.execute(
            "UPDATE trades SET sector=? WHERE account=? AND (instrument_id=? OR symbol=?)",
            (sector, account, instrument_id, symbol),
        )
        conn.commit()
        return updated

    from ..db import with_conn

    if with_conn(_run) == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"ok": True, "account": account, "instrument_id": instrument_id, "sector": sector}
