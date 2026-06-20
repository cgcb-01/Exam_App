/**
 * api.js — Central HTTP client with auth headers, offline queue, and error handling.
 */

const API_BASE = '';  // same origin

// ── Token management ──────────────────────────────────────────────────────────
const Auth = {
  getToken()  { return localStorage.getItem('ep_token'); },
  setToken(t) { localStorage.setItem('ep_token', t); },
  removeToken(){ localStorage.removeItem('ep_token'); },
  getUser()   { try { return JSON.parse(localStorage.getItem('ep_user') || 'null'); } catch { return null; } },
  setUser(u)  { localStorage.setItem('ep_user', JSON.stringify(u)); },
  removeUser(){ localStorage.removeItem('ep_user'); },
  clear()     { this.removeToken(); this.removeUser(); },
  isPremium() { const u = this.getUser(); return u ? u.is_premium : false; },
  isAdmin()   { const u = this.getUser(); return u ? u.is_admin   : false; },
  isLoggedIn(){ return !!this.getToken(); },
};

// ── Offline queue (for answer syncing during connectivity loss) ───────────────
const OfflineQueue = {
  _key: 'ep_offline_q',
  push(item) {
    const q = this.all();
    q.push({ ...item, queued_at: Date.now() });
    localStorage.setItem(this._key, JSON.stringify(q));
  },
  all() { try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; } },
  clear() { localStorage.removeItem(this._key); },
  async flush() {
    const items = this.all();
    if (!items.length || !navigator.onLine) return;
    const failed = [];
    for (const item of items) {
      try {
        await api(item.url, item.opts);
      } catch {
        failed.push(item);
      }
    }
    localStorage.setItem(this._key, JSON.stringify(failed));
    return items.length - failed.length;
  },
};

