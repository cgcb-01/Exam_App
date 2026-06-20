/**
 * auth.js — Login, Register pages + auth state helpers.
 */

function renderLogin(container) {
  container.innerHTML = `
    <div style="max-width:420px;margin:40px auto;">
      <div class="card fade-in">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:2.5rem;margin-bottom:8px;">📚</div>
          <h2 style="font-size:1.3rem;font-weight:800;">Welcome Back</h2>
          <p class="text-muted" style="font-size:.88rem;margin-top:4px;">Login to continue your preparation</p>
        </div>
        <div id="login-error" class="hidden" style="background:var(--danger-light);color:var(--danger);padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:14px;"></div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input id="login-email" type="email" class="form-control" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div style="position:relative;">
            <input id="login-password" type="password" class="form-control" placeholder="••••••••" autocomplete="current-password" style="padding-right:42px;">
            <button onclick="togglePass('login-password',this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text3);">👁</button>
          </div>
        </div>
        <button id="login-btn" class="btn btn-primary" style="width:100%;margin-top:6px;" onclick="doLogin()">Login</button>
        <p style="text-align:center;margin-top:16px;font-size:.85rem;color:var(--text2);">
          Don't have an account? <a href="#" onclick="navigate('#register')">Register</a>
        </p>
      </div>
    </div>`;

  document.getElementById('login-email').addEventListener('keyup', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-password').addEventListener('keyup', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  if (!email || !password) { showErr(errEl, 'Please fill in all fields.'); return; }

  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const data = await AuthAPI.login({ email, password });
    Auth.setToken(data.access_token);
    Auth.setUser(data.user);
    updateAuthUI();
    showToast('Welcome back! 🎉', 'success');
    navigate('#home');
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Login';
  }
}

function renderRegister(container) {
  container.innerHTML = `
    <div style="max-width:420px;margin:40px auto;">
      <div class="card fade-in">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:2.5rem;margin-bottom:8px;">🚀</div>
          <h2 style="font-size:1.3rem;font-weight:800;">Create Account</h2>
          <p class="text-muted" style="font-size:.88rem;margin-top:4px;">Start your JEE / NEET preparation journey</p>
        </div>
        <div id="reg-error" class="hidden" style="background:var(--danger-light);color:var(--danger);padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:14px;"></div>
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input id="reg-name" type="text" class="form-control" placeholder="Your name">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input id="reg-email" type="email" class="form-control" placeholder="you@example.com">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div style="position:relative;">
            <input id="reg-password" type="password" class="form-control" placeholder="Min 6 characters" style="padding-right:42px;">
            <button onclick="togglePass('reg-password',this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text3);">👁</button>
          </div>
        </div>
        <button id="reg-btn" class="btn btn-primary" style="width:100%;margin-top:6px;" onclick="doRegister()">Create Account</button>
        <p style="text-align:center;margin-top:16px;font-size:.85rem;color:var(--text2);">
          Already have an account? <a href="#" onclick="navigate('#login')">Login</a>
        </p>
      </div>
    </div>`;
}

async function doRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  const btn      = document.getElementById('reg-btn');

  if (!email || !password) { showErr(errEl, 'Email and password are required.'); return; }
  if (password.length < 6) { showErr(errEl, 'Password must be at least 6 characters.'); return; }

  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const data = await AuthAPI.register({ email, full_name: name || undefined, password });
    Auth.setToken(data.access_token);
    Auth.setUser(data.user);
    updateAuthUI();
    showToast('Account created! Welcome 🎉', 'success');
    navigate('#home');
  } catch (e) {
    showErr(errEl, e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

function doLogout() {
  Auth.clear();
  updateAuthUI();
  showToast('Logged out successfully.', 'info');
  navigate('#home');
}

function updateAuthUI() {
  const user      = Auth.getUser();
  const loggedIn  = !!user;
  const isPremium = user?.is_premium;
  const isAdmin   = user?.is_admin;

  document.getElementById('nav-login').style.display    = loggedIn ? 'none' : 'flex';
  document.getElementById('nav-register').style.display = loggedIn ? 'none' : 'flex';
  document.getElementById('nav-logout').style.display   = loggedIn ? 'flex' : 'none';
  document.getElementById('nav-dashboard').style.display= loggedIn ? 'flex' : 'none';
  document.getElementById('nav-library').style.display  = loggedIn ? 'flex' : 'none';
  document.getElementById('nav-admin').style.display    = isAdmin  ? 'flex' : 'none';

  const subEl = document.getElementById('nav-subscription');
  if (subEl) subEl.style.display = loggedIn && !isPremium ? 'flex' : 'none';

  const userEl = document.getElementById('topbar-user');
  if (userEl) {
    if (loggedIn) {
      userEl.innerHTML = `
        <span style="font-size:.82rem;color:var(--text2);font-weight:500;">${user.full_name || user.email.split('@')[0]}</span>
        ${isPremium ? '<span class="premium-badge">⭐ Premium</span>' : ''}
      `;
    } else {
      userEl.innerHTML = '';
    }
  }
}

function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.display = 'block';
}

function togglePass(id, btn) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function requireAuth(redirectRoute = '#login') {
  if (!Auth.isLoggedIn()) {
    showToast('Please login to continue.', 'warning');
    navigate(redirectRoute);
    return false;
  }
  return true;
}
