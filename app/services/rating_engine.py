import math
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.config import settings, get_rating_tier
from app.models.user import UserProfile, RatingHistory
from app.models.submission import Submission
K_CONTEST  = settings.rating_k_factor_contest  
K_SHEET    = settings.rating_k_factor_sheet    
K_ACCURACY = 6
K_STREAK   = 2
K_TODO     = 1


def expected_score(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def compute_contest_delta(
    user_rating: int,
    user_rank: int,
    total_participants: int,
    user_score: float,
    max_score: float,
    avg_rating_of_participants: int,
) -> int:
    if total_participants < 2:
        return 0
    rank_score = 1.0 - (user_rank - 1) / (total_participants - 1)
    accuracy_score = user_score / max_score if max_score > 0 else 0.0
    actual = 0.7 * rank_score + 0.3 * accuracy_score
    expected = expected_score(user_rating, avg_rating_of_participants)

    delta = K_CONTEST * (actual - expected)
    return int(round(delta))


def compute_sheet_delta(
    accuracy: float,          
    user_avg_accuracy: float,  
    sheets_today: int,
    streak: int,
) -> int:
    acc_norm = accuracy / 100.0
    avg_norm = user_avg_accuracy / 100.0

    acc_delta   = K_ACCURACY * (acc_norm - avg_norm)
    streak_bonus = K_STREAK * math.log1p(streak) * 0.5
    sheet_bonus  = K_SHEET   * math.log1p(sheets_today) * 0.3

    return int(round(acc_delta + streak_bonus + sheet_bonus))


def apply_rating_update(
    db: Session,
    user_id: str,
    delta: int,
    source: str,
    source_type: str,  
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile:
        return

    old_rating = profile.rating
    new_rating = max(0, old_rating + delta)

    level_name, color = get_rating_tier(new_rating)

    profile.rating       = new_rating
    profile.rating_level = level_name
    profile.rating_color = color

    history = RatingHistory(
        user_id     = user_id,
        rating      = new_rating,
        delta       = delta,
        source      = source,
        source_type = source_type,
        recorded_at = datetime.utcnow(),
    )
    db.add(history)
    db.commit()
    return new_rating


def apply_todo_delta(db: Session, user_id: str, completion_pct: float, task_title: str):
    if completion_pct >= 100:
        delta = K_TODO
    elif completion_pct >= 50:
        delta = 0
    else:
        delta = -K_TODO * 2
    apply_rating_update(db, user_id, delta, f"TODO:{task_title}", "todo")


def weekly_decay(db: Session):
    from app.models.user import User
    cutoff = datetime.utcnow() - timedelta(days=7)
    users = db.query(User).filter(User.is_active == True).all()

    for user in users:
        last_sub = (
            db.query(Submission)
            .filter(Submission.user_id == user.id, Submission.is_complete == True)
            .order_by(Submission.submitted_at.desc())
            .first()
        )
        if not last_sub or (last_sub.submitted_at and last_sub.submitted_at < cutoff):
            apply_rating_update(db, user.id, -3, "weekly_inactivity", "decay")
