const DashDB = (() => {
  let _db = null;
  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open('examprep_v1', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('results')) {
          const s = db.createObjectStore('results', { keyPath: 'attempt_id' });
          s.createIndex('date', 'submitted_at');
        }
        if (!db.objectStoreNames.contains('streak')) {
          db.createObjectStore('streak', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror   = e => rej(e.target.error);
    });
  }
  async function save(result) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('results', 'readwrite');
      tx.objectStore('results').put({ ...result, submitted_at: new Date().toISOString() });
      tx.oncomplete = () => res();
      tx.onerror    = e => rej(e.target.error);
    });
  }
  async function all() {
    const db = await open();
    return new Promise((res, rej) => {
      const req = db.transaction('results','readonly').objectStore('results').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = e => rej(e.target.error);
    });
  }
  async function clear() {
    const db = await open();
    return new Promise((res, rej) => {
      const req = db.transaction('results','readwrite').objectStore('results').clear();
      req.onsuccess = () => res(); req.onerror = e => rej(e.target.error);
    });
  }
  return { save, all, clear, open };
})();

registerPage('dashboard', async function(el) {
  if (!requireLogin()) return;
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  let results = [], myRank = null;
  try { results = await DashDB.all(); } catch {}
  try { myRank = await GET('/api/leaderboard/my-rank'); } catch {}
  _drawDash(el, results, myRank);
});

function _drawDash(el, results, myRank) {
  const S = _stats(results);
  const myRating = myRank ? getRating(myRank.composite_score || 0) : 0;
  const rInfo    = getRatingInfo(myRating);

  el.innerHTML = `<div class="fade-in">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div class="page-header" style="margin-bottom:0">
        <div class="page-title">My Dashboard</div>
        <div class="page-sub">Performance data stored locally on this device only.</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="_dashClear()">Clear Local Data</button>
    </div>

    <!-- Rating card -->
    ${myRank ? `<div style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);border-radius:var(--radius-xl);padding:22px 28px;color:#fff;margin-bottom:20px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;opacity:.7;margin-bottom:6px">Your Rating</div>
        <div style="font-size:36px;font-weight:900;letter-spacing:-1px;color:${rInfo.color==='#fff'?'#fff':rInfo.color}">${myRating}</div>
        <div style="font-size:12px;font-weight:700;opacity:.8">${rInfo.title}</div>
      </div>
      <div style="width:1px;height:50px;background:rgba(255,255,255,.2)"></div>
      <div><div style="font-size:10px;font-weight:700;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Overall Rank</div><div style="font-size:28px;font-weight:900">#${myRank.overall_rank||'—'}</div></div>
      <div style="width:1px;height:50px;background:rgba(255,255,255,.2)"></div>
      <div><div style="font-size:10px;font-weight:700;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Streak</div><div style="font-size:28px;font-weight:900;color:#fcd34d">${myRank.streak_days||0}d</div></div>
      <div style="width:1px;height:50px;background:rgba(255,255,255,.2)"></div>
      <div><div style="font-size:10px;font-weight:700;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Solved</div><div style="font-size:28px;font-weight:900">${myRank.total_questions||0}</div></div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:10px;opacity:.7;margin-bottom:8px">Progress to next tier</div>
        <div style="width:160px;height:6px;background:rgba(255,255,255,.2);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.min((myRating/3000)*100,100)}%;background:#fff;border-radius:99px"></div>
        </div>
        <div style="font-size:10px;opacity:.6;margin-top:4px">${myRating} / ${rInfo.max}</div>
      </div>
    </div>` : ''}

    <!-- Stats grid -->
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-val">${S.total}</div><div class="stat-lbl">Tests Taken</div></div>
      <div class="stat-card"><div class="stat-val">${S.correct}</div><div class="stat-lbl">Correct</div></div>
      <div class="stat-card"><div class="stat-val">${S.avgPct}%</div><div class="stat-lbl">Avg Score</div></div>
      <div class="stat-card"><div class="stat-val">${S.best}%</div><div class="stat-lbl">Best Score</div></div>
      <div class="stat-card"><div class="stat-val">${S.attempted}</div><div class="stat-lbl">Attempted</div></div>
    </div>

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" id="chart-row">
      <div class="card"><div class="card-body">
        <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:14px">Score Trend</div>
        <canvas id="chart-trend" height="160" style="width:100%"></canvas>
      </div></div>
      <div class="card"><div class="card-body">
        <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:14px">Subject Accuracy</div>
        <canvas id="chart-subj" height="160" style="width:100%"></canvas>
      </div></div>
    </div>

    <!-- Heatmap -->
    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:14px">Activity Heatmap (Last 52 Weeks)</div>
      <div id="heatmap" style="overflow-x:auto"></div>
      <div style="display:flex;align-items:center;gap:5px;margin-top:10px;font-size:11px;color:var(--c-text4)">
        Less&nbsp;
        <div style="width:11px;height:11px;border-radius:2px;background:var(--c-border)"></div>
        <div class="hm-l1" style="width:11px;height:11px;border-radius:2px"></div>
        <div class="hm-l2" style="width:11px;height:11px;border-radius:2px"></div>
        <div class="hm-l3" style="width:11px;height:11px;border-radius:2px"></div>
        <div class="hm-l4" style="width:11px;height:11px;border-radius:2px"></div>
        &nbsp;More
      </div>
    </div></div>

    <!-- Subject progress -->
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:14px">Subject Accuracy</div>
      ${_subjProgress(S.bySubj)}
    </div></div>
  </div>`;

  if (window.innerWidth < 700) document.getElementById('chart-row').style.gridTemplateColumns = '1fr';
  setTimeout(() => { _drawTrend(S.trend); _drawSubjPie(S.bySubj); _drawHeatmap(results); }, 60);
}

