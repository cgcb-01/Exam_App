'use strict';
// ─── Exam state ───────────────────────────────────────────────────────────────
let _E = {
  id: null, qs: [], answers: {}, cur: 0,
  endTime: 0, dur: 180, started: 0,
  timer: null, qTimer: 0, subjects: [],
  readonly: false, camId: null, camInterval: null,
  camStream: null, micStream: null,
};

// ─── Entry point ──────────────────────────────────────────────────────────────
async function examLaunch(opts = {}) {
  if (!requireLogin()) return;
  window._lastExamOpts = opts;

  // Build overlay first — completely replace body content
  const overlay = document.getElementById('exam-overlay');
  overlay.style.cssText = 'position:fixed;inset:0;background:var(--c-bg);z-index:1000;display:flex;flex-direction:column;';
  overlay.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:14px">
    <div class="spinner" style="width:40px;height:40px;border-width:3px"></div>
    <div style="font-size:13px;color:var(--c-text3);font-weight:600">Loading exam...</div>
  </div>`;

  try {
    let attempt, questions;

    if (opts.readonly && opts.attempt_id) {
      attempt   = await GET('/api/attempts/' + opts.attempt_id);
      questions = await GET('/api/attempts/' + opts.attempt_id + '/solutions');
      _E.readonly = true;
    } else {
      // Ask about camera/mic if not specified
      if (opts.camera === undefined) {
        const useCam = await _askProctoring();
        opts.camera = useCam.camera;
        opts.mic    = useCam.mic;
      }

      let camId = null;
      if (opts.camera) {
        try {
          const cs = await POST('/api/camera/start', { attempt_context: opts.title || '' });
          camId = cs.id;
        } catch {}
      }

      attempt = await POST('/api/attempts/start', {
        shift_id:     opts.shift_id     || null,
        dpp_id:       opts.dpp_id       || null,
        module_id:    opts.module_id    || null,
        mock_test_id: opts.mock_test_id || null,
        is_offline_attempt: false,
        camera_session_id: camId,
      });
      questions = attempt.questions || [];
      _E.readonly = false;
      _E.camId    = camId;
    }

    if (!questions || questions.length === 0) {
      overlay.style.display = 'none';
      toast('This test has no questions yet. Please check back later.', 'err', 5000);
      return;
    }

    // Reset state
    const elapsed = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;
    _E = {
      id: attempt.id, qs: questions, answers: {},
      cur: 0, qTimer: Date.now(),
      dur: attempt.duration_minutes_allotted,
      started: new Date(attempt.started_at).getTime(),
      endTime: Date.now() + Math.max(0, attempt.duration_minutes_allotted * 60 - elapsed) * 1000,
      timer: null, subjects: [...new Set(questions.map(q => q.subject))],
      readonly: _E.readonly, camId: _E.camId, camInterval: null,
      camStream: null, micStream: null,
    };

    // Populate answer map from existing state
    (attempt.answers || []).forEach(a => {
      _E.answers[a.question_id] = { sel: a.selected_answer, status: a.status || 'NOT_VISITED', time: a.time_spent_seconds || 0 };
    });
    questions.forEach(q => {
      if (!_E.answers[q.id]) _E.answers[q.id] = { sel: null, status: 'NOT_VISITED', time: 0 };
    });

    _buildExamUI(opts.title || 'Exam');

    if (!_E.readonly) {
      _startTimer();
      if (opts.camera) _startCamera();
      if (opts.mic)    _startMic();
    }

  } catch (e) {
    overlay.style.display = 'none';
    toast('Failed to load exam: ' + e.message, 'err', 5000);
    console.error('examLaunch error:', e);
  }
}

function _askProctoring() {
  return new Promise(resolve => {
    openModal('Proctoring Options',
      `<div class="modal-body-pad" style="text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--c-text);margin-bottom:8px">Enable proctoring for this test?</div>
        <div style="font-size:12px;color:var(--c-text3);margin-bottom:20px">Camera and microphone are optional. Your device will request permission.</div>
        <div style="display:flex;flex-direction:column;gap:10px;max-width:280px;margin:0 auto">
          <button class="btn btn-secondary" onclick="window._procRes({camera:false,mic:false});closeModal()">No proctoring — just take the test</button>
          <button class="btn btn-secondary" onclick="window._procRes({camera:true,mic:false});closeModal()">Enable camera only</button>
          <button class="btn btn-secondary" onclick="window._procRes({camera:true,mic:true});closeModal()">Enable camera and microphone</button>
        </div>
      </div>`,
      '<button class="btn btn-primary" onclick="window._procRes({camera:false,mic:false});closeModal()">Continue without proctoring</button>'
    );
    window._procRes = resolve;
  });
}

// ─── Build exam UI ────────────────────────────────────────────────────────────
function _buildExamUI(title) {
  const ro = _E.readonly;
  document.getElementById('exam-overlay').innerHTML = `
    <div class="exam-topbar">
      <button onclick="_examExit()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Exit</button>
      <div class="exam-topbar-title">${title}</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${_E.camId ? '<div style="display:flex;align-items:center;gap:4px;padding:3px 10px;background:rgba(239,68,68,.2);border-radius:99px;border:1px solid rgba(239,68,68,.4)"><div style="width:7px;height:7px;border-radius:50%;background:#ef4444;animation:blink 1s step-start infinite"></div><span style="font-size:10px;font-weight:700;color:#fca5a5">REC</span></div>' : ''}
        ${ro ? '<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.8);padding:4px 12px;border-radius:99px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.2)">REVIEW MODE</span>'
             : '<div class="exam-timer-box" id="exam-timer">--:--</div>'}
        <button onclick="_openOMROverlay()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer" title="Open OMR Sheet">OMR</button>
      </div>
    </div>
    <div class="exam-body">
      <div class="exam-q-panel">
        <div class="exam-q-toolbar">
          <div id="subj-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          <div class="q-progress" id="q-prog"></div>
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
        ${ro ? '' : `<div class="palette-submit"><button class="btn btn-danger" style="width:100%;font-size:13px;padding:10px" onclick="_confirmSubmit()">Submit Test</button></div>`}
      </div>
    </div>`;

  _renderSubjChips();
  _renderPalette();
  _goQ(0);
}

// ─── Subject tabs ─────────────────────────────────────────────────────────────
function _renderSubjChips() {
  const el = document.getElementById('subj-chips'); if (!el) return;
  const curSubj = _E.qs[_E.cur]?.subject;
  el.innerHTML = _E.subjects.map(s =>
    `<button class="subject-chip ${s === curSubj ? 'active' : ''}" onclick="_jumpSubj('${s}')">${s.charAt(0)+s.slice(1).toLowerCase()}</button>`
  ).join('');
}

function _jumpSubj(s) {
  const idx = _E.qs.findIndex(q => q.subject === s);
  if (idx >= 0) _goQ(idx);
}

// ─── Navigate to question ──────────────────────────────────────────────────────
function _goQ(idx) {
  // Accumulate time on previous question
  if (_E.cur !== idx || idx === 0) {
    const curQ = _E.qs[_E.cur];
    if (curQ && _E.qTimer) {
      _E.answers[curQ.id].time += Math.round((Date.now() - _E.qTimer) / 1000);
      if (_E.answers[curQ.id].status === 'NOT_VISITED' && !_E.readonly) {
        _E.answers[curQ.id].status = 'NOT_ANSWERED';
        _sendAnswer(curQ.id);
      }
    }
  }

  _E.cur    = Math.max(0, Math.min(idx, _E.qs.length - 1));
  _E.qTimer = Date.now();

  const q = _E.qs[_E.cur];
  document.getElementById('q-prog').textContent = `${_E.cur + 1} / ${_E.qs.length}`;
  _renderSubjChips();
  _renderQ(q);
  _renderFooter(q);
  _renderPalette();

  // Scroll palette button into view
  setTimeout(() => document.querySelector(`.pq-btn[data-i="${_E.cur}"]`)?.scrollIntoView({ block:'nearest', behavior:'smooth' }), 50);
}

// ─── Render question ──────────────────────────────────────────────────────────
function _renderQ(q) {
  const area = document.getElementById('exam-qarea'); if (!area) return;
  const ans     = _E.answers[q.id] || { sel: null, status: 'NOT_VISITED', time: 0 };
  const ro      = _E.readonly;
  const isNum   = q.question_type === 'NUMERICAL';
  const isMulti = q.question_type === 'MCQ_MULTIPLE';
  const opts    = [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]].filter(([,v])=>v);
  const corr    = new Set((q.correct_answer||'').split(',').map(s=>s.trim()).filter(Boolean));

  let qContent = '';
  if (q.question_text) {
    qContent += `<div class="q-text">${q.question_text}</div>`;
  }
  if (q.question_image_path) {
    qContent += `<div style="margin-bottom:14px"><img src="/static/uploads/${q.question_image_path.replace('uploads/','')}" style="max-width:100%;border-radius:8px;border:1px solid var(--c-border)" onerror="this.style.display='none'" alt="Question image"></div>`;
  }
  if (!qContent) qContent = '<div class="q-text" style="color:var(--c-text4);font-style:italic">Question content not available</div>';

  let answerHTML = '';
  if (isNum) {
    answerHTML = `<div class="numpad-wrapper">
      <div class="num-display" id="num-disp">${ans.sel !== null && ans.sel !== '' ? ans.sel : '—'}</div>
      <div class="numpad-grid">
        ${[7,8,9,'DEL',4,5,6,'±',1,2,3,'.','0','00','C','OK'].map(k =>
          `<button class="numpad-key ${k==='DEL'||k==='C'?'del':k==='±'||k==='OK'?'fn':''}" onclick="_numKey('${q.id}','${k}')">${k}</button>`).join('')}
      </div>
    </div>`;
  } else {
    let optHTML = '';
    opts.forEach(([k,v]) => {
      const sel = (ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean).includes(k);
      let cls = '';
      if (ro) { cls = corr.has(k) ? 'correct' : sel ? 'wrong' : ''; }
      else     { cls = sel ? 'selected' : ''; }
      optHTML += `<div class="option-row ${cls}" ${ro?'style="cursor:default"':''} onclick="${ro?'void 0':''}" ${ro?'':'onmousedown="'+_esc(`_pickOpt('${q.id}','${k}',${isMulti})`)+'\"'}>
        <div class="option-key">${k}</div>
        <div class="option-text">${v}</div>
        ${ro && corr.has(k) ? `<span style="margin-left:auto;color:var(--c-green);display:flex;align-items:center">${IC.chk}</span>` : ''}
      </div>`;
    });
    if (q.options_image_path) {
      optHTML += `<img src="/static/uploads/${q.options_image_path.replace('uploads/','')}" style="max-width:100%;margin-top:8px;border-radius:8px;border:1px solid var(--c-border)" onerror="this.style.display='none'" alt="Options">`;
    }
    answerHTML = `<div class="options-list">${optHTML}</div>`;
  }

  let solHTML = '';
  if (ro) {
    solHTML = `<div style="margin-top:14px;padding:12px 14px;background:var(--c-green-l);border-radius:var(--radius-sm);border-left:3px solid var(--c-green)">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--c-green);margin-bottom:6px">Correct Answer: ${q.correct_answer || '—'}</div>
      ${q.solution_text ? `<div style="font-size:12px;color:var(--c-text2);line-height:1.7">${q.solution_text}</div>` : ''}
      ${q.solution_image_path ? `<img src="/static/uploads/${q.solution_image_path.replace('uploads/','')}" style="max-width:100%;margin-top:8px;border-radius:6px" onerror="this.style.display='none'" alt="Solution">` : ''}
    </div>`;
  }

  area.innerHTML = `<div class="exam-q-card fade-in">
    <div class="q-num-row">
      <span class="q-num-pill">Q${q.question_number}</span>
      ${isMulti ? '<span class="q-type-pill">Multiple Correct</span>' : ''}
      ${isNum   ? '<span class="q-type-pill">Numerical</span>' : ''}
      <span class="q-marks-pill">+${q.marks_correct} / ${q.marks_incorrect}</span>
    </div>
    ${qContent}
    ${answerHTML}
    ${solHTML}
  </div>`;
}

function _esc(s) { return s.replace(/"/g, '&quot;'); }

// ─── Answer interactions ──────────────────────────────────────────────────────
function _pickOpt(qId, key, isMulti) {
  if (_E.readonly) return;
  const ans = _E.answers[qId];
  if (!ans) return;
  if (isMulti) {
    const sel = new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
    sel.has(key) ? sel.delete(key) : sel.add(key);
    ans.sel = [...sel].sort().join(',') || null;
  } else {
    ans.sel = (ans.sel === key) ? null : key;
  }
  ans.status = ans.sel ? 'ANSWERED' : 'NOT_ANSWERED';
  _sendAnswer(qId);
  _renderQ(_E.qs[_E.cur]);
  _renderPalette();
}

function _numKey(qId, k) {
  if (_E.readonly) return;
  const ans = _E.answers[qId]; if (!ans) return;
  let v = ans.sel || '';
  if (k==='C')        v = '';
  else if (k==='DEL') v = v.slice(0, -1);
  else if (k==='±')   v = v.startsWith('-') ? v.slice(1) : '-' + v;
  else if (k==='OK')  { _saveAndNext(); return; }
  else if (k==='.' && v.includes('.')) return;
  else v += k;
  ans.sel    = v || null;
  ans.status = v ? 'ANSWERED' : 'NOT_ANSWERED';
  const d = document.getElementById('num-disp');
  if (d) d.textContent = v || '—';
  _sendAnswer(qId);
  _renderPalette();
}

function _clearResp(qId) {
  const ans = _E.answers[qId]; if (!ans) return;
  ans.sel = null; ans.status = 'NOT_ANSWERED';
  _sendAnswer(qId); _renderQ(_E.qs[_E.cur]); _renderPalette();
}

function _markReview(qId) {
  const ans = _E.answers[qId]; if (!ans) return;
  ans.status = ans.sel ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW';
  _sendAnswer(qId); _renderPalette(); _goQ(_E.cur + 1);
}

function _saveAndNext() {
  const q = _E.qs[_E.cur]; if (!q) return;
  const ans = _E.answers[q.id];
  if (ans && ans.sel) ans.status = 'ANSWERED';
  _sendAnswer(q.id);
  _goQ(_E.cur + 1);
}

// ─── Footer actions ───────────────────────────────────────────────────────────
function _renderFooter(q) {
  const el = document.getElementById('exam-footer'); if (!el) return;
  const ro = _E.readonly;
  const isFirst = _E.cur === 0, isLast = _E.cur === _E.qs.length - 1;
  if (ro) {
    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="_goQ(${_E.cur-1})" ${isFirst?'disabled':''}>Previous</button>
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="_goQ(${_E.cur+1})" ${isLast?'disabled':''}>Next</button>`;
  } else {
    el.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="_clearResp('${q.id}')">Clear</button>
      <button class="btn btn-sm" style="background:var(--q-marked);color:#fff;border:none" onclick="_markReview('${q.id}')">Mark for Review</button>
      <div style="flex:1"></div>
      <button class="btn btn-secondary btn-sm" onclick="_goQ(${_E.cur-1})" ${isFirst?'disabled':''}>Prev</button>
      <button class="btn btn-primary btn-sm" onclick="_saveAndNext()">Save &amp; Next</button>`;
  }
}

// ─── Palette ──────────────────────────────────────────────────────────────────
function _renderPalette() {
  const leg  = document.getElementById('pal-legend');
  const grid = document.getElementById('pal-grid');
  if (!leg || !grid) return;

  const counts = { NOT_VISITED:0, NOT_ANSWERED:0, ANSWERED:0, MARKED_FOR_REVIEW:0, ANSWERED_AND_MARKED:0 };
  Object.values(_E.answers).forEach(a => { if (a && counts[a.status] !== undefined) counts[a.status]++; });

  leg.innerHTML = `
    <div class="legend-row"><div class="legend-dot ans"></div>${counts.ANSWERED} Answered</div>
    <div class="legend-row"><div class="legend-dot na"></div>${counts.NOT_ANSWERED} Not Answered</div>
    <div class="legend-row"><div class="legend-dot mrk"></div>${counts.MARKED_FOR_REVIEW + counts.ANSWERED_AND_MARKED} Marked</div>
    <div class="legend-row"><div class="legend-dot nv"></div>${counts.NOT_VISITED} Not Visited</div>`;

  const bySubj = {};
  _E.qs.forEach((q,i) => { if (!bySubj[q.subject]) bySubj[q.subject]=[]; bySubj[q.subject].push({q,i}); });

  grid.innerHTML = Object.entries(bySubj).map(([s, items]) => `
    <div class="palette-subj-label">${s.charAt(0)+s.slice(1).toLowerCase()}</div>
    <div class="palette-buttons">
      ${items.map(({q,i}) => {
        const a  = _E.answers[q.id];
        const st = a?.status || 'NOT_VISITED';
        const cls= st==='ANSWERED'?'ans':st==='NOT_ANSWERED'?'na':st==='MARKED_FOR_REVIEW'?'mrk':st==='ANSWERED_AND_MARKED'?'am':'nv';
        return `<button class="pq-btn ${cls} ${i===_E.cur?'cur':''}" data-i="${i}" onclick="_goQ(${i})">${i+1}</button>`;
      }).join('')}
    </div>`).join('');
}

// ─── OMR overlay from exam ────────────────────────────────────────────────────
function _openOMROverlay() {
  if (_E.qs.length) {
    OMR.open(_E.qs, _E.answers, (qId, ans) => {
      _E.answers[qId] = ans;
      _sendAnswer(qId);
      _renderPalette();
      if (_E.qs[_E.cur]?.id === qId) _renderQ(_E.qs[_E.cur]);
    });
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function _startTimer() {
  if (_E.timer) clearInterval(_E.timer);
  _E.timer = setInterval(() => {
    const rem = Math.max(0, _E.endTime - Date.now());
    const m   = Math.floor(rem / 60000);
    const s   = Math.floor((rem % 60000) / 1000);
    const el  = document.getElementById('exam-timer'); if (!el) { clearInterval(_E.timer); return; }
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.className   = 'exam-timer-box' + (m < 5 ? ' crit' : m < 15 ? ' warn' : '');
    if (rem <= 0) { clearInterval(_E.timer); _doSubmit(true); }
  }, 1000);
}

// ─── Camera & Mic ─────────────────────────────────────────────────────────────
async function _startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    _E.camStream = stream;
    // Show small camera preview
    const vid = document.createElement('video');
    vid.srcObject = stream; vid.play(); vid.autoplay = true;
    vid.style.cssText = 'position:fixed;bottom:70px;right:10px;width:120px;height:90px;border-radius:8px;border:2px solid var(--c-green);z-index:2000;object-fit:cover;';
    document.body.appendChild(vid);
    vid.id = 'cam-preview';

    // Snapshots every 30s
    const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=240;
    const ctx = canvas.getContext('2d');
    _E.camInterval = setInterval(() => {
      ctx.drawImage(vid, 0, 0, 320, 240);
      const b64 = canvas.toDataURL('image/jpeg', 0.5);
      if (_E.camId) POST(`/api/camera/${_E.camId}/snapshot`, { image_b64: b64 }).catch(()=>{});
    }, 30000);

    toast('Camera active', 'ok', 2000);
  } catch {
    toast('Camera permission denied — continuing without proctoring', 'warn');
  }
}

async function _startMic() {
  try {
    _E.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    toast('Microphone active', 'ok', 2000);
  } catch {
    toast('Microphone permission denied', 'warn');
  }
}

function _stopMedia() {
  if (_E.camInterval) { clearInterval(_E.camInterval); _E.camInterval = null; }
  if (_E.camStream) { _E.camStream.getTracks().forEach(t => t.stop()); _E.camStream = null; }
  if (_E.micStream) { _E.micStream.getTracks().forEach(t => t.stop()); _E.micStream = null; }
  const prev = document.getElementById('cam-preview'); if (prev) prev.remove();
  if (_E.camId) POST(`/api/camera/${_E.camId}/end`, {}).catch(()=>{});
}

// ─── Send answer ──────────────────────────────────────────────────────────────
async function _sendAnswer(qId) {
  if (_E.readonly) return;
  const ans  = _E.answers[qId]; if (!ans) return;
  const body = { question_id: qId, selected_answer: ans.sel || null, status: ans.status, time_spent_seconds: ans.time || 0 };
  if (!navigator.onLine) { OQ.push({ url:`/api/attempts/${_E.id}/answer`, opts:{method:'PATCH',body} }); return; }
  try { await PATCH(`/api/attempts/${_E.id}/answer`, body); } catch {}
}

// ─── Submit ───────────────────────────────────────────────────────────────────
function _confirmSubmit() {
  const counts = { NOT_ANSWERED:0, NOT_VISITED:0, ANSWERED:0 };
  Object.values(_E.answers).forEach(a => { if(counts[a.status]!==undefined) counts[a.status]++; });
  openModal('Submit Test?',
    `<div class="modal-body-pad" style="text-align:center">
      <div style="font-size:14px;font-weight:700;color:var(--c-text);margin-bottom:16px">Are you sure you want to submit?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="padding:12px;background:var(--c-green-l);border-radius:var(--radius);"><div style="font-size:20px;font-weight:900;color:var(--c-green)">${counts.ANSWERED}</div><div style="font-size:10px;color:var(--c-green);font-weight:700">Answered</div></div>
        <div style="padding:12px;background:var(--c-red-l);border-radius:var(--radius);"><div style="font-size:20px;font-weight:900;color:var(--c-red)">${counts.NOT_ANSWERED}</div><div style="font-size:10px;color:var(--c-red);font-weight:700">Not Answered</div></div>
        <div style="padding:12px;background:var(--c-surface2);border-radius:var(--radius);"><div style="font-size:20px;font-weight:900;color:var(--c-text3)">${counts.NOT_VISITED}</div><div style="font-size:10px;color:var(--c-text4);font-weight:700">Not Visited</div></div>
      </div>
      <div style="font-size:12px;color:var(--c-text4)">Once submitted, you cannot change your answers.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Continue Test</button>
     <button class="btn btn-danger" onclick="closeModal();_doSubmit(false)">Submit Now</button>`
  );
}

async function _doSubmit(auto = false) {
  if (_E.timer) { clearInterval(_E.timer); _E.timer = null; }
  _stopMedia();

  // Save time on current question
  const curQ = _E.qs[_E.cur];
  if (curQ) {
    _E.answers[curQ.id].time += Math.round((Date.now() - _E.qTimer) / 1000);
    await _sendAnswer(curQ.id);
  }

  const overlay = document.getElementById('exam-overlay');
  overlay.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:14px">
    <div class="spinner" style="width:40px;height:40px;border-width:3px"></div>
    <div style="font-size:13px;color:var(--c-text3);font-weight:600">Submitting and calculating results...</div>
  </div>`;

  try {
    const result = await POST(`/api/attempts/${_E.id}/submit`, { auto_submitted: auto });
    overlay.style.display = 'none';
    _showResult(result);
    // Save to local DB
    try { await DashDB.save(result); } catch {}
  } catch (e) {
    overlay.style.display = 'none';
    toast('Submit failed: ' + e.message, 'err', 5000);
  }
}

