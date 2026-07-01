"""
schemas/user_schema.py
Pydantic v2 schemas for auth, user profile, dashboard responses.
"""
from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Auth ─────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name:          str       = Field(..., min_length=2, max_length=120)
    email:         EmailStr
    password:      str       = Field(..., min_length=8, max_length=128)
    school_name:   Optional[str] = None
    state:         Optional[str] = None
    country:       str       = "India"
    student_class: str       = "Class 11"
    stream:        str       = "JEE"

    @field_validator("student_class")
    @classmethod
    def validate_class(cls, v):
        valid = ["Class 11", "Class 12", "Dropper"]
        if v not in valid:
            raise ValueError(f"student_class must be one of {valid}")
        return v

    @field_validator("stream")
    @classmethod
    def validate_stream(cls, v):
        if v not in ("JEE", "NEET"):
            raise ValueError("stream must be JEE or NEET")
        return v


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_id:      str
    is_admin:     bool


# ── Profile ───────────────────────────────────────────────────────
class ProfileUpdateRequest(BaseModel):
    name:          str       = Field(..., min_length=2, max_length=120)
    school_name:   Optional[str] = None
    state:         Optional[str] = None
    country:       str       = "India"
    student_class: str       = "Class 11"
    stream:        str       = "JEE"


class RatingHistoryItem(BaseModel):
    date:   str
    rating: int
    delta:  int
    source: str
    type:   str

    model_config = {"from_attributes": True}


class PublicProfileOut(BaseModel):
    """Returned for public profile pages (no private data)."""
    user_id:       str
    name:          str
    roll_no:       str
    photo_url:     Optional[str]
    school_name:   Optional[str]
    state:         Optional[str]
    country:       str
    student_class: str
    stream:        str
    rating:        int
    rating_level:  str
    rating_color:  str
    sheets_solved: int
    tests_given:   int
    accuracy:      float
    current_streak:int
    max_streak:    int
    is_online:     bool
    registered_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PrivateProfileOut(PublicProfileOut):
    """Full profile including weak/strong subjects — only for the user themselves."""
    strong_subjects: Optional[str]
    weak_subjects:   Optional[str]
    weak_chapters:   Optional[str]


class DashboardStatsOut(BaseModel):
    rating:          int
    rating_level:    str
    rating_color:    str
    sheets_solved:   int
    pyqs_solved:     int
    dpps_attempted:  int
    chapterwise_done:int
    tests_given:     int
    accuracy:        float
    current_streak:  int
    max_streak:      int
    max_submissions_day: int

    model_config = {"from_attributes": True}