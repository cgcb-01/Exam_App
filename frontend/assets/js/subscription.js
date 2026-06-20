/**
 * subscription.js — Plans page, billing UI, and status display.
 */

async function renderSubscription(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const [plans, status] = await Promise.all([
      SubAPI.plans(),
      Auth.isLoggedIn() ? SubAPI.status() : Promise.resolve({ is_premium: false, subscription: null }),
    ]);
    _drawSubscription(container, plans, status);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}

function _drawSubscription(container, plans, status) {
  const { is_premium, subscription } = status;

  container.innerHTML = `
    <div style="max-width:860px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:2.5rem;margin-bottom:10px;">⭐</div>
        <div class="section-title" style="font-size:1.4rem;">Unlock Premium Access</div>
        <div class="section-sub">Get full access to DPPs, Chapterwise Tests, and Mock Tests for JEE & NEET.</div>
      </div>

      ${is_premium && subscription ? _activeBanner(subscription) : ''}

      <div class="plans-grid">
        ${plans.map(p => _planCard(p, is_premium)).join('')}
      </div>

      <div class="card" style="margin-top:28px;">
        <div class="section-title" style="margin-bottom:16px;">What's included in Premium?</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${['📋 DPP – All Chapters (Physics, Chemistry, Maths/Biology)',
             '📚 Chapterwise Tests with Module-wise Questions',
             '🏆 Full Syllabus Mock Tests (JEE & NEET format)',
             '⬇ Download PDFs for offline study',
             '📊 Advanced Performance Dashboard',
             '🔴 Camera Proctoring for Focused Practice',
             '🏅 Access Leaderboards for every test',
             '📱 Works on mobile, tablet and desktop'].map(f =>
            `<div style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;">
              <span>${f.split(' ')[0]}</span>
              <span style="color:var(--text2);">${f.slice(f.indexOf(' ')+1)}</span>
            </div>`).join('')}
        </div>
      </div>

      <div style="text-align:center;margin-top:20px;font-size:.8rem;color:var(--text3);">
        Payments powered by Razorpay. Secure checkout. Cancel anytime.
        ${is_premium ? `<br><button class="btn btn-sm" style="background:none;color:var(--danger);border:none;margin-top:8px;" onclick="_cancelSub()">Cancel Subscription</button>` : ''}
      </div>
    </div>`;
}

function _activeBanner(sub) {
  const end = new Date(sub.current_period_end).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  return `
    <div style="background:linear-gradient(135deg,#14532d,#16a34a);color:#fff;border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
      <span style="font-size:1.8rem;">✅</span>
      <div style="flex:1;">
        <div style="font-weight:800;font-size:1rem;">You have an active Premium subscription</div>
        <div style="font-size:.85rem;opacity:.9;">Plan: ${sub.plan} &nbsp;·&nbsp; Renews / Expires: ${end}</div>
      </div>
      <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);" onclick="navigate('#premium')">Browse Content →</button>
    </div>`;
}

function _planCard(plan, isPremium) {
  const prices = { INTRO:'₹80', MONTHLY:'₹80', HALF_YEARLY:'₹399', ANNUAL:'₹750' };
  const periods= { INTRO:'/month (first 3 months)', MONTHLY:'/month', HALF_YEARLY:'/6 months', ANNUAL:'/year' };
  const savings= { INTRO:'New users only', MONTHLY:'', HALF_YEARLY:'Save ₹81', ANNUAL:'Save ₹210' };

  return `
    <div class="plan-card ${plan.best_value?'best-value':''}" onclick="_selectPlan('${plan.plan}')">
      <div class="plan-name">${_planName(plan.plan)}</div>
      <div class="plan-price">${prices[plan.plan]}</div>
      <div class="plan-period">${periods[plan.plan]}</div>
      ${savings[plan.plan] ? `<div class="plan-savings">${savings[plan.plan]}</div>` : '<div style="height:22px;"></div>'}
      <button class="btn btn-primary" style="width:100%;margin-top:6px;"
              onclick="event.stopPropagation();_selectPlan('${plan.plan}')">
        ${isPremium ? 'Switch Plan' : 'Get Started'}
      </button>
    </div>`;
}

function _planName(plan) {
  const n = { INTRO:'Intro Offer', MONTHLY:'Monthly', HALF_YEARLY:'Half-Yearly', ANNUAL:'Annual' };
  return n[plan] || plan;
}

function _selectPlan(plan) {
  if (!requireAuth()) return;

  const prices = { INTRO:80, MONTHLY:80, HALF_YEARLY:399, ANNUAL:750 };
  const names  = { INTRO:'Intro (₹80 × 3 months)', MONTHLY:'Monthly (₹80/month)', HALF_YEARLY:'Half-Yearly (₹399)', ANNUAL:'Annual (₹750/year)' };

  openModal('Confirm Subscription', `
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:2rem;margin-bottom:12px;">⭐</div>
      <p style="font-size:.95rem;margin-bottom:8px;">You are selecting:</p>
      <div style="font-size:1.1rem;font-weight:800;color:var(--primary);margin-bottom:16px;">${names[plan]}</div>
      <p style="font-size:.85rem;color:var(--text2);">
        In a production environment, this would redirect to Razorpay checkout.
        For this demo, your subscription will be activated directly.
      </p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="_activatePlan('${plan}')">Activate Now</button>`
  );
}

async function _activatePlan(plan) {
  closeModal();
  const prices = { INTRO:80, MONTHLY:80, HALF_YEARLY:399, ANNUAL:750 };
  try {
    await SubAPI.activate({ plan, payment_gateway_ref: 'DEMO_' + Date.now() });
    // Refresh user premium status
    const me = await AuthAPI.me();
    Auth.setUser(me);
    updateAuthUI();
    showToast('🎉 Premium activated! Welcome aboard.', 'success');
    renderSubscription(document.getElementById('page-content'));
  } catch(e) {
    showToast('Activation failed: ' + e.message, 'error');
  }
}

async function _cancelSub() {
  if (!confirm('Cancel your subscription? You will keep access until the period ends.')) return;
  try {
    await SubAPI.cancel();
    showToast('Subscription cancelled. Access continues until expiry.', 'info');
    renderSubscription(document.getElementById('page-content'));
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}