// ─── Exit ─────────────────────────────────────────────────────────────────────
function _examExit() {
  if (_E.readonly) {
    _stopMedia();
    document.getElementById('exam-overlay').style.display = 'none';
    return;
  }
  if (confirm('Exit exam? Your current answers are saved and the timer continues.')) {
    if (_E.timer) clearInterval(_E.timer);
    _stopMedia();
    document.getElementById('exam-overlay').style.display = 'none';
  }
}

// ─── Result screen ────────────────────────────────────────────────────────────
function _showResult(r) {
  const el  = document.getElementById('page-content');
  const pct = r.percentage ?? (r.max_score > 0 ? (r.score/r.max_score*100).toFixed(1) : 0);

  el.innerHTML = `<div style="max-width:680px;margin:0 auto" class="fade-in">
    <div class="result-hero">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;opacity:.75;margin-bottom:10px">Test Complete</div>
      <div class="result-score-num">${Number(r.score).toFixed(1)}</div>
      <div class="result-score-den">out of ${Number(r.max_score).toFixed(0)}</div>
      <div class="result-pct">${pct}%</div>
    </div>
    <div class="result-grid">
      <div class="result-cell"><div class="result-cell-val rc-correct">${r.correct_count}</div><div class="result-cell-lbl">Correct</div></div>
      <div class="result-cell"><div class="result-cell-val rc-wrong">${r.incorrect_count}</div><div class="result-cell-lbl">Wrong</div></div>
      <div class="result-cell"><div class="result-cell-val rc-skip">${r.unattempted_count}</div><div class="result-cell-lbl">Skipped</div></div>
      <div class="result-cell"><div class="result-cell-val">${r.attempted_count}</div><div class="result-cell-lbl">Attempted</div></div>
      <div class="result-cell"><div class="result-cell-val">${Math.floor(r.time_taken_seconds/60)}m ${r.time_taken_seconds%60}s</div><div class="result-cell-lbl">Time</div></div>
      <div class="result-cell"><div class="result-cell-val" style="color:${Number(pct)>=35?'var(--c-green)':'var(--c-red)'}">${Number(pct)>=35?'Pass':'Fail'}</div><div class="result-cell-lbl">Result</div></div>
    </div>
    ${_subjBreakdown(r.subject_breakdown)}
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px">
      <button class="btn btn-primary" onclick="examLaunch({...window._lastExamOpts,readonly:true,attempt_id:${r.attempt_id}})">View Solutions</button>
      <button class="btn btn-secondary" onclick="go('leaderboard')">Leaderboard</button>
      <button class="btn btn-secondary" onclick="go('dashboard')">Dashboard</button>
      <button class="btn btn-secondary" onclick="go('pyq')">More Tests</button>
    </div>
  </div>`;
}

function _subjBreakdown(breakdown) {
  if (!breakdown || !Object.keys(breakdown).length) return '';
  return `<div class="card" style="margin-top:16px"><div class="card-body">
    <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Subject Breakdown</div>
    <table class="data-table">
      <thead><tr><th>Subject</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th style="text-align:right">Score</th></tr></thead>
      <tbody>${Object.entries(breakdown).map(([s,b])=>`
        <tr>
          <td style="font-weight:600">${s.charAt(0)+s.slice(1).toLowerCase()}</td>
          <td style="color:var(--c-green);font-weight:700">${b.correct||0}</td>
          <td style="color:var(--c-red);font-weight:700">${b.incorrect||0}</td>
          <td style="color:var(--c-text3)">${b.unattempted||0}</td>
          <td style="text-align:right;font-weight:800;color:var(--c-blue)">${Number(b.score||0).toFixed(1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;
}
