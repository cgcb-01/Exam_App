import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Date,
    ForeignKey, Text, Enum as SAEnum, Float
)
from sqlalchemy.orm import relationship
from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title       = Column(String(300), nullable=False)
    body        = Column(Text, nullable=False)
    ann_type    = Column(
        SAEnum("CONTEST_UPCOMING","DATE_CHANGE","RESULT","SOLUTION_RELEASE",
               "TOPPER","GENERAL", name="ann_type_enum"),
        default="GENERAL"
    )
    related_id  = Column(String(36), nullable=True) 
    is_pinned   = Column(Boolean, default=False)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    expire_at   = Column(DateTime, nullable=True)


class ToDo(Base):
    __tablename__ = "todos"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title       = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    due_date    = Column(Date, nullable=True)
    is_completed= Column(Boolean, default=False)
    completed_at= Column(DateTime, nullable=True)
    completion_pct = Column(Float, default=0.0)       
    rating_impact  = Column(Integer, default=0)      
    created_at  = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="todos")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title       = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    event_date  = Column(Date, nullable=False, index=True)
    end_date    = Column(Date, nullable=True)
    event_type  = Column(
        SAEnum("PAIC","BAIC","DPP","HOLIDAY","RESULT","SOLUTION","GENERAL",
               name="cal_type_enum"),
        default="GENERAL"
    )
    color_hex   = Column(String(10), default="#42A5F5")
    related_id  = Column(String(36), nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


class DailyDownloadLog(Base):
    __tablename__ = "daily_download_logs"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    log_date    = Column(Date, default=date.today, index=True)
    count       = Column(Integer, default=0)