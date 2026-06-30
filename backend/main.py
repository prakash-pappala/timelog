import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import bcrypt
from jose import jwt, JWTError
from sqlalchemy import create_engine, Column, String, Integer, BigInteger, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from sqlalchemy.sql import func

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./timetrack.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://timelog-eight.vercel.app")
PASSWORD_RESET_EXPIRE_MINUTES = 30

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

security = HTTPBearer()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session_", back_populates="owner", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="owner", cascade="all, delete-orphan")
    todos = relationship("TodoItem", back_populates="owner", cascade="all, delete-orphan")


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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="sessions")
    category = relationship("Category")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(String, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    owner = relationship("User", back_populates="notes")


class TodoItem(Base):
    __tablename__ = "todos"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(String, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    done = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="todos")


Base.metadata.create_all(bind=engine)

# Lightweight migration: add columns that create_all() won't add to an already-existing table.
with engine.connect() as conn:
    from sqlalchemy import text
    is_pg = "postgresql" in DATABASE_URL
    if is_pg:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR"))
        conn.execute(text("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email); END IF; END $$;"))
        conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()"))
        conn.commit()

app = FastAPI(title="TimeBook API")

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


def send_reset_email(to_email, username, reset_token):
    if not RESEND_API_KEY:
        # No email service configured — fail quietly on the server side rather than
        # leaking whether this is a config issue to the caller.
        print(f"RESEND_API_KEY not set — would have emailed reset link to {to_email}")
        return False

    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    html = f"""
    <p>Hi {username},</p>
    <p>You asked to reset your Time Log password. This link is valid for {PASSWORD_RESET_EXPIRE_MINUTES} minutes.</p>
    <p><a href="{reset_link}">Reset your password</a></p>
    <p>If you didn't request this, you can ignore this email.</p>
    """

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Reset your Time Log password",
                "html": html,
            },
            timeout=10,
        )
        return response.status_code in (200, 201)
    except httpx.HTTPError:
        return False


def create_token(user_id):
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
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


