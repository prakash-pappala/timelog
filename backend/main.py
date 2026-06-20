import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import bcrypt
from jose import jwt, JWTError
from sqlalchemy import create_engine, Column, String, Integer, BigInteger, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./timetrack.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

security = HTTPBearer()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session_", back_populates="owner", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False)
    owner = relationship("User", back_populates="categories")


class Session_(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    start_ms = Column(BigInteger, nullable=False)
    end_ms = Column(BigInteger, nullable=True)
    owner = relationship("User", back_populates="sessions")
    category = relationship("Category")


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Time Log API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(user_id):
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


DEFAULT_CATEGORIES = [
    {"name": "Study", "color": "#534AB7"},
    {"name": "Work", "color": "#0F6E56"},
    {"name": "Classes", "color": "#185FA5"},
    {"name": "Research", "color": "#993C1D"},
]


class SignupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class CategoryRequest(BaseModel):
    name: str
    color: Optional[str] = None


class SessionRequest(BaseModel):
    category_id: int
    start_ms: int
    end_ms: int


class StartSessionRequest(BaseModel):
    category_id: int
    start_ms: int


class EndSessionRequest(BaseModel):
    end_ms: int


@app.post("/auth/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(username=payload.username, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    for i, c in enumerate(DEFAULT_CATEGORIES):
        db.add(Category(user_id=user.id, name=c["name"], color=c["color"]))
    db.commit()

    token = create_token(user.id)
    return {"token": token, "username": user.username}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_token(user.id)
    return {"token": token, "username": user.username}


@app.get("/categories")
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cats = db.query(Category).filter(Category.user_id == user.id).all()
    return [{"id": c.id, "name": c.name, "color": c.color} for c in cats]


@app.post("/categories")
def create_category(payload: CategoryRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    palette = ["#534AB7", "#0F6E56", "#185FA5", "#993C1D", "#993556", "#854F0B", "#3B6D11", "#A32D2D"]
    count = db.query(Category).filter(Category.user_id == user.id).count()
    color = payload.color or palette[count % len(palette)]

    cat = Category(user_id=user.id, name=payload.name, color=color)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color}


@app.delete("/categories/{category_id}")
def delete_category(category_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"deleted": category_id}


@app.get("/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(Session_)
        .filter(Session_.user_id == user.id, Session_.end_ms.isnot(None))
        .order_by(Session_.start_ms.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "category_id": s.category_id,
            "category_name": s.category.name if s.category else "Deleted",
            "color": s.category.color if s.category else "#888780",
            "start_ms": s.start_ms,
            "end_ms": s.end_ms,
            "duration_ms": s.end_ms - s.start_ms,
        }
        for s in sessions
    ]


@app.get("/sessions/active")
def get_active_session(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = (
        db.query(Session_)
        .filter(Session_.user_id == user.id, Session_.end_ms.is_(None))
        .order_by(Session_.start_ms.desc())
        .first()
    )
    if not s:
        return None
    return {
        "id": s.id,
        "category_id": s.category_id,
        "category_name": s.category.name if s.category else "Deleted",
        "color": s.category.color if s.category else "#888780",
        "start_ms": s.start_ms,
    }


@app.post("/sessions/start")
def start_session(payload: StartSessionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == payload.category_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    existing_open = db.query(Session_).filter(Session_.user_id == user.id, Session_.end_ms.is_(None)).first()
    if existing_open:
        raise HTTPException(status_code=409, detail="A session is already running")

    s = Session_(user_id=user.id, category_id=payload.category_id, start_ms=payload.start_ms, end_ms=None)
    db.add(s)
    db.commit()
    db.refresh(s)

    return {
        "id": s.id,
        "category_id": s.category_id,
        "category_name": cat.name,
        "color": cat.color,
        "start_ms": s.start_ms,
    }


@app.post("/sessions/{session_id}/end")
def end_session_endpoint(session_id: int, payload: EndSessionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Session_).filter(Session_.id == session_id, Session_.user_id == user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s.end_ms is not None:
        raise HTTPException(status_code=400, detail="Session already ended")
    if payload.end_ms <= s.start_ms:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    s.end_ms = payload.end_ms
    db.commit()
    db.refresh(s)

    cat = s.category
    return {
        "id": s.id,
        "category_id": s.category_id,
        "category_name": cat.name if cat else "Deleted",
        "color": cat.color if cat else "#888780",
        "start_ms": s.start_ms,
        "end_ms": s.end_ms,
        "duration_ms": s.end_ms - s.start_ms,
    }


@app.post("/sessions")
def create_session(payload: SessionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == payload.category_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.end_ms <= payload.start_ms:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    s = Session_(
        user_id=user.id,
        category_id=payload.category_id,
        start_ms=payload.start_ms,
        end_ms=payload.end_ms,
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    return {
        "id": s.id,
        "category_id": s.category_id,
        "category_name": cat.name,
        "color": cat.color,
        "start_ms": s.start_ms,
        "end_ms": s.end_ms,
        "duration_ms": s.end_ms - s.start_ms,
    }


@app.delete("/sessions/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Session_).filter(Session_.id == session_id, Session_.user_id == user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(s)
    db.commit()
    return {"deleted": session_id}


@app.get("/")
def root():
    return {"status": "ok", "service": "Time Log API"}
