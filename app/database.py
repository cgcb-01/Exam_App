"""
database.py — SQLAlchemy engine, session factory, and Base.
Supports both SQLite (dev) and PostgreSQL (prod) via DATABASE_URL.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
from app.config import settings


# ── Engine ───────────────────────────────────────────────────────
def _make_engine():
    url = settings.database_url
    if settings.is_sqlite:
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=settings.debug,
        )
        # Enable WAL mode for SQLite concurrency
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        return engine
    else:
        return create_engine(
            url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            echo=settings.debug,
        )


engine = _make_engine()

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


# ── Declarative Base ─────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ────────────────────────────────────────────
def get_db():
    """Yield a DB session, always closing after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Import all models then create tables."""
    from app.models import ( 
        user, exam, submission, content, contest, library, misc
    )
    Base.metadata.create_all(bind=engine)
