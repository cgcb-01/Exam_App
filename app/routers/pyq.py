"""routers/pyq.py — Past Year Questions browser."""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.content import PYQYear
from app.models.exam import Exam

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def pyq_home(request: Request, stream: str = "JEE_MAINS", db: Session = Depends(get_db)):
    get_current_user(request, db)  # auth check
    years = db.query(PYQYear).filter(
        PYQYear.stream == stream, PYQYear.is_active == True,
    ).order_by(PYQYear.year.desc(), PYQYear.shift).all()
    return templates.TemplateResponse("pyq.html", {
        "request": request,
        "years":   years,
        "stream":  stream,
        "page":    "pyq",
    })