def require_admin(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


DEFAULT_CATEGORIES = [
    {"name": "Study", "color": "#534AB7"},
    {"name": "Work", "color": "#0F6E56"},
    {"name": "Classes", "color": "#185FA5"},
    {"name": "Research", "color": "#993C1D"},
]


class SignupRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class CategoryRequest(BaseModel):
    name: str
    color: Optional[str] = None


class SessionRequest(BaseModel):
    category_id: int
    start_ms: int
    end_ms: int


class UpdateSessionRequest(BaseModel):
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
    email = payload.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    existing_email = db.query(User).filter(User.email == email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="An account with that email already exists")

    user = User(username=payload.username, email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    for i, c in enumerate(DEFAULT_CATEGORIES):
        db.add(Category(user_id=user.id, name=c["name"], color=c["color"]))
    db.commit()

    token = create_token(user.id)
    return {"token": token, "username": user.username, "is_admin": user.is_admin}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_token(user.id)
    return {"token": token, "username": user.username, "is_admin": user.is_admin}


@app.post("/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Always return the same response whether or not the email exists,
    # so this endpoint can't be used to discover which emails have accounts.
    generic_response = {"message": "If that email has an account, a reset link has been sent."}

    if not user:
        return generic_response

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)

    reset = PasswordResetToken(user_id=user.id, token=token, expires_at=expires_at)
    db.add(reset)
    db.commit()

    send_reset_email(user.email, user.username, token)
    return generic_response


@app.post("/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password should be at least 6 characters")

    reset = db.query(PasswordResetToken).filter(PasswordResetToken.token == payload.token).first()
    if not reset:
        raise HTTPException(status_code=400, detail="This reset link is invalid")
    if reset.used:
        raise HTTPException(status_code=400, detail="This reset link has already been used")
    if reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset link has expired")

    user = db.query(User).filter(User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    user.password_hash = hash_password(payload.new_password)
    reset.used = True
    db.commit()

    return {"message": "Password updated. You can sign in now."}


@app.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password should be at least 6 characters")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed."}


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


@app.put("/sessions/{session_id}")
def update_session(session_id: int, payload: UpdateSessionRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Session_).filter(Session_.id == session_id, Session_.user_id == user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.end_ms is None:
        raise HTTPException(status_code=400, detail="Cannot edit a session that is still running")

    cat = db.query(Category).filter(Category.id == payload.category_id, Category.user_id == user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.end_ms <= payload.start_ms:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    s.category_id = payload.category_id
    s.start_ms = payload.start_ms
    s.end_ms = payload.end_ms
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


class PromoteAdminRequest(BaseModel):
    username: str
    bootstrap_key: str


@app.post("/admin/bootstrap")
def bootstrap_admin(payload: PromoteAdminRequest, db: Session = Depends(get_db)):
    """
    One-time setup helper: promotes a user to admin if the request includes
    the server's SECRET_KEY. This is only meant to be called once, by you,
    to make your own account an admin. Anyone without the secret key gets rejected.
    """
    if payload.bootstrap_key != SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid bootstrap key")

    target = db.query(User).filter(User.username == payload.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_admin = True
    db.commit()
    return {"username": target.username, "is_admin": True}


@app.get("/admin/stats")
def admin_stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Aggregate, anonymized usage stats only. No individual session content,
    no per-user breakdowns by name, no timestamps tied to a specific student.
    """
    total_users = db.query(User).count()

    all_sessions = db.query(Session_).filter(Session_.end_ms.isnot(None)).all()
    total_sessions = len(all_sessions)
    total_ms = sum((s.end_ms - s.start_ms) for s in all_sessions)

    # Signups over the last 30 days, grouped by day
    signup_rows = db.query(User.created_at).all()
    signup_counts = {}
    for (created_at,) in signup_rows:
        if created_at is None:
            continue
        day_key = created_at.strftime("%Y-%m-%d")
        signup_counts[day_key] = signup_counts.get(day_key, 0) + 1

    # Sessions logged per day, last 30 days, by created_at (when the entry was saved)
    session_rows = db.query(Session_.created_at).filter(Session_.end_ms.isnot(None)).all()
    activity_counts = {}
    for (created_at,) in session_rows:
        if created_at is None:
            continue
        day_key = created_at.strftime("%Y-%m-%d")
        activity_counts[day_key] = activity_counts.get(day_key, 0) + 1

    # Category popularity across ALL users combined, by category name only (no user attribution)
    category_totals = {}
    for s in all_sessions:
        name = s.category.name if s.category else "Deleted"
        duration = s.end_ms - s.start_ms
        if name not in category_totals:
            category_totals[name] = {"sessions": 0, "total_ms": 0}
        category_totals[name]["sessions"] += 1
        category_totals[name]["total_ms"] += duration

    # Users active in the last 7 days (had at least one session), count only — not who
    seven_days_ago_ms = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp() * 1000)
    active_user_ids = set(
        s.user_id for s in all_sessions if s.start_ms >= seven_days_ago_ms
    )

    return {
        "total_users": total_users,
        "active_users_last_7_days": len(active_user_ids),
        "total_sessions": total_sessions,
        "total_hours_logged": round(total_ms / 3600000, 1),
        "average_session_minutes": round((total_ms / total_sessions) / 60000, 1) if total_sessions else 0,
        "signups_by_day": signup_counts,
        "sessions_logged_by_day": activity_counts,
        "category_totals": {
            name: {
                "sessions": v["sessions"],
                "hours": round(v["total_ms"] / 3600000, 1),
            }
            for name, v in sorted(category_totals.items(), key=lambda kv: kv[1]["total_ms"], reverse=True)
        },
    }


@app.get("/admin/users")
def admin_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Per-user list for troubleshooting: who exists, when they signed up,
    how many sessions they've logged, and when they were last active.
    Deliberately excludes any actual session content (what they tracked,
    at what time, for how long on a given day).
    """
    users = db.query(User).order_by(User.created_at.desc()).all()

    result = []
    for u in users:
        ended_sessions = [s for s in u.sessions if s.end_ms is not None]
        session_count = len(ended_sessions)
        last_active_ms = max((s.start_ms for s in ended_sessions), default=None)

        result.append({
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "signed_up_at": u.created_at.isoformat() if u.created_at else None,
            "session_count": session_count,
            "last_active_ms": last_active_ms,
        })

    return result


@app.get("/")
def root():
    return {"status": "ok", "service": "TimeBook API"}


# ─── Notes ────────────────────────────────────────────────────────────────────

class NoteRequest(BaseModel):
    content: str
    date: str  # YYYY-MM-DD


@app.get("/notes")
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notes = db.query(Note).filter(Note.user_id == user.id).order_by(Note.date.desc(), Note.created_at.desc()).all()
    return [{"id": n.id, "content": n.content, "date": n.date, "created_at": n.created_at.isoformat() if n.created_at else None} for n in notes]


@app.post("/notes")
def create_note(payload: NoteRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = Note(user_id=user.id, content=payload.content.strip(), date=payload.date)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "content": note.content, "date": note.date, "created_at": note.created_at.isoformat() if note.created_at else None}


@app.put("/notes/{note_id}")
def update_note(note_id: int, payload: NoteRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.content = payload.content.strip()
    db.commit()
    db.refresh(note)
    return {"id": note.id, "content": note.content, "date": note.date, "created_at": note.created_at.isoformat() if note.created_at else None}


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"deleted": note_id}


# ─── Todos ────────────────────────────────────────────────────────────────────

class TodoRequest(BaseModel):
    text: str
    date: str  # YYYY-MM-DD


class TodoUpdateRequest(BaseModel):
    text: Optional[str] = None
    done: Optional[bool] = None


@app.get("/todos")
def list_todos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todos = db.query(TodoItem).filter(TodoItem.user_id == user.id).order_by(TodoItem.date.desc(), TodoItem.created_at.asc()).all()
    return [{"id": t.id, "text": t.text, "date": t.date, "done": t.done, "created_at": t.created_at.isoformat() if t.created_at else None} for t in todos]


@app.post("/todos")
def create_todo(payload: TodoRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = TodoItem(user_id=user.id, text=payload.text.strip(), date=payload.date, done=False)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return {"id": todo.id, "text": todo.text, "date": todo.date, "done": todo.done, "created_at": todo.created_at.isoformat() if todo.created_at else None}


@app.patch("/todos/{todo_id}")
def update_todo(todo_id: int, payload: TodoUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    if payload.text is not None:
        todo.text = payload.text.strip()
    if payload.done is not None:
        todo.done = payload.done
    db.commit()
    db.refresh(todo)
    return {"id": todo.id, "text": todo.text, "date": todo.date, "done": todo.done, "created_at": todo.created_at.isoformat() if todo.created_at else None}


@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id, TodoItem.user_id == user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
    return {"deleted": todo_id}

