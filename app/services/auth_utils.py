from datetime import datetime, timedelta
from typing import Optional
import hashlib

from fastapi import Request, HTTPException, Cookie
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _truncate_password(plain: str) -> bytes:
    return plain.encode('utf-8')[:72]

def hash_password(plain: str) -> str:
    return pwd_context.hash(_truncate_password(plain))

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_truncate_password(plain), hashed)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

COOKIE_NAME = "aic_token"


def set_auth_cookie(response, token: str):
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=not settings.debug,   
        max_age=settings.jwt_expire_minutes * 60,
    )


def clear_auth_cookie(response):
    response.delete_cookie(key=COOKIE_NAME)

def get_current_user_id(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return user_id


def get_current_user(request: Request, db: Session):
    from app.models.user import User
    user_id = get_current_user_id(request)
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(request: Request, db: Session):
    user = get_current_user(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
