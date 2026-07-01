"""routers/information.py — Rules, regulations, rating system explanation."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path
from app.config import RATING_TIERS

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def information(request: Request):
    return templates.TemplateResponse("information.html", {
        "request":      request,
        "page":         "information",
        "rating_tiers": RATING_TIERS,
    })