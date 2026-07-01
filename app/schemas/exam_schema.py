"""
schemas/exam_schema.py
Admin-facing create/update schemas and student-facing read schemas.
Correct answers and solutions are NEVER included in student-facing Out schemas.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


# ── Content block (shared) ────────────────────────────────────────
class ContentBlock(BaseModel):
    """type: 'text' | 'latex' | 'image'"""
    type:  str
    value: Optional[str] = None   # text / latex
    url:   Optional[str] = None   # image


# ── Option schemas ────────────────────────────────────────────────
class OptionCreate(BaseModel):
    option_label: str = Field(..., max_length=5)
    content:      List[ContentBlock]
    is_correct:   bool = False


class OptionOut(BaseModel):
    id:           str
    option_label: str
    content:      List[ContentBlock]

    model_config = {"from_attributes": True}


# ── Question schemas ──────────────────────────────────────────────
class QuestionCreate(BaseModel):
    content:         List[ContentBlock]
    correct_answer:  Any                    # list[str] | str | dict
    solution:        Optional[List[ContentBlock]] = None
    difficulty:      str = "Medium"
    topic_tags:      List[str] = []
    order_index:     int = 0
    options:         List[OptionCreate] = []
    numerical_range: Optional[dict] = None  # {"min": x, "max": y}


class QuestionUpdate(BaseModel):
    content:         Optional[List[ContentBlock]] = None
    correct_answer:  Optional[Any] = None
    solution:        Optional[List[ContentBlock]] = None
    difficulty:      Optional[str] = None
    topic_tags:      Optional[List[str]] = None


class QuestionStudentOut(BaseModel):
    """No correct_answer / solution."""
    id:          str
    content:     List[ContentBlock]
    options:     List[OptionOut]
    order_index: int
    difficulty:  Optional[str]

    model_config = {"from_attributes": True}


class QuestionAdminOut(QuestionStudentOut):
    """Includes answer + solution — admin only."""
    correct_answer:  Any
    solution:        Optional[List[ContentBlock]]
    numerical_range: Optional[dict]

    model_config = {"from_attributes": True}


# ── Section schemas ───────────────────────────────────────────────
class SectionCreate(BaseModel):
    title:          str
    question_type:  str = "MCQ"
    marks_correct:  float = 4.0
    marks_wrong:    float = -1.0
    marks_partial:  float = 0.0
    order_index:    int = 0
    max_questions_to_attempt: Optional[int] = None


class SectionStudentOut(BaseModel):
    id:            str
    title:         str
    question_type: str
    marks_correct: float
    marks_wrong:   float
    marks_partial: float
    questions:     List[QuestionStudentOut]

    model_config = {"from_attributes": True}


# ── Exam schemas ──────────────────────────────────────────────────
class ExamCreate(BaseModel):
    title:            str
    exam_type:        str = "DPP"
    paper_style:      str = "JEE_MAINS"
    stream:           str = "JEE"
    for_class:        str = "ALL"
    subject:          Optional[str] = None
    duration_minutes: int = 180
    is_premium:       bool = False
    instructions:     Optional[str] = None
    year:             Optional[int] = None
    shift:            Optional[str] = None
    paper_no:         Optional[str] = None
    module_no:        Optional[int] = None
    chapter_id:       Optional[str] = None
    start_time:       Optional[datetime] = None
    end_time:         Optional[datetime] = None


class ExamListOut(BaseModel):
    id:               str
    title:            str
    exam_type:        str
    paper_style:      str
    stream:           str
    for_class:        str
    subject:          Optional[str]
    duration_minutes: int
    is_premium:       bool
    is_published:     bool
    start_time:       Optional[datetime]
    end_time:         Optional[datetime]
    solution_released:bool

    model_config = {"from_attributes": True}


class ExamDetailOut(ExamListOut):
    instructions: Optional[str]
    sections:     List[SectionStudentOut]

    model_config = {"from_attributes": True}