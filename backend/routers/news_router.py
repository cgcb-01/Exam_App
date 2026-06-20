from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.models.db import get_db, NewsItem
from backend import schemas
from backend.auth import require_admin, User

router = APIRouter(prefix="/api/news", tags=["news"])

@router.get("/", response_model=list[schemas.NewsOut])
def list_news(limit: int = Query(20, le=100), db: Session = Depends(get_db)):
    items = (db.query(NewsItem).filter(NewsItem.is_published == True)
             .order_by(NewsItem.published_at.desc()).limit(limit).all())
    return items

@router.post("/", response_model=schemas.NewsOut)
def create_news(payload: schemas.NewsCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    item = NewsItem(title=payload.title, body=payload.body, exam_type=payload.exam_type)
    db.add(item); db.commit(); db.refresh(item)
    return item
