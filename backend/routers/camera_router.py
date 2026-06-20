"""webcam proctoring — snapshots stored server-side."""
import os, base64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.models.db import get_db, User, CameraSession
from backend import schemas
from backend.auth import get_current_user

router = APIRouter(prefix="/api/camera", tags=["camera"])

SNAPSHOT_BASE = "uploads/snapshots"
os.makedirs(SNAPSHOT_BASE, exist_ok=True)

@router.post("/start", response_model=schemas.CameraSessionOut)
def start_session(payload: schemas.CameraSessionStart, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    snap_dir = os.path.join(SNAPSHOT_BASE, f"user_{current_user.id}_{int(datetime.utcnow().timestamp())}")
    os.makedirs(snap_dir, exist_ok=True)
    session = CameraSession(user_id=current_user.id, snapshot_dir=snap_dir)
    db.add(session); db.commit(); db.refresh(session)
    return session

@router.post("/{session_id}/snapshot")
async def upload_snapshot(session_id: int, payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Client posts base64 JPEG snapshots every N seconds."""
    session = db.query(CameraSession).filter(CameraSession.id == session_id, CameraSession.user_id == current_user.id).first()
    if not session: raise HTTPException(404, "Session not found.")
    img_data = payload.get("image_b64", "")
    if img_data.startswith("data:image"):
        img_data = img_data.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(img_data)
        fname = os.path.join(session.snapshot_dir, f"snap_{session.snapshot_count:04d}.jpg")
        with open(fname, "wb") as f:
            f.write(img_bytes)
        session.snapshot_count += 1
        db.commit()
    except Exception as e:
        pass  # don't fail the exam on a bad snapshot
    return {"ok": True, "count": session.snapshot_count}

@router.post("/{session_id}/end")
def end_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(CameraSession).filter(CameraSession.id == session_id, CameraSession.user_id == current_user.id).first()
    if not session: raise HTTPException(404, "Session not found.")
    session.ended_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "snapshots_saved": session.snapshot_count}
