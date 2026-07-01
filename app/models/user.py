"""
models/user.py
Tables: users, user_profiles, rating_history, friendships, sessions
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base
import shortuuid


class User(Base):
    __tablename__ = "users"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    roll_no       = Column(String(20),  unique=True, nullable=False,
                           default=lambda: "AIC" + shortuuid.ShortUUID().random(length=7).upper())
    is_admin      = Column(Boolean, default=False)
    is_premium    = Column(Boolean, default=False)
    premium_expiry= Column(DateTime, nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    last_login    = Column(DateTime, nullable=True)

    # ── Relations ────────────────────────────────────────────────
    profile        = relationship("UserProfile",   back_populates="user", uselist=False, cascade="all, delete-orphan")
    rating_history = relationship("RatingHistory", back_populates="user", order_by="RatingHistory.recorded_at")
    sessions       = relationship("UserSession",   back_populates="user", cascade="all, delete-orphan")
    submissions    = relationship("Submission",    back_populates="user")
    downloads      = relationship("DownloadedFile",back_populates="user")
    todos          = relationship("ToDo",          back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.email} roll={self.roll_no}>"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name         = Column(String(120), nullable=False)
    photo_url    = Column(String(500), nullable=True)   # B2 URL
    school_name  = Column(String(200), nullable=True)
    state        = Column(String(100), nullable=True)
    country      = Column(String(100), default="India")
    student_class= Column(SAEnum("Class 11","Class 12","Dropper", name="class_enum"), default="Class 11")
    stream       = Column(SAEnum("JEE","NEET", name="stream_enum"), default="JEE")
    rating       = Column(Integer, default=0)
    rating_level = Column(String(50), default="Unrated")
    rating_color = Column(String(10), default="#9E9E9E")

    # ── Public stats ─────────────────────────────────────────────
    sheets_solved      = Column(Integer, default=0)
    pyqs_solved        = Column(Integer, default=0)
    dpps_attempted     = Column(Integer, default=0)
    chapterwise_done   = Column(Integer, default=0)
    tests_given        = Column(Integer, default=0)
    accuracy           = Column(Float,   default=0.0)  # percent
    current_streak     = Column(Integer, default=0)
    max_streak         = Column(Integer, default=0)
    max_submissions_day= Column(Integer, default=0)
    is_online          = Column(Boolean, default=False)

    # ── Private stats ─────────────────────────────────────────────
    strong_subjects = Column(Text, nullable=True)  # JSON list
    weak_subjects   = Column(Text, nullable=True)
    weak_chapters   = Column(Text, nullable=True)

    # ── Relations ────────────────────────────────────────────────
    user = relationship("User", back_populates="profile")


class RatingHistory(Base):
    __tablename__ = "rating_history"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating      = Column(Integer, nullable=False)
    delta       = Column(Integer, default=0)   # +/-
    source      = Column(String(100))          # "PAIC-2024-01", "DPP", etc.
    source_type = Column(String(30))           # "contest" | "sheet" | "decay"
    recorded_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="rating_history")


class Friendship(Base):
    __tablename__ = "friendships"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    friend_id  = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status     = Column(SAEnum("pending","accepted","blocked", name="friend_status"), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    """JWT refresh tokens / device sessions."""
    __tablename__ = "user_sessions"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash = Column(String(255), unique=True)
    device_info= Column(String(255), nullable=True)
    ip_address = Column(String(50),  nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_valid   = Column(Boolean, default=True)

    user = relationship("User", back_populates="sessions")
