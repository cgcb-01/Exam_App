const CF_RATINGS = [
  { min:0,    max:1199, title:'Newbie',          color:'#808080', bg:'#e5e5e5' },
  { min:1200, max:1399, title:'Pupil',            color:'#008000', bg:'#d4edda' },
  { min:1400, max:1599, title:'Specialist',       color:'#03a89e', bg:'#d1f0ee' },
  { min:1600, max:1899, title:'Expert',           color:'#0000ff', bg:'#d0d0ff' },
  { min:1900, max:2099, title:'Candidate Master', color:'#aa00aa', bg:'#f0d0f0' },
  { min:2100, max:2299, title:'Master',           color:'#ff8c00', bg:'#ffe0b0' },
  { min:2300, max:2399, title:'International Master', color:'#ff8c00', bg:'#ffe0b0' },
  { min:2400, max:2599, title:'Grandmaster',      color:'#ff0000', bg:'#ffd0d0' },
  { min:2600, max:2999, title:'International Grandmaster', color:'#ff0000', bg:'#ffd0d0' },
  { min:3000, max:9999, title:'Legendary Grandmaster', color:'#aa0000', bg:'#ffb0b0' },
];

function getRating(score) {
  // Rating formula: composite score maps to 0–3500 range but very slowly
  // Base: 800 + score * 0.6 (capped so nobody gets to 2400+ easily)
  const raw = Math.round(800 + score * 0.6);
  return Math.min(raw, 3400);
}

function getRatingInfo(rating) {
  return CF_RATINGS.find(r => rating >= r.min && rating <= r.max) || CF_RATINGS[0];
}

function ratingBadge(rating) {
  const info = getRatingInfo(rating);
  return `<span style="color:${info.color};font-weight:800;font-size:13px">${rating}</span>
    <span style="font-size:10px;font-weight:700;background:${info.bg};color:${info.color};padding:1px 7px;border-radius:3px;margin-left:4px">${info.title}</span>`;
}

function rankMedal(rank) {
  if (rank === 1) return `<div class="rank-medal medal-1">1</div>`;
  if (rank === 2) return `<div class="rank-medal medal-2">2</div>`;
  if (rank === 3) return `<div class="rank-medal medal-3">3</div>`;
  return `<div class="rank-medal medal-n">${rank}</div>`;
}

registerPage('leaderboard', async function(el) {
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  let myRank = null;
  if (Auth.loggedIn()) { try { myRank = await GET('/api/leaderboard/my-rank'); } catch {} }
  _lbRender(el, myRank, 'overall');
});

let _lbMode = 'overall';

