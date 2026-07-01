import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.database import Base


class DownloadedFile(Base):
    __tablename__ = "downloaded_files"

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    exam_id      = Column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), index=True)
    file_type    = Column(SAEnum("QUESTION_PAPER","SOLUTION","OMR", name="filetype_enum"),
                          default="QUESTION_PAPER")
    b2_file_key  = Column(String(500), nullable=True)
    downloaded_at= Column(DateTime, default=datetime.utcnow)
    is_premium   = Column(Boolean, default=False)
    is_deleted   = Column(Boolean, default=False)   

    user = relationship("User", back_populates="downloads")


class OfflineAttempt(Base):
    __tablename__ = "offline_attempts"

    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id       = Column(String(36), ForeignKey("users.id",   ondelete="CASCADE"), index=True)
    exam_id       = Column(String(36), ForeignKey("exams.id",   ondelete="CASCADE"), index=True)
    submission_id = Column(String(36), ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True)
    synced_at     = Column(DateTime, nullable=True) 
    is_synced     = Column(Boolean, default=False)
    created_at    = Column(DateTime, default=datetime.utcnow)