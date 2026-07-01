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

    attempt_no  = Column(Integer, default=1)        
    started_at  = Column(DateTime, default=datetime.utcnow)
    submitted_at= Column(DateTime, nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    is_complete = Column(Boolean, default=False)
    is_offline  = Column(Boolean, default=False)      
    total_score         = Column(Float, default=0.0)
    max_possible_score  = Column(Float, default=0.0)
    correct_count       = Column(Integer, default=0)
    wrong_count         = Column(Integer, default=0)
    unattempted_count   = Column(Integer, default=0)
    accuracy            = Column(Float, default=0.0)   
    rank_in_exam        = Column(Integer, nullable=True)
    percentile          = Column(Float, nullable=True)
    rating_delta        = Column(Integer, default=0)   
    omr_snapshot        = Column(JSON, nullable=True)

    proctor_enabled     = Column(Boolean, default=False)
    proctor_warnings    = Column(Integer, default=0)  

    user    = relationship("User", back_populates="submissions")
    exam    = relationship("Exam", back_populates="submissions")
    answers = relationship("AnswerLog", back_populates="submission",
                           cascade="all, delete-orphan")


class AnswerLog(Base):
    __tablename__ = "answer_logs"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    submission_id = Column(String(36), ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    question_id   = Column(String(36), ForeignKey("questions.id",   ondelete="SET NULL"), nullable=True)

    user_answer   = Column(JSON, nullable=True)
    status        = Column(
        SAEnum("correct","wrong","partial","unattempted","marked_review",
               name="answer_status_enum"),
        default="unattempted"
    )
    marks_awarded = Column(Float, default=0.0)
    time_spent_seconds = Column(Integer, default=0)

    marked_to_review = Column(Boolean, default=False)  
    submission = relationship("Submission", back_populates="answers")
