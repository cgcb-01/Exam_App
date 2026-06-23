"""Unified exam-attempt engine."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.db import (
    get_db, User, Attempt, AttemptAnswer, Question,
    Shift, Dpp, Module, MockTest, AttemptStatus, AnswerStatus
)
from backend import schemas
from backend.auth import get_current_user, user_has_active_premium

router = APIRouter(prefix="/api/attempts", tags=["attempts"])


def _utc_iso(dt: datetime) -> str:
    """Return ISO string with Z suffix so JS parses as UTC."""
    if dt is None:
        return None
    return dt.isoformat() + 'Z'


def _resolve(payload: schemas.AttemptStart, db: Session):
    if payload.shift_id:
        obj = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if not obj: raise HTTPException(404, "Shift not found.")
        qs = db.query(Question).filter(Question.shift_id == obj.id).order_by(Question.question_number).all()
        return qs, 180, False
    if payload.dpp_id:
        obj = db.query(Dpp).filter(Dpp.id == payload.dpp_id).first()
        if not obj: raise HTTPException(404, "DPP not found.")
        qs = db.query(Question).filter(Question.dpp_id == obj.id).order_by(Question.question_number).all()
        return qs, obj.duration_minutes, True
    if payload.module_id:
        obj = db.query(Module).filter(Module.id == payload.module_id).first()
        if not obj: raise HTTPException(404, "Module not found.")
        qs = db.query(Question).filter(Question.module_id == obj.id).order_by(Question.question_number).all()
        return qs, obj.duration_minutes, True
    if payload.mock_test_id:
        obj = db.query(MockTest).filter(MockTest.id == payload.mock_test_id).first()
        if not obj: raise HTTPException(404, "Mock test not found.")
        qs = db.query(Question).filter(Question.mock_test_id == obj.id).order_by(Question.question_number).all()
        return qs, obj.duration_minutes, True
    raise HTTPException(400, "One of shift_id, dpp_id, module_id, mock_test_id required.")


def _grade(attempt: Attempt, db: Session) -> schemas.AttemptResult:
    correct = incorrect = unattempted = 0
    score = max_score = 0.0
    breakdown = {}
    for ans in attempt.answers:
        q = db.query(Question).filter(Question.id == ans.question_id).first()
        if not q: continue
        max_score += q.marks_correct
        s = q.subject.value
        breakdown.setdefault(s, {"correct":0,"incorrect":0,"unattempted":0,"score":0.0,"max_score":0.0})
        breakdown[s]["max_score"] += q.marks_correct
        has_ans = ans.selected_answer not in (None, "")
        if not has_ans:
            unattempted += 1; breakdown[s]["unattempted"] += 1
            ans.is_correct = None; continue
        ok = _match(q.correct_answer, ans.selected_answer, q.question_type.value)
        ans.is_correct = ok
        if ok:
            correct += 1; score += q.marks_correct
            breakdown[s]["correct"] += 1; breakdown[s]["score"] += q.marks_correct
        else:
            incorrect += 1; score += q.marks_incorrect
            breakdown[s]["incorrect"] += 1; breakdown[s]["score"] += q.marks_incorrect
    attempt.correct_count = correct; attempt.incorrect_count = incorrect
    attempt.attempted_count = correct + incorrect; attempt.score = score
    elapsed = 0
    if attempt.submitted_at and attempt.started_at:
        elapsed = int((attempt.submitted_at - attempt.started_at).total_seconds())
    pct = (score / max_score * 100) if max_score > 0 else 0.0
    return schemas.AttemptResult(
        attempt_id=attempt.id, total_questions=attempt.total_questions,
        attempted_count=attempt.attempted_count, correct_count=correct,
        incorrect_count=incorrect, unattempted_count=unattempted,
        score=score, max_score=max_score, time_taken_seconds=elapsed,
        subject_breakdown=breakdown, percentage=round(pct, 2),
    )


def _match(correct: str, selected: str, qtype: str) -> bool:
    if qtype == "MCQ_MULTIPLE":
        return set(x.strip().upper() for x in correct.split(",")) == \
               set(x.strip().upper() for x in selected.split(","))
    if qtype == "NUMERICAL":
        try: return abs(float(correct) - float(selected)) < 1e-4
        except: return correct.strip() == selected.strip()
    return correct.strip().upper() == selected.strip().upper()


def _attempt_response(attempt: Attempt, questions: list, db: Session) -> dict:
    """Build response dict with UTC-marked timestamps to fix JS timezone bug."""
    return {
        "id": attempt.id,
        "duration_minutes_allotted": attempt.duration_minutes_allotted,
        "started_at": _utc_iso(attempt.started_at),
        "status": attempt.status.value,
        "total_questions": attempt.total_questions,
        "camera_session_id": attempt.camera_session_id,
        "questions": [
            {
                "id": q.id,
                "question_number": q.question_number,
                "subject": q.subject.value,
                "question_type": q.question_type.value,
                "question_format": q.question_format.value,
                "question_text": q.question_text,
                "question_image_path": q.question_image_path,
                "question_pdf_path": q.question_pdf_path,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "options_image_path": q.options_image_path,
                "marks_correct": q.marks_correct,
                "marks_incorrect": q.marks_incorrect,
            }
            for q in questions
        ],
        "answers": [
            {
                "id": a.id,
                "question_id": a.question_id,
                "selected_answer": a.selected_answer,
                "status": a.status.value,
                "time_spent_seconds": a.time_spent_seconds,
            }
            for a in attempt.answers
        ],
    }


@router.post("/start")
def start_attempt(
    payload: schemas.AttemptStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    questions, duration, needs_premium = _resolve(payload, db)
    if needs_premium and not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium subscription required.")
    if not questions:
        raise HTTPException(400, "No questions in this test yet.")

    attempt = Attempt(
        user_id=current_user.id,
        shift_id=payload.shift_id, dpp_id=payload.dpp_id,
        module_id=payload.module_id, mock_test_id=payload.mock_test_id,
        is_offline_attempt=payload.is_offline_attempt,
        duration_minutes_allotted=duration,
        total_questions=len(questions),
        status=AttemptStatus.IN_PROGRESS,
        camera_session_id=payload.camera_session_id,
    )
    db.add(attempt); db.flush()
    for q in questions:
        db.add(AttemptAnswer(attempt_id=attempt.id, question_id=q.id,
                             status=AnswerStatus.NOT_VISITED))
    db.commit(); db.refresh(attempt)
    return _attempt_response(attempt, questions, db)


@router.get("/{attempt_id}")
def get_attempt(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt: raise HTTPException(404, "Attempt not found.")
    qids = [a.question_id for a in attempt.answers]
    questions = db.query(Question).filter(Question.id.in_(qids)).order_by(Question.question_number).all()
    return _attempt_response(attempt, questions, db)


@router.patch("/{attempt_id}/answer")
def upsert_answer(
    attempt_id: int,
    payload: schemas.AnswerSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt: raise HTTPException(404, "Attempt not found.")
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(400, "Already submitted.")
    ans = db.query(AttemptAnswer).filter(
        AttemptAnswer.attempt_id == attempt_id,
        AttemptAnswer.question_id == payload.question_id).first()
    if not ans: raise HTTPException(404, "Question not in this attempt.")
    ans.selected_answer = payload.selected_answer
    ans.status = payload.status
    ans.time_spent_seconds += payload.time_spent_seconds
    db.commit()
    return {"ok": True}


@router.post("/{attempt_id}/submit", response_model=schemas.AttemptResult)
def submit_attempt(
    attempt_id: int,
    payload: schemas.AttemptSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt: raise HTTPException(404, "Attempt not found.")
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(400, "Already submitted.")
    attempt.submitted_at = datetime.utcnow()
    attempt.status = AttemptStatus.AUTO_SUBMITTED if payload.auto_submitted else AttemptStatus.SUBMITTED
    result = _grade(attempt, db)
    db.commit()
    if not attempt.is_offline_attempt:
        try:
            from backend.routers.leaderboard_router import update_leaderboard_after_attempt
            update_leaderboard_after_attempt(attempt, result, db)
        except Exception:
            pass
    return result


@router.get("/{attempt_id}/result", response_model=schemas.AttemptResult)
def get_result(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt: raise HTTPException(404)
    if attempt.status == AttemptStatus.IN_PROGRESS: raise HTTPException(400, "Not submitted yet.")
    return _grade(attempt, db)


@router.get("/{attempt_id}/solutions")
def get_solutions(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(
        Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt: raise HTTPException(404)
    if attempt.status == AttemptStatus.IN_PROGRESS: raise HTTPException(400, "Submit first.")
    qids = [a.question_id for a in attempt.answers]
    questions = db.query(Question).filter(Question.id.in_(qids)).order_by(Question.question_number).all()
    return [
        {
            "id": q.id, "question_number": q.question_number,
            "subject": q.subject.value, "question_type": q.question_type.value,
            "question_format": q.question_format.value,
            "question_text": q.question_text,
            "question_image_path": q.question_image_path,
            "question_pdf_path": q.question_pdf_path,
            "option_a": q.option_a, "option_b": q.option_b,
            "option_c": q.option_c, "option_d": q.option_d,
            "options_image_path": q.options_image_path,
            "marks_correct": q.marks_correct, "marks_incorrect": q.marks_incorrect,
            "correct_answer": q.correct_answer,
            "solution_format": q.solution_format.value,
            "solution_text": q.solution_text,
            "solution_image_path": q.solution_image_path,
            "solution_pdf_path": q.solution_pdf_path,
        }
        for q in questions
    ]


@router.post("/sync-offline", response_model=schemas.AttemptResult)
def sync_offline(
    payload: schemas.OfflineAttemptSync,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start_p = schemas.AttemptStart(
        shift_id=payload.shift_id, dpp_id=payload.dpp_id,
        module_id=payload.module_id, mock_test_id=payload.mock_test_id,
        is_offline_attempt=True,
    )
    questions, duration, needs_premium = _resolve(start_p, db)
    if needs_premium and not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    attempt = Attempt(
        user_id=current_user.id,
        shift_id=payload.shift_id, dpp_id=payload.dpp_id,
        module_id=payload.module_id, mock_test_id=payload.mock_test_id,
        is_offline_attempt=True,
        duration_minutes_allotted=payload.duration_minutes_allotted,
        started_at=payload.started_at, submitted_at=payload.submitted_at,
        total_questions=len(questions), status=AttemptStatus.SUBMITTED,
    )
    db.add(attempt); db.flush()
    ans_map = {a.question_id: a for a in payload.answers}
    for q in questions:
        a = ans_map.get(q.id)
        db.add(AttemptAnswer(
            attempt_id=attempt.id, question_id=q.id,
            selected_answer=a.selected_answer if a else None,
            status=a.status if a else AnswerStatus.NOT_ANSWERED,
            time_spent_seconds=a.time_spent_seconds if a else 0,
        ))
    db.flush(); db.refresh(attempt)
    result = _grade(attempt, db)
    db.commit()
    return result
