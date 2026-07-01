from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import datetime

from app.database import get_db
from app.models.misc import Announcement
from app.models.contest import Contest

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def home(request: Request, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    announcements = (
        db.query(Announcement)
        .filter(Announcement.is_active == True)
        .filter((Announcement.expire_at == None) | (Announcement.expire_at > now))
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
        .limit(30)
        .all()
    )
    upcoming_contests = (
        db.query(Contest)
        .filter(Contest.is_active == True, Contest.start_time > now)
        .order_by(Contest.start_time)
        .limit(5)
        .all()
    )
    return templates.TemplateResponse("home.html", {
        "request":           request,
        "announcements":     announcements,
        "upcoming_contests": upcoming_contests,
        "now":               now,
        "page":              "home",
    })