"""routers/calendar_routes.py"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from app.database import get_db
from app.models.misc import CalendarEvent
from datetime import date

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def calendar_page(request: Request):
    return templates.TemplateResponse("calendar.html", {"request": request, "page": "calendar"})


@router.get("/api/events", response_class=JSONResponse)
async def get_events(year: int = None, month: int = None, db: Session = Depends(get_db)):
    q = db.query(CalendarEvent).filter(CalendarEvent.is_active == True)
    if year and month:
        from calendar import monthrange
        start = date(year, month, 1)
        end   = date(year, month, monthrange(year, month)[1])
        q = q.filter(CalendarEvent.event_date >= start, CalendarEvent.event_date <= end)
    events = q.order_by(CalendarEvent.event_date).all()
    return [{"id": e.id, "title": e.title, "date": str(e.event_date),
             "type": e.event_type, "color": e.color_hex, "description": e.description} for e in events]