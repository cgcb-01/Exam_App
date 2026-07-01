"""schemas/misc_schema.py — Announcements, ToDo, Calendar."""
from __future__ import annotations
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class AnnouncementOut(BaseModel):
    id:         str
    title:      str
    body:       str
    ann_type:   str
    is_pinned:  bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ToDoCreate(BaseModel):
    title:       str
    description: Optional[str] = None
    due_date:    Optional[date] = None


class ToDoOut(BaseModel):
    id:             str
    title:          str
    description:    Optional[str]
    due_date:       Optional[date]
    is_completed:   bool
    completion_pct: float
    created_at:     datetime

    model_config = {"from_attributes": True}


class CalendarEventOut(BaseModel):
    id:          str
    title:       str
    description: Optional[str]
    event_date:  date
    event_type:  str
    color_hex:   str
    related_id:  Optional[str]

    model_config = {"from_attributes": True}