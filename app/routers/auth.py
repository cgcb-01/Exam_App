from datetime import datetime
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path

from app.database import get_db
from app.models.user import User, UserProfile
from app.services.auth_utils import (
    hash_password, verify_password,
    create_access_token, set_auth_cookie, clear_auth_cookie,
    get_current_user,
)
from app.config import CLASS_OPTIONS, STREAM_OPTIONS
import shortuuid

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {
        "request": request,
        "page": "login",
        "error": None,
    })

@router.post("/login")
async def login(
    request: Request,
    email:    str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email.lower().strip()).first()
    if not user or not verify_password(password, user.password_hash):
        return templates.TemplateResponse("login.html", {
            "request": request,
            "page": "login",
            "error": "Invalid email or password.",
        }, status_code=401)

    if not user.is_active:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "page": "login",
            "error": "Account is deactivated. Contact support.",
        }, status_code=403)

    user.last_login = datetime.utcnow()
    if user.profile:
        user.profile.is_online = True
    db.commit()

    token = create_access_token({"sub": user.id, "admin": user.is_admin})
    response = RedirectResponse(url="/", status_code=302)
    set_auth_cookie(response, token)
    return response

@router.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    return templates.TemplateResponse("login.html", {
        "request": request,
        "page": "signup",
        "class_options":  CLASS_OPTIONS,
        "stream_options": STREAM_OPTIONS,
        "error": None,
    })

@router.post("/signup")
async def signup(
    request: Request,
    name:         str = Form(...),
    email:        str = Form(...),
    password:     str = Form(...),
    school_name:  str = Form(""),
    state:        str = Form(""),
    country:      str = Form("India"),
    student_class:str = Form("Class 11"),
    stream:       str = Form("JEE"),
    db: Session = Depends(get_db),
):
    email = email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        return templates.TemplateResponse("login.html", {
            "request": request,
            "page": "signup",
            "class_options":  CLASS_OPTIONS,
            "stream_options": STREAM_OPTIONS,
            "error": "Email already registered.",
        }, status_code=400)

    if len(password) < 8:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "page": "signup",
            "class_options":  CLASS_OPTIONS,
            "stream_options": STREAM_OPTIONS,
            "error": "Password must be at least 8 characters.",
        }, status_code=400)

    user = User(
        email         = email,
        password_hash = hash_password(password),
    )
    db.add(user)
    db.flush()

    profile = UserProfile(
        user_id       = user.id,
        name          = name.strip(),
        school_name   = school_name.strip() or None,
        state         = state.strip() or None,
        country       = country.strip() or "India",
        student_class = student_class if student_class in CLASS_OPTIONS else "Class 11",
        stream        = stream if stream in STREAM_OPTIONS else "JEE",
        rating        = 0,
    )
    db.add(profile)
    db.commit()

    token = create_access_token({"sub": user.id, "admin": False})
    response = RedirectResponse(url="/dashboard", status_code=302)
    set_auth_cookie(response, token)
    return response

@router.post("/logout")
@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/auth/login", status_code=302)
    clear_auth_cookie(response)
    return response

@router.post("/update-profile")
async def update_profile(
    request: Request,
    name:         str = Form(...),
    school_name:  str = Form(""),
    state:        str = Form(""),
    country:      str = Form("India"),
    student_class:str = Form("Class 11"),
    stream:       str = Form("JEE"),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    profile = user.profile
    if not profile:
        raise HTTPException(404, "Profile not found")

    profile.name          = name.strip()
    profile.school_name   = school_name.strip() or None
    profile.state         = state.strip() or None
    profile.country       = country.strip() or "India"
    profile.student_class = student_class if student_class in CLASS_OPTIONS else profile.student_class
    profile.stream        = stream if stream in STREAM_OPTIONS else profile.stream
    db.commit()

    return RedirectResponse(url="/dashboard", status_code=302)