// ── Core fetch wrapper ─────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(API_BASE + path, {
    ...opts,
    headers,
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });

  if (response.status === 204) return null;

  let data;
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.blob();
  }

  if (!response.ok) {
    const msg = data?.detail || (typeof data === 'string' ? data : `HTTP ${response.status}`);
    const err = new Error(msg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Convenience helpers ────────────────────────────────────────────────────────
const GET  = (path)        => api(path, { method: 'GET' });
const POST = (path, body)  => api(path, { method: 'POST',  body });
const PUT  = (path, body)  => api(path, { method: 'PUT',   body });
const PATCH= (path, body)  => api(path, { method: 'PATCH', body });
const DEL  = (path)        => api(path, { method: 'DELETE' });

// ── API namespaces ─────────────────────────────────────────────────────────────
const AuthAPI = {
  register: (d) => POST('/api/auth/register', d),
  login:    (d) => POST('/api/auth/login', d),
  me:       ()  => GET('/api/auth/me'),
};

const PyqAPI = {
  exams:     ()   => GET('/api/pyq/exams'),
  questions: (id) => GET(`/api/pyq/shifts/${id}/questions`),
  solutions: (id) => GET(`/api/pyq/shifts/${id}/solutions`),
};

const AttemptAPI = {
  start:   (d)    => POST('/api/attempts/start', d),
  get:     (id)   => GET(`/api/attempts/${id}`),
  answer:  (id,d) => PATCH(`/api/attempts/${id}/answer`, d),
  submit:  (id,d) => POST(`/api/attempts/${id}/submit`, d),
  result:  (id)   => GET(`/api/attempts/${id}/result`),
  solutions:(id)  => GET(`/api/attempts/${id}/solutions`),
  syncOffline: (d)=> POST('/api/attempts/sync-offline', d),
};

const PremiumAPI = {
  tracks: () => GET('/api/premium/tracks'),
};

const SubAPI = {
  plans:    ()    => GET('/api/subscriptions/plans'),
  status:   ()    => GET('/api/subscriptions/status'),
  activate: (d)   => POST('/api/subscriptions/activate', d),
  cancel:   ()    => POST('/api/subscriptions/cancel', {}),
};

const LbAPI = {
  test:    (type, id) => GET(`/api/leaderboard/test/${type}/${id}`),
  overall: ()         => GET('/api/leaderboard/overall'),
  daily:   ()         => GET('/api/leaderboard/daily'),
  myRank:  ()         => GET('/api/leaderboard/my-rank'),
};

const NewsAPI = {
  list:   ()    => GET('/api/news/'),
  create: (d)   => POST('/api/news/', d),
};

const PdfAPI = {
  shiftPaper:    (id, omr=false) => `${API_BASE}/api/pdf/shift/${id}/paper?include_omr=${omr}`,
  shiftSolutions:(id)            => `${API_BASE}/api/pdf/shift/${id}/solutions`,
  shiftOmr:      (id)            => `${API_BASE}/api/pdf/shift/${id}/omr`,
  dppPaper:      (id, omr=false) => `${API_BASE}/api/pdf/dpp/${id}/paper?include_omr=${omr}`,
  dppSolutions:  (id)            => `${API_BASE}/api/pdf/dpp/${id}/solutions`,
  modulePaper:   (id, omr=false) => `${API_BASE}/api/pdf/module/${id}/paper?include_omr=${omr}`,
  mockPaper:     (id, omr=false) => `${API_BASE}/api/pdf/mock/${id}/paper?include_omr=${omr}`,
};

const CameraAPI = {
  start:    (d)      => POST('/api/camera/start', d),
  snapshot: (sid, d) => POST(`/api/camera/${sid}/snapshot`, d),
  end:      (sid)    => POST(`/api/camera/${sid}/end`, {}),
};

const AdminAPI = {
  stats:        ()   => GET('/api/admin/stats'),
  uploadImage:  (fd) => api('/api/admin/upload/image', { method:'POST', body:fd, headers:{} }),
  uploadPdf:    (fd) => api('/api/admin/upload/pdf',   { method:'POST', body:fd, headers:{} }),
  createQuestion:(d) => POST('/api/admin/questions', d),
  updateQuestion:(id,d)=> PUT(`/api/admin/questions/${id}`, d),
  deleteQuestion:(id)=> DEL(`/api/admin/questions/${id}`),
  createExam:   (fd) => api('/api/admin/exams',   { method:'POST', body:fd, headers:{} }),
  createYear:   (fd) => api('/api/admin/years',   { method:'POST', body:fd, headers:{} }),
  createShift:  (fd) => api('/api/admin/shifts',  { method:'POST', body:fd, headers:{} }),
  createTrack:  (fd) => api('/api/admin/premium/tracks',    { method:'POST', body:fd, headers:{} }),
  createSubject:(fd) => api('/api/admin/premium/subjects',  { method:'POST', body:fd, headers:{} }),
  createDppSet: (fd) => api('/api/admin/premium/dpp-sets',  { method:'POST', body:fd, headers:{} }),
  createDpp:    (fd) => api('/api/admin/premium/dpps',      { method:'POST', body:fd, headers:{} }),
  createTestSet:(fd) => api('/api/admin/premium/test-sets', { method:'POST', body:fd, headers:{} }),
  createChapter:(fd) => api('/api/admin/premium/chapters',  { method:'POST', body:fd, headers:{} }),
  createModule: (fd) => api('/api/admin/premium/modules',   { method:'POST', body:fd, headers:{} }),
  createMock:   (fd) => api('/api/admin/premium/mock-tests',{ method:'POST', body:fd, headers:{} }),
};

// ── Connectivity tracking ──────────────────────────────────────────────────────
window.addEventListener('online',  () => { OfflineQueue.flush(); updateOfflineBanner(false); });
window.addEventListener('offline', () => { updateOfflineBanner(true); });
function updateOfflineBanner(offline) {
  const el = document.getElementById('offline-indicator');
  if (el) el.classList.toggle('visible', offline);
}
