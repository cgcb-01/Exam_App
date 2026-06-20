"""Leaderboard: per-test, overall composite, and daily question-solver boards."""
from datetime import datetime, date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.db import get_db, User, LeaderboardEntry, LeaderboardStat, Attempt, AttemptAnswer
from backend import schemas
from backend.auth import get_current_user_optional

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("/test/{content_type}/{content_id}", response_model=list[schemas.LeaderboardRow])
def per_test_leaderboard(
    content_type: str, content_id: int,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Rankings for a specific shift / DPP / module / mock test."""
    entries = (db.query(LeaderboardEntry, User)
        .join(User, LeaderboardEntry.user_id == User.id)
        .filter(LeaderboardEntry.content_type == content_type.upper(),
                LeaderboardEntry.content_id == content_id)
        .order_by(LeaderboardEntry.percentage.desc(), LeaderboardEntry.time_taken_sec.asc())
        .limit(limit).all())
    
    rows = []
    for rank, (entry, user) in enumerate(entries, 1):
        rows.append(schemas.LeaderboardRow(
            rank=rank, user_id=user.id, full_name=user.full_name, email=_mask_email(user.email),
            score=entry.score, max_score=entry.max_score, percentage=entry.percentage,
            time_taken_sec=entry.time_taken_sec, submitted_at=entry.submitted_at,
        ))
    return rows


@router.get("/overall", response_model=list[schemas.OverallLeaderboardRow])
def overall_leaderboard(limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    """
    Overall leaderboard. Composite score weights:
      - 40% accuracy (correct/attempted)
      - 25% total score earned
      - 20% DPP completion count
      - 15% streak (consistency)
    """
    stats = (db.query(LeaderboardStat, User)
        .join(User, LeaderboardStat.user_id == User.id)
        .filter(LeaderboardStat.total_tests_taken > 0)
        .order_by(LeaderboardStat.composite_score.desc())
        .limit(limit).all())
    
    rows = []
    for rank, (stat, user) in enumerate(stats, 1):
        accuracy = 0.0
        if stat.total_questions_solved > 0:
            accuracy = (stat.total_score / max(stat.total_max_score, 1)) * 100
        rows.append(schemas.OverallLeaderboardRow(
            rank=rank, user_id=user.id, full_name=user.full_name, email=_mask_email(user.email),
            composite_score=round(stat.composite_score, 2),
            total_tests=stat.total_tests_taken,
            total_questions=stat.total_questions_solved,
            total_dpps=stat.total_dpps_completed,
            streak_days=stat.current_streak_days,
            accuracy=round(accuracy, 1),
        ))
    return rows


@router.get("/daily", response_model=list[schemas.DailyLeaderboardRow])
def daily_leaderboard(limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    """Daily leaderboard — questions solved today."""
    today = date.today().isoformat()
    stats = (db.query(LeaderboardStat, User)
        .join(User, LeaderboardStat.user_id == User.id)
        .filter(LeaderboardStat.daily_date == today, LeaderboardStat.daily_questions_solved > 0)
        .order_by(LeaderboardStat.daily_questions_solved.desc(), LeaderboardStat.daily_score.desc())
        .limit(limit).all())
    
    rows = []
    for rank, (stat, user) in enumerate(stats, 1):
        rows.append(schemas.DailyLeaderboardRow(
            rank=rank, user_id=user.id, full_name=user.full_name, email=_mask_email(user.email),
            daily_questions_solved=stat.daily_questions_solved, daily_score=stat.daily_score,
        ))
    return rows


@router.get("/my-rank")
def my_rank(current_user: User = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    if not current_user:
        return {"overall_rank": None, "daily_rank": None}
    
    stat = db.query(LeaderboardStat).filter(LeaderboardStat.user_id == current_user.id).first()
    if not stat:
        return {"overall_rank": None, "daily_rank": None, "composite_score": 0}
    
    overall_rank = (db.query(func.count(LeaderboardStat.id))
        .filter(LeaderboardStat.composite_score > stat.composite_score).scalar() or 0) + 1
    
    today = date.today().isoformat()
    daily_rank = None
    if stat.daily_date == today:
        daily_rank = (db.query(func.count(LeaderboardStat.id))
            .filter(LeaderboardStat.daily_date == today,
                    LeaderboardStat.daily_questions_solved > stat.daily_questions_solved).scalar() or 0) + 1
    
    return {
        "overall_rank": overall_rank, "daily_rank": daily_rank,
        "composite_score": stat.composite_score,
        "streak_days": stat.current_streak_days,
        "total_tests": stat.total_tests_taken,
        "total_questions": stat.total_questions_solved,
    }


def _mask_email(email: str) -> str:
    """Show only first 2 chars + domain for privacy on public leaderboard."""
    parts = email.split("@")
    if len(parts) == 2:
        return parts[0][:2] + "***@" + parts[1]
    return email[:4] + "***"


def update_leaderboard_after_attempt(attempt, result: schemas.AttemptResult, db: Session):
    """
    Called from attempt_router after a successful online submission.
    Updates both the per-test LeaderboardEntry and the user's LeaderboardStat.
    """
    # Determine content_type / content_id
    if attempt.shift_id:
        ctype, cid = "SHIFT", attempt.shift_id
    elif attempt.dpp_id:
        ctype, cid = "DPP", attempt.dpp_id
    elif attempt.module_id:
        ctype, cid = "MODULE", attempt.module_id
    elif attempt.mock_test_id:
        ctype, cid = "MOCK", attempt.mock_test_id
    else:
        return

    pct = (result.score / result.max_score * 100) if result.max_score > 0 else 0.0

    # Upsert LeaderboardEntry — keep best score per user per test
    existing = (db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.content_type == ctype, LeaderboardEntry.content_id == cid,
                LeaderboardEntry.user_id == attempt.user_id).first())
    if existing:
        if pct > existing.percentage:
            existing.score = result.score; existing.max_score = result.max_score
            existing.percentage = pct; existing.time_taken_sec = result.time_taken_seconds
            existing.submitted_at = datetime.utcnow(); existing.attempt_id = attempt.id
    else:
        db.add(LeaderboardEntry(
            content_type=ctype, content_id=cid, user_id=attempt.user_id,
            attempt_id=attempt.id, score=result.score, max_score=result.max_score,
            percentage=pct, time_taken_sec=result.time_taken_seconds,
        ))

    # Update LeaderboardStat
    stat = db.query(LeaderboardStat).filter(LeaderboardStat.user_id == attempt.user_id).first()
    if not stat:
        stat = LeaderboardStat(user_id=attempt.user_id)
        db.add(stat)
        db.flush()

    stat.total_tests_taken += 1
    stat.total_questions_solved += result.attempted_count
    stat.total_score += result.score
    stat.total_max_score += result.max_score
    if ctype == "DPP":
        stat.total_dpps_completed += 1

    # Streak
    today = date.today().isoformat()
    if stat.last_active_date == today:
        pass  # already active today, streak unchanged
    elif stat.last_active_date == (date.today().replace(day=date.today().day - 1)).isoformat() if date.today().day > 1 else None:
        stat.current_streak_days += 1
    else:
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        if stat.last_active_date == yesterday:
            stat.current_streak_days += 1
        else:
            stat.current_streak_days = 1
    stat.last_active_date = today
    stat.max_streak_days = max(stat.max_streak_days, stat.current_streak_days)

    # Daily counters
    if stat.daily_date != today:
        stat.daily_date = today
        stat.daily_questions_solved = 0
        stat.daily_score = 0.0
    stat.daily_questions_solved += result.attempted_count
    stat.daily_score += result.score

    # Composite score = accuracy(40%) + normalised_score(25%) + dpp(20%) + streak(15%)
    accuracy_score = (stat.total_score / max(stat.total_max_score, 1)) * 40
    test_score     = min(stat.total_score / 10, 25)          # capped at 25 pts
    dpp_score      = min(stat.total_dpps_completed * 0.5, 20)
    streak_score   = min(stat.current_streak_days * 0.3, 15)
    stat.composite_score = accuracy_score + test_score + dpp_score + streak_score

    db.commit()