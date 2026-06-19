# Time Log

A time tracking tool built for students. Start a timer when you begin studying, working, attending class, or doing anything else you want to track. Stop it when you're done. Get a weekly breakdown of where your hours actually went.

Built this after noticing how hard it is to actually know how much time goes into different parts of a week as a grad student — coursework, research, a part-time job, and everything else blur together without something tracking it.

## Why this exists

Most time tracking apps are built for billing hours at a company. This one is built around how a student's week actually looks: classes, study blocks, research, a job, and personal stuff like an instrument or a hobby — all worth tracking separately, none of them fitting neatly into a "project" the way work tools assume.

The categories are not fixed. Add whatever you're tracking — thesis, GRE prep, guitar practice, gym — and it shows up the same way standard categories do, with its own color and its own slice of the weekly report.

## How it works

1. Sign up with a username and password
2. Pick what you're starting from the category list, or add a new one
3. A live timer runs while the session is active
4. Press end when you're done — the session is saved
5. Switch to the weekly report tab for a breakdown by day and by category, plus a short written summary

Each account's data is private to that account and stored in a database, not the browser, so it survives across devices and sessions.

## Running it locally

### Backend

```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs on `http://localhost:8000`. It creates a `timetrack.db` SQLite file on first run — no separate database setup needed for local testing.

Set a real secret key before deploying anywhere beyond your own machine:

```
export SECRET_KEY=replace-with-a-long-random-string
```

### Frontend

```
cd frontend
npm install
npm start
```

Runs on `http://localhost:3000` and talks to the API at `localhost:8000` by default. To point it at a deployed backend, set `REACT_APP_API_BASE` before building.

## Stack

- FastAPI, SQLAlchemy, SQLite for the backend
- JWT-based authentication with bcrypt password hashing
- React for the frontend, Recharts for the weekly charts

## Where this could go

For a department-wide rollout, the next steps would be moving from SQLite to Postgres, adding an admin view so an advisor could see aggregate (anonymized) trends across a cohort, and a native mobile wrapper so the timer survives the phone locking. The current version is meant to prove the core idea works before investing in any of that.
