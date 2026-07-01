"""
models/contest.py
Tables: contests (PAIC/BAIC meta), leaderboard_entries
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


class Contest(Base):
    """PAIC / BAIC meta record — links to one or more Exam rows."""
    __tablename__ = "contests"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name          = Column(String(200), nullable=False)
    contest_type  = Column(SAEnum("PAIC","BAIC", name="ctype_enum"), nullable=False)
    edition_no    = Column(Integer, default=1)           # e.g. PAIC #5
    # One contest can have diff papers per class/stream
    # Those Exam rows have contest_id via JSON ref in announcement
    exam_ids      = Column(JSON, default=list)           # list of exam UUIDs
    start_time    = Column(DateTime, nullable=False)
    end_time      = Column(DateTime, nullable=False)
    result_time   = Column(DateTime, nullable=True)
    solution_time = Column(DateTime, nullable=True)
    is_premium    = Column(Boolean, default=False)
    is_active     = Column(Boolean, default=True)
    announcement  = Column(String(500), nullable=True)
    topper_list   = Column(JSON, nullable=True)          # set after result
    created_at    = Column(DateTime, default=datetime.utcnow)

    leaderboard = relationship("LeaderboardEntry", back_populates="contest",
                               cascade="all, delete-orphan")


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contest_id   = Column(String(36), ForeignKey("contests.id", ondelete="CASCADE"), index=True)
    user_id      = Column(String(36), ForeignKey("users.id",    ondelete="CASCADE"), index=True)
    submission_id= Column(String(36), ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True)
    rank         = Column(Integer, nullable=True)
    score        = Column(Float, default=0.0)
    accuracy     = Column(Float, default=0.0)
    time_taken_s = Column(Integer, default=0)
    rating_delta = Column(Integer, default=0)
    is_final     = Column(Boolean, default=False)   

    contest = relationship("Contest", back_populates="leaderboard")