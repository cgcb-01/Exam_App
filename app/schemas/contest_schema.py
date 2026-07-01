"""schemas/contest_schema.py"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class ContestCreate(BaseModel):
    name:         str
    contest_type: str       # PAIC | BAIC
    edition_no:   int = 1
    exam_ids:     List[str] = []
    start_time:   datetime
    end_time:     datetime
    result_time:  Optional[datetime] = None
    is_premium:   bool = False
    announcement: Optional[str] = None


class ContestOut(BaseModel):
    id:           str
    name:         str
    contest_type: str
    edition_no:   int
    start_time:   datetime
    end_time:     datetime
    is_premium:   bool
    is_active:    bool
    announcement: Optional[str]
    topper_list:  Optional[Any]

    model_config = {"from_attributes": True}


class LeaderboardEntryOut(BaseModel):
    rank:         int
    user_id:      str
    score:        float
    accuracy:     float
    time_taken_s: int
    rating_delta: int

    model_config = {"from_attributes": True}