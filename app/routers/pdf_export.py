"""routers/pdf_export.py — Triggered by admin/system to generate PDFs."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth_utils import require_admin
from app.services.pdf_builder import build_exam_pdf

router = APIRouter()


@router.get("/generate/{exam_id}")
async def generate_exam_pdf(exam_id: str, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    pdf_bytes = build_exam_pdf(exam_id, db)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="exam_{exam_id}.pdf"'})