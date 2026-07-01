"""
routers/exams.py
Generic exam engine: start, fetch question, save answer, submit.
Handles JEE Mains/Adv (palette) and NEET (OMR) modes.
"""
from fastapi import APIRouter, Request, Depends, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import datetime
import json

from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.exam import Exam, Question
from app.models.submission import Submission, AnswerLog
from app.models.user import UserProfile
from app.services.rating_engine import compute_sheet_delta, apply_rating_update

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


def _check_access(exam: Exam, user, now: datetime):
    """Raise 403/410 if user cannot access this exam."""
    if not exam or not exam.is_published:
        raise HTTPException(404, "Exam not found")
    if exam.is_premium and not user.is_premium:
        raise HTTPException(403, "Premium required")
    # Class filter
    if exam.for_class != "ALL" and user.profile and user.profile.student_class != exam.for_class:
        raise HTTPException(403, "This paper is not for your class.")


# ── GET /exams/{exam_id} — exam landing / instructions ───────────
@router.get("/{exam_id}", response_class=HTMLResponse)
async def exam_landing(exam_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    now  = datetime.utcnow()
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    _check_access(exam, user, now)

    # Check existing in-progress submission
    existing = db.query(Submission).filter(
        Submission.user_id == user.id,
        Submission.exam_id == exam_id,
        Submission.is_complete == False,
    ).first()

    template = ("exam_attempt_neet_omr.html"
                if exam.paper_style == "NEET"
                else "exam_attempt_jee.html")

    return templates.TemplateResponse(template, {
        "request":    request,
        "exam":       exam,
        "submission": existing,
        "page":       "exam",
        "now":        now,
    })


# ── POST /exams/{exam_id}/start ───────────────────────────────────
@router.post("/{exam_id}/start", response_class=JSONResponse)
async def start_exam(exam_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    now  = datetime.utcnow()
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    _check_access(exam, user, now)

    # Contest time window
    if exam.exam_type in ("PAIC","BAIC"):
        if exam.start_time and now < exam.start_time:
            raise HTTPException(403, "Contest has not started yet.")
        if exam.end_time and now > exam.end_time:
            raise HTTPException(410, "Contest has ended.")

    # Max attempt check for non-DPP
    attempts = db.query(Submission).filter(
        Submission.user_id == user.id,
        Submission.exam_id == exam_id,
    ).count()
    if exam.exam_type not in ("DPP","PERSONALISED") and attempts >= 1:
        # For DPP: unlimited; others: 1 attempt
        existing = db.query(Submission).filter(
            Submission.user_id == user.id,
            Submission.exam_id == exam_id,
            Submission.is_complete == True,
        ).first()
        if existing:
            raise HTTPException(409, "Already submitted.")

    sub = Submission(
        user_id    = user.id,
        exam_id    = exam_id,
        attempt_no = attempts + 1,
        started_at = now,
    )
    db.add(sub)
    db.commit()

    # Return all questions (content blocks + options)
    sections = []
    for sec in exam.sections:
        questions = []
        for q in sec.questions:
            questions.append({
                "id":      q.id,
                "content": q.content,
                "options": [{"label": o.option_label, "content": o.content}
                            for o in q.options],
                "type":    sec.question_type,
            })
        sections.append({
            "id":    sec.id,
            "title": sec.title,
            "type":  sec.question_type,
            "marks": {"correct": sec.marks_correct, "wrong": sec.marks_wrong,
                      "partial": sec.marks_partial},
            "questions": questions,
        })

    return {
        "submission_id":   sub.id,
        "exam_id":         exam_id,
        "duration_minutes": exam.duration_minutes,
        "sections":        sections,
        "paper_style":     exam.paper_style,
        "instructions":    exam.instructions,
    }


# ── POST /exams/{exam_id}/save-answer ────────────────────────────
@router.post("/{exam_id}/save-answer", response_class=JSONResponse)
async def save_answer(
    exam_id:       str,
    request:       Request,
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    body = await request.json()

    submission_id  = body.get("submission_id")
    question_id    = body.get("question_id")
    user_answer    = body.get("answer")          # list or string
    status         = body.get("status", "unattempted")
    time_spent     = body.get("time_spent", 0)

    sub = db.query(Submission).filter(
        Submission.id      == submission_id,
        Submission.user_id == user.id,
        Submission.is_complete == False,
    ).first()
    if not sub:
        raise HTTPException(404, "Submission not found or already complete.")

    existing = db.query(AnswerLog).filter(
        AnswerLog.submission_id == submission_id,
        AnswerLog.question_id   == question_id,
    ).first()

    if existing:
        existing.user_answer       = user_answer
        existing.status            = status
        existing.time_spent_seconds = time_spent
    else:
        log = AnswerLog(
            submission_id       = submission_id,
            question_id         = question_id,
            user_answer         = user_answer,
            status              = status,
            time_spent_seconds  = time_spent,
        )
        db.add(log)
    db.commit()
    return {"saved": True}


# ── POST /exams/{exam_id}/submit ──────────────────────────────────
@router.post("/{exam_id}/submit", response_class=JSONResponse)
async def submit_exam(exam_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    body = await request.json()
    submission_id = body.get("submission_id")
    omr_snapshot  = body.get("omr_snapshot")  # NEET only

    sub = db.query(Submission).filter(
        Submission.id      == submission_id,
        Submission.user_id == user.id,
        Submission.is_complete == False,
    ).first()
    if not sub:
        raise HTTPException(404, "Submission not found.")

    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    now  = datetime.utcnow()

    # ── Evaluate answers ─────────────────────────────────────────
    total_score   = 0.0
    max_score     = 0.0
    correct_count = wrong_count = unattempted = 0

    for section in exam.sections:
        for question in section.questions:
            max_score += section.marks_correct
            log = db.query(AnswerLog).filter(
                AnswerLog.submission_id == submission_id,
                AnswerLog.question_id   == question.id,
            ).first()

            if not log or log.status == "unattempted":
                unattempted += 1
                continue

            correct = question.correct_answer
            given   = log.user_answer

            if section.question_type == "MCQ":
                if given and isinstance(given, list) and given == correct:
                    log.marks_awarded = section.marks_correct
                    log.status = "correct"
                    correct_count += 1
                else:
                    log.marks_awarded = section.marks_wrong
                    log.status = "wrong"
                    wrong_count += 1

            elif section.question_type == "MULTI":
                if not given:
                    unattempted += 1
                    continue
                given_set   = set(given) if isinstance(given, list) else {given}
                correct_set = set(correct)
                if given_set == correct_set:
                    log.marks_awarded = section.marks_correct
                    log.status = "correct"
                    correct_count += 1
                elif given_set.issubset(correct_set):
                    log.marks_awarded = section.marks_partial * len(given_set)
                    log.status = "partial"
                else:
                    log.marks_awarded = section.marks_wrong
                    log.status = "wrong"
                    wrong_count += 1

            elif section.question_type in ("NUMERICAL","INTEGER"):
                try:
                    user_val  = float(str(given).strip())
                    if question.numerical_range:
                        lo, hi = question.numerical_range["min"], question.numerical_range["max"]
                        hit = lo <= user_val <= hi
                    else:
                        hit = abs(user_val - float(str(correct[0] if isinstance(correct,list) else correct))) < 1e-4
                    if hit:
                        log.marks_awarded = section.marks_correct
                        log.status = "correct"
                        correct_count += 1
                    else:
                        log.marks_awarded = 0
                        log.status = "wrong"
                        wrong_count += 1
                except Exception:
                    log.status = "wrong"
                    wrong_count += 1

            total_score += log.marks_awarded

    accuracy = (correct_count / max(1, correct_count + wrong_count)) * 100

    sub.submitted_at       = now
    sub.time_taken_seconds = int((now - sub.started_at).total_seconds())
    sub.is_complete        = True
    sub.total_score        = total_score
    sub.max_possible_score = max_score
    sub.correct_count      = correct_count
    sub.wrong_count        = wrong_count
    sub.unattempted_count  = unattempted
    sub.accuracy           = accuracy
    if omr_snapshot:
        sub.omr_snapshot = omr_snapshot

    # ── Update profile stats ─────────────────────────────────────
    profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    if profile:
        profile.tests_given += 1
        profile.sheets_solved += 1
        # Recalculate rolling accuracy
        total_tests = profile.tests_given
        profile.accuracy = (
            (profile.accuracy * (total_tests - 1) + accuracy) / total_tests
        )
        # Sheet-based rating delta
        delta = compute_sheet_delta(
            accuracy, profile.accuracy, 1, profile.current_streak
        )
        apply_rating_update(db, user.id, delta, f"EXAM:{exam.title}", "sheet")

    db.commit()
    return {
        "score":          total_score,
        "max_score":      max_score,
        "correct":        correct_count,
        "wrong":          wrong_count,
        "unattempted":    unattempted,
        "accuracy":       round(accuracy, 1),
        "submission_id":  sub.id,
    }


# ── POST /exams/answer-log/{log_id}/mark-review ──────────────────
@router.post("/answer-log/{log_id}/mark-review", response_class=JSONResponse)
async def mark_for_review(log_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    log = db.query(AnswerLog).filter(AnswerLog.id == log_id).first()
    if log:
        log.marked_to_review = True
        db.commit()
    return {"marked": True}