/**
 * router.js — Hash-based SPA router. Works without a server rewrite rule.
 * Routes: #home | #pyq | #premium | #leaderboard | #dashboard | #news
 *         #library | #subscription | #admin | #login | #register
 */

const Routes = {};
let currentRoute = null;

function registerRoute(hash, renderFn) {
  Routes[hash] = renderFn;
}

function navigate(hash, params = {}) {
  window.location.hash = hash;
  currentRoute = hash;
  _render(hash, params);
}

function _render(hash, params = {}) {
  const fn = Routes[hash];
  if (!fn) { navigate('#home'); return; }

  // Highlight active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === hash);
  });

  const container = document.getElementById('page-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  document.getElementById('topbar-title').textContent = _routeTitle(hash);

  Promise.resolve(fn(container, params)).catch(err => {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Something went wrong</h3>
      <p class="text-muted">${err.message}</p>
      <button class="btn btn-primary mt-2" onclick="navigate('#home')">Go Home</button>
    </div>`;
  });
}

function _routeTitle(hash) {
  const titles = {
    '#home':         'Home',
    '#pyq':          'Solved PYQs',
    '#premium':      'Premium Content',
    '#leaderboard':  'Leaderboard',
    '#dashboard':    'My Dashboard',
    '#news':         'Exam News',
    '#library':      'My Library',
    '#subscription': 'Subscription Plans',
    '#admin':        'Admin Panel',
    '#login':        'Login',
    '#register':     'Register',
  };
  return titles[hash] || 'ExamPrep';
}

// Boot: resolve current hash or default to #home
function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#home';
    _render(hash);
  });
  const hash = window.location.hash || '#home';
  _render(hash);
}