function _lbRender(el, myRank, mode) {
  _lbMode = mode;
  const myRating = myRank ? getRating(myRank.composite_score || 0) : 0;
  const myInfo   = getRatingInfo(myRating);

  el.innerHTML = `<div class="fade-in">
    <!-- My standing bar -->
    ${myRank ? `<div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);padding:18px 22px;margin-bottom:20px;display:flex;gap:24px;flex-wrap:wrap;align-items:center">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:4px">Your Rating</div>
        <div>${ratingBadge(myRating)}</div>
      </div>
      <div style="width:1px;height:40px;background:var(--c-border)"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:4px">Overall Rank</div>
        <div style="font-size:22px;font-weight:900;color:var(--c-text)">#${myRank.overall_rank || '—'}</div>
      </div>
      <div style="width:1px;height:40px;background:var(--c-border)"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:4px">Today's Rank</div>
        <div style="font-size:22px;font-weight:900;color:var(--c-text)">${myRank.daily_rank ? '#'+myRank.daily_rank : '—'}</div>
      </div>
      <div style="width:1px;height:40px;background:var(--c-border)"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:4px">Streak</div>
        <div style="font-size:22px;font-weight:900;color:var(--c-amber)">${myRank.streak_days || 0} days</div>
      </div>
      <div style="width:1px;height:40px;background:var(--c-border)"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:4px">Solved</div>
        <div style="font-size:22px;font-weight:900;color:var(--c-text)">${myRank.total_questions || 0}</div>
      </div>
      <div style="margin-left:auto">
        <div style="font-size:11px;color:var(--c-text4);margin-bottom:8px;text-align:right">Rating Progress</div>
        <div style="width:180px;height:6px;background:var(--c-border);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.min((myRating/3000)*100,100)}%;background:${myInfo.color};border-radius:99px;transition:width .8s ease"></div>
        </div>
        <div style="font-size:10px;color:var(--c-text4);margin-top:4px;text-align:right">${myRating} / 3000</div>
      </div>
    </div>` : ''}

    <!-- Rating legend -->
    <div class="card" style="margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 18px;background:var(--c-surface2);border-bottom:1px solid var(--c-border)">
        <div style="font-size:12px;font-weight:800;color:var(--c-text)">Rating Tiers — Earning high rating requires consistent performance across many tests</div>
      </div>
      <div style="padding:14px 18px;display:flex;flex-wrap:wrap;gap:10px">
        ${CF_RATINGS.filter((_,i) => i % 2 === 0).map(r => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 10px;background:${r.bg};border-radius:4px;min-width:140px">
          <div style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0"></div>
          <span style="font-size:11px;font-weight:700;color:${r.color}">${r.title}</span>
          <span style="font-size:10px;color:${r.color};opacity:.7">${r.min}+</span>
        </div>`).join('')}
      </div>
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:2px;background:var(--c-surface2);padding:3px;border-radius:var(--radius-sm);width:fit-content;margin-bottom:16px">
      ${[['overall','Overall Standings'],['daily','Daily Contest']].map(([m,l]) =>
        `<button class="tab-item ${mode===m?'active':''}" onclick="_lbSwitch('${m}')">${l}</button>`).join('')}
    </div>

    <div class="card" style="overflow:hidden" id="lb-table-wrap">
      <div class="loading-center" style="min-height:200px"><div class="spinner"></div></div>
    </div>
  </div>`;
  _lbLoad(mode);
}

async function _lbSwitch(mode) {
  _lbMode = mode;
  document.querySelectorAll('.tab-item').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(mode === 'overall' ? 'overall' : 'daily'));
  });
  _lbLoad(mode);
}

async function _lbLoad(mode) {
  const wrap = document.getElementById('lb-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-center" style="min-height:200px"><div class="spinner"></div></div>';
  try {
    if (mode === 'overall') {
      const data = await GET('/api/leaderboard/overall');
      wrap.innerHTML = _overallTable(data);
    } else {
      const data = await GET('/api/leaderboard/daily');
      wrap.innerHTML = _dailyTable(data);
    }
  } catch(e) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

function _overallTable(data) {
  if (!data.length) return `<div class="empty-state"><div class="empty-title">No rankings yet</div><div class="empty-sub">Complete tests to appear on the leaderboard</div></div>`;
  return `<div style="overflow-x:auto">
    <div style="padding:14px 18px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:800;color:var(--c-text)">Overall Leaderboard</div>
      <div style="font-size:11px;color:var(--c-text4)">${data.length} participants</div>
    </div>
    <table class="data-table">
      <thead><tr>
        <th style="width:60px">Rank</th>
        <th>Handle</th>
        <th>Rating</th>
        <th>Tests</th>
        <th>Questions</th>
        <th>DPPs</th>
        <th>Streak</th>
        <th style="text-align:right">Accuracy</th>
      </tr></thead>
      <tbody>
      ${data.map(row => {
        const rating = getRating(row.composite_score || 0);
        const info   = getRatingInfo(rating);
        return `<tr>
          <td><div class="cf-rank-cell">${rankMedal(row.rank)}</div></td>
          <td>
            <div>
              <span class="cf-handle" style="color:${info.color}">${row.full_name || row.email.split('@')[0]}</span>
              ${ratingBadge(rating).split('\n')[1]}
            </div>
            <div style="font-size:10px;color:var(--c-text4)">${row.email}</div>
          </td>
          <td><span style="color:${info.color};font-weight:800">${rating}</span></td>
          <td><span style="font-weight:700">${row.total_tests}</span></td>
          <td>${row.total_questions}</td>
          <td>${row.total_dpps}</td>
          <td><span style="color:var(--c-amber);font-weight:700">${row.streak_days}d</span></td>
          <td style="text-align:right">
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
              <div style="width:48px;height:5px;background:var(--c-border);border-radius:99px;overflow:hidden">
                <div style="height:100%;width:${Math.round(row.accuracy||0)}%;background:var(--c-green)"></div>
              </div>
              <span style="font-size:11px;font-weight:700;color:var(--c-text)">${(row.accuracy||0).toFixed(1)}%</span>
            </div>
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    <div style="padding:12px 18px;background:var(--c-surface2);border-top:1px solid var(--c-border);font-size:10px;color:var(--c-text4)">
      Rating = 800 + (composite score × 0.6). Composite = Accuracy (40%) + Score (25%) + DPPs (20%) + Streak (15%). Max achievable ~3200.
    </div>
  </div>`;
}

function _dailyTable(data) {
  if (!data.length) return `<div class="empty-state"><div class="empty-title">No activity today yet</div><div class="empty-sub">Solve questions to appear on today's board</div></div>`;
  return `<div style="overflow-x:auto">
    <div style="padding:14px 18px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:13px;font-weight:800;color:var(--c-text)">Daily Standing — ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
      <div style="font-size:11px;color:var(--c-text4)">Resets at midnight</div>
    </div>
    <table class="data-table">
      <thead><tr><th>Rank</th><th>Handle</th><th>Questions Today</th><th style="text-align:right">Score Today</th></tr></thead>
      <tbody>
      ${data.map(row => `<tr>
        <td>${rankMedal(row.rank)}</td>
        <td><span class="cf-handle">${row.full_name || row.email.split('@')[0]}</span><div style="font-size:10px;color:var(--c-text4)">${row.email}</div></td>
        <td><span style="font-size:16px;font-weight:800;color:var(--c-blue)">${row.daily_questions_solved}</span></td>
        <td style="text-align:right;font-weight:700;color:var(--c-text)">${(row.daily_score||0).toFixed(1)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

async function lbPerTest(ctype, cid, label) {
  openModal('Test Leaderboard — ' + label,
    '<div class="loading-center" style="min-height:200px"><div class="spinner"></div></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button>');
  try {
    const data = await GET(`/api/leaderboard/test/${ctype}/${cid}`);
    const body = document.getElementById('modal-body');
    if (!data.length) { body.innerHTML = '<div class="empty-state" style="padding:32px"><div class="empty-title">No submissions yet</div><div class="empty-sub">Be the first to complete this test</div></div>'; return; }
    body.innerHTML = `<div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Participant</th><th>Score</th><th>%</th><th>Time</th></tr></thead>
        <tbody>
        ${data.map(row => {
          const rating = getRating(row.score || 0);
          const info   = getRatingInfo(rating);
          return `<tr>
            <td>${rankMedal(row.rank)}</td>
            <td><span class="cf-handle" style="color:${info.color}">${row.full_name||row.email.split('@')[0]}</span><div style="font-size:10px;color:var(--c-text4)">${row.email}</div></td>
            <td style="font-weight:800;color:var(--c-blue)">${row.score.toFixed(1)} / ${row.max_score.toFixed(0)}</td>
            <td>${row.percentage.toFixed(1)}%</td>
            <td>${Math.floor(row.time_taken_sec/60)}m ${row.time_taken_sec%60}s</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) { document.getElementById('modal-body').innerHTML = `<div class="empty-state"><div class="empty-sub">${e.message}</div></div>`; }
}
