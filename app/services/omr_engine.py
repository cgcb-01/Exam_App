"""
Evaluates a filled OMR snapshot (NEET style) against correct answers.
OMR snapshot format: {"Q1": "A", "Q2": "C", ...}  (1-indexed string keys)
Returns evaluation dict consumed by the submission router.
"""
from __future__ import annotations
from typing import Any
from sqlalchemy.orm import Session

from app.models.exam import Exam, Question


NEET_CORRECT = 4.0
NEET_WRONG   = -1.0


def evaluate_omr(
    exam_id: str,
    omr_snapshot: dict[str, str],
    db: Session,
) -> dict[str, Any]:
    """
    Returns:
    {
        "total_score": float,
        "max_score": float,
        "correct": int,
        "wrong": int,
        "unattempted": int,
        "accuracy": float,
        "per_question": [{"q_no": 1, "given": "A", "correct": "B", "status": "wrong", "marks": -1}]
    }
    """
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise ValueError(f"Exam {exam_id} not found")

    all_questions: list[Question] = []
    for sec in sorted(exam.sections, key=lambda s: s.order_index):
        for q in sorted(sec.questions, key=lambda q: q.order_index):
            all_questions.append(q)

    total_score  = 0.0
    max_score    = float(len(all_questions)) * NEET_CORRECT
    correct_cnt  = wrong_cnt = unattempted_cnt = 0
    per_question = []

    for idx, question in enumerate(all_questions, start=1):
        given_raw = omr_snapshot.get(f"Q{idx}", "").strip().upper()
        correct_raw = question.correct_answer

        if isinstance(correct_raw, list):
            correct_val = correct_raw[0].upper() if correct_raw else ""
        else:
            correct_val = str(correct_raw).strip().upper()

        if not given_raw:
            status = "unattempted"
            marks  = 0.0
            unattempted_cnt += 1
        elif given_raw == correct_val:
            status = "correct"
            marks  = NEET_CORRECT
            correct_cnt += 1
        else:
            status = "wrong"
            marks  = NEET_WRONG
            wrong_cnt += 1

        total_score += marks
        per_question.append({
            "q_no":    idx,
            "given":   given_raw or "—",
            "correct": correct_val,
            "status":  status,
            "marks":   marks,
        })

    answered = correct_cnt + wrong_cnt
    accuracy = (correct_cnt / max(1, answered)) * 100

    return {
        "total_score":  total_score,
        "max_score":    max_score,
        "correct":      correct_cnt,
        "wrong":        wrong_cnt,
        "unattempted":  unattempted_cnt,
        "accuracy":     round(accuracy, 1),
        "per_question": per_question,
    }