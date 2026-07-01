"""
Utility callable from both the scheduler and admin endpoints.
Revokes premium access and flags downloaded content for client-side deletion.
"""
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.library import DownloadedFile


def run_cleanup(db: Session) -> dict:
    now = datetime.utcnow()
    expired = db.query(User).filter(
        User.is_premium    == True,
        User.premium_expiry < now,
        User.is_active     == True,
    ).all()

    cleaned_users  = 0
    flagged_files  = 0

    for user in expired:
        user.is_premium = False

        files = db.query(DownloadedFile).filter(
            DownloadedFile.user_id   == user.id,
            DownloadedFile.is_premium == True,
            DownloadedFile.is_deleted == False,
        ).all()

        for f in files:
            f.is_deleted = True
            flagged_files += 1

        cleaned_users += 1

    db.commit()
    return {"cleaned_users": cleaned_users, "flagged_files": flagged_files}


def check_user_premium(user_id: str, db: Session) -> bool:
    """Quick inline check, also expires on-the-fly if past date."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    if user.is_premium and user.premium_expiry and user.premium_expiry < datetime.utcnow():
        user.is_premium = False
        db.commit()
        return False
    return user.is_premium