"""
config.py — Central configuration loaded from .env
All other modules import `settings` from here.
"""
from functools import lru_cache
from pydantic import field_validator
try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    HAS_PYDANTIC_SETTINGS = True
except ImportError:
    from pydantic import BaseSettings
    HAS_PYDANTIC_SETTINGS = False


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────
    app_secret_key: str = "dev_secret_change_me"
    app_name: str = "AIC Prep Platform"
    debug: bool = True
    base_url: str = "http://localhost:8000"

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "sqlite:///./aic_prep.db"

    # ── JWT ──────────────────────────────────────────────────────
    jwt_secret_key: str = "jwt_secret_change_me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 days

    # ── Backblaze B2 ─────────────────────────────────────────────
    b2_application_key_id: str = ""
    b2_application_key: str = ""
    b2_bucket_name: str = "aic-prep-bucket"
    b2_endpoint_url: str = "https://s3.us-west-004.backblazeb2.com"

    # ── Premium ──────────────────────────────────────────────────
    premium_cleanup_hour: int = 3

    # ── Admin Bootstrap ──────────────────────────────────────────
    admin_bootstrap_email: str = "admin@aicprep.com"
    admin_bootstrap_password: str = "Admin@123"

    # ── Rating Engine ────────────────────────────────────────────
    rating_base: int = 1500
    rating_k_factor_contest: int = 32
    rating_k_factor_sheet: int = 4

    # ── File Limits ──────────────────────────────────────────────
    max_downloads_per_day: int = 3
    max_library_offline_mb: int = 500

    # ── Exam ─────────────────────────────────────────────────────
    default_exam_duration_minutes: int = 180

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    # ── Configuration ────────────────────────────────────────────
    # Use ONLY this for Pydantic v2 with pydantic-settings
    if HAS_PYDANTIC_SETTINGS:
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            case_sensitive=False,
            extra="ignore",
        )
    else:
        # Fallback for Pydantic v1
        class Config:
            env_file = ".env"
            case_sensitive = False
            extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

# ── Rating tier thresholds ───────────────────────────────────────
RATING_TIERS = [
    ("Unrated",     0,    "#9E9E9E"),
    ("Novice",      800,  "#78909C"),
    ("Apprentice",  1000, "#26A69A"),
    ("Scholar",     1200, "#42A5F5"),
    ("Adept",       1400, "#7E57C2"),
    ("Expert",      1600, "#EF5350"),
    ("Master",      1800, "#FF7043"),
    ("Grandmaster", 2000, "#FFD600"),
    ("Legend",      2400, "#E040FB"),
]


def get_rating_tier(rating: int) -> tuple:
    tier = ("Unrated", "#9E9E9E")
    for name, min_r, color in RATING_TIERS:
        if rating >= min_r:
            tier = (name, color)
    return tier


CLASS_OPTIONS   = ["Class 11", "Class 12", "Dropper"]
STREAM_OPTIONS  = ["JEE", "NEET"]
SUBJECTS_JEE    = ["Physics", "Chemistry", "Mathematics"]
SUBJECTS_NEET   = ["Physics", "Chemistry", "Biology"]

QUESTION_TYPES  = ["MCQ", "MULTI", "NUMERICAL", "INTEGER", "MATCH"]

DEFAULT_MARKING = {
    "MCQ":       {"correct": 4,  "wrong": -1, "unattempted": 0},
    "MULTI":     {"correct": 4,  "wrong": -2, "partial": 1,  "unattempted": 0},
    "NUMERICAL": {"correct": 4,  "wrong": 0,  "unattempted": 0},
    "INTEGER":   {"correct": 3,  "wrong": 0,  "unattempted": 0},
    "MATCH":     {"correct": 8,  "wrong": -2, "unattempted": 0},
}