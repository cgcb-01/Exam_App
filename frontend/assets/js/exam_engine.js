// exam_engine.js — Full exam interface
'use strict';
let _E = {};

async function examLaunch(opts = {}) {
  if (!requireLogin()) return;
  window._lastExamOpts = opts;
  const overlay = document.getElementById('exam-overlay');
  overlay.className = 'open';
  overlay.style.cssText = 'display:flex;flex-direction:column;position:fixed;inset:0;background:var(--c-bg);z-index:1000;';
  overlay.innerHTML = '<div class="loading-center" style="height:100vh"><div class="spinner"></div><div class="loading-text">Loading exam...</div></div>';

  try {
    let attempt, questions;
    if (opts.readonly && opts.attempt_id) {
      attempt = await GET('/api/attempts/' + opts.attempt_id);
      questions = await GET('/api/attempts/' + opts.attempt_id + '/solutions');
      _E.readonly = true;
    } else {
      let camId = null;
      if (opts.camera) {
        try { const cs = await POST('/api/camera/start', { attempt_context: opts.title || '' }); camId = cs.id; } catch {}
      }
      attempt = await POST('/api/attempts/start', {
        shift_id: opts.shift_id || null, dpp_id: opts.dpp_id || null,
        module_id: opts.module_id || null, mock_test_id: opts.mock_test_id || null,
        is_offline_attempt: false, camera_session_id: camId
      });
      questions = attempt.questions;
      _E.readonly = false;
      _E.camId = camId;
    }

    _E = { ..._E, id: attempt.id, qs: questions, cur: 0, opts,
      endTime: Date.now() + attempt.duration_minutes_allotted * 60000,
      dur: attempt.duration_minutes_allotted,
      started: new Date(attempt.started_at).getTime(),
      answers: {}, timer: null, qTimer: Date.now(),
      subjects: [...new Set(questions.map(q => q.subject))],
    };

    (attempt.answers || []).forEach(a => {
      _E.answers[a.question_id] = { sel: a.selected_answer, status: a.status || 'NOT_VISITED', time: a.time_spent_seconds || 0 };
    });
    questions.forEach(q => { if (!_E.answers[q.id]) _E.answers[q.id] = { sel: null, status: 'NOT_VISITED', time: 0 }; });

    _buildExam(opts.title || 'Exam');
    if (!_E.readonly) _startTimer();
    if (opts.camera && _E.camId) _startCam();
  } catch (e) {
    overlay.style.display = 'none';
    toast('Failed to load: ' + e.message, 'err');
  }
}

function _buildExam(title) {
  const ro = _E.readonly;
  document.getElementById('exam-overlay').innerHTML = `
    <div class="exam-topbar">
      <button onclick="_examExit()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:5px 10px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;cursor:pointer">Exit</button>
      <span class="exam-topbar-title">${title}</span>
      ${ro ? '<span style="background:rgba(255,255,255,.1);color:#fff;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700">REVIEW MODE</span>'
           : `<div class="exam-timer-box" id="exam-timer">--:--</div>`}
    </div>
    <div class="exam-body">
      <div class="exam-q-panel">
        <div class="exam-q-toolbar">
          <div id="subj-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          <div class="q-progress" id="q-prog">1 / ${_E.qs.length}</div>
        </div>
        <div class="exam-q-scroll"><div id="exam-qarea"></div></div>
        <div class="exam-footer" id="exam-footer"></div>
      </div>
      <div class="exam-palette">
        <div class="palette-top">
          <div class="palette-title">Question Palette</div>
          <div class="palette-legend" id="pal-legend"></div>
        </div>
        <div class="palette-grid-wrap" id="pal-grid"></div>
        ${ro ? '' : `<div class="palette-submit"><button class="btn btn-danger" style="width:100%" onclick="_examSubmit(false)">Submit Test</button></div>`}
      </div>
    </div>`;
  _renderSubjChips();
  _renderPalette();
  _goQ(0);
}

function _renderSubjChips() {
  const chips = document.getElementById('subj-chips'); if (!chips) return;
  const cur = _E.qs[_E.cur];
  chips.innerHTML = _E.subjects.map(s => `<button class="subject-chip ${s === cur?.subject ? 'active' : ''}" onclick="_jumpSubj('${s}')">${s.charAt(0)+s.slice(1).toLowerCase()}</button>`).join('');
}

function _jumpSubj(s) {
  const idx = _E.qs.findIndex(q => q.subject === s);
  if (idx >= 0) _goQ(idx);
}

