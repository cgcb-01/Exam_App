from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from pathlib import Path
from datetime import datetime, timedelta
import json

from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.user import UserProfile, RatingHistory, Friendship
from app.models.submission import Submission
from app.config import CLASS_OPTIONS, STREAM_OPTIONS, get_rating_tier

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    profile = user.profile
    history = (
        db.query(RatingHistory)
        .filter(RatingHistory.user_id == user.id)
        .order_by(RatingHistory.recorded_at)
        .limit(100)
        .all()
    )
    rating_labels  = [h.recorded_at.strftime("%d %b") for h in history]
    rating_values  = [h.rating for h in history]
    rating_sources = [h.source for h in history]
    year_ago = datetime.utcnow() - timedelta(days=365)
    daily_counts = (
        db.query(
            func.date(Submission.submitted_at).label("day"),
            func.count(Submission.id).label("count"),
        )
        .filter(
            Submission.user_id == user.id,
            Submission.submitted_at >= year_ago,
            Submission.is_complete == True,
        )
        .group_by(func.date(Submission.submitted_at))
        .all()
    )
    heatmap_data = {str(row.day): row.count for row in daily_counts}
    friends_raw = (
        db.query(Friendship)
        .filter(
            ((Friendship.user_id == user.id) | (Friendship.friend_id == user.id)),
            Friendship.status == "accepted",
        )
        .limit(20)
        .all()
    )

    return templates.TemplateResponse("dashboard.html", {
        "request":        request,
        "user":           user,
        "profile":        profile,
        "page":           "dashboard",
        "class_options":  CLASS_OPTIONS,
        "stream_options": STREAM_OPTIONS,
        "rating_labels":  json.dumps(rating_labels),
        "rating_values":  json.dumps(rating_values),
        "rating_sources": json.dumps(rating_sources),
        "heatmap_data":   json.dumps(heatmap_data),
        "friends":        friends_raw,
    })


@router.get("/api/stats", response_class=JSONResponse)
async def get_stats(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    p = user.profile
    return {
        "rating":         p.rating if p else 0,
        "level":          p.rating_level if p else "Unrated",
        "color":          p.rating_color if p else "#9E9E9E",
        "sheets_solved":  p.sheets_solved if p else 0,
        "tests_given":    p.tests_given if p else 0,
        "accuracy":       round(p.accuracy, 1) if p else 0,
        "streak":         p.current_streak if p else 0,
        "max_streak":     p.max_streak if p else 0,
    }