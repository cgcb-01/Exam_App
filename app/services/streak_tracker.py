"""
services/streak_tracker.py
Updates current_streak, max_streak, max_submissions_day on the user profile.
Called after every completed submission.
"""
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.submission import Submission
from app.models.user import UserProfile


def update_streak(user_id: str, db: Session):
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        return

    today = date.today()

    # ── Max submissions in a day ──────────────────────────────────
    daily_counts = (
        db.query(
            func.date(Submission.submitted_at).label("day"),
            func.count(Submission.id).label("cnt"),
        )
        .filter(
            Submission.user_id == user_id,
            Submission.is_complete == True,
        )
        .group_by(func.date(Submission.submitted_at))
        .all()
    )
    if daily_counts:
        max_day = max(row.cnt for row in daily_counts)
        if max_day > (profile.max_submissions_day or 0):
            profile.max_submissions_day = max_day

    # ── Streak calculation ────────────────────────────────────────
    # Get all distinct dates with at least one submission, sorted desc
    dates = sorted(
        {row.day for row in daily_counts},
        reverse=True,
    )

    streak = 0
    expected = today
    for d in dates:
        # d might be a date or string depending on DB
        if isinstance(d, str):
            d = date.fromisoformat(d)
        if d == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        elif d < expected:
            break   # gap found

    profile.current_streak = streak
    if streak > (profile.max_streak or 0):
        profile.max_streak = streak

    db.commit()