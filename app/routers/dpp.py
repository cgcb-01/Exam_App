"""routers/dpp.py — Daily Practice Sheets + calendar."""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from pathlib import Path
from datetime import datetime, date, timedelta
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.content import DPPEntry
from app.models.submission import Submission

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def dpp_home(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    # Current month DPPs
    today = date.today()
    start = today.replace(day=1)
    end   = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    dpps  = db.query(DPPEntry).filter(
        DPPEntry.scheduled_date >= datetime.combine(start, datetime.min.time()),
        DPPEntry.scheduled_date <= datetime.combine(end,   datetime.max.time()),
    ).order_by(DPPEntry.scheduled_date).all()

    # Mark attempted
    attempted_exam_ids = {
        s.exam_id for s in db.query(Submission.exam_id)
        .filter(Submission.user_id == user.id, Submission.is_complete == True).all()
    }
    return templates.TemplateResponse("dpp.html", {
        "request":          request,
        "dpps":             dpps,
        "attempted_ids":    attempted_exam_ids,
        "today":            today,
        "page":             "dpp",
        "stream":           user.profile.stream if user.profile else "JEE",
    })


@router.get("/api/calendar", response_class=JSONResponse)
async def dpp_calendar(year: int, month: int, request: Request, db: Session = Depends(get_db)):
    user  = get_current_user(request, db)
    start = datetime(year, month, 1)
    end   = (start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)
    dpps  = db.query(DPPEntry).filter(
        DPPEntry.scheduled_date >= start,
        DPPEntry.scheduled_date <= end,
    ).all()
    attempted = {
        s.exam_id for s in db.query(Submission.exam_id)
        .filter(Submission.user_id == user.id, Submission.is_complete == True).all()
    }
    return [{
        "exam_id":   d.exam_id,
        "subject":   d.subject,
        "date":      d.scheduled_date.strftime("%Y-%m-%d"),
        "attempted": d.exam_id in attempted,
        "premium":   d.is_premium,
    } for d in dpps]