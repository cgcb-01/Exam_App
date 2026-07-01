"""routers/leaderboard.py"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pathlib import Path
from app.database import get_db
from app.models.user import User, UserProfile
from app.models.contest import LeaderboardEntry, Contest

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def leaderboard_page(request: Request, db: Session = Depends(get_db)):
    # Global rating leaderboard
    top_users = (
        db.query(User, UserProfile)
        .join(UserProfile, User.id == UserProfile.user_id)
        .filter(User.is_active == True, User.is_admin == False)
        .order_by(desc(UserProfile.rating))
        .limit(100)
        .all()
    )
    return templates.TemplateResponse("leaderboard.html", {
        "request":   request,
        "top_users": top_users,
        "page":      "leaderboard",
    })


@router.get("/contest/{contest_id}", response_class=JSONResponse)
async def contest_leaderboard(contest_id: str, db: Session = Depends(get_db)):
    entries = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.contest_id == contest_id, LeaderboardEntry.is_final == True)
        .order_by(LeaderboardEntry.rank)
        .limit(200)
        .all()
    )
    return [{"rank": e.rank, "user_id": e.user_id, "score": e.score,
             "accuracy": e.accuracy, "time_taken_s": e.time_taken_s} for e in entries]