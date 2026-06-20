/**
 * dashboard.js — Performance dashboard using IndexedDB (data stays on device).
 * Stores attempt results, computes stats, renders charts with pure Canvas API.
 * No external chart library needed — all drawn with Canvas 2D.
 */

const DashboardDB = (() => {
  const DB_NAME    = 'examprep_dashboard';
  const DB_VERSION = 1;
  let _db = null;

  async function open() {
    if (_db) return _db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('results')) {
          const s = db.createObjectStore('results', { keyPath: 'attempt_id' });
          s.createIndex('date', 'submitted_at');
        }
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function saveAttemptResult(result) {
    const db    = await open();
    const store = db.transaction('results','readwrite').objectStore('results');
    store.put({ ...result, submitted_at: new Date().toISOString() });
  }

  async function getAllResults() {
    const db = await open();
    return new Promise((res, rej) => {
      const store = db.transaction('results','readonly').objectStore('results');
      const req   = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => rej(req.error);
    });
  }

  async function clearAll() {
    const db = await open();
    db.transaction('results','readwrite').objectStore('results').clear();
  }

  return { saveAttemptResult, getAllResults, clearAll, open };
})();

async function renderDashboard(container) {
  if (!requireAuth()) return;
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

  let results = [];
  try { results = await DashboardDB.getAllResults(); } catch {}

  let myRank = null;
  try { if (Auth.isLoggedIn()) myRank = await LbAPI.myRank(); } catch {}

  _drawDashboard(container, results, myRank);
}

function _drawDashboard(container, results, myRank) {
  const stats = _computeStats(results);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="section-title">My Dashboard</div>
        <div class="section-sub">Your performance data is stored privately on this device only.</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_clearDashboard()">🗑 Clear Data</button>
    </div>

    ${myRank ? _rankBanner(myRank) : ''}

    <div class="dashboard-grid">
      ${_statCard('📝', 'Tests Taken',     stats.totalTests,     '')}
      ${_statCard('✅', 'Correct Answers', stats.totalCorrect,   '')}
      ${_statCard('📊', 'Avg Score %',     stats.avgPct + '%',   '')}
      ${_statCard('🔥', 'Best Streak',     myRank?.streak_days ?? stats.streak + ' days', '')}
      ${_statCard('📚', 'Questions Done',  stats.totalAttempted, '')}
      ${_statCard('🎯', 'Best Score',      stats.bestPct + '%',  'personal best')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;" class="chart-row">
      <div class="chart-card">
        <div class="chart-title">Score Trend</div>
        <div class="chart-container"><canvas id="chart-trend" class="chart-canvas"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Subject Accuracy</div>
        <div class="chart-container"><canvas id="chart-subject" class="chart-canvas"></canvas></div>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:20px;">
      <div class="chart-title">Correct vs Incorrect per Test</div>
      <div class="chart-container" style="height:180px;"><canvas id="chart-bar" class="chart-canvas"></canvas></div>
    </div>

    <div class="chart-card" style="margin-bottom:20px;">
      <div class="chart-title">Activity Heatmap (Last 52 Weeks)</div>
      <div id="heatmap-container" style="overflow-x:auto;padding:8px 0;"></div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.75rem;color:var(--text3);">
        Less <div style="width:12px;height:12px;border-radius:2px;background:var(--border);"></div>
        <div style="width:12px;height:12px;border-radius:2px;background:#bbf7d0;"></div>
        <div style="width:12px;height:12px;border-radius:2px;background:#4ade80;"></div>
        <div style="width:12px;height:12px;border-radius:2px;background:#16a34a;"></div>
        <div style="width:12px;height:12px;border-radius:2px;background:#14532d;"></div> More
      </div>
    </div>

    <div class="card">
      <div class="chart-title">Subject Progress</div>
      <div class="subject-progress">
        ${_subjectProg(stats.bySubject)}
      </div>
    </div>`;

  // Render charts after DOM is ready
  setTimeout(() => {
    _drawLineChart('chart-trend', stats.trend);
    _drawPieChart('chart-subject', stats.bySubject);
    _drawBarChart('chart-bar', results.slice(-10));
    _drawHeatmap(results);
    // Responsive: stack charts on mobile
    if (window.innerWidth < 700) {
      document.querySelector('.chart-row').style.gridTemplateColumns = '1fr';
    }
  }, 50);
}

function _rankBanner(myRank) {
  return `
    <div class="my-rank-card" style="margin-bottom:20px;">
      <div>
        <div class="my-rank-main">#${myRank.overall_rank ?? '—'}</div>
        <div class="my-rank-label">Overall Rank</div>
      </div>
      <div>
        <div style="font-size:1.4rem;font-weight:800;">${myRank.daily_rank ? '#'+myRank.daily_rank : '—'}</div>
        <div style="font-size:.82rem;opacity:.85;">Today's Rank</div>
      </div>
      <div>
        <div style="font-size:1.4rem;font-weight:800;">🔥 ${myRank.streak_days ?? 0}</div>
        <div style="font-size:.82rem;opacity:.85;">Day Streak</div>
      </div>
      <div>
        <div style="font-size:1.4rem;font-weight:800;">${myRank.composite_score?.toFixed?.(1) ?? 0}</div>
        <div style="font-size:.82rem;opacity:.85;">Score Points</div>
      </div>
      <div style="margin-left:auto;">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);" onclick="navigate('#leaderboard')">View Leaderboard</button>
      </div>
    </div>`;
}

function _statCard(icon, label, value, sub) {
  return `
    <div class="dash-stat">
      <div style="font-size:1.4rem;">${icon}</div>
      <div class="ds-value">${value}</div>
      <div class="ds-label">${label}</div>
      ${sub ? `<div class="ds-sub">${sub}</div>` : ''}
    </div>`;
}

function _subjectProg(bySubject) {
  const classes = { PHYSICS:'prog-physics', CHEMISTRY:'prog-chemistry', MATHS:'prog-maths', BIOLOGY:'prog-biology' };
  return Object.entries(bySubject).map(([subj, data]) => {
    const pct = data.total > 0 ? Math.round(data.correct / data.total * 100) : 0;
    return `
      <div class="subject-prog-row">
        <div class="subject-prog-label">
          <span>${subj.charAt(0)+subj.slice(1).toLowerCase()}</span>
          <span>${pct}% accuracy (${data.correct}/${data.total})</span>
        </div>
        <div class="prog-bar-bg">
          <div class="prog-bar-fill ${classes[subj]||'prog-physics'}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('') || '<div class="text-muted" style="font-size:.85rem;">No data yet. Start attempting tests!</div>';
}