function _goQ(idx) {
  // Save time on current
  const curQ = _E.qs[_E.cur];
  if (curQ) {
    _E.answers[curQ.id].time += Math.round((Date.now() - _E.qTimer) / 1000);
    if (_E.answers[curQ.id].status === 'NOT_VISITED') {
      _E.answers[curQ.id].status = 'NOT_ANSWERED';
      if (!_E.readonly) _saveAnswer(curQ.id);
    }
  }
  _E.cur = Math.max(0, Math.min(idx, _E.qs.length - 1));
  _E.qTimer = Date.now();
  const q = _E.qs[_E.cur];
  document.getElementById('q-prog').textContent = `${_E.cur + 1} / ${_E.qs.length}`;
  _renderSubjChips();
  _renderQ(q);
  _renderFooter(q);
  _renderPalette();
  document.querySelector(`.pq-btn[data-i="${_E.cur}"]`)?.scrollIntoView({ block: 'nearest' });
}

function _renderQ(q) {
  const ans = _E.answers[q.id];
  const ro = _E.readonly;
  const isNum = q.question_type === 'NUMERICAL';
  const isMulti = q.question_type === 'MCQ_MULTIPLE';
  const opts = [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]].filter(([,v])=>v);
  const corr = new Set((q.correct_answer||'').split(',').map(s=>s.trim()));

  document.getElementById('exam-qarea').innerHTML = `
    <div class="exam-q-card fade-in">
      <div class="q-num-row">
        <span class="q-num-pill">Q${q.question_number}</span>
        ${isMulti ? '<span class="q-type-pill">Multiple Correct</span>' : ''}
        ${isNum   ? '<span class="q-type-pill">Numerical</span>' : ''}
        <span class="q-marks-pill">+${q.marks_correct} / ${q.marks_incorrect}</span>
      </div>
      ${q.question_text ? `<div class="q-text">${q.question_text}</div>` : ''}
      ${q.question_image_path ? `<img src="/static/${q.question_image_path}" class="q-image">` : ''}
      ${isNum ? _numpadHTML(q, ans) : `<div class="options-list">
        ${opts.map(([k,v]) => {
          const sel = (ans.sel||'').split(',').map(s=>s.trim()).includes(k);
          let cls = '';
          if (ro) { cls = corr.has(k) ? 'correct' : sel ? 'wrong' : ''; }
          else     { cls = sel ? 'selected' : ''; }
          return `<div class="option-row ${cls}" ${ro?'style="cursor:default"':''} onclick="${ro?'':JSON.stringify(`_pickOpt('${q.id}','${k}',${isMulti})`).slice(1,-1)}">
            <div class="option-key">${k}</div>
            <div class="option-text">${v}</div>
            ${ro && corr.has(k) ? `<span style="margin-left:auto;color:var(--c-green)">${IC.chk}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`}
      ${ro && (q.solution_text || q.correct_answer) ? `
        <div style="margin-top:14px;padding:12px 14px;background:var(--c-green-l);border-radius:var(--radius-sm);border-left:3px solid var(--c-green)">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--c-green);margin-bottom:4px">Correct Answer: ${q.correct_answer}</div>
          ${q.solution_text ? `<div style="font-size:12px;color:var(--c-text2);line-height:1.7">${q.solution_text}</div>` : ''}
        </div>` : ''}
    </div>`;
}

function _numpadHTML(q, ans) {
  return `<div class="numpad-wrapper">
    <div class="num-display" id="num-disp">${ans.sel || '—'}</div>
    <div class="numpad-grid">
      ${[7,8,9,'DEL',4,5,6,'±',1,2,3,'.','0','00','C','OK'].map(k =>
        `<button class="numpad-key ${k==='DEL'||k==='C'?'del':k==='±'||k==='OK'?'fn':''}" onclick="_numKey('${q.id}','${k}')">${k}</button>`).join('')}
    </div>
  </div>`;
}

function _numKey(qId, k) {
  const ans = _E.answers[qId]; let v = ans.sel || '';
  if (k==='C')   v='';
  else if (k==='DEL') v=v.slice(0,-1);
  else if (k==='±')   v = v.startsWith('-') ? v.slice(1) : '-'+v;
  else if (k==='OK')  { _saveAndNext(); return; }
  else if (k==='.' && v.includes('.')) return;
  else v += k;
  ans.sel = v||null; ans.status = v ? 'ANSWERED' : 'NOT_ANSWERED';
  const d = document.getElementById('num-disp'); if(d) d.textContent = v||'—';
}

function _pickOpt(qId, key, isMulti) {
  const ans = _E.answers[qId];
  if (isMulti) {
    const sel = new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
    sel.has(key) ? sel.delete(key) : sel.add(key);
    ans.sel = [...sel].sort().join(',') || null;
  } else {
    ans.sel = ans.sel === key ? null : key;
  }
  ans.status = ans.sel ? 'ANSWERED' : 'NOT_ANSWERED';
  _renderQ(_E.qs[_E.cur]);
  _renderPalette();
}

function _renderFooter(q) {
  const ro = _E.readonly;
  const el = document.getElementById('exam-footer'); if (!el) return;
  if (ro) {
    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="_goQ(${_E.cur-1})" ${_E.cur===0?'disabled':''}>Previous</button>
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="_goQ(${_E.cur+1})" ${_E.cur===_E.qs.length-1?'disabled':''}>Next</button>`;
  } else {
    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="_clearResp('${q.id}')">Clear</button>
      <button class="btn btn-sm" style="background:var(--q-marked);color:#fff" onclick="_markReview('${q.id}')">Mark for Review</button>
      <div style="flex:1"></div>
      <button class="btn btn-secondary btn-sm" onclick="_goQ(${_E.cur-1})" ${_E.cur===0?'disabled':''}>Previous</button>
      <button class="btn btn-primary btn-sm" onclick="_saveAndNext()">Save & Next</button>`;
  }
}

function _clearResp(qId) {
  const ans = _E.answers[qId]; ans.sel = null; ans.status = 'NOT_ANSWERED';
  _saveAnswer(qId); _renderQ(_E.qs[_E.cur]); _renderPalette();
}
function _markReview(qId) {
  const ans = _E.answers[qId];
  ans.status = ans.sel ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW';
  _saveAnswer(qId); _renderPalette(); _goQ(_E.cur+1);
}
function _saveAndNext() {
  const q = _E.qs[_E.cur]; const ans = _E.answers[q.id];
  if (ans.sel) ans.status = 'ANSWERED';
  _saveAnswer(q.id); _goQ(_E.cur+1);
}

async function _saveAnswer(qId) {
  const ans = _E.answers[qId];
  const body = { question_id: qId, selected_answer: ans.sel, status: ans.status, time_spent_seconds: ans.time||0 };
  if (!navigator.onLine) { OQ.push({ url:`/api/attempts/${_E.id}/answer`, opts:{method:'PATCH',body} }); return; }
  try { await PATCH(`/api/attempts/${_E.id}/answer`, body); } catch {}
}

function _renderPalette() {
  const leg = document.getElementById('pal-legend'); const grid = document.getElementById('pal-grid');
  if (!leg||!grid) return;
  const counts = { NOT_VISITED:0, NOT_ANSWERED:0, ANSWERED:0, MARKED_FOR_REVIEW:0, ANSWERED_AND_MARKED:0 };
  Object.values(_E.answers).forEach(a => { if (counts[a.status]!==undefined) counts[a.status]++; });
  leg.innerHTML = `
    <div class="legend-row"><div class="legend-dot ans"></div>${counts.ANSWERED} Answered</div>
    <div class="legend-row"><div class="legend-dot na"></div>${counts.NOT_ANSWERED} Not Answered</div>
    <div class="legend-row"><div class="legend-dot mrk"></div>${counts.MARKED_FOR_REVIEW+counts.ANSWERED_AND_MARKED} Marked</div>
    <div class="legend-row"><div class="legend-dot nv"></div>${counts.NOT_VISITED} Not Visited</div>`;
  const bySubj = {};
  _E.qs.forEach((q,i) => { (bySubj[q.subject]||(bySubj[q.subject]=[])).push({q,i}); });
  grid.innerHTML = Object.entries(bySubj).map(([s,items]) => `
    <div class="palette-subj-label">${s.charAt(0)+s.slice(1).toLowerCase()}</div>
    <div class="palette-buttons">
      ${items.map(({q,i}) => {
        const a = _E.answers[q.id]; const st = a?.status||'NOT_VISITED';
        const cls = st==='ANSWERED'?'ans':st==='NOT_ANSWERED'?'na':st==='MARKED_FOR_REVIEW'?'mrk':st==='ANSWERED_AND_MARKED'?'am':'nv';
        return `<button class="pq-btn ${cls} ${i===_E.cur?'cur':''}" data-i="${i}" onclick="_goQ(${i})">${i+1}</button>`;
      }).join('')}
    </div>`).join('');
}

function _startTimer() {
  const elapsed = (Date.now() - _E.started) / 1000;
  _E.endTime = Date.now() + (_E.dur * 60 - elapsed) * 1000;
  _E.timer = setInterval(() => {
    const rem = Math.max(0, _E.endTime - Date.now());
    const m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
    const el = document.getElementById('exam-timer'); if(!el){clearInterval(_E.timer);return;}
    el.textContent = String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    el.className = 'exam-timer-box' + (m<5?' crit':m<15?' warn':'');
    if (rem<=0) { clearInterval(_E.timer); _examSubmit(true); }
  }, 1000);
}

async function _examSubmit(auto=false) {
  if (_E.timer) clearInterval(_E.timer);
  const curQ = _E.qs[_E.cur];
  if (curQ) { _E.answers[curQ.id].time += Math.round((Date.now()-_E.qTimer)/1000); _saveAnswer(curQ.id); }
  const overlay = document.getElementById('exam-overlay');
  overlay.innerHTML = '<div class="loading-center" style="height:100vh"><div class="spinner"></div><div class="loading-text">Submitting...</div></div>';
  try {
    const r = await POST(`/api/attempts/${_E.id}/submit`, { auto_submitted: auto });
    overlay.style.display = 'none';
    _showResult(r);
  } catch(e) { overlay.style.display='none'; toast('Submit failed: '+e.message,'err'); }
}

function _examExit() {
  if (_E.readonly || confirm('Exit exam? Your progress is saved.')) {
    if (_E.timer) clearInterval(_E.timer);
    document.getElementById('exam-overlay').style.display='none';
  }
}

function _showResult(r) {
  const el = document.getElementById('page-content');
  const pct = r.percentage || (r.max_score>0 ? (r.score/r.max_score*100).toFixed(1) : 0);
  el.innerHTML = `<div class="result-wrap fade-in">
    <div class="result-hero">
      <div class="result-score-num">${r.score.toFixed(1)}</div>
      <div class="result-score-den">out of ${r.max_score.toFixed(0)}</div>
      <div class="result-pct">${pct}%</div>
      <div style="margin-top:8px;font-size:12px;opacity:.7">${pct>=70?'Excellent performance!':pct>=50?'Good effort. Keep pushing!':'Keep practicing. You can do it!'}</div>
    </div>
    <div class="result-grid">
      <div class="result-cell"><div class="result-cell-val rc-correct">${r.correct_count}</div><div class="result-cell-lbl">Correct</div></div>
      <div class="result-cell"><div class="result-cell-val rc-wrong">${r.incorrect_count}</div><div class="result-cell-lbl">Incorrect</div></div>
      <div class="result-cell"><div class="result-cell-val rc-skip">${r.unattempted_count}</div><div class="result-cell-lbl">Skipped</div></div>
      <div class="result-cell"><div class="result-cell-val">${r.attempted_count}</div><div class="result-cell-lbl">Attempted</div></div>
      <div class="result-cell"><div class="result-cell-val">${Math.floor(r.time_taken_seconds/60)}m</div><div class="result-cell-lbl">Time Taken</div></div>
      <div class="result-cell"><div class="result-cell-val" style="color:${pct>=35?'var(--c-green)':'var(--c-red)'}">${pct>=35?'Pass':'Fail'}</div><div class="result-cell-lbl">Result</div></div>
    </div>
    ${r.subject_breakdown && Object.keys(r.subject_breakdown).length ? `
    <div class="card" style="margin-bottom:20px"><div class="card-body">
      <div style="font-size:13px;font-weight:800;color:var(--c-text);margin-bottom:14px">Subject Breakdown</div>
      <table class="data-table">
        <thead><tr><th>Subject</th><th>Correct</th><th>Incorrect</th><th>Skipped</th><th style="text-align:right">Score</th></tr></thead>
        <tbody>${Object.entries(r.subject_breakdown).map(([s,b])=>`
          <tr><td style="font-weight:600">${s.charAt(0)+s.slice(1).toLowerCase()}</td>
          <td style="color:var(--c-green);font-weight:600">${b.correct}</td>
          <td style="color:var(--c-red);font-weight:600">${b.incorrect}</td>
          <td style="color:var(--c-text3)">${b.unattempted}</td>
          <td style="text-align:right;font-weight:700;color:var(--c-blue)">${(b.score||0).toFixed(1)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button class="btn btn-primary" onclick="examLaunch({...window._lastExamOpts,readonly:true,attempt_id:${r.attempt_id}})">View Solutions</button>
      <button class="btn btn-secondary" onclick="go('pyq')">More PYQs</button>
      <button class="btn btn-secondary" onclick="go('leaderboard')">Leaderboard</button>
      <button class="btn btn-secondary" onclick="go('dashboard')">Dashboard</button>
    </div>
  </div>`;
  // Save to IndexedDB
  DashDB.save(r).catch(()=>{});
}

function _startCam() {
  navigator.mediaDevices.getUserMedia({ video:true, audio:false }).then(stream => {
    const vid = document.createElement('video'); vid.srcObject=stream; vid.play();
    const can = document.createElement('canvas'); can.width=320; can.height=240;
    const ctx = can.getContext('2d');
    setInterval(() => {
      ctx.drawImage(vid,0,0,320,240);
      const b64 = can.toDataURL('image/jpeg',.5);
      POST(`/api/camera/${_E.camId}/snapshot`, { image_b64: b64 }).catch(()=>{});
    }, 30000);
  }).catch(()=>toast('Camera access denied','warn'));
}
