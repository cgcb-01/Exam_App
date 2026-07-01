"""
routers/rating.py
Exposes rating history and contest delta APIs.
Also handles post-contest bulk rating recalculation triggered by admin.
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.services.auth_utils import get_current_user, require_admin
from app.models.user import UserProfile, RatingHistory
from app.models.submission import Submission
from app.models.contest import Contest, LeaderboardEntry
from app.services.rating_engine import (
    compute_contest_delta, apply_rating_update
)

router = APIRouter()


@router.get("/history")
async def my_rating_history(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    history = (
        db.query(RatingHistory)
        .filter(RatingHistory.user_id == user.id)
        .order_by(RatingHistory.recorded_at)
        .all()
    )
    return [{
        "date":   h.recorded_at.strftime("%Y-%m-%d"),
        "rating": h.rating,
        "delta":  h.delta,
        "source": h.source,
        "type":   h.source_type,
    } for h in history]


@router.post("/recalculate-contest/{contest_id}")
async def recalculate_contest_ratings(
    contest_id: str, request: Request, db: Session = Depends(get_db)
):
    """
    Admin-triggered: after contest results are finalised,
    compute and apply rating deltas for all participants.
    Uses JEE/NEET rank-rule:
      - Sort by score DESC, then time_taken_s ASC (JEE style)
      - NEET: same but marks are fixed 4/-1 MCQ
    """
    require_admin(request, db)

    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        raise HTTPException(404, "Contest not found")

    entries = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.contest_id == contest_id)
        .order_by(LeaderboardEntry.score.desc(),
                  LeaderboardEntry.time_taken_s.asc())
        .all()
    )
    if not entries:
        raise HTTPException(404, "No leaderboard entries found")

    total = len(entries)
    avg_rating = (
        db.query(func.avg(UserProfile.rating))
        .filter(UserProfile.user_id.in_([e.user_id for e in entries]))
        .scalar()
    ) or 1500
    avg_rating = int(avg_rating)

    max_score = max((e.score for e in entries), default=1)

    for rank, entry in enumerate(entries, start=1):
        profile = db.query(UserProfile).filter(
            UserProfile.user_id == entry.user_id
        ).first()
        if not profile:
            continue

        delta = compute_contest_delta(
            user_rating             = profile.rating,
            user_rank               = rank,
            total_participants      = total,
            user_score              = entry.score,
            max_score               = max_score,
            avg_rating_of_participants = avg_rating,
        )
        entry.rank         = rank
        entry.rating_delta = delta
        entry.is_final     = True

        apply_rating_update(
            db, entry.user_id, delta,
            f"{contest.contest_type}-{contest.edition_no}",
            "contest",
        )

    toppers = [
        {"rank": e.rank, "user_id": e.user_id, "score": e.score}
        for e in entries[:10]
    ]
    contest.topper_list = toppers
    db.commit()

    return {"recalculated": total, "contest_id": contest_id}
