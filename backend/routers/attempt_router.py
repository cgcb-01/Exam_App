"""
The unified exam-attempt engine.

This single set of endpoints powers the "exact JEE/NEET online exam" UI for
EVERY content source: PYQ shifts, premium DPPs, premium chapterwise Modules,
and premium full-syllabus Mock Tests. The frontend exam-engine screen is
identical in all cases - it just points at a different `source`.

Flow:
  POST /api/attempts/start         -> creates an Attempt + blank AttemptAnswer
                                       rows (status=NOT_VISITED) for every
                                       question, returns the full attempt
                                       payload (questions WITHOUT answers).
  PATCH /api/attempts/{id}/answer  -> upsert one answer / status (called on
                                       every option click, skip, mark-for-
                                       review, navigation - exactly like NTA's
                                       real exam interface logs each action).
  POST /api/attempts/{id}/submit   -> grades the attempt, returns the result
                                       breakdown (correct/incorrect/skipped,
                                       score, per-subject breakdown).
  GET  /api/attempts/{id}          -> resume an in-progress attempt (timer
                                       continues from started_at + duration).
  POST /api/attempts/sync-offline  -> bulk-submit an attempt that was taken
                                       fully offline on the client and is
                                       now being synced & graded.
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.db import (
    get_db, User, Attempt, AttemptAnswer, Question,
    Shift, Dpp, Module, MockTest, AttemptStatus, AnswerStatus
)
from backend import schemas
from backend.auth import get_current_user, require_premium, user_has_active_premium

router = APIRouter(prefix="/api/attempts", tags=["attempts"])


def _resolve_questions_and_duration(payload: schemas.AttemptStart, db: Session):
    """Given exactly one of shift_id/dpp_id/module_id/mock_test_id, return
    (questions, duration_minutes, requires_premium: bool)."""
    if payload.shift_id:
        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found.")
        questions = db.query(Question).filter(Question.shift_id == shift.id).order_by(Question.question_number).all()
        # Default full-paper duration heuristics; could be made configurable per shift.
        return questions, 180, False

    if payload.dpp_id:
        dpp = db.query(Dpp).filter(Dpp.id == payload.dpp_id).first()
        if not dpp:
            raise HTTPException(status_code=404, detail="DPP not found.")
        questions = db.query(Question).filter(Question.dpp_id == dpp.id).order_by(Question.question_number).all()
        return questions, dpp.duration_minutes, True

    if payload.module_id:
        module = db.query(Module).filter(Module.id == payload.module_id).first()
        if not module:
            raise HTTPException(status_code=404, detail="Module not found.")
        questions = db.query(Question).filter(Question.module_id == module.id).order_by(Question.question_number).all()
        return questions, module.duration_minutes, True

    if payload.mock_test_id:
        mock = db.query(MockTest).filter(MockTest.id == payload.mock_test_id).first()
        if not mock:
            raise HTTPException(status_code=404, detail="Mock test not found.")
        questions = db.query(Question).filter(Question.mock_test_id == mock.id).order_by(Question.question_number).all()
        return questions, mock.duration_minutes, True

    raise HTTPException(status_code=400, detail="One of shift_id, dpp_id, module_id, mock_test_id is required.")


@router.post("/start", response_model=schemas.AttemptOut)
def start_attempt(
    payload: schemas.AttemptStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    questions, duration, needs_premium = _resolve_questions_and_duration(payload, db)

    if needs_premium and not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(status_code=402, detail="Premium subscription required for this test.")

    if not questions:
        raise HTTPException(status_code=400, detail="This test has no questions yet.")

    attempt = Attempt(
        user_id=current_user.id,
        shift_id=payload.shift_id,
        dpp_id=payload.dpp_id,
        module_id=payload.module_id,
        mock_test_id=payload.mock_test_id,
        is_offline_attempt=payload.is_offline_attempt,
        duration_minutes_allotted=duration,
        total_questions=len(questions),
        status=AttemptStatus.IN_PROGRESS,
    )
    db.add(attempt)
    db.flush()

    for q in questions:
        db.add(AttemptAnswer(attempt_id=attempt.id, question_id=q.id, status=AnswerStatus.NOT_VISITED))

    db.commit()
    db.refresh(attempt)

    return schemas.AttemptOut(
        id=attempt.id,
        duration_minutes_allotted=attempt.duration_minutes_allotted,
        started_at=attempt.started_at,
        status=attempt.status,
        total_questions=attempt.total_questions,
        questions=questions,
        answers=attempt.answers,
    )


@router.get("/{attempt_id}", response_model=schemas.AttemptOut)
def get_attempt(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resume an in-progress attempt - e.g. after a page refresh. The
    frontend timer recalculates remaining time from started_at + duration,
    exactly mirroring how the real NTA exam interface survives a refresh."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")

    question_ids = [a.question_id for a in attempt.answers]
    questions = db.query(Question).filter(Question.id.in_(question_ids)).order_by(Question.question_number).all()

    return schemas.AttemptOut(
        id=attempt.id,
        duration_minutes_allotted=attempt.duration_minutes_allotted,
        started_at=attempt.started_at,
        status=attempt.status,
        total_questions=attempt.total_questions,
        questions=questions,
        answers=attempt.answers,
    )


@router.patch("/{attempt_id}/answer")
def upsert_answer(
    attempt_id: int,
    payload: schemas.AnswerSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called on every interaction: choosing an option, clearing a response,
    marking for review, or simply navigating to/from a question (which
    flips NOT_VISITED -> NOT_ANSWERED). This mirrors the real exam's
    continuous answer-state tracking."""
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This attempt has already been submitted.")

    answer = (
        db.query(AttemptAnswer)
        .filter(AttemptAnswer.attempt_id == attempt_id, AttemptAnswer.question_id == payload.question_id)
        .first()
    )
    if not answer:
        raise HTTPException(status_code=404, detail="Question does not belong to this attempt.")

    answer.selected_answer = payload.selected_answer
    answer.status = payload.status
    answer.time_spent_seconds += payload.time_spent_seconds
    db.commit()
    return {"ok": True}


