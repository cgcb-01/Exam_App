"""routers/syllabus.py"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from app.database import get_db
from app.models.content import Chapter, SyllabusEntry

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def syllabus(request: Request, stream: str = "JEE", db: Session = Depends(get_db)):
    chapters = db.query(Chapter).filter(
        (Chapter.stream == stream) | (Chapter.stream == "BOTH"),
        Chapter.is_active == True,
    ).order_by(Chapter.subject, Chapter.order_index).all()
    return templates.TemplateResponse("syllabus.html", {
        "request": request,
        "chapters": chapters,
        "stream": stream,
        "page": "syllabus",
    })