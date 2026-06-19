"""Pydantic schemas — all request/response shapes."""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ExamType(str, Enum):
    JEE_MAIN="JEE_MAIN"; JEE_ADVANCED="JEE_ADVANCED"; NEET="NEET"

class SubjectName(str, Enum):
    PHYSICS="PHYSICS"; CHEMISTRY="CHEMISTRY"; MATHS="MATHS"; BIOLOGY="BIOLOGY"

class QuestionType(str, Enum):
    MCQ_SINGLE="MCQ_SINGLE"; MCQ_MULTIPLE="MCQ_MULTIPLE"
    NUMERICAL="NUMERICAL";   MATRIX_MATCH="MATRIX_MATCH"

class ContentFormat(str, Enum):
    TEXT="TEXT"; IMAGE="IMAGE"; PDF="PDF"

class AttemptStatus(str, Enum):
    IN_PROGRESS="IN_PROGRESS"; SUBMITTED="SUBMITTED"; AUTO_SUBMITTED="AUTO_SUBMITTED"

class AnswerStatus(str, Enum):
    NOT_VISITED="NOT_VISITED"; NOT_ANSWERED="NOT_ANSWERED"; ANSWERED="ANSWERED"
    MARKED_FOR_REVIEW="MARKED_FOR_REVIEW"; ANSWERED_AND_MARKED="ANSWERED_AND_MARKED"

class SubscriptionPlan(str, Enum):
    MONTHLY="MONTHLY"; INTRO="INTRO"; HALF_YEARLY="HALF_YEARLY"; ANNUAL="ANNUAL"

class SubscriptionStatus(str, Enum):
    ACTIVE="ACTIVE"; EXPIRED="EXPIRED"; CANCELLED="CANCELLED"


# ── Auth ─────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    password: str = Field(min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int; email: str; full_name: Optional[str]; is_admin: bool
    is_premium: bool = False
    class Config: from_attributes = True

class Token(BaseModel):
    access_token: str; token_type: str = "bearer"; user: UserOut


# ── PYQ browse ───────────────────────────────────────────────────────────────
class ShiftOut(BaseModel):
    id: int; label: str; exam_date: Optional[str]; question_count: int = 0
    class Config: from_attributes = True

class YearOut(BaseModel):
    id: int; year: int; shifts: List[ShiftOut] = []
    class Config: from_attributes = True

class ExamOut(BaseModel):
    id: int; type: ExamType; display_name: str; years: List[YearOut] = []
    class Config: from_attributes = True


# ── Questions ─────────────────────────────────────────────────────────────────
class QuestionPublic(BaseModel):
    id: int; question_number: int; subject: SubjectName
    question_type: QuestionType; question_format: ContentFormat
    question_text: Optional[str]; question_image_path: Optional[str]
    question_pdf_path: Optional[str]
    option_a: Optional[str]; option_b: Optional[str]
    option_c: Optional[str]; option_d: Optional[str]
    options_image_path: Optional[str]
    marks_correct: float; marks_incorrect: float
    class Config: from_attributes = True

class QuestionWithSolution(QuestionPublic):
    correct_answer: str; solution_format: ContentFormat
    solution_text: Optional[str]; solution_image_path: Optional[str]
    solution_pdf_path: Optional[str]

class QuestionCreate(BaseModel):
    shift_id: Optional[int]=None; module_id: Optional[int]=None
    dpp_id: Optional[int]=None;   mock_test_id: Optional[int]=None
    subject: SubjectName; question_type: QuestionType = QuestionType.MCQ_SINGLE
    question_number: int = 1; question_format: ContentFormat = ContentFormat.TEXT
    question_text: Optional[str]=None; question_image_path: Optional[str]=None
    question_pdf_path: Optional[str]=None
    option_a: Optional[str]=None; option_b: Optional[str]=None
    option_c: Optional[str]=None; option_d: Optional[str]=None
    options_image_path: Optional[str]=None
    correct_answer: str; marks_correct: float=4.0; marks_incorrect: float=-1.0
    solution_format: ContentFormat=ContentFormat.TEXT
    solution_text: Optional[str]=None; solution_image_path: Optional[str]=None
    solution_pdf_path: Optional[str]=None; topic: Optional[str]=None


# ── Attempt engine ────────────────────────────────────────────────────────────
class AttemptStart(BaseModel):
    shift_id: Optional[int]=None; dpp_id: Optional[int]=None
    module_id: Optional[int]=None; mock_test_id: Optional[int]=None
    is_offline_attempt: bool=False; camera_session_id: Optional[int]=None

class AttemptAnswerOut(BaseModel):
    id: int; question_id: int; selected_answer: Optional[str]
    status: AnswerStatus; time_spent_seconds: int
    class Config: from_attributes = True

class AttemptOut(BaseModel):
    id: int; duration_minutes_allotted: int; started_at: datetime
    status: AttemptStatus; total_questions: int
    questions: List[QuestionPublic] = []; answers: List[AttemptAnswerOut] = []
    camera_session_id: Optional[int] = None
    class Config: from_attributes = True

