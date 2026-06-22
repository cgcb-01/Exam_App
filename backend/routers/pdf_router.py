"""PDF download endpoints."""
import re, os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.models.db import get_db, Shift, Dpp, Module, MockTest, Question, Year, Exam
from backend.pdf_generator import generate_question_paper, generate_answer_key
from backend.auth import get_current_user, user_has_active_premium, User

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

def _safe_filename(name: str) -> str:
    """Convert to ASCII-safe filename."""
    name = name.replace('–', '-').replace('—', '-').replace('\u2013', '-').replace('\u2014', '-')
    name = re.sub(r'[^\w\s\-.]', '', name)
    name = re.sub(r'[\s]+', '_', name.strip())
    return name[:120]

def _shift_info(shift_id: int, db: Session):
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(404, "Shift not found.")
    year = db.query(Year).filter(Year.id == shift.year_id).first()
    exam = db.query(Exam).filter(Exam.id == year.exam_id).first()
    questions = db.query(Question).filter(Question.shift_id == shift_id).order_by(Question.question_number).all()
    return questions, exam.display_name, f"{year.year} {shift.label}"

def _pdf_response(content: bytes, filename: str, disposition: str = "attachment") -> Response:
    safe = _safe_filename(filename)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{safe}.pdf"'}
    )

@router.get("/shift/{shift_id}/paper")
def shift_paper(shift_id: int, include_omr: bool = Query(False),
                db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    questions, exam_name, shift_label = _shift_info(shift_id, db)
    if not questions:
        raise HTTPException(404, "No questions in this shift yet.")
    pdf = generate_question_paper(questions, exam_name, shift_label, include_omr=include_omr)
    return _pdf_response(pdf, f"{exam_name}_{shift_label}_Paper")

@router.get("/shift/{shift_id}/solutions")
def shift_solutions(shift_id: int, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    questions, exam_name, shift_label = _shift_info(shift_id, db)
    if not questions:
        raise HTTPException(404, "No questions in this shift yet.")
    pdf = generate_answer_key(questions, exam_name, shift_label)
    return _pdf_response(pdf, f"{exam_name}_{shift_label}_Solutions")

@router.get("/shift/{shift_id}/omr")
def shift_omr(shift_id: int, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    questions, exam_name, shift_label = _shift_info(shift_id, db)
    pdf = generate_question_paper(questions, exam_name, shift_label, include_omr=True)
    return _pdf_response(pdf, f"{exam_name}_{shift_label}_OMR")

@router.get("/dpp/{dpp_id}/paper")
def dpp_paper(dpp_id: int, include_omr: bool = Query(False),
              db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    dpp = db.query(Dpp).filter(Dpp.id == dpp_id).first()
    if not dpp:
        raise HTTPException(404, "DPP not found.")
    questions = db.query(Question).filter(Question.dpp_id == dpp_id).order_by(Question.question_number).all()
    if not questions:
        raise HTTPException(404, "No questions in this DPP yet.")
    pdf = generate_question_paper(questions, "DPP", dpp.title, include_omr=include_omr)
    return _pdf_response(pdf, f"DPP_{dpp.title}")

@router.get("/dpp/{dpp_id}/solutions")
def dpp_solutions(dpp_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    dpp = db.query(Dpp).filter(Dpp.id == dpp_id).first()
    if not dpp:
        raise HTTPException(404, "DPP not found.")
    questions = db.query(Question).filter(Question.dpp_id == dpp_id).order_by(Question.question_number).all()
    pdf = generate_answer_key(questions, "DPP", dpp.title)
    return _pdf_response(pdf, f"DPP_{dpp.title}_Solutions")

@router.get("/module/{module_id}/paper")
def module_paper(module_id: int, include_omr: bool = Query(False),
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(404, "Module not found.")
    questions = db.query(Question).filter(Question.module_id == module_id).order_by(Question.question_number).all()
    if not questions:
        raise HTTPException(404, "No questions in this module yet.")
    pdf = generate_question_paper(questions, "Chapterwise Test", module.name, include_omr=include_omr)
    return _pdf_response(pdf, f"Module_{module.name}")

@router.get("/mock/{mock_id}/paper")
def mock_paper(mock_id: int, include_omr: bool = Query(False),
               db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    mock = db.query(MockTest).filter(MockTest.id == mock_id).first()
    if not mock:
        raise HTTPException(404, "Mock test not found.")
    questions = db.query(Question).filter(Question.mock_test_id == mock_id).order_by(Question.question_number).all()
    if not questions:
        raise HTTPException(404, "No questions in this mock test yet.")
    pdf = generate_question_paper(questions, "Full Syllabus Mock Test", mock.title, include_omr=include_omr)
    return _pdf_response(pdf, f"Mock_{mock.title}")

@router.get("/mock/{mock_id}/solutions")
def mock_solutions(mock_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    mock = db.query(MockTest).filter(MockTest.id == mock_id).first()
    if not mock:
        raise HTTPException(404)
    questions = db.query(Question).filter(Question.mock_test_id == mock_id).order_by(Question.question_number).all()
    pdf = generate_answer_key(questions, "Full Syllabus Mock Test", mock.title)
    return _pdf_response(pdf, f"Mock_{mock.title}_Solutions")
