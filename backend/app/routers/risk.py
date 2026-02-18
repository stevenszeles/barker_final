from fastapi import APIRouter, HTTPException
from ..schemas import RiskSummary
from ..services.risk import get_risk_summary

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/summary", response_model=RiskSummary)
def summary():
    try:
        return get_risk_summary()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