class AnswerSubmit(BaseModel):
    question_id: int; selected_answer: Optional[str]=None
    status: AnswerStatus; time_spent_seconds: int=0

class AttemptSubmit(BaseModel):
    auto_submitted: bool=False

class AttemptResult(BaseModel):
    attempt_id: int; total_questions: int; attempted_count: int
    correct_count: int; incorrect_count: int; unattempted_count: int
    score: float; max_score: float; time_taken_seconds: int
    subject_breakdown: Dict[str, Any] = {}
    percentage: float = 0.0

class OfflineAttemptSync(BaseModel):
    shift_id: Optional[int]=None; dpp_id: Optional[int]=None
    module_id: Optional[int]=None; mock_test_id: Optional[int]=None
    duration_minutes_allotted: int; started_at: datetime; submitted_at: datetime
    answers: List[AnswerSubmit]


# ── Premium content tree ──────────────────────────────────────────────────────
class ModuleOut(BaseModel):
    id: int; name: str; order_index: int; duration_minutes: int; question_count: int=0
    class Config: from_attributes = True

class ChapterOut(BaseModel):
    id: int; name: str; order_index: int; modules: List[ModuleOut]=[]
    class Config: from_attributes = True

class TestSetOut(BaseModel):
    id: int; name: str; chapters: List[ChapterOut]=[]
    class Config: from_attributes = True

class DppOut(BaseModel):
    id: int; title: str; chapter_name: Optional[str]; order_index: int
    duration_minutes: int; question_count: int=0
    class Config: from_attributes = True

class DppSetOut(BaseModel):
    id: int; name: str; questions_per_dpp: int; dpps: List[DppOut]=[]
    class Config: from_attributes = True

class MockTestOut(BaseModel):
    id: int; title: str; duration_minutes: int; question_count: int=0
    class Config: from_attributes = True

class PremiumSubjectOut(BaseModel):
    id: int; name: SubjectName; is_active: bool
    dpp_sets: List[DppSetOut]=[]; test_sets: List[TestSetOut]=[]
    mock_tests: List[MockTestOut]=[]
    class Config: from_attributes = True

class PremiumTrackOut(BaseModel):
    id: int; name: str; display_name: str; is_active: bool
    subjects: List[PremiumSubjectOut]=[]
    class Config: from_attributes = True


# ── Subscriptions ─────────────────────────────────────────────────────────────
PLAN_PRICES = {
    SubscriptionPlan.INTRO:       80.0,
    SubscriptionPlan.MONTHLY:     80.0,
    SubscriptionPlan.HALF_YEARLY: 399.0,
    SubscriptionPlan.ANNUAL:      750.0,
}
PLAN_MONTHS = {
    SubscriptionPlan.INTRO:        1,
    SubscriptionPlan.MONTHLY:      1,
    SubscriptionPlan.HALF_YEARLY:  6,
    SubscriptionPlan.ANNUAL:      12,
}

class SubscriptionCreate(BaseModel):
    plan: SubscriptionPlan; payment_gateway_ref: Optional[str]=None

class SubscriptionOut(BaseModel):
    id: int; plan: SubscriptionPlan; status: SubscriptionStatus
    price_paid: float; current_period_end: datetime; auto_renew: bool
    class Config: from_attributes = True

class SubscriptionPlanInfo(BaseModel):
    plan: SubscriptionPlan; price: float; months: int; display: str; best_value: bool=False


# ── Leaderboard ───────────────────────────────────────────────────────────────
class LeaderboardRow(BaseModel):
    rank: int; user_id: int; full_name: Optional[str]; email: str
    score: float; max_score: float; percentage: float
    time_taken_sec: int; submitted_at: datetime

class OverallLeaderboardRow(BaseModel):
    rank: int; user_id: int; full_name: Optional[str]; email: str
    composite_score: float; total_tests: int; total_questions: int
    total_dpps: int; streak_days: int; accuracy: float

class DailyLeaderboardRow(BaseModel):
    rank: int; user_id: int; full_name: Optional[str]; email: str
    daily_questions_solved: int; daily_score: float


# ── Camera / Proctoring ───────────────────────────────────────────────────────
class CameraSessionStart(BaseModel):
    attempt_context: str = ""   # e.g. "JEE Main 2024 Jan Shift 1"

class CameraSessionOut(BaseModel):
    id: int; started_at: datetime; snapshot_count: int
    class Config: from_attributes = True


# ── News ──────────────────────────────────────────────────────────────────────
class NewsOut(BaseModel):
    id: int; title: str; body: Optional[str]
    exam_type: Optional[ExamType]; published_at: datetime
    class Config: from_attributes = True

class NewsCreate(BaseModel):
    title: str; body: Optional[str]=None; exam_type: Optional[ExamType]=None


# ── Library ───────────────────────────────────────────────────────────────────
class LibraryItemOut(BaseModel):
    id: int; content_type: str; content_id: int; file_path: str
    downloaded_at: datetime; revoked: bool
    class Config: from_attributes = True