function _computeStats(results) {
  if (!results.length) return { totalTests:0, totalCorrect:0, totalAttempted:0, avgPct:0, bestPct:0, streak:0, trend:[], bySubject:{} };

  let totalCorrect = 0, totalAttempted = 0, totalPct = 0, bestPct = 0;
  const bySubject = {};
  const trend = [];

  results.forEach(r => {
    totalCorrect  += r.correct_count || 0;
    totalAttempted+= r.attempted_count || 0;
    const pct = r.percentage ?? (r.max_score > 0 ? r.score/r.max_score*100 : 0);
    totalPct += pct;
    if (pct > bestPct) bestPct = pct;
    trend.push(Math.round(pct));

    Object.entries(r.subject_breakdown || {}).forEach(([subj, data]) => {
      if (!bySubject[subj]) bySubject[subj] = { correct:0, total:0 };
      bySubject[subj].correct += data.correct || 0;
      bySubject[subj].total   += (data.correct||0) + (data.incorrect||0) + (data.unattempted||0);
    });
  });

  return {
    totalTests: results.length, totalCorrect, totalAttempted,
    avgPct: Math.round(totalPct / results.length),
    bestPct: Math.round(bestPct), streak: 0,
    trend: trend.slice(-15),
    bySubject,
  };
}

// ── Canvas Charts ──────────────────────────────────────────────────────────────

