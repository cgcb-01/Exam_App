"""
routers/admin.py
Admin panel: create/edit exams, sections, questions, contests,
announcements, calendar events, manage users/premium.
"""
from fastapi import APIRouter, Request, Depends, HTTPException, Form, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import datetime
import json, uuid

from app.database import get_db
from app.services.auth_utils import require_admin
from app.models.exam import Exam, ExamSection, Question, QuestionOption
from app.models.content import Chapter, SyllabusEntry, PYQYear, DPPEntry
from app.models.contest import Contest
from app.models.misc import Announcement, CalendarEvent
from app.models.user import User, UserProfile
from app.config import QUESTION_TYPES, DEFAULT_MARKING, CLASS_OPTIONS, STREAM_OPTIONS
from app.services.b2_storage import get_storage

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))

# ── Admin dashboard ───────────────────────────────────────────────
@router.get("/", response_class=HTMLResponse)
async def admin_home(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    stats = {
        "users":   db.query(User).count(),
        "exams":   db.query(Exam).count(),
        "chapters":db.query(Chapter).count(),
    }
    return templates.TemplateResponse("admin_panel.html", {
        "request": request, "stats": stats, "page": "admin",
        "question_types": QUESTION_TYPES,
        "class_options":  CLASS_OPTIONS,
        "stream_options": STREAM_OPTIONS,
    })

# ── Exam CRUD ─────────────────────────────────────────────────────
@router.get("/exams", response_class=HTMLResponse)
async def admin_exams(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    exams = db.query(Exam).order_by(Exam.created_at.desc()).limit(100).all()
    return templates.TemplateResponse("admin_panel.html", {
        "request": request, "exams": exams, "view": "exams", "page": "admin",
    })

@router.post("/exams/create")
async def create_exam(
    request: Request,
    title:            str  = Form(...),
    exam_type:        str  = Form("DPP"),
    paper_style:      str  = Form("JEE_MAINS"),
    stream:           str  = Form("JEE"),
    for_class:        str  = Form("ALL"),
    subject:          str  = Form(""),
    duration_minutes: int  = Form(180),
    is_premium:       bool = Form(False),
    instructions:     str  = Form(""),
    year:             int  = Form(None),
    shift:            str  = Form(""),
    paper_no:         str  = Form(""),
    module_no:        int  = Form(None),
    chapter_id:       str  = Form(""),
    start_time:       str  = Form(""),
    end_time:         str  = Form(""),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    exam = Exam(
        title            = title.strip(),
        exam_type        = exam_type,
        paper_style      = paper_style,
        stream           = stream,
        for_class        = for_class,
        subject          = subject.strip() or None,
        duration_minutes = duration_minutes,
        is_premium       = is_premium,
        instructions     = instructions.strip() or None,
        year             = year,
        shift            = shift.strip() or None,
        paper_no         = paper_no.strip() or None,
        module_no        = module_no,
        chapter_id       = chapter_id.strip() or None,
        start_time       = datetime.fromisoformat(start_time) if start_time else None,
        end_time         = datetime.fromisoformat(end_time) if end_time else None,
    )
    db.add(exam)
    db.commit()
    return RedirectResponse(url=f"/admin/exams/{exam.id}", status_code=302)


@router.get("/exams/{exam_id}", response_class=HTMLResponse)
async def admin_exam_detail(exam_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam: raise HTTPException(404)
    return templates.TemplateResponse("admin_panel.html", {
        "request": request, "exam": exam, "view": "exam_detail",
        "page": "admin", "question_types": QUESTION_TYPES,
    })


@router.post("/exams/{exam_id}/publish")
async def publish_exam(exam_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if exam:
        exam.is_published = True
        db.commit()
    return RedirectResponse(url=f"/admin/exams/{exam_id}", status_code=302)


# ── Section CRUD ──────────────────────────────────────────────────
@router.post("/exams/{exam_id}/sections/add")
async def add_section(
    exam_id:       str,
    request:       Request,
    title:         str   = Form(...),
    question_type: str   = Form("MCQ"),
    marks_correct: float = Form(4.0),
    marks_wrong:   float = Form(-1.0),
    marks_partial: float = Form(0.0),
    order_index:   int   = Form(0),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    sec = ExamSection(
        exam_id       = exam_id,
        title         = title.strip(),
        question_type = question_type,
        marks_correct = marks_correct,
        marks_wrong   = marks_wrong,
        marks_partial = marks_partial,
        order_index   = order_index,
    )
    db.add(sec)
    db.commit()
    return RedirectResponse(url=f"/admin/exams/{exam_id}", status_code=302)


# ── Question CRUD ─────────────────────────────────────────────────
@router.post("/sections/{section_id}/questions/add")
async def add_question(
    section_id:     str,
    request:        Request,
    content_json:   str  = Form(...),   # JSON array of content blocks
    answer_json:    str  = Form(...),   # JSON correct answer
    solution_json:  str  = Form("[]"),
    difficulty:     str  = Form("Medium"),
    tags_json:      str  = Form("[]"),
    order_index:    int  = Form(0),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    try:
        content  = json.loads(content_json)
        answer   = json.loads(answer_json)
        solution = json.loads(solution_json)
        tags     = json.loads(tags_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid JSON: {e}")

    sec = db.query(ExamSection).filter(ExamSection.id == section_id).first()
    if not sec: raise HTTPException(404, "Section not found")

    q = Question(
        section_id     = section_id,
        order_index    = order_index,
        content        = content,
        correct_answer = answer,
        solution       = solution,
        difficulty     = difficulty if difficulty in ("Easy","Medium","Hard") else "Medium",
        topic_tags     = tags,
    )
    db.add(q)
    db.flush()

    # Options (MCQ/MULTI/MATCH come with options in content_json metadata)
    options_json = request.query_params.get("options", "[]")
    try:
        options = json.loads(options_json)
    except Exception:
        options = []
    for opt in options:
        o = QuestionOption(
            question_id  = q.id,
            option_label = opt.get("label","A"),
            content      = opt.get("content", []),
            is_correct   = opt.get("is_correct", False),
        )
        db.add(o)

    db.commit()
    return JSONResponse({"question_id": q.id})


@router.post("/questions/{question_id}/update")
async def update_question(
    question_id:  str,
    request:      Request,
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    body = await request.json()
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q: raise HTTPException(404)
    if "content"        in body: q.content        = body["content"]
    if "correct_answer" in body: q.correct_answer  = body["correct_answer"]
    if "solution"       in body: q.solution        = body["solution"]
    if "difficulty"     in body: q.difficulty      = body["difficulty"]
    if "topic_tags"     in body: q.topic_tags      = body["topic_tags"]
    q.updated_at = datetime.utcnow()
    db.commit()
    return JSONResponse({"updated": True})


# ── Chapter / Syllabus ────────────────────────────────────────────
@router.post("/chapters/add")
async def add_chapter(
    request:     Request,
    name:        str = Form(...),
    subject:     str = Form(...),
    stream:      str = Form("BOTH"),
    order_index: int = Form(0),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    ch = Chapter(name=name.strip(), subject=subject.strip(),
                 stream=stream, order_index=order_index)
    db.add(ch)
    db.commit()
    return RedirectResponse(url="/admin", status_code=302)


# ── Announcements ─────────────────────────────────────────────────
@router.post("/announcements/add")
async def add_announcement(
    request:    Request,
    title:      str  = Form(...),
    body:       str  = Form(...),
    ann_type:   str  = Form("GENERAL"),
    is_pinned:  bool = Form(False),
    related_id: str  = Form(""),
    expire_at:  str  = Form(""),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    ann = Announcement(
        title      = title.strip(),
        body       = body.strip(),
        ann_type   = ann_type,
        is_pinned  = is_pinned,
        related_id = related_id.strip() or None,
        expire_at  = datetime.fromisoformat(expire_at) if expire_at else None,
    )
    db.add(ann)
    db.commit()
    return RedirectResponse(url="/admin", status_code=302)


# ── Users management ──────────────────────────────────────────────
@router.get("/users", response_class=HTMLResponse)
async def admin_users(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    users = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return templates.TemplateResponse("admin_panel.html", {
        "request": request, "users": users, "view": "users", "page": "admin",
    })

@router.post("/users/{user_id}/set-premium")
async def set_premium(
    user_id: str,
    request: Request,
    expiry:  str = Form(...),
    db: Session = Depends(get_db),
):
    require_admin(request, db)
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.is_premium     = True
        user.premium_expiry = datetime.fromisoformat(expiry)
        db.commit()
    return RedirectResponse(url="/admin/users", status_code=302)
