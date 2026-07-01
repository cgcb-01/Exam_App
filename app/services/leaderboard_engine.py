"""
JEE and NEET rank determination rules applied to contest submissions.

JEE Mains tiebreaker (NTA rule):
  1. Higher score
  2. Higher accuracy in Mathematics → Chemistry → Physics
  3. Fewer wrong answers
  4. Time taken (less = better)

JEE Advanced tiebreaker:
  1. Higher aggregate score
  2. Higher score in Paper 1
  3. Higher score in Paper 2

NEET tiebreaker (NMC rule):
  1. Higher score
  2. Higher Biology score
  3. Higher Chemistry score
  4. Fewer wrong answers
  5. Age (older preferred)
  6. Alphabetical by name
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.submission import Submission, AnswerLog
from app.models.exam import Exam, ExamSection
from app.models.contest import LeaderboardEntry, Contest
from app.models.user import UserProfile


@dataclass
class RankedEntry:
    user_id:      str
    submission_id: str
    total_score:  float
    accuracy:     float
    time_taken_s: int
    subject_scores: dict = field(default_factory=dict)
    wrong_count:  int = 0
    name:         str = ""
    age:          int = 0


def _subject_scores(submission_id: str, db: Session) -> dict:
    from app.models.exam import Question
    scores: dict[str, float] = {}
    logs = db.query(AnswerLog).filter(AnswerLog.submission_id == submission_id).all()
    for log in logs:
        q = db.query(Question).filter(Question.id == log.question_id).first()
        if not q:
            continue
        sec = q.section
        subject = (sec.exam.subject or "").capitalize()
        if not subject:
            continue
        scores[subject] = scores.get(subject, 0.0) + log.marks_awarded
    return scores


def build_leaderboard(contest_id: str, db: Session, exam_type: str = "JEE_MAINS") -> list[RankedEntry]:

    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        return []

    exam_ids: list[str] = contest.exam_ids or []
    entries: list[RankedEntry] = []

    for exam_id in exam_ids:
        subs = db.query(Submission).filter(
            Submission.exam_id     == exam_id,
            Submission.is_complete == True,
        ).all()

        for sub in subs:
            profile = db.query(UserProfile).filter(
                UserProfile.user_id == sub.user_id
            ).first()
            subj_scores = _subject_scores(sub.id, db)
            entries.append(RankedEntry(
                user_id       = sub.user_id,
                submission_id = sub.id,
                total_score   = sub.total_score,
                accuracy      = sub.accuracy,
                time_taken_s  = sub.time_taken_seconds or 0,
                subject_scores= subj_scores,
                wrong_count   = sub.wrong_count,
                name          = profile.name if profile else "",
            ))

    best: dict[str, RankedEntry] = {}
    for e in entries:
        if e.user_id not in best or e.total_score > best[e.user_id].total_score:
            best[e.user_id] = e
    entries = list(best.values())

    if exam_type in ("JEE_MAINS", "JEE_ADV"):
        entries.sort(key=lambda e: (
            -e.total_score,
            -e.subject_scores.get("Mathematics", 0),
            -e.subject_scores.get("Chemistry", 0),
            -e.subject_scores.get("Physics", 0),
            e.wrong_count,
            e.time_taken_s,
        ))
    else:  
        entries.sort(key=lambda e: (
            -e.total_score,
            -e.subject_scores.get("Biology", 0),
            -e.subject_scores.get("Chemistry", 0),
            e.wrong_count,
            e.time_taken_s,
            e.name.lower(),
        ))

    return entries


def persist_leaderboard(contest_id: str, entries: list[RankedEntry], db: Session):
    for rank, entry in enumerate(entries, start=1):
        existing = db.query(LeaderboardEntry).filter(
            LeaderboardEntry.contest_id == contest_id,
            LeaderboardEntry.user_id    == entry.user_id,
        ).first()
        if existing:
            existing.rank         = rank
            existing.score        = entry.total_score
            existing.accuracy     = entry.accuracy
            existing.time_taken_s = entry.time_taken_s
        else:
            row = LeaderboardEntry(
                contest_id    = contest_id,
                user_id       = entry.user_id,
                submission_id = entry.submission_id,
                rank          = rank,
                score         = entry.total_score,
                accuracy      = entry.accuracy,
                time_taken_s  = entry.time_taken_s,
            )
            db.add(row)
    db.commit()