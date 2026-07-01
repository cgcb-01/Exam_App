"""
models/submission.py
Tables: submissions, answer_logs
Handles JEE palette-style and NEET OMR-style submissions.
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, ForeignKey, JSON, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exam_id     = Column(String(36), ForeignKey("exams.id",  ondelete="CASCADE"), index=True)

    # ── Attempt tracking ─────────────────────────────────────────
    attempt_no  = Column(Integer, default=1)          # DPPs can be re-attempted
    started_at  = Column(DateTime, default=datetime.utcnow)
    submitted_at= Column(DateTime, nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    is_complete = Column(Boolean, default=False)
    is_offline  = Column(Boolean, default=False)      # attempted via My Library offline

    # ── Scores ───────────────────────────────────────────────────
    total_score         = Column(Float, default=0.0)
    max_possible_score  = Column(Float, default=0.0)
    correct_count       = Column(Integer, default=0)
    wrong_count         = Column(Integer, default=0)
    unattempted_count   = Column(Integer, default=0)
    accuracy            = Column(Float, default=0.0)   # percent

    # ── Leaderboard / Rating ─────────────────────────────────────
    rank_in_exam        = Column(Integer, nullable=True)
    percentile          = Column(Float, nullable=True)
    rating_delta        = Column(Integer, default=0)    # +/- after evaluation

    # ── OMR snapshot (NEET style) ─────────────────────────────────
    # Stores the full filled OMR as JSON: {"Q1":"A","Q2":"C",...}
    omr_snapshot        = Column(JSON, nullable=True)

    # ── Proctoring ───────────────────────────────────────────────
    proctor_enabled     = Column(Boolean, default=False)
    proctor_warnings    = Column(Integer, default=0)    # face-not-found count

    user    = relationship("User", back_populates="submissions")
    exam    = relationship("Exam", back_populates="submissions")
    answers = relationship("AnswerLog", back_populates="submission",
                           cascade="all, delete-orphan")


class AnswerLog(Base):
    """
    One row per question per submission.
    Stores the user's chosen answer and evaluation result.
    """
    __tablename__ = "answer_logs"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    submission_id = Column(String(36), ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    question_id   = Column(String(36), ForeignKey("questions.id",   ondelete="SET NULL"), nullable=True)

    # ── User response ─────────────────────────────────────────────
    # Same format as Question.correct_answer
    user_answer   = Column(JSON, nullable=True)
    status        = Column(
        SAEnum("correct","wrong","partial","unattempted","marked_review",
               name="answer_status_enum"),
        default="unattempted"
    )
    marks_awarded = Column(Float, default=0.0)
    time_spent_seconds = Column(Integer, default=0)

    # ── Review flag ──────────────────────────────────────────────
    marked_to_review = Column(Boolean, default=False)   # user marked during solution viewing → goes to personalised test

    submission = relationship("Submission", back_populates="answers")
