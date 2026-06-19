"""
Database models for the Exam Prep App.
All enums, ORM models, engine, session helpers in one file.
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, ForeignKey, Text,
    DateTime, Enum, create_engine, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship, declarative_base, sessionmaker
from datetime import datetime
import enum

Base = declarative_base()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ExamType(str, enum.Enum):
    JEE_MAIN     = "JEE_MAIN"
    JEE_ADVANCED = "JEE_ADVANCED"
    NEET         = "NEET"

class SubjectName(str, enum.Enum):
    PHYSICS   = "PHYSICS"
    CHEMISTRY = "CHEMISTRY"
    MATHS     = "MATHS"
    BIOLOGY   = "BIOLOGY"

class QuestionType(str, enum.Enum):
    MCQ_SINGLE   = "MCQ_SINGLE"
    MCQ_MULTIPLE = "MCQ_MULTIPLE"
    NUMERICAL    = "NUMERICAL"
    MATRIX_MATCH = "MATRIX_MATCH"

class ContentFormat(str, enum.Enum):
    TEXT  = "TEXT"
    IMAGE = "IMAGE"
    PDF   = "PDF"

class AttemptStatus(str, enum.Enum):
    IN_PROGRESS    = "IN_PROGRESS"
    SUBMITTED      = "SUBMITTED"
    AUTO_SUBMITTED = "AUTO_SUBMITTED"

class AnswerStatus(str, enum.Enum):
    NOT_VISITED         = "NOT_VISITED"
    NOT_ANSWERED        = "NOT_ANSWERED"
    ANSWERED            = "ANSWERED"
    MARKED_FOR_REVIEW   = "MARKED_FOR_REVIEW"
    ANSWERED_AND_MARKED = "ANSWERED_AND_MARKED"

class SubscriptionPlan(str, enum.Enum):
    MONTHLY      = "MONTHLY"       # Rs 80 / month
    INTRO        = "INTRO"         # Rs 80 / month for first 3 months
    HALF_YEARLY  = "HALF_YEARLY"   # Rs 399 / 6 months
    ANNUAL       = "ANNUAL"        # Rs 750 / year

class SubscriptionStatus(str, enum.Enum):
    ACTIVE    = "ACTIVE"
    EXPIRED   = "EXPIRED"
    CANCELLED = "CANCELLED"

class LeaderboardType(str, enum.Enum):
    PER_TEST  = "PER_TEST"   # specific shift/dpp/module/mock
    OVERALL   = "OVERALL"    # all-time composite score
    DAILY     = "DAILY"      # questions solved today


# ---------------------------------------------------------------------------
# PYQ hierarchy: Exam -> Year -> Shift -> Question
# ---------------------------------------------------------------------------

class Exam(Base):
    __tablename__ = "exams"
    id           = Column(Integer, primary_key=True)
    type         = Column(Enum(ExamType), unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    years        = relationship("Year", back_populates="exam", cascade="all, delete-orphan")

class Year(Base):
    __tablename__ = "years"
    id      = Column(Integer, primary_key=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    year    = Column(Integer, nullable=False)
    exam    = relationship("Exam", back_populates="years")
    shifts  = relationship("Shift", back_populates="year", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("exam_id", "year"),)

class Shift(Base):
    __tablename__ = "shifts"
    id        = Column(Integer, primary_key=True)
    year_id   = Column(Integer, ForeignKey("years.id"), nullable=False)
    label     = Column(String, nullable=False)
    exam_date = Column(String, nullable=True)
    year      = relationship("Year", back_populates="shifts")
    questions = relationship("Question", back_populates="shift", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"
    id             = Column(Integer, primary_key=True)

    # Parent container — exactly one is non-null
    shift_id       = Column(Integer, ForeignKey("shifts.id"),     nullable=True)
    module_id      = Column(Integer, ForeignKey("modules.id"),    nullable=True)
    dpp_id         = Column(Integer, ForeignKey("dpps.id"),       nullable=True)
    mock_test_id   = Column(Integer, ForeignKey("mock_tests.id"), nullable=True)

    subject         = Column(Enum(SubjectName), nullable=False)
    question_type   = Column(Enum(QuestionType), nullable=False, default=QuestionType.MCQ_SINGLE)
    question_number = Column(Integer, nullable=False, default=1)

    question_format     = Column(Enum(ContentFormat), default=ContentFormat.TEXT)
    question_text       = Column(Text, nullable=True)
    question_image_path = Column(String, nullable=True)
    question_pdf_path   = Column(String, nullable=True)

    option_a           = Column(Text, nullable=True)
    option_b           = Column(Text, nullable=True)
    option_c           = Column(Text, nullable=True)
    option_d           = Column(Text, nullable=True)
    options_image_path = Column(String, nullable=True)

    correct_answer  = Column(String, nullable=False)
    marks_correct   = Column(Float, default=4.0)
    marks_incorrect = Column(Float, default=-1.0)

    solution_format     = Column(Enum(ContentFormat), default=ContentFormat.TEXT)
    solution_text       = Column(Text, nullable=True)
    solution_image_path = Column(String, nullable=True)
    solution_pdf_path   = Column(String, nullable=True)

    topic = Column(String, nullable=True)

    shift     = relationship("Shift",    back_populates="questions")
    module    = relationship("Module",   back_populates="questions")
    dpp       = relationship("Dpp",      back_populates="questions")
    mock_test = relationship("MockTest", back_populates="questions")


# ---------------------------------------------------------------------------
# Premium hierarchy
# ---------------------------------------------------------------------------

class PremiumExamTrack(Base):
    __tablename__ = "premium_tracks"
    id           = Column(Integer, primary_key=True)
    name         = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    is_active    = Column(Boolean, default=True)
    subjects     = relationship("PremiumSubject", back_populates="track", cascade="all, delete-orphan")

class PremiumSubject(Base):
    __tablename__  = "premium_subjects"
    id        = Column(Integer, primary_key=True)
    track_id  = Column(Integer, ForeignKey("premium_tracks.id"), nullable=False)
    name      = Column(Enum(SubjectName), nullable=False)
    is_active = Column(Boolean, default=True)
    track      = relationship("PremiumExamTrack", back_populates="subjects")
    dpp_sets   = relationship("DppSet",   back_populates="subject", cascade="all, delete-orphan")
    test_sets  = relationship("TestSet",  back_populates="subject", cascade="all, delete-orphan")
    mock_tests = relationship("MockTest", back_populates="subject", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("track_id", "name"),)

class DppSet(Base):
    __tablename__      = "dpp_sets"
    id                 = Column(Integer, primary_key=True)
    subject_id         = Column(Integer, ForeignKey("premium_subjects.id"), nullable=False)
    name               = Column(String, nullable=False)
    questions_per_dpp  = Column(Integer, default=10)
    subject = relationship("PremiumSubject", back_populates="dpp_sets")
    dpps    = relationship("Dpp", back_populates="dpp_set", cascade="all, delete-orphan")

class Dpp(Base):
    __tablename__      = "dpps"
    id                 = Column(Integer, primary_key=True)
    dpp_set_id         = Column(Integer, ForeignKey("dpp_sets.id"), nullable=False)
    title              = Column(String, nullable=False)
    chapter_name       = Column(String, nullable=True)
    order_index        = Column(Integer, default=1)
    duration_minutes   = Column(Integer, default=30)
    dpp_set   = relationship("DppSet", back_populates="dpps")
    questions = relationship("Question", back_populates="dpp", cascade="all, delete-orphan")

class TestSet(Base):
    __tablename__ = "test_sets"
    id         = Column(Integer, primary_key=True)
    subject_id = Column(Integer, ForeignKey("premium_subjects.id"), nullable=False)
    name       = Column(String, nullable=False)
    subject    = relationship("PremiumSubject", back_populates="test_sets")
    chapters   = relationship("Chapter", back_populates="test_set", cascade="all, delete-orphan")

class Chapter(Base):
    __tablename__ = "chapters"
    id          = Column(Integer, primary_key=True)
    test_set_id = Column(Integer, ForeignKey("test_sets.id"), nullable=False)
    name        = Column(String, nullable=False)
    order_index = Column(Integer, default=1)
    test_set = relationship("TestSet", back_populates="chapters")
    modules  = relationship("Module", back_populates="chapter", cascade="all, delete-orphan")

class Module(Base):
    __tablename__    = "modules"
    id               = Column(Integer, primary_key=True)
    chapter_id       = Column(Integer, ForeignKey("chapters.id"), nullable=False)
    name             = Column(String, nullable=False)
    order_index      = Column(Integer, default=1)
    duration_minutes = Column(Integer, default=30)
    chapter   = relationship("Chapter", back_populates="modules")
    questions = relationship("Question", back_populates="module", cascade="all, delete-orphan")

class MockTest(Base):
    __tablename__    = "mock_tests"
    id               = Column(Integer, primary_key=True)
    subject_id       = Column(Integer, ForeignKey("premium_subjects.id"), nullable=False)
    title            = Column(String, nullable=False)
    duration_minutes = Column(Integer, default=180)
    order_index      = Column(Integer, default=1)
    subject   = relationship("PremiumSubject", back_populates="mock_tests")
    questions = relationship("Question", back_populates="mock_test", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Users, Subscriptions, Attempts, Library, News
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__     = "users"
    id                = Column(Integer, primary_key=True)
    email             = Column(String, unique=True, nullable=False)
    full_name         = Column(String, nullable=True)
    hashed_password   = Column(String, nullable=False)
    is_admin          = Column(Boolean, default=False)
    created_at        = Column(DateTime, default=datetime.utcnow)
    subscriptions     = relationship("Subscription",  back_populates="user", cascade="all, delete-orphan")
    attempts          = relationship("Attempt",        back_populates="user", cascade="all, delete-orphan")
    library_items     = relationship("LibraryItem",    back_populates="user", cascade="all, delete-orphan")
    leaderboard_stats = relationship("LeaderboardStat", back_populates="user", cascade="all, delete-orphan")

# Pricing table (kept in code for quick reference, enforced in subscription_router)
# MONTHLY     : Rs  80 / month   (regular)
# INTRO       : Rs  80 / month   (first 3 months only, auto-upgrades to MONTHLY)
# HALF_YEARLY : Rs 399 / 6 months
# ANNUAL      : Rs 750 / year

class Subscription(Base):
    __tablename__              = "subscriptions"
    id                         = Column(Integer, primary_key=True)
    user_id                    = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan                       = Column(Enum(SubscriptionPlan), nullable=False)
    status                     = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE)
    price_paid                 = Column(Float, nullable=False)
    months_billed_at_intro_rate= Column(Integer, default=0)
    start_date                 = Column(DateTime, default=datetime.utcnow)
    current_period_end         = Column(DateTime, nullable=False)
    auto_renew                 = Column(Boolean, default=True)
    payment_gateway_ref        = Column(String, nullable=True)
    user = relationship("User", back_populates="subscriptions")

class Attempt(Base):
    __tablename__             = "attempts"
    id                        = Column(Integer, primary_key=True)
    user_id                   = Column(Integer, ForeignKey("users.id"), nullable=False)
    shift_id                  = Column(Integer, ForeignKey("shifts.id"),     nullable=True)
    dpp_id                    = Column(Integer, ForeignKey("dpps.id"),       nullable=True)
    module_id                 = Column(Integer, ForeignKey("modules.id"),    nullable=True)
    mock_test_id              = Column(Integer, ForeignKey("mock_tests.id"), nullable=True)
    is_offline_attempt        = Column(Boolean, default=False)
    duration_minutes_allotted = Column(Integer, nullable=False)
    started_at                = Column(DateTime, default=datetime.utcnow)
    submitted_at              = Column(DateTime, nullable=True)
    status                    = Column(Enum(AttemptStatus), default=AttemptStatus.IN_PROGRESS)
    total_questions           = Column(Integer, default=0)
    attempted_count           = Column(Integer, default=0)
    correct_count             = Column(Integer, default=0)
    incorrect_count           = Column(Integer, default=0)
    score                     = Column(Float, default=0.0)
    camera_session_id         = Column(Integer, ForeignKey("camera_sessions.id"), nullable=True)
    user     = relationship("User",          back_populates="attempts")
    answers  = relationship("AttemptAnswer", back_populates="attempt", cascade="all, delete-orphan")
    camera   = relationship("CameraSession", foreign_keys=[camera_session_id])

class AttemptAnswer(Base):
    __tablename__       = "attempt_answers"
    id                  = Column(Integer, primary_key=True)
    attempt_id          = Column(Integer, ForeignKey("attempts.id"),   nullable=False)
    question_id         = Column(Integer, ForeignKey("questions.id"),  nullable=False)
    selected_answer     = Column(String, nullable=True)
    status              = Column(Enum(AnswerStatus), default=AnswerStatus.NOT_VISITED)
    time_spent_seconds  = Column(Integer, default=0)
    is_correct          = Column(Boolean, nullable=True)
    attempt  = relationship("Attempt",  back_populates="answers")
    question = relationship("Question")

class CameraSession(Base):
    """Optional webcam proctoring session metadata (snapshots stored as files)."""
    __tablename__      = "camera_sessions"
    id                 = Column(Integer, primary_key=True)
    user_id            = Column(Integer, ForeignKey("users.id"), nullable=False)
    attempt_id_ref     = Column(Integer, nullable=True)   # set after attempt creation
    started_at         = Column(DateTime, default=datetime.utcnow)
    ended_at           = Column(DateTime, nullable=True)
    snapshot_dir       = Column(String, nullable=True)    # server path to snapshot folder
    snapshot_count     = Column(Integer, default=0)
    flags              = Column(JSON, nullable=True)       # list of flagged timestamps/reasons

class LibraryItem(Base):
    __tablename__   = "library_items"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    content_type    = Column(String, nullable=False)
    content_id      = Column(Integer, nullable=False)
    file_path       = Column(String, nullable=False)
    downloaded_at   = Column(DateTime, default=datetime.utcnow)
    revoked         = Column(Boolean, default=False)
    user = relationship("User", back_populates="library_items")

class NewsItem(Base):
    __tablename__  = "news_items"
    id             = Column(Integer, primary_key=True)
    title          = Column(String, nullable=False)
    body           = Column(Text, nullable=True)
    exam_type      = Column(Enum(ExamType), nullable=True)
    published_at   = Column(DateTime, default=datetime.utcnow)
    is_published   = Column(Boolean, default=True)


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

class LeaderboardEntry(Base):
    """
    One row per (user, test-source) combination for PER_TEST leaderboard.
    Keyed by content_type ("SHIFT","DPP","MODULE","MOCK") + content_id.
    Only online attempts (is_offline_attempt=False) are recorded here.
    """
    __tablename__  = "leaderboard_entries"
    id             = Column(Integer, primary_key=True)
    content_type   = Column(String,  nullable=False)   # "SHIFT"|"DPP"|"MODULE"|"MOCK"
    content_id     = Column(Integer, nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    attempt_id     = Column(Integer, ForeignKey("attempts.id"), nullable=False)
    score          = Column(Float,   nullable=False)
    max_score      = Column(Float,   nullable=False)
    percentage     = Column(Float,   nullable=False)
    time_taken_sec = Column(Integer, nullable=False)
    submitted_at   = Column(DateTime, default=datetime.utcnow)
    rank           = Column(Integer, nullable=True)     # pre-computed rank within this test
    user    = relationship("User")
    attempt = relationship("Attempt")
    __table_args__ = (UniqueConstraint("content_type", "content_id", "user_id"),)

class LeaderboardStat(Base):
    """
    Aggregated stats per user — the source for OVERALL and DAILY leaderboards.
    Updated after every online attempt submission.
    """
    __tablename__          = "leaderboard_stats"
    id                     = Column(Integer, primary_key=True)
    user_id                = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # cumulative
    total_tests_taken      = Column(Integer, default=0)
    total_questions_solved = Column(Integer, default=0)
    total_dpps_completed   = Column(Integer, default=0)
    total_score            = Column(Float,   default=0.0)
    total_max_score        = Column(Float,   default=0.0)

    # streaks / consistency (updated daily)
    current_streak_days    = Column(Integer, default=0)
    max_streak_days        = Column(Integer, default=0)
    last_active_date       = Column(String,  nullable=True)   # "YYYY-MM-DD"

    # composite leaderboard score (weighted):
    #   base_score + streak_bonus + dpp_bonus + consistency_bonus
    composite_score        = Column(Float,   default=0.0)

    # daily snapshot (reset at midnight IST by a cron / background task)
    daily_questions_solved = Column(Integer, default=0)
    daily_score            = Column(Float,   default=0.0)
    daily_date             = Column(String,  nullable=True)   # "YYYY-MM-DD"

    user = relationship("User", back_populates="leaderboard_stats")


# ---------------------------------------------------------------------------
# Engine / session helpers
# ---------------------------------------------------------------------------

DATABASE_URL = "sqlite:///./data/examapp.db"
engine       = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    import os
    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

