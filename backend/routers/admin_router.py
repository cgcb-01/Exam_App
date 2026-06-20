"""Admin/Owner content insertion: questions (text/image/pdf), exams, shifts, premium hierarchy."""
import os, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from backend.models.db import (
    get_db, User, Exam, Year, Shift, Question,
    PremiumExamTrack, PremiumSubject, DppSet, Dpp, TestSet, Chapter, Module, MockTest,
    NewsItem, ExamType, SubjectName, QuestionType, ContentFormat
)
from backend import schemas
from backend.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])
UPLOAD_DIR = "uploads"
os.makedirs(f"{UPLOAD_DIR}/questions", exist_ok=True)
os.makedirs(f"{UPLOAD_DIR}/pdfs", exist_ok=True)

# ── Media upload ─────────────────────────────────────────────────────────────
@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), admin: User = Depends(require_admin)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(400, "Only image files allowed.")
    fname = f"{int(__import__('time').time())}_{file.filename}"
    path = f"{UPLOAD_DIR}/questions/{fname}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": path, "url": f"/static/{path}"}

@router.post("/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), admin: User = Depends(require_admin)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files allowed.")
    fname = f"{int(__import__('time').time())}_{file.filename}"
    path = f"{UPLOAD_DIR}/pdfs/{fname}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": path, "url": f"/static/{path}"}

# ── PYQ structure management ─────────────────────────────────────────────────
@router.post("/exams", response_model=dict)
def create_exam(type: str = Form(...), display_name: str = Form(...),
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    existing = db.query(Exam).filter(Exam.type == type).first()
    if existing: raise HTTPException(400, "Exam type already exists.")
    exam = Exam(type=ExamType(type), display_name=display_name)
    db.add(exam); db.commit(); db.refresh(exam)
    return {"id": exam.id, "type": exam.type, "display_name": exam.display_name}

@router.post("/years", response_model=dict)
def create_year(exam_id: int = Form(...), year: int = Form(...),
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    yr = Year(exam_id=exam_id, year=year)
    db.add(yr); db.commit(); db.refresh(yr)
    return {"id": yr.id, "year": yr.year}

@router.post("/shifts", response_model=dict)
def create_shift(year_id: int = Form(...), label: str = Form(...),
                 exam_date: Optional[str] = Form(None),
                 admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    shift = Shift(year_id=year_id, label=label, exam_date=exam_date)
    db.add(shift); db.commit(); db.refresh(shift)
    return {"id": shift.id, "label": shift.label}

@router.post("/questions", response_model=dict)
def create_question(payload: schemas.QuestionCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    sources = [x for x in [payload.shift_id, payload.module_id, payload.dpp_id, payload.mock_test_id] if x]
    if len(sources) != 1:
        raise HTTPException(400, "Exactly one of shift_id/module_id/dpp_id/mock_test_id required.")
    q = Question(**payload.model_dump())
    db.add(q); db.commit(); db.refresh(q)
    return {"id": q.id, "question_number": q.question_number}

@router.put("/questions/{question_id}", response_model=dict)
def update_question(question_id: int, payload: schemas.QuestionCreate,
                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q: raise HTTPException(404, "Question not found.")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(q, k, v)
    db.commit()
    return {"id": q.id, "updated": True}

@router.delete("/questions/{question_id}")
def delete_question(question_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q: raise HTTPException(404, "Question not found.")
    db.delete(q); db.commit()
    return {"deleted": True}

# ── Premium structure management ─────────────────────────────────────────────
@router.post("/premium/tracks", response_model=dict)
def create_track(name: str = Form(...), display_name: str = Form(...),
                 admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    t = PremiumExamTrack(name=name.upper(), display_name=display_name)
    db.add(t); db.commit(); db.refresh(t)
    return {"id": t.id}

@router.post("/premium/subjects", response_model=dict)
def create_subject(track_id: int = Form(...), name: str = Form(...), is_active: bool = Form(True),
                   admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = PremiumSubject(track_id=track_id, name=SubjectName(name.upper()), is_active=is_active)
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id}

@router.post("/premium/dpp-sets", response_model=dict)
def create_dpp_set(subject_id: int = Form(...), name: str = Form(...), questions_per_dpp: int = Form(10),
                   admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ds = DppSet(subject_id=subject_id, name=name, questions_per_dpp=questions_per_dpp)
    db.add(ds); db.commit(); db.refresh(ds)
    return {"id": ds.id}

@router.post("/premium/dpps", response_model=dict)
def create_dpp(dpp_set_id: int = Form(...), title: str = Form(...),
               chapter_name: Optional[str] = Form(None), order_index: int = Form(1),
               duration_minutes: int = Form(30),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = Dpp(dpp_set_id=dpp_set_id, title=title, chapter_name=chapter_name,
            order_index=order_index, duration_minutes=duration_minutes)
    db.add(d); db.commit(); db.refresh(d)
    return {"id": d.id}

@router.post("/premium/test-sets", response_model=dict)
def create_test_set(subject_id: int = Form(...), name: str = Form(...),
                    admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ts = TestSet(subject_id=subject_id, name=name)
    db.add(ts); db.commit(); db.refresh(ts)
    return {"id": ts.id}

@router.post("/premium/chapters", response_model=dict)
def create_chapter(test_set_id: int = Form(...), name: str = Form(...), order_index: int = Form(1),
                   admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ch = Chapter(test_set_id=test_set_id, name=name, order_index=order_index)
    db.add(ch); db.commit(); db.refresh(ch)
    return {"id": ch.id}

@router.post("/premium/modules", response_model=dict)
def create_module(chapter_id: int = Form(...), name: str = Form(...),
                  order_index: int = Form(1), duration_minutes: int = Form(30),
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    m = Module(chapter_id=chapter_id, name=name, order_index=order_index, duration_minutes=duration_minutes)
    db.add(m); db.commit(); db.refresh(m)
    return {"id": m.id}

@router.post("/premium/mock-tests", response_model=dict)
def create_mock_test(subject_id: int = Form(...), title: str = Form(...),
                     duration_minutes: int = Form(180), order_index: int = Form(1),
                     admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    mt = MockTest(subject_id=subject_id, title=title, duration_minutes=duration_minutes, order_index=order_index)
    db.add(mt); db.commit(); db.refresh(mt)
    return {"id": mt.id}

# ── Admin stats dashboard ─────────────────────────────────────────────────────
@router.get("/stats")
def admin_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    from sqlalchemy import func
    from backend.models.db import User as UserModel, Attempt, Subscription, SubscriptionStatus
    from datetime import datetime
    return {
        "total_users": db.query(func.count(UserModel.id)).scalar(),
        "active_premium": db.query(func.count(Subscription.id)).filter(
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.current_period_end >= datetime.utcnow()).scalar(),
        "total_attempts": db.query(func.count(Attempt.id)).scalar(),
        "total_questions": db.query(func.count(Question.id)).scalar(),
    }
