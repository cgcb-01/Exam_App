import logging
from datetime import datetime, date

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings

logger = logging.getLogger("scheduler")
_scheduler = BackgroundScheduler(timezone="Asia/Kolkata")


def generate_weekly_personalised_tests():
    from app.database import SessionLocal
    from app.models.user import User, UserProfile
    from app.models.submission import AnswerLog, Submission
    from app.models.exam import Exam, ExamSection, Question
    from datetime import timedelta

    logger.info("Generating weekly personalised tests...")
    db = SessionLocal()
    try:
        week_ago = datetime.utcnow() - timedelta(days=7)
        users = db.query(User).filter(User.is_active == True).all()

        for user in users:
            reviewed = (
                db.query(AnswerLog.question_id)
                .join(Submission, AnswerLog.submission_id == Submission.id)
                .filter(
                    Submission.user_id == user.id,
                    AnswerLog.marked_to_review == True,
                    Submission.submitted_at >= week_ago,
                    AnswerLog.question_id.isnot(None),
                )
                .distinct()
                .all()
            )
            q_ids = [r[0] for r in reviewed]
            if not q_ids:
                continue

            questions = db.query(Question).filter(Question.id.in_(q_ids)).all()
            if not questions:
                continue

            exam = Exam(
                title      = f"Weekly Review Test — {user.profile.name if user.profile else user.email}",
                exam_type  = "PERSONALISED",
                paper_style= "GENERIC",
                stream     = user.profile.stream if user.profile else "JEE",
                for_class  = user.profile.student_class if user.profile else "Class 11",
                is_premium = False,
                is_published = True,
                is_active  = True,
                duration_minutes = len(questions) * 2,
            )
            db.add(exam)
            db.flush()

            section = ExamSection(
                exam_id       = exam.id,
                title         = "Review Questions",
                question_type = "MCQ",
                marks_correct = 4,
                marks_wrong   = -1,
            )
            db.add(section)
            db.flush()

            for i, q in enumerate(questions):
                new_q = Question(
                    section_id     = section.id,
                    order_index    = i,
                    content        = q.content,
                    correct_answer = q.correct_answer,
                    solution       = q.solution,
                )
                db.add(new_q)

            db.commit()
            logger.info(f"Personalised test created for {user.email}: {len(questions)} questions")

    except Exception as e:
        logger.error(f"Personalised test generation failed: {e}")
        db.rollback()
    finally:
        db.close()


def cleanup_expired_premium():
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.library import DownloadedFile
    from app.services.b2_storage import get_storage

    logger.info("Running premium content cleanup...")
    db = SessionLocal()
    storage = get_storage()
    try:
        now = datetime.utcnow()
        expired_users = db.query(User).filter(
            User.is_premium == True,
            User.premium_expiry < now,
        ).all()

        for user in expired_users:
            user.is_premium = False
            premium_files = db.query(DownloadedFile).filter(
                DownloadedFile.user_id  == user.id,
                DownloadedFile.is_premium == True,
                DownloadedFile.is_deleted == False,
            ).all()
            for f in premium_files:
                f.is_deleted = True
            db.commit()
            logger.info(f"Cleaned premium for {user.email}: {len(premium_files)} files flagged")

    except Exception as e:
        logger.error(f"Premium cleanup failed: {e}")
        db.rollback()
    finally:
        db.close()

def apply_weekly_decay():
    from app.database import SessionLocal
    from app.services.rating_engine import weekly_decay
    db = SessionLocal()
    try:
        weekly_decay(db)
        logger.info("Weekly rating decay applied.")
    except Exception as e:
        logger.error(f"Rating decay failed: {e}")
        db.rollback()
    finally:
        db.close()

def evaluate_todo_deadlines():
    from app.database import SessionLocal
    from app.models.misc import ToDo
    from app.services.rating_engine import apply_todo_delta

    db = SessionLocal()
    try:
        today = date.today()
        overdue = db.query(ToDo).filter(
            ToDo.due_date < today,
            ToDo.is_completed == False,
            ToDo.rating_impact == 0,
        ).all()
        for todo in overdue:
            apply_todo_delta(db, todo.user_id, todo.completion_pct, todo.title)
            todo.rating_impact = -1  # mark evaluated
        db.commit()
        logger.info(f"Evaluated {len(overdue)} overdue to-dos.")
    except Exception as e:
        logger.error(f"To-do evaluation failed: {e}")
        db.rollback()
    finally:
        db.close()

def start_scheduler():
    _scheduler.add_job(
        generate_weekly_personalised_tests,
        CronTrigger(day_of_week="sun", hour=0, minute=0),
        id="weekly_personalised", replace_existing=True,
    )
    _scheduler.add_job(
        cleanup_expired_premium,
        CronTrigger(hour=settings.premium_cleanup_hour, minute=0),
        id="premium_cleanup", replace_existing=True,
    )
    _scheduler.add_job(
        apply_weekly_decay,
        CronTrigger(day_of_week="sun", hour=0, minute=30),
        id="rating_decay", replace_existing=True,
    )
    _scheduler.add_job(
        evaluate_todo_deadlines,
        CronTrigger(hour=0, minute=5),
        id="todo_eval", replace_existing=True,
    )
    _scheduler.start()
    logger.info("Background scheduler started.")
