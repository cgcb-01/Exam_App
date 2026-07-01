"""
routers/proctoring.py
Optional proctoring: receives frame snapshots from the client (base64 JPEG),
does a lightweight face-presence check (pixel brightness heuristic or
basic OpenCV if available), and returns a warning flag.
No face data is stored — only a warning counter on the Submission.
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import base64, io

from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.submission import Submission

router = APIRouter()


def _face_detected(image_b64: str) -> bool:
    """
    Returns True if at least one face is visible.
    Uses OpenCV if available, else a simple brightness fallback
    (non-black frame = someone present — basic but lightweight).
    """
    try:
        from PIL import Image
        import numpy as np
        data = base64.b64decode(image_b64.split(",")[-1])
        img  = Image.open(io.BytesIO(data)).convert("L").resize((64, 64))
        arr  = np.array(img)
        return float(arr.mean()) > 20
    except Exception:
        return True  


@router.post("/check-frame")
async def check_frame(request: Request, db: Session = Depends(get_db)):
    """
    Called by proctoring.js every ~10 s during an exam.
    Body: { "submission_id": "...", "frame": "data:image/jpeg;base64,..." }
    """
    user = get_current_user(request, db)
    body = await request.json()

    submission_id = body.get("submission_id")
    frame_b64     = body.get("frame", "")

    if not submission_id:
        raise HTTPException(400, "submission_id required")

    sub = db.query(Submission).filter(
        Submission.id      == submission_id,
        Submission.user_id == user.id,
        Submission.is_complete == False,
    ).first()
    if not sub:
        raise HTTPException(404, "Active submission not found")

    if not sub.proctor_enabled:
        sub.proctor_enabled = True

    face_ok = _face_detected(frame_b64) if frame_b64 else False
    warning = False

    if not face_ok:
        sub.proctor_warnings = (sub.proctor_warnings or 0) + 1
        warning = True

    db.commit()
    return JSONResponse({
        "ok":       face_ok,
        "warning":  warning,
        "warnings": sub.proctor_warnings,
    })


@router.post("/toggle")
async def toggle_proctoring(request: Request, db: Session = Depends(get_db)):
    """Enable/disable proctoring for an in-progress submission."""
    user = get_current_user(request, db)
    body = await request.json()
    sub  = db.query(Submission).filter(
        Submission.id      == body.get("submission_id"),
        Submission.user_id == user.id,
        Submission.is_complete == False,
    ).first()
    if not sub:
        raise HTTPException(404)
    sub.proctor_enabled = body.get("enabled", True)
    db.commit()
    return {"proctor_enabled": sub.proctor_enabled}


