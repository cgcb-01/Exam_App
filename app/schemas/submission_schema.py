"""schemas/submission_schema.py"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Any, List
from pydantic import BaseModel


class SaveAnswerRequest(BaseModel):
    submission_id: str
    question_id:   str
    answer:        Optional[Any]       # list[str] | str | float
    status:        str = "unattempted" # unattempted | marked_review
    time_spent:    int = 0


class SubmitRequest(BaseModel):
    submission_id: str
    omr_snapshot:  Optional[dict] = None   # NEET: {"Q1":"A",...}


class SubmissionResultOut(BaseModel):
    submission_id: str
    score:         float
    max_score:     float
    correct:       int
    wrong:         int
    unattempted:   int
    accuracy:      float
    rank:          Optional[int]
    percentile:    Optional[float]
    rating_delta:  int

    model_config = {"from_attributes": True}


class AnswerLogOut(BaseModel):
    question_id:     str
    user_answer:     Optional[Any]
    status:          str
    marks_awarded:   float
    marked_to_review:bool

    model_config = {"from_attributes": True}