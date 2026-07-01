"""routers/library.py — My Library: offline downloads, view/attempt."""
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import date
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.library import DownloadedFile
from app.models.misc import DailyDownloadLog
from app.models.exam import Exam
from app.services.b2_storage import get_storage
from app.config import settings

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def library_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    files = (
        db.query(DownloadedFile)
        .filter(DownloadedFile.user_id == user.id, DownloadedFile.is_deleted == False)
        .order_by(DownloadedFile.downloaded_at.desc())
        .all()
    )
    return templates.TemplateResponse("library.html", {
        "request": request,
        "files":   files,
        "page":    "library",
    })


@router.post("/download/{exam_id}")
async def download_exam(exam_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)

    # Check daily limit
    today = date.today()
    log = db.query(DailyDownloadLog).filter(
        DailyDownloadLog.user_id == user.id,
        DailyDownloadLog.log_date == today,
    ).first()
    if log and log.count >= settings.max_downloads_per_day:
        raise HTTPException(429, f"Max {settings.max_downloads_per_day} downloads per day reached.")

    exam = db.query(Exam).filter(Exam.id == exam_id, Exam.is_published == True).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    # Block downloading active AIC/PAIC/BAIC during exam window
    from datetime import datetime
    now = datetime.utcnow()
    if exam.exam_type in ("PAIC","BAIC") and exam.start_time and exam.end_time:
        if exam.start_time <= now <= exam.end_time:
            raise HTTPException(403, "Cannot download during an active contest.")

    # Premium check
    if exam.is_premium and not user.is_premium:
        raise HTTPException(403, "Premium subscription required.")

    # Record download
    dl = DownloadedFile(
        user_id    = user.id,
        exam_id    = exam_id,
        file_type  = "QUESTION_PAPER",
        is_premium = exam.is_premium,
    )
    db.add(dl)

    if not log:
        log = DailyDownloadLog(user_id=user.id, log_date=today, count=1)
        db.add(log)
    else:
        log.count += 1
    db.commit()

    # Return PDF bytes
    storage = get_storage()
    key = storage.exam_pdf_key(exam_id)
    try:
        pdf_bytes = storage.download_bytes(key)
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{exam.title}.pdf"'})
    except Exception:
        raise HTTPException(503, "File not yet available for download.")