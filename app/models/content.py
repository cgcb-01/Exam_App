"""
models/content.py
Tables: chapters, syllabi, pyq_years, dpp_entries
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


class Chapter(Base):
    __tablename__ = "chapters"

    id       = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name     = Column(String(200), nullable=False)
    subject  = Column(String(50),  nullable=False)
    stream   = Column(SAEnum("JEE","NEET","BOTH", name="chap_stream_enum"), default="BOTH")
    order_index = Column(Integer, default=0)
    is_active   = Column(Boolean, default=True)

    # Relations
    exams    = relationship("Exam",    back_populates="chapter")
    syllabus_entries = relationship("SyllabusEntry", back_populates="chapter",
                                    cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chapter {self.subject}/{self.name}>"


class SyllabusEntry(Base):
    """
    Maps a topic/subtopic to a chapter for the three class syllabi.
    Admin manages these. Three separate syllabi per class.
    """
    __tablename__ = "syllabus_entries"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    chapter_id  = Column(String(36), ForeignKey("chapters.id", ondelete="CASCADE"), index=True)
    for_class   = Column(SAEnum("Class 11","Class 12","Dropper","ALL",
                                name="syl_class_enum"), default="ALL")
    topic_title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)
    is_paic_topic = Column(Boolean, default=False)
    is_baic_topic = Column(Boolean, default=False)

    chapter = relationship("Chapter", back_populates="syllabus_entries")


class PYQYear(Base):
    """
    Groups PYQ exams by year + stream. Admin adds new years/shifts.
    """
    __tablename__ = "pyq_years"

    id       = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    year     = Column(Integer, nullable=False)
    stream   = Column(SAEnum("JEE_MAINS","JEE_ADV","NEET", name="pyq_stream_enum"))
    shift    = Column(String(30), nullable=True)   # "Morning", "Afternoon", etc.
    label    = Column(String(100), nullable=True)  # display label
    is_active= Column(Boolean, default=True)


class DPPEntry(Base):
    """
    Tracks which DPP belongs to which date and subject for the calendar view.
    The actual exam/questions are in the Exam table.
    """
    __tablename__ = "dpp_entries"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id     = Column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), unique=True)
    subject     = Column(String(50), nullable=False)
    for_class   = Column(SAEnum("Class 11","Class 12","Dropper","ALL",
                                name="dpp_class_enum"), default="ALL")
    stream      = Column(SAEnum("JEE","NEET","BOTH", name="dpp_stream_enum"), default="BOTH")
    scheduled_date = Column(DateTime, nullable=False)
    is_premium  = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