def _grade_attempt(attempt: Attempt, db: Session) -> schemas.AttemptResult:
    correct = incorrect = unattempted = 0
    score = 0.0
    max_score = 0.0
    subject_breakdown: dict[str, dict] = {}

    for ans in attempt.answers:
        q = db.query(Question).filter(Question.id == ans.question_id).first()
        if not q:
            continue
        max_score += q.marks_correct
        subj = q.subject.value
        subject_breakdown.setdefault(subj, {"correct": 0, "incorrect": 0, "unattempted": 0, "score": 0.0})

        has_response = ans.selected_answer is not None and ans.selected_answer != ""
        if not has_response:
            unattempted += 1
            subject_breakdown[subj]["unattempted"] += 1
            ans.is_correct = None
            continue

        is_correct = _answers_match(q.correct_answer, ans.selected_answer, q.question_type.value)
        ans.is_correct = is_correct
        if is_correct:
            correct += 1
            score += q.marks_correct
            subject_breakdown[subj]["correct"] += 1
            subject_breakdown[subj]["score"] += q.marks_correct
        else:
            incorrect += 1
            score += q.marks_incorrect
            subject_breakdown[subj]["incorrect"] += 1
            subject_breakdown[subj]["score"] += q.marks_incorrect

    attempt.correct_count = correct
    attempt.incorrect_count = incorrect
    attempt.attempted_count = correct + incorrect
    attempt.score = score

    time_taken = int((attempt.submitted_at - attempt.started_at).total_seconds()) if attempt.submitted_at else 0

    return schemas.AttemptResult(
        attempt_id=attempt.id,
        total_questions=attempt.total_questions,
        attempted_count=attempt.attempted_count,
        correct_count=correct,
        incorrect_count=incorrect,
        unattempted_count=unattempted,
        score=score,
        max_score=max_score,
        time_taken_seconds=time_taken,
        subject_breakdown=subject_breakdown,
    )


def _answers_match(correct_answer: str, selected: str, qtype: str) -> bool:
    if qtype == "MCQ_MULTIPLE":
        correct_set = set(x.strip().upper() for x in correct_answer.split(","))
        selected_set = set(x.strip().upper() for x in selected.split(","))
        return correct_set == selected_set
    if qtype == "NUMERICAL":
        try:
            return abs(float(correct_answer) - float(selected)) < 1e-6
        except ValueError:
            return correct_answer.strip() == selected.strip()
    return correct_answer.strip().upper() == selected.strip().upper()


@router.post("/{attempt_id}/submit", response_model=schemas.AttemptResult)
def submit_attempt(
    attempt_id: int,
    payload: schemas.AttemptSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="This attempt has already been submitted.")

    attempt.submitted_at = datetime.utcnow()
    attempt.status = AttemptStatus.AUTO_SUBMITTED if payload.auto_submitted else AttemptStatus.SUBMITTED

    result = _grade_attempt(attempt, db)
    db.commit()
    return result


@router.get("/{attempt_id}/result", response_model=schemas.AttemptResult)
def get_result(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.query(Attempt).filter(Attempt.id == attempt_id, Attempt.user_id == current_user.id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Attempt has not been submitted yet.")
    return _grade_attempt(attempt, db)


@router.post("/sync-offline", response_model=schemas.AttemptResult)
def sync_offline_attempt(
    payload: schemas.OfflineAttemptSync,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The client may let the user 'give the test offline' (questions cached
    locally, answers recorded locally with its own timer). When connectivity
    returns, the whole session is posted here in one shot, graded exactly
    like a live attempt."""
    start_payload = schemas.AttemptStart(
        shift_id=payload.shift_id, dpp_id=payload.dpp_id,
        module_id=payload.module_id, mock_test_id=payload.mock_test_id,
        is_offline_attempt=True,
    )
    questions, duration, needs_premium = _resolve_questions_and_duration(start_payload, db)
    if needs_premium and not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(status_code=402, detail="Premium subscription required for this test.")

    attempt = Attempt(
        user_id=current_user.id,
        shift_id=payload.shift_id, dpp_id=payload.dpp_id,
        module_id=payload.module_id, mock_test_id=payload.mock_test_id,
        is_offline_attempt=True,
        duration_minutes_allotted=payload.duration_minutes_allotted,
        started_at=payload.started_at,
        submitted_at=payload.submitted_at,
        total_questions=len(questions),
        status=AttemptStatus.SUBMITTED,
    )
    db.add(attempt)
    db.flush()

    answers_by_qid = {a.question_id: a for a in payload.answers}
    for q in questions:
        a = answers_by_qid.get(q.id)
        db.add(AttemptAnswer(
            attempt_id=attempt.id,
            question_id=q.id,
            selected_answer=a.selected_answer if a else None,
            status=a.status if a else AnswerStatus.NOT_ANSWERED,
            time_spent_seconds=a.time_spent_seconds if a else 0,
        ))
    db.flush()
    db.refresh(attempt)

    result = _grade_attempt(attempt, db)
    db.commit()
    return result