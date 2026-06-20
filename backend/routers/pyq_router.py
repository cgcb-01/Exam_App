"""Browse the free PYQ hierarchy plus solution-only view."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.db import get_db, Exam, Year, Shift, Question
from backend import schemas

router = APIRouter(prefix="/api/pyq", tags=["pyq"])


@router.get("/exams", response_model=list[schemas.ExamOut])
def list_exams(db: Session = Depends(get_db)):
    exams = db.query(Exam).all()
    result = []
    for exam in exams:
        years_sorted = sorted(exam.years, key=lambda y: y.year, reverse=True)
        year_outs = []
        for year in years_sorted:
            shift_outs = []
            for shift in year.shifts:
                qc = db.query(func.count(Question.id)).filter(Question.shift_id == shift.id).scalar() or 0
                shift_outs.append(schemas.ShiftOut(id=shift.id, label=shift.label, exam_date=shift.exam_date, question_count=qc))
            year_outs.append(schemas.YearOut(id=year.id, year=year.year, shifts=shift_outs))
        result.append(schemas.ExamOut(id=exam.id, type=exam.type, display_name=exam.display_name, years=year_outs))
    return result


@router.get("/shifts/{shift_id}/questions", response_model=list[schemas.QuestionPublic])
def get_shift_questions(shift_id: int, db: Session = Depends(get_db)):
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift: raise HTTPException(404, "Shift not found.")
    return db.query(Question).filter(Question.shift_id == shift_id).order_by(Question.question_number).all()


@router.get("/shifts/{shift_id}/solutions", response_model=list[schemas.QuestionWithSolution])
def get_shift_solutions(shift_id: int, db: Session = Depends(get_db)):
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift: raise HTTPException(404, "Shift not found.")
    return db.query(Question).filter(Question.shift_id == shift_id).order_by(Question.question_number).all()
