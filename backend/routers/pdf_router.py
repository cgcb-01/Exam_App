"""PDF download endpoints for question papers, OMR sheets, and solution PDFs."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.models.db import get_db, Shift, Dpp, Module, MockTest, Question, Year, Exam
from backend.pdf_generator import generate_question_paper, generate_answer_key
from backend.auth import get_current_user, user_has_active_premium, User

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


def _get_shift_info(shift_id: int, db: Session):
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift: raise HTTPException(404, "Shift not found.")
    year  = db.query(Year).filter(Year.id == shift.year_id).first()
    exam  = db.query(Exam).filter(Exam.id == year.exam_id).first()
    questions = db.query(Question).filter(Question.shift_id == shift_id).order_by(Question.question_number).all()
    return questions, exam.display_name, f"{year.year} – {shift.label}"


@router.get("/shift/{shift_id}/paper")
def download_shift_paper(
    shift_id: int,
    include_omr: bool = Query(False, description="Attach OMR sheet at the end"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    questions, exam_name, shift_label = _get_shift_info(shift_id, db)
    pdf = generate_question_paper(questions, exam_name, shift_label, include_omr=include_omr)
    filename = f"{'_'.join(exam_name.split())}_{shift_label.replace(' ','_')}_paper.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/shift/{shift_id}/solutions")
def download_shift_solutions(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    questions, exam_name, shift_label = _get_shift_info(shift_id, db)
    pdf = generate_answer_key(questions, exam_name, shift_label)
    filename = f"{'_'.join(exam_name.split())}_{shift_label.replace(' ','_')}_solutions.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/shift/{shift_id}/omr")
def download_omr_only(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a blank OMR sheet only (useful for offline practice)."""
    questions, exam_name, shift_label = _get_shift_info(shift_id, db)
    pdf = generate_question_paper(questions, exam_name, shift_label, include_omr=True)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="OMR_{shift_label.replace(" ","_")}.pdf"'})


@router.get("/dpp/{dpp_id}/paper")
def download_dpp_paper(
    dpp_id: int,
    include_omr: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    dpp = db.query(Dpp).filter(Dpp.id == dpp_id).first()
    if not dpp: raise HTTPException(404, "DPP not found.")
    questions = db.query(Question).filter(Question.dpp_id == dpp_id).order_by(Question.question_number).all()
    pdf = generate_question_paper(questions, "Premium DPP", dpp.title, include_omr=include_omr)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="DPP_{dpp_id}.pdf"'})


@router.get("/dpp/{dpp_id}/solutions")
def download_dpp_solutions(
    dpp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    dpp = db.query(Dpp).filter(Dpp.id == dpp_id).first()
    if not dpp: raise HTTPException(404, "DPP not found.")
    questions = db.query(Question).filter(Question.dpp_id == dpp_id).order_by(Question.question_number).all()
    pdf = generate_answer_key(questions, "Premium DPP", dpp.title)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="DPP_{dpp_id}_solutions.pdf"'})


@router.get("/module/{module_id}/paper")
def download_module_paper(
    module_id: int,
    include_omr: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module: raise HTTPException(404, "Module not found.")
    questions = db.query(Question).filter(Question.module_id == module_id).order_by(Question.question_number).all()
    pdf = generate_question_paper(questions, "Chapterwise Test", module.name, include_omr=include_omr)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="Module_{module_id}.pdf"'})


@router.get("/mock/{mock_id}/paper")
def download_mock_paper(
    mock_id: int,
    include_omr: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin and not user_has_active_premium(current_user, db):
        raise HTTPException(402, "Premium required.")
    mock = db.query(MockTest).filter(MockTest.id == mock_id).first()
    if not mock: raise HTTPException(404, "Mock test not found.")
    questions = db.query(Question).filter(Question.mock_test_id == mock_id).order_by(Question.question_number).all()
    pdf = generate_question_paper(questions, "Full Syllabus Mock Test", mock.title, include_omr=include_omr)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="Mock_{mock_id}.pdf"'})
