"""routers/todo.py"""
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pathlib import Path
from datetime import date, datetime
from app.database import get_db
from app.services.auth_utils import get_current_user
from app.models.misc import ToDo
from app.services.rating_engine import apply_todo_delta

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).parent.parent / "templates"))


@router.get("/", response_class=HTMLResponse)
async def todo_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    todos = db.query(ToDo).filter(ToDo.user_id == user.id).order_by(ToDo.due_date).all()
    return templates.TemplateResponse("todo.html", {"request": request, "todos": todos, "page": "todo"})


@router.post("/add")
async def add_todo(
    request: Request,
    title:       str  = Form(...),
    description: str  = Form(""),
    due_date:    str  = Form(""),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    todo = ToDo(
        user_id     = user.id,
        title       = title.strip(),
        description = description.strip() or None,
        due_date    = date.fromisoformat(due_date) if due_date else None,
    )
    db.add(todo)
    db.commit()
    return RedirectResponse(url="/todo", status_code=302)


@router.post("/{todo_id}/complete")
async def complete_todo(
    todo_id: str,
    request: Request,
    pct: float = Form(100.0),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    todo = db.query(ToDo).filter(ToDo.id == todo_id, ToDo.user_id == user.id).first()
    if todo:
        todo.is_completed   = True
        todo.completed_at   = datetime.utcnow()
        todo.completion_pct = pct
        apply_todo_delta(db, user.id, pct, todo.title)
    return RedirectResponse(url="/todo", status_code=302)


@router.post("/{todo_id}/delete")
async def delete_todo(todo_id: str, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    db.query(ToDo).filter(ToDo.id == todo_id, ToDo.user_id == user.id).delete()
    db.commit()
    return RedirectResponse(url="/todo", status_code=302)