function _stats(results) {
  if (!results.length) return { total:0, correct:0, attempted:0, avgPct:0, best:0, trend:[], bySubj:{} };
  let correct=0, attempted=0, totalPct=0, best=0;
  const bySubj = {}, trend = [];
  results.forEach(r => {
    correct   += r.correct_count  || 0;
    attempted += r.attempted_count|| 0;
    const pct = r.percentage ?? (r.max_score>0 ? r.score/r.max_score*100 : 0);
    totalPct += pct; if (pct > best) best = pct;
    trend.push(Math.round(pct));
    Object.entries(r.subject_breakdown||{}).forEach(([s,b]) => {
      if (!bySubj[s]) bySubj[s] = { c:0, t:0 };
      bySubj[s].c += b.correct||0;
      bySubj[s].t += (b.correct||0)+(b.incorrect||0)+(b.unattempted||0);
    });
  });
  return { total:results.length, correct, attempted, avgPct:Math.round(totalPct/results.length), best:Math.round(best), trend:trend.slice(-15), bySubj };
}

function _subjProgress(bySubj) {
  const cols = { PHYSICS:'#2563eb', CHEMISTRY:'#059669', MATHS:'#d97706', BIOLOGY:'#db2777' };
  const entries = Object.entries(bySubj);
  if (!entries.length) return '<div style="font-size:12px;color:var(--c-text4);padding:8px 0">No data yet. Start attempting tests.</div>';
  return entries.map(([s, d]) => {
    const pct = d.t > 0 ? Math.round(d.c/d.t*100) : 0;
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:5px">
        <span>${s.charAt(0)+s.slice(1).toLowerCase()}</span>
        <span style="color:var(--c-text3)">${pct}% (${d.c}/${d.t})</span>
      </div>
      <div style="height:7px;background:var(--c-border);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${cols[s]||'#2563eb'};border-radius:99px;transition:width .8s ease"></div>
      </div>
    </div>`;
  }).join('');
}

function _drawTrend(data) {
  const canvas = document.getElementById('chart-trend'); if (!canvas||!data.length) return;
  const W = canvas.offsetWidth||300, H = 160; canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = dark ? '#2a3148' : '#e2e5f0';
  const textColor = dark ? '#64748b' : '#94a3b8';
  const p = { t:16, r:16, b:28, l:38 };
  const cW=W-p.l-p.r, cH=H-p.t-p.b, max=100, step=cW/Math.max(data.length-1,1);
  // Grid
  [0,25,50,75,100].forEach(v => {
    const y = p.t + cH - (v/max)*cH;
    ctx.strokeStyle=gridColor; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(p.l+cW,y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle=textColor; ctx.font='9px Inter,sans-serif';
    ctx.textAlign='right'; ctx.fillText(v+'%', p.l-5, y+3);
  });
  // Area fill
  const grad = ctx.createLinearGradient(0,p.t,0,p.t+cH);
  grad.addColorStop(0,'rgba(37,99,235,0.2)'); grad.addColorStop(1,'rgba(37,99,235,0)');
  ctx.beginPath();
  data.forEach((v,i) => { const x=p.l+i*step, y=p.t+cH-(v/max)*cH; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.lineTo(p.l+(data.length-1)*step, p.t+cH); ctx.lineTo(p.l, p.t+cH); ctx.closePath();
  ctx.fillStyle=grad; ctx.fill();
  // Line
  ctx.beginPath(); ctx.strokeStyle='#2563eb'; ctx.lineWidth=2; ctx.lineJoin='round';
  data.forEach((v,i) => { const x=p.l+i*step, y=p.t+cH-(v/max)*cH; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.stroke();
  // Dots
  data.forEach((v,i) => {
    const x=p.l+i*step, y=p.t+cH-(v/max)*cH;
    ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#2563eb'; ctx.lineWidth=2; ctx.stroke();
  });
}

function _drawSubjPie(bySubj) {
  const canvas = document.getElementById('chart-subj'); if (!canvas) return;
  const W=canvas.offsetWidth||260, H=160; canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  const entries=Object.entries(bySubj).filter(([,d])=>d.t>0);
  if (!entries.length) { ctx.fillStyle=document.documentElement.getAttribute('data-theme')==='dark'?'#64748b':'#94a3b8'; ctx.font='12px Inter'; ctx.textAlign='center'; ctx.fillText('No data yet',W/2,H/2); return; }
  const colors={PHYSICS:'#2563eb',CHEMISTRY:'#059669',MATHS:'#d97706',BIOLOGY:'#db2777'};
  const total=entries.reduce((s,[,d])=>s+d.t,0);
  const cx=H/2, cy=H/2, r=H/2-10;
  let angle=-Math.PI/2;
  entries.forEach(([s,d]) => {
    const slice=(d.t/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
    ctx.fillStyle=colors[s]||'#94a3b8'; ctx.fill();
    ctx.strokeStyle='var(--c-surface)'; ctx.lineWidth=2; ctx.stroke();
    angle+=slice;
  });
  // Legend
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  entries.forEach(([s,d],i) => {
    const pct=Math.round(d.c/d.t*100);
    const lx=H+12, ly=20+i*26;
    ctx.fillStyle=colors[s]||'#94a3b8'; ctx.fillRect(lx,ly-9,12,12);
    ctx.fillStyle=dark?'#cbd5e1':'#374151'; ctx.font='11px Inter'; ctx.textAlign='left';
    ctx.fillText(`${s.charAt(0)+s.slice(1).toLowerCase()} ${pct}%`,lx+16,ly);
  });
}

function _drawHeatmap(results) {
  const el=document.getElementById('heatmap'); if (!el) return;
  const dateMap={};
  results.forEach(r => { const d=r.submitted_at?.slice(0,10); if(d) dateMap[d]=(dateMap[d]||0)+1; });
  const today=new Date(), WEEKS=52;
  let colsHTML='';
  for (let w=WEEKS-1; w>=0; w--) {
    let colHTML='';
    for (let d=0; d<7; d++) {
      const dt=new Date(today); dt.setDate(today.getDate()-(w*7+(6-d)));
      const key=dt.toISOString().slice(0,10);
      const cnt=dateMap[key]||0;
      const lvl=cnt===0?0:cnt<2?1:cnt<4?2:cnt<6?3:4;
      colHTML+=`<div class="hm-cell ${lvl>0?'hm-l'+lvl:''}" title="${key}: ${cnt} tests"></div>`;
    }
    colsHTML+=`<div class="heatmap-col">${colHTML}</div>`;
  }
  el.innerHTML=`<div class="heatmap-row">${colsHTML}</div>`;
}

async function _dashClear() {
  if (!confirm('Clear all local performance data? This cannot be undone.')) return;
  await DashDB.clear();
  toast('Dashboard data cleared.', 'info');
  go('dashboard');
}
