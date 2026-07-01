"""routers/chapterwise.py — Subject → Chapter → Module browsing."""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.content import Chapter
from app.models.exam import Exam

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def chapterwise_home(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    stream = user.profile.stream if user.profile else "JEE"
    chapters = db.query(Chapter).filter(
        (Chapter.stream == stream) | (Chapter.stream == "BOTH"),
        Chapter.is_active == True,
    ).order_by(Chapter.subject, Chapter.order_index).all()
    return templates.TemplateResponse("chapterwise.html", {
        "request":  request,
        "chapters": chapters,
        "stream":   stream,
        "page":     "chapterwise",
    })


@router.get("/{chapter_id}", response_class=HTMLResponse)
async def chapter_modules(chapter_id: str, request: Request, db: Session = Depends(get_db)):
    user    = get_current_user(request, db)
    chapter = db.query(Chapter).filter(Chapter.id == chapter_id).first()
    if not chapter:
        from fastapi import HTTPException; raise HTTPException(404)
    modules = db.query(Exam).filter(
        Exam.chapter_id  == chapter_id,
        Exam.exam_type   == "CHAPTERWISE",
        Exam.is_published == True,
    ).order_by(Exam.module_no).all()
    return templates.TemplateResponse("chapterwise.html", {
        "request": request,
        "chapter": chapter,
        "modules": modules,
        "page":    "chapterwise",
    })