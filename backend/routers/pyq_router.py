"""Browse the free PYQ hierarchy: Exam -> Year -> Shift -> Questions.
Also exposes the 'view solution only' endpoint (no attempt needed)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from backend.models.db import get_db, Exam, Year, Shift, Question
from backend import schemas

router = APIRouter(prefix="/api/pyq", tags=["pyq"])


@router.get("/exams", response_model=list[schemas.ExamOut])
def list_exams(db: Session = Depends(get_db)):
    """Top level: JEE Main / JEE Advanced / NEET, each with nested years and shifts."""
    exams = db.query(Exam).options(
        joinedload(Exam.years).joinedload(Year.shifts)
    ).all()

    result = []
    for exam in exams:
        # sort years descending (most recent first) and attach live question counts
        years_sorted = sorted(exam.years, key=lambda y: y.year, reverse=True)
        year_outs = []
        for year in years_sorted:
            shift_outs = []
            for shift in year.shifts:
                qcount = db.query(func.count(Question.id)).filter(Question.shift_id == shift.id).scalar()
                shift_outs.append(schemas.ShiftOut(
                    id=shift.id, label=shift.label, exam_date=shift.exam_date,
                    question_count=qcount or 0
                ))
            year_outs.append(schemas.YearOut(id=year.id, year=year.year, shifts=shift_outs))
        result.append(schemas.ExamOut(
            id=exam.id, type=exam.type, display_name=exam.display_name, years=year_outs
        ))
    return result


@router.get("/shifts/{shift_id}/questions", response_model=list[schemas.QuestionPublic])
def get_shift_questions(shift_id: int, db: Session = Depends(get_db)):
    """Used to start an attempt - questions WITHOUT the answer/solution."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found.")
    questions = (
        db.query(Question)
        .filter(Question.shift_id == shift_id)
        .order_by(Question.question_number)
        .all()
    )
    return questions


@router.get("/shifts/{shift_id}/solutions", response_model=list[schemas.QuestionWithSolution])
def get_shift_solutions(shift_id: int, db: Session = Depends(get_db)):
    """'Only check the solution' mode - returns full answer key + explanations."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found.")
    questions = (
        db.query(Question)
        .filter(Question.shift_id == shift_id)
        .order_by(Question.question_number)
        .all()
    )
    return questions