function _drawLineChart(id, data) {
  const canvas = document.getElementById(id);
  if (!canvas || !data.length) return;
  const ctx    = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300;
  const H = canvas.offsetHeight || 200;
  canvas.width = W; canvas.height = H;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const pad = { t:20, r:20, b:30, l:40 };
  const cW  = W - pad.l - pad.r;
  const cH  = H - pad.t - pad.b;
  const max = Math.max(...data, 100);
  const step= cW / Math.max(data.length-1, 1);

  ctx.clearRect(0,0,W,H);

  // Grid lines
  ctx.strokeStyle = isDark ? '#2e3855' : '#e8edf8';
  ctx.lineWidth   = 1;
  [0,25,50,75,100].forEach(v => {
    const y = pad.t + cH - (v/max)*cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+cW, y); ctx.stroke();
    ctx.fillStyle = isDark ? '#718096' : '#94a3b8';
    ctx.font = '10px Inter,sans-serif';
    ctx.fillText(v+'%', 2, y+4);
  });

  // Gradient fill under line
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t+cH);
  grad.addColorStop(0, 'rgba(37,99,235,0.25)');
  grad.addColorStop(1, 'rgba(37,99,235,0)');
  ctx.beginPath();
  data.forEach((v,i) => {
    const x = pad.l + i*step;
    const y = pad.t + cH - (v/max)*cH;
    i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.lineTo(pad.l + (data.length-1)*step, pad.t+cH);
  ctx.lineTo(pad.l, pad.t+cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  data.forEach((v,i) => {
    const x = pad.l + i*step;
    const y = pad.t + cH - (v/max)*cH;
    i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Dots
  data.forEach((v,i) => {
    const x = pad.l + i*step;
    const y = pad.t + cH - (v/max)*cH;
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle   = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth   = 2;
    ctx.stroke();
  });
}

function _drawPieChart(id, bySubject) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 280;
  const H = canvas.offsetHeight || 200;
  canvas.width = W; canvas.height = H;

  const entries = Object.entries(bySubject).filter(([,d]) => d.total > 0);
  if (!entries.length) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', W/2, H/2);
    return;
  }

  const colors = { PHYSICS:'#2563eb', CHEMISTRY:'#16a34a', MATHS:'#f59e0b', BIOLOGY:'#ec4899' };
  const total  = entries.reduce((s,[,d]) => s+d.total, 0);
  const cx = W*0.38, cy = H/2, r = Math.min(cx,cy) - 20;

  let angle = -Math.PI/2;
  entries.forEach(([subj, data]) => {
    const slice = (data.total/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,angle,angle+slice);
    ctx.closePath();
    ctx.fillStyle   = colors[subj] || '#94a3b8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();
    angle += slice;
  });

  // Legend
  entries.forEach(([subj, data], i) => {
    const lx = W*0.7, ly = 40 + i*28;
    ctx.fillStyle = colors[subj] || '#94a3b8';
    ctx.fillRect(lx, ly-10, 14, 14);
    ctx.fillStyle = document.documentElement.getAttribute('data-theme')==='dark' ? '#e8edf8' : '#1a1f36';
    ctx.font = '11px Inter,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${subj.charAt(0)+subj.slice(1).toLowerCase()} ${Math.round(data.correct/data.total*100)}%`, lx+18, ly);
  });
}

function _drawBarChart(id, results) {
  const canvas = document.getElementById(id);
  if (!canvas || !results.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 500;
  const H = canvas.offsetHeight || 160;
  canvas.width = W; canvas.height = H;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const pad   = { t:10, r:10, b:30, l:10 };
  const bW    = (W - pad.l - pad.r) / results.length;
  const grpW  = bW * 0.8;
  const barW  = grpW / 2 - 2;

  results.forEach((r, i) => {
    const maxQ   = r.total_questions || 1;
    const x      = pad.l + i*bW + bW*0.1;
    const correct  = (r.correct_count  / maxQ) * (H - pad.t - pad.b);
    const incorrect= (r.incorrect_count/ maxQ) * (H - pad.t - pad.b);

    // Correct bar
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(x, H - pad.b - correct, barW, correct);
    // Incorrect bar
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + barW + 2, H - pad.b - incorrect, barW, incorrect);

    // X label
    ctx.fillStyle = isDark ? '#718096' : '#94a3b8';
    ctx.font = '9px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`T${i+1}`, x + barW/2, H - pad.b + 12);
  });

  // Legend
  const ly = H - 4;
  ctx.fillStyle = '#16a34a'; ctx.fillRect(W-90, ly-10, 10, 10);
  ctx.fillStyle = '#dc2626'; ctx.fillRect(W-60, ly-10, 10, 10);
  ctx.fillStyle = isDark ? '#e8edf8' : '#4a5568';
  ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Correct', W-78, ly);
  ctx.fillText('Wrong', W-48, ly);
}

function _drawHeatmap(results) {
  const container = document.getElementById('heatmap-container');
  if (!container) return;
  // Build a map of date -> count
  const dateMap = {};
  results.forEach(r => {
    const d = r.submitted_at?.slice?.(0,10);
    if (d) dateMap[d] = (dateMap[d]||0) + 1;
  });

  const today   = new Date();
  const WEEKS   = 52;
  const DAYS    = 7;
  const cells   = [];

  for (let w = WEEKS-1; w >= 0; w--) {
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w*7 + (DAYS-1-d)));
      const key   = date.toISOString().slice(0,10);
      const count = dateMap[key] || 0;
      const level = count === 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 6 ? 3 : 4;
      cells.push(`<div class="heatmap-cell" data-level="${level}" title="${key}: ${count} tests"></div>`);
    }
  }

  container.innerHTML = `<div class="heatmap-grid">${cells.join('')}</div>`;
}

async function _clearDashboard() {
  if (!confirm('Clear all local dashboard data? This cannot be undone.')) return;
  await DashboardDB.clearAll();
  showToast('Dashboard data cleared.', 'info');
  renderDashboard(document.getElementById('page-content'));
}
