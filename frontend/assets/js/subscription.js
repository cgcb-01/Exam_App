registerPage('subscription', async function(el) {
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  const [plans, status] = await Promise.all([
    GET('/api/subscriptions/plans'),
    Auth.loggedIn() ? GET('/api/subscriptions/status') : Promise.resolve({ is_premium:false, subscription:null })
  ]);
  _subRender(el, plans, status);
});

function _subRender(el, plans, status) {
  const { is_premium, subscription } = status;
  el.innerHTML = `<div class="fade-in" style="max-width:860px;margin:0 auto">
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-block;padding:6px 16px;background:var(--c-blue-l);color:var(--c-blue);border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">Premium Access</div>
      <div class="page-title" style="font-size:26px;letter-spacing:-.5px">Unlock Full Preparation</div>
      <div class="page-sub" style="max-width:480px;margin:6px auto 0">Get access to DPPs, Chapterwise Tests, and Full Syllabus Mock Tests for JEE Main, JEE Advanced, and NEET UG.</div>
    </div>

    ${is_premium && subscription ? `<div style="background:var(--c-green-l);border:1px solid var(--c-green);border-radius:var(--radius-lg);padding:16px 20px;margin-bottom:24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:36px;height:36px;background:var(--c-green);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff">${IC.chk}</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:800;color:var(--c-green)">Premium Active</div>
      <div style="font-size:11px;color:var(--c-green);opacity:.8">Plan: ${subscription.plan} &middot; Renews ${new Date(subscription.current_period_end).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div></div>
      <button class="btn btn-success btn-sm" onclick="go('premium')">Browse Content</button>
      <button class="btn btn-secondary btn-sm" onclick="_subCancel()">Cancel</button>
    </div>` : ''}

    <div class="plans-row" style="margin-bottom:32px">
      ${plans.map(p => `
      <div class="plan-card ${p.best_value?'featured':''}" onclick="_subSelect('${p.plan}')">
        <div class="plan-name">${{INTRO:'Intro Offer',MONTHLY:'Monthly',HALF_YEARLY:'Half-Yearly',ANNUAL:'Annual'}[p.plan]||p.plan}</div>
        <div class="plan-price">&#8377;${p.price.toFixed(0)}</div>
        <div class="plan-period">${{INTRO:'/ month',MONTHLY:'/ month',HALF_YEARLY:'/ 6 months',ANNUAL:'/ year'}[p.plan]||''}</div>
        <div class="plan-saving">${{INTRO:'New users only',MONTHLY:'',HALF_YEARLY:'Save &#8377;81',ANNUAL:'Save &#8377;210'}[p.plan]||'&nbsp;'}</div>
        <button class="btn btn-primary" style="width:100%" onclick="event.stopPropagation();_subSelect('${p.plan}')">
          ${is_premium?'Switch':'Get Started'}
        </button>
      </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:24px"><div class="card-body">
      <div style="font-size:13px;font-weight:800;color:var(--c-text);margin-bottom:16px">Everything in Premium</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${['DPP — All Chapters for Physics, Chemistry, Maths and Biology','Chapterwise Tests with Module-wise Question Sets','Full Syllabus Mock Tests in real exam format','Download PDFs with OMR sheets for offline practice','Camera proctoring for focused practice sessions','Advanced performance dashboard with charts','Access leaderboards for every test and overall','Works on mobile, tablet and desktop browser'].map(f=>`
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--c-surface2);border-radius:var(--radius-sm)">
          <div style="color:var(--c-green);flex-shrink:0;margin-top:1px">${IC.chk}</div>
          <span style="font-size:12px;color:var(--c-text2)">${f}</span>
        </div>`).join('')}
      </div>
    </div></div>

    <div style="text-align:center;font-size:11px;color:var(--c-text4)">
      Secure payments. Cancel anytime. Access continues until period end after cancellation.
    </div>
  </div>`;
}

function _subSelect(plan) {
  if (!requireLogin()) return;
  const names = { INTRO:'Intro — &#8377;80/month (first 3 months)', MONTHLY:'Monthly — &#8377;80/month', HALF_YEARLY:'Half-Yearly — &#8377;399', ANNUAL:'Annual — &#8377;750/year' };
  openModal('Confirm Subscription', `
    <div class="modal-body-pad" style="text-align:center">
      <div style="font-size:24px;font-weight:900;color:var(--c-text);margin-bottom:8px">${names[plan]||plan}</div>
      <div style="font-size:12px;color:var(--c-text3);margin-bottom:16px;line-height:1.6">In production this redirects to Razorpay checkout.<br>For this demo your subscription will be activated immediately.</div>
      <div style="background:var(--c-surface2);border-radius:var(--radius);padding:12px;font-size:11px;color:var(--c-text4)">
        Auto-renews until cancelled. Cancel anytime from account settings.
      </div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="_subActivate('${plan}')">Activate Now</button>`);
}

async function _subActivate(plan) {
  closeModal();
  try {
    await POST('/api/subscriptions/activate', { plan, payment_gateway_ref: 'DEMO_'+Date.now() });
    const me = await GET('/api/auth/me');
    Auth.set(Auth.token(), me);
    updateAuthUI();
    toast('Premium activated! Welcome.', 'ok');
    go('subscription');
  } catch(e) { toast(e.message, 'err'); }
}

async function _subCancel() {
  if (!confirm('Cancel subscription? Access continues until the period ends.')) return;
  try { await POST('/api/subscriptions/cancel', {}); toast('Subscription cancelled.', 'info'); go('subscription'); }
  catch(e) { toast(e.message, 'err'); }
}
