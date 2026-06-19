from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.models.db import get_db, User
from backend import schemas
from backend.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, user_has_active_premium
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    user_out = schemas.UserOut.model_validate(user)
    user_out.is_premium = False
    return schemas.Token(access_token=token, user=user_out)


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({"sub": str(user.id)})
    user_out = schemas.UserOut.model_validate(user)
    user_out.is_premium = user_has_active_premium(user, db)
    return schemas.Token(access_token=token, user=user_out)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_out = schemas.UserOut.model_validate(current_user)
    user_out.is_premium = user_has_active_premium(current_user, db)
    return user_out