"""Premium content tree browsing — visible to all, but attempting requires premium."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.db import get_db, PremiumExamTrack, PremiumSubject, DppSet, Dpp, TestSet, Chapter, Module, MockTest, Question
from backend import schemas
from backend.auth import get_current_user_optional, User

router = APIRouter(prefix="/api/premium", tags=["premium"])


def _qcount(db, **filters):
    q = db.query(func.count(Question.id))
    for k, v in filters.items():
        q = q.filter(getattr(Question, k) == v)
    return q.scalar() or 0


@router.get("/tracks", response_model=list[schemas.PremiumTrackOut])
def list_tracks(db: Session = Depends(get_db), current_user=Depends(get_current_user_optional)):
    """
    Returns the full tree of tracks->subjects->dpp_sets->dpps / test_sets->chapters->modules / mock_tests.
    All users (including non-premium/guests) can see this tree for browsing.
    Attempting any test in this tree requires premium (enforced in attempt_router).
    """
    tracks = db.query(PremiumExamTrack).filter(PremiumExamTrack.is_active == True).all()
    result = []
    for track in tracks:
        subjects_out = []
        for subj in track.subjects:
            if not subj.is_active:
                continue
            # DPP sets
            dpp_sets_out = []
            for ds in subj.dpp_sets:
                dpps_out = [schemas.DppOut(
                    id=d.id, title=d.title, chapter_name=d.chapter_name,
                    order_index=d.order_index, duration_minutes=d.duration_minutes,
                    question_count=_qcount(db, dpp_id=d.id),
                ) for d in sorted(ds.dpps, key=lambda x: x.order_index)]
                dpp_sets_out.append(schemas.DppSetOut(id=ds.id, name=ds.name,
                    questions_per_dpp=ds.questions_per_dpp, dpps=dpps_out))

            # Test sets
            test_sets_out = []
            for ts in subj.test_sets:
                chapters_out = []
                for ch in sorted(ts.chapters, key=lambda x: x.order_index):
                    modules_out = [schemas.ModuleOut(
                        id=m.id, name=m.name, order_index=m.order_index,
                        duration_minutes=m.duration_minutes,
                        question_count=_qcount(db, module_id=m.id),
                    ) for m in sorted(ch.modules, key=lambda x: x.order_index)]
                    chapters_out.append(schemas.ChapterOut(
                        id=ch.id, name=ch.name, order_index=ch.order_index, modules=modules_out))
                test_sets_out.append(schemas.TestSetOut(id=ts.id, name=ts.name, chapters=chapters_out))

            # Mock tests
            mocks_out = [schemas.MockTestOut(
                id=m.id, title=m.title, duration_minutes=m.duration_minutes,
                question_count=_qcount(db, mock_test_id=m.id),
            ) for m in sorted(subj.mock_tests, key=lambda x: x.order_index)]

            subjects_out.append(schemas.PremiumSubjectOut(
                id=subj.id, name=subj.name, is_active=subj.is_active,
                dpp_sets=dpp_sets_out, test_sets=test_sets_out, mock_tests=mocks_out,
            ))
        result.append(schemas.PremiumTrackOut(
            id=track.id, name=track.name, display_name=track.display_name,
            is_active=track.is_active, subjects=subjects_out,
        ))
    return result
