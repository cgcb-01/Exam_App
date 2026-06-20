"""FastAPI entry point — mounts all routers and serves static frontend."""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.models.db import init_db
from backend.routers import (
    auth_router, pyq_router, attempt_router, premium_router,
    subscription_router, leaderboard_router, news_router,
    admin_router, pdf_router, camera_router,
)

app = FastAPI(title="ExamPrep API", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# API routers
app.include_router(auth_router.router)
app.include_router(pyq_router.router)
app.include_router(attempt_router.router)
app.include_router(premium_router.router)
app.include_router(subscription_router.router)
app.include_router(leaderboard_router.router)
app.include_router(news_router.router)
app.include_router(admin_router.router)
app.include_router(pdf_router.router)
app.include_router(camera_router.router)

# Static file uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory="uploads"), name="uploads")

# Serve frontend SPA
app.mount("/assets", StaticFiles(directory="frontend"), name="frontend_assets")

@app.get("/", include_in_schema=False)
@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str = ""):
    index = "frontend/index.html"
    if os.path.exists(index):
        return FileResponse(index)
    return {"status": "API running. Frontend not found."}

@app.on_event("startup")
def startup():
    init_db()
    _seed_if_empty()

def _seed_if_empty():
    from backend.models.db import SessionLocal, Exam
    db = SessionLocal()
    try:
        if db.query(Exam).count() == 0:
            import subprocess, sys
            subprocess.run([sys.executable, "seed_data.py"], check=False)
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
