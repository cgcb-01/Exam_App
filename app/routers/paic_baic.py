"""routers/paic_baic.py — PAIC and BAIC contest pages."""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import datetime
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.contest import Contest

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def contests_home(request: Request, db: Session = Depends(get_db)):
    get_current_user(request, db)
    now = datetime.utcnow()
    contests = db.query(Contest).filter(Contest.is_active == True).order_by(Contest.start_time.desc()).all()
    return templates.TemplateResponse("paic_baic.html", {
        "request":  request,
        "contests": contests,
        "now":      now,
        "page":     "contests",
    })