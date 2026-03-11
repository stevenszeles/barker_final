from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from ..services import stooq

router = APIRouter(prefix="/stooq", tags=["stooq"])


@router.get("/q/d/l/", response_class=PlainTextResponse)
def stooq_daily_history(
    s: str = Query(..., min_length=1, description="Stooq-compatible symbol, e.g. xlk.us or ^spx"),
    i: str = Query("d", description="Interval. Only daily history is supported."),
):
    if i.lower() != "d":
        raise HTTPException(status_code=400, detail="Only daily interval is supported")

    history = stooq.get_history(s)
    if not history:
        raise HTTPException(status_code=404, detail=f"No history found for {s}")

    rows = ["Date,Open,High,Low,Close,Volume"]
    for row in history:
        date = row.get("date")
        close = row.get("close")
        if not date or close is None:
            continue
        value = f"{float(close):.6f}".rstrip("0").rstrip(".")
        rows.append(f"{date},{value},{value},{value},{value},0")

    if len(rows) == 1:
        raise HTTPException(status_code=404, detail=f"No history found for {s}")

    return "\n".join(rows) + "\n"
