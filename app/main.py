"""
main.py — FastAPI application entry point.
Mounts all routers, static files, Jinja2 templates, and startup tasks.
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.database import init_db

logger = logging.getLogger("aic_prep")
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO)

# ── Paths ─────────────────────────────────────────────────────────
BASE_DIR  = Path(__file__).parent
TEMPLATES = BASE_DIR / "templates"
STATIC    = BASE_DIR / "static"


# ── Lifespan (startup / shutdown) ────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AIC Prep Platform...")
    # 1. Create DB tables
    init_db()
    # 2. Bootstrap admin account
    _bootstrap_admin()
    # 3. Start background scheduler
    _start_scheduler()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down...")


def _bootstrap_admin():
    """Create the default admin user if none exists."""
    from app.database import SessionLocal
    from app.models.user import User, UserProfile
    from app.services.auth_utils import hash_password
    import shortuuid

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.is_admin == True).first()
        if not existing:
            admin = User(
                email         = settings.admin_bootstrap_email,
                password_hash = hash_password(settings.admin_bootstrap_password),
                is_admin      = True,
                is_premium    = True,
                roll_no       = "AICADMIN001",
            )
            db.add(admin)
            db.flush()
            profile = UserProfile(
                user_id = admin.id,
                name    = "Platform Admin",
                country = "India",
            )
            db.add(profile)
            db.commit()
            logger.info(f"Admin bootstrapped: {settings.admin_bootstrap_email}")
    finally:
        db.close()


def _start_scheduler():
    from app.workers.scheduled_jobs import start_scheduler
    start_scheduler()


# ── App instance ─────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

# ── Static files ─────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")

# ── Templates ────────────────────────────────────────────────────
templates = Jinja2Templates(directory=str(TEMPLATES))

# ── Routers ──────────────────────────────────────────────────────
from app.routers import (
    auth, home, dashboard, library, exams,
    dpp, chapterwise, pyq, paic_baic, syllabus,
    calendar_routes, todo, leaderboard, admin,
    pdf_export, information, proctoring, rating,
)

app.include_router(auth.router,             prefix="/auth",        tags=["auth"])
app.include_router(home.router,             prefix="",             tags=["home"])
app.include_router(dashboard.router,        prefix="/dashboard",   tags=["dashboard"])
app.include_router(library.router,          prefix="/library",     tags=["library"])
app.include_router(exams.router,            prefix="/exams",       tags=["exams"])
app.include_router(dpp.router,              prefix="/dpp",         tags=["dpp"])
app.include_router(chapterwise.router,      prefix="/chapterwise", tags=["chapterwise"])
app.include_router(pyq.router,              prefix="/pyq",         tags=["pyq"])
app.include_router(paic_baic.router,        prefix="/contests",    tags=["contests"])
app.include_router(syllabus.router,         prefix="/syllabus",    tags=["syllabus"])
app.include_router(calendar_routes.router,  prefix="/calendar",    tags=["calendar"])
app.include_router(todo.router,             prefix="/todo",        tags=["todo"])
app.include_router(leaderboard.router,      prefix="/leaderboard", tags=["leaderboard"])
app.include_router(admin.router,            prefix="/admin",       tags=["admin"])
app.include_router(pdf_export.router,       prefix="/pdf",         tags=["pdf"])
app.include_router(information.router,      prefix="/information", tags=["information"])
app.include_router(proctoring.router,       prefix="/proctor",     tags=["proctoring"])
app.include_router(rating.router,           prefix="/rating",      tags=["rating"])


# ── Global exception handlers ────────────────────────────────────
@app.exception_handler(401)
async def unauthorized(request: Request, exc):
    return RedirectResponse(url="/auth/login", status_code=302)


@app.exception_handler(403)
async def forbidden(request: Request, exc):
    return templates.TemplateResponse(
        "error.html", {"request": request, "code": 403, "message": "Access Denied"}, status_code=403
    )


@app.exception_handler(404)
async def not_found(request: Request, exc):
    return templates.TemplateResponse(
        "error.html", {"request": request, "code": 404, "message": "Page Not Found"}, status_code=404
    )