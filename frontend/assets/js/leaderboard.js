/**
 * leaderboard.js — Per-test, Overall, and Daily leaderboard pages.
 */

let _lbTab = 'overall';

async function renderLeaderboard(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  let myRank = null;
  try { if (Auth.isLoggedIn()) myRank = await LbAPI.myRank(); } catch {}
  _drawLeaderboard(container, myRank);
}

function _drawLeaderboard(container, myRank) {
  container.innerHTML = `
    <div class="section-title">Leaderboard</div>
    <div class="section-sub">Rankings update after every online exam submission.</div>

    ${myRank ? `
      <div class="my-rank-card">
        <div>
          <div class="my-rank-main">#${myRank.overall_rank ?? '—'}</div>
          <div class="my-rank-label">Your Overall Rank</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;">${myRank.daily_rank ? '#'+myRank.daily_rank : '—'}</div>
          <div class="my-rank-label">Today's Rank</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;">🔥 ${myRank.streak_days ?? 0}</div>
          <div class="my-rank-label">Day Streak</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;">${myRank.composite_score?.toFixed?.(1) ?? 0}</div>
          <div class="my-rank-label">Score Points</div>
        </div>
        <div>
          <div style="font-size:1.3rem;font-weight:800;">${myRank.total_questions ?? 0}</div>
          <div class="my-rank-label">Questions Solved</div>
        </div>
      </div>` : ''}

    <div class="leaderboard-tabs">
      <button class="lb-tab ${_lbTab==='overall'?'active':''}" onclick="_switchLbTab('overall')">🏆 Overall</button>
      <button class="lb-tab ${_lbTab==='daily'?'active':''}"   onclick="_switchLbTab('daily')">📅 Daily</button>
    </div>

    <div id="lb-body"><div class="loading-overlay"><div class="spinner"></div></div></div>`;

  _loadLbTab(_lbTab);
}

function _switchLbTab(tab) {
  _lbTab = tab;
  document.querySelectorAll('.lb-tab').forEach(el => {
    el.classList.toggle('active',
      (tab==='overall' && el.textContent.includes('Overall')) ||
      (tab==='daily'   && el.textContent.includes('Daily')));
  });
  _loadLbTab(tab);
}

async function _loadLbTab(tab) {
  const body = document.getElementById('lb-body');
  body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    if (tab === 'overall') {
      const data = await LbAPI.overall();
      body.innerHTML = _overallTable(data);
    } else {
      const data = await LbAPI.daily();
      body.innerHTML = _dailyTable(data);
    }
  } catch(e) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${e.message}</h3></div>`;
  }
}

function _rankBadge(rank) {
  const cls = rank===1?'rank-1':rank===2?'rank-2':rank===3?'rank-3':'rank-other';
  const icon = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank;
  return `<span class="rank-badge ${cls}">${icon}</span>`;
}

function _overallTable(data) {
  if (!data.length) return '<div class="empty-state"><div class="empty-icon">🏆</div><h3>No rankings yet — be the first!</h3></div>';
  return `
    <div style="overflow-x:auto;">
      <table class="lb-table">
        <thead><tr>
          <th>Rank</th><th>Student</th><th>Score</th>
          <th>Tests</th><th>Questions</th><th>DPPs</th>
          <th>Streak 🔥</th><th>Accuracy</th>
        </tr></thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${_rankBadge(row.rank)}</td>
              <td>
                <div style="font-weight:600;">${row.full_name || 'Student'}</div>
                <div style="font-size:.75rem;color:var(--text3);">${row.email}</div>
              </td>
              <td><b style="color:var(--primary);">${row.composite_score?.toFixed?.(1)}</b></td>
              <td>${row.total_tests}</td>
              <td>${row.total_questions}</td>
              <td>${row.total_dpps}</td>
              <td>${row.streak_days}d</td>
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="height:7px;background:var(--border);border-radius:99px;width:60px;overflow:hidden;">
                    <div style="height:100%;width:${row.accuracy}%;background:var(--success);border-radius:99px;"></div>
                  </div>
                  ${row.accuracy?.toFixed?.(1)}%
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:.78rem;color:var(--text3);margin-top:12px;text-align:center;">
      Composite score = Accuracy (40%) + Total Score (25%) + DPP Completion (20%) + Streak (15%)
    </div>`;
}

function _dailyTable(data) {
  if (!data.length) return '<div class="empty-state"><div class="empty-icon">📅</div><h3>No activity today yet — go solve some questions!</h3></div>';
  return `
    <div style="overflow-x:auto;">
      <table class="lb-table">
        <thead><tr>
          <th>Rank</th><th>Student</th><th>Questions Solved Today</th><th>Score Today</th>
        </tr></thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${_rankBadge(row.rank)}</td>
              <td>
                <div style="font-weight:600;">${row.full_name || 'Student'}</div>
                <div style="font-size:.75rem;color:var(--text3);">${row.email}</div>
              </td>
              <td><b style="color:var(--primary);">${row.daily_questions_solved}</b></td>
              <td>${row.daily_score?.toFixed?.(1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadPerTestLeaderboard(contentType, contentId, title) {
  const modal = document.getElementById('modal-backdrop');
  document.getElementById('modal-title').textContent = `🏆 ${title} — Leaderboard`;
  document.getElementById('modal-body').innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  document.getElementById('modal-footer').innerHTML = '<button class="btn btn-secondary" onclick="closeModal()">Close</button>';
  modal.classList.add('active');
  try {
    const data = await LbAPI.test(contentType, contentId);
    document.getElementById('modal-body').innerHTML = data.length
      ? `<div style="overflow-x:auto;">
          <table class="lb-table">
            <thead><tr><th>Rank</th><th>Student</th><th>Score</th><th>%</th><th>Time</th></tr></thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  <td>${_rankBadge(row.rank)}</td>
                  <td>
                    <div style="font-weight:600;">${row.full_name||'Student'}</div>
                    <div style="font-size:.75rem;color:var(--text3);">${row.email}</div>
                  </td>
                  <td><b style="color:var(--primary);">${row.score?.toFixed?.(1)} / ${row.max_score?.toFixed?.(0)}</b></td>
                  <td>${row.percentage?.toFixed?.(1)}%</td>
                  <td>${Math.floor(row.time_taken_sec/60)}m ${row.time_taken_sec%60}s</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`
      : '<div class="empty-state"><div class="empty-icon">🏆</div><h3>No submissions yet for this test.</h3></div>';
  } catch(e) {
    document.getElementById('modal-body').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}
