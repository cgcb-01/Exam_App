"""Subscription plans, activation, status checking."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models.db import get_db, User, Subscription, SubscriptionPlan, SubscriptionStatus
from backend import schemas
from backend.auth import get_current_user, user_has_active_premium

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

PLAN_DETAILS = [
    schemas.SubscriptionPlanInfo(plan=schemas.SubscriptionPlan.INTRO,       price=80.0,  months=1,  display="Intro – ₹80/month (first 3 months)",       best_value=False),
    schemas.SubscriptionPlanInfo(plan=schemas.SubscriptionPlan.MONTHLY,     price=80.0,  months=1,  display="Monthly – ₹80/month",                        best_value=False),
    schemas.SubscriptionPlanInfo(plan=schemas.SubscriptionPlan.HALF_YEARLY, price=399.0, months=6,  display="Half-Yearly – ₹399 (save ₹81)",              best_value=False),
    schemas.SubscriptionPlanInfo(plan=schemas.SubscriptionPlan.ANNUAL,      price=750.0, months=12, display="Annual – ₹750/year (save ₹210)",             best_value=True),
]

@router.get("/plans", response_model=list[schemas.SubscriptionPlanInfo])
def list_plans():
    return PLAN_DETAILS

@router.get("/status", response_model=dict)
def subscription_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    is_premium = user_has_active_premium(current_user, db)
    active_sub = None
    if is_premium:
        active_sub = (db.query(Subscription)
            .filter(Subscription.user_id == current_user.id, Subscription.status == SubscriptionStatus.ACTIVE,
                    Subscription.current_period_end >= datetime.utcnow())
            .order_by(Subscription.current_period_end.desc()).first())
    return {
        "is_premium": is_premium,
        "subscription": schemas.SubscriptionOut.model_validate(active_sub) if active_sub else None
    }

@router.post("/activate", response_model=schemas.SubscriptionOut)
def activate_subscription(
    payload: schemas.SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Check if user already has an active subscription
    existing = (db.query(Subscription)
        .filter(Subscription.user_id == current_user.id, Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.current_period_end >= datetime.utcnow()).first())
    
    plan_map = {p.plan: p for p in PLAN_DETAILS}
    plan_info = plan_map.get(payload.plan)
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan.")

    # Intro plan: only allowed if user has never had a subscription
    if payload.plan == schemas.SubscriptionPlan.INTRO:
        ever_had = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
        if ever_had:
            raise HTTPException(status_code=400, detail="Intro plan is only for new subscribers. Please choose Monthly, Half-Yearly, or Annual.")

    if existing:
        existing.status = SubscriptionStatus.CANCELLED

    end_date = datetime.utcnow() + timedelta(days=30 * plan_info.months)
    sub = Subscription(
        user_id=current_user.id, plan=payload.plan,
        status=SubscriptionStatus.ACTIVE, price_paid=plan_info.price,
        current_period_end=end_date, auto_renew=True,
        payment_gateway_ref=payload.payment_gateway_ref,
        months_billed_at_intro_rate=1 if payload.plan == schemas.SubscriptionPlan.INTRO else 0,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub

@router.post("/cancel")
def cancel_subscription(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sub = (db.query(Subscription)
        .filter(Subscription.user_id == current_user.id, Subscription.status == SubscriptionStatus.ACTIVE).first())
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found.")
    sub.status = SubscriptionStatus.CANCELLED
    sub.auto_renew = False
    db.commit()
    return {"message": "Subscription cancelled. Access continues until period end.", "period_end": sub.current_period_end}
