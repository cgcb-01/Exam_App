/**
 * exam_engine.js
 * The core JEE/NEET exam interface with:
 *   - Countdown timer (auto-submit on expiry)
 *   - Question palette with 5-state colour coding
 *   - Subject tabs for multi-subject papers
 *   - Per-question answer recording (PATCH on every interaction)
 *   - Mark for review, clear response, save & next
 *   - Numerical input numpad
 *   - Camera proctoring hook (optional)
 *   - Offline resilience (queue PATCH requests)
 */

let _exam = {
  attemptId: null,
  questions: [],
  answers: {},           // { question_id: { selected_answer, status, time_spent } }
  currentIndex: 0,
  timerInterval: null,
  endTime: null,
  subjects: [],
  activeSubject: null,
  cameraSessionId: null,
  cameraInterval: null,
  questionStartTime: Date.now(),
  readonly: false,       // solution-review mode
};

async function launchExam(opts = {}) {
  // opts: { shift_id, dpp_id, module_id, mock_test_id, camera, readonly }
  if (!requireAuth()) return;

  const screen = document.getElementById('exam-screen');
  screen.classList.add('active');
  screen.innerHTML = '<div class="loading-overlay" style="height:100vh;"><div class="spinner"></div></div>';

  try {
    let attempt, questions;

    if (opts.readonly && opts.attempt_id) {
      // Solution review mode — fetch submitted attempt + solutions
      attempt   = await AttemptAPI.get(opts.attempt_id);
      questions = await AttemptAPI.solutions(opts.attempt_id);
      _exam.readonly = true;
    } else {
      // Start fresh attempt
      let camera_session_id = null;
      if (opts.camera) {
        try {
          const cs = await CameraAPI.start({ attempt_context: opts.context || '' });
          camera_session_id = cs.id;
          _exam.cameraSessionId = cs.id;
        } catch (e) { console.warn('Camera init failed:', e); }
      }

      attempt   = await AttemptAPI.start({
        shift_id:      opts.shift_id      || null,
        dpp_id:        opts.dpp_id        || null,
        module_id:     opts.module_id     || null,
        mock_test_id:  opts.mock_test_id  || null,
        is_offline_attempt: false,
        camera_session_id,
      });
      questions = attempt.questions;
    }

    _exam.attemptId     = attempt.id;
    _exam.questions     = questions;
    _exam.currentIndex  = 0;

    // Build answers map from existing attempt state
    _exam.answers = {};
    (attempt.answers || []).forEach(a => {
      _exam.answers[a.question_id] = {
        selected_answer: a.selected_answer,
        status:          a.status || 'NOT_VISITED',
        time_spent:      a.time_spent_seconds || 0,
      };
    });
    // Any question not yet in answers map
    questions.forEach(q => {
      if (!_exam.answers[q.id]) {
        _exam.answers[q.id] = { selected_answer: null, status: 'NOT_VISITED', time_spent: 0 };
      }
    });

    // Subjects
    _exam.subjects = [...new Set(questions.map(q => q.subject))];
    _exam.activeSubject = _exam.subjects[0];

    // Timer
    if (!opts.readonly) {
      const elapsed = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;
      const remaining = attempt.duration_minutes_allotted * 60 - elapsed;
      _exam.endTime = Date.now() + remaining * 1000;
    }

    _buildExamUI(attempt, opts);
    if (!opts.readonly) _startTimer();
    if (opts.camera) _startCameraCapture();

  } catch (e) {
    screen.classList.remove('active');
    showToast('Failed to load exam: ' + e.message, 'error');
  }
}

function _buildExamUI(attempt, opts) {
  const screen = document.getElementById('exam-screen');
  const title  = opts.title || 'Exam';
  const ro     = _exam.readonly;

  screen.innerHTML = `
    <div class="exam-topbar">
      <button class="btn-icon" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff;" onclick="_confirmExit()">✕</button>
      <span class="exam-title-bar">${title}</span>
      ${!ro ? `<div id="exam-timer" class="exam-timer">--:--</div>` : `<span style="background:rgba(255,255,255,.12);padding:5px 14px;border-radius:8px;font-size:.82rem;">Review Mode</span>`}
      ${opts.camera ? `<span id="cam-status" style="font-size:.8rem;background:rgba(255,0,0,.2);padding:3px 10px;border-radius:99px;">🔴 REC</span>` : ''}
    </div>
    <div class="exam-body">
      <div class="exam-question-panel">
        <div class="exam-question-header">
          <div class="subject-tabs" id="subject-tabs"></div>
          <span style="margin-left:auto;font-size:.8rem;color:var(--text3);" id="q-progress">Q 1 / ${_exam.questions.length}</span>
        </div>
        <div class="exam-question-scroll" id="exam-question-scroll">
          <div id="exam-question-area"></div>
        </div>
        <div class="exam-actions" id="exam-actions"></div>
      </div>
      <div class="exam-palette">
        <div class="palette-header">Question Palette</div>
        <div class="palette-stats" id="palette-stats"></div>
        <div class="palette-grid" id="palette-grid"></div>
        ${!ro ? `<div style="padding:12px;border-top:1px solid var(--border);">
          <button class="btn btn-danger" style="width:100%;" onclick="_submitExam(false)">Submit Test</button>
        </div>` : ''}
      </div>
    </div>`;

  _renderSubjectTabs();
  _renderPalette();
  _goToQuestion(0);
}

function _renderSubjectTabs() {
  const el = document.getElementById('subject-tabs');
  el.innerHTML = _exam.subjects.map(s => `
    <button class="subject-tab ${s === _exam.activeSubject ? 'active' : ''}"
            onclick="_setSubject('${s}')">${s.charAt(0) + s.slice(1).toLowerCase()}</button>
  `).join('');
}

function _setSubject(subj) {
  _exam.activeSubject = subj;
  _renderSubjectTabs();
  // Jump to first question of this subject
  const idx = _exam.questions.findIndex(q => q.subject === subj);
  if (idx >= 0) _goToQuestion(idx);
}

function _goToQuestion(idx) {
  // Save time spent on current question
  if (_exam.currentIndex !== idx) {
    const curQ = _exam.questions[_exam.currentIndex];
    if (curQ) {
      _exam.answers[curQ.id].time_spent += Math.round((Date.now() - _exam.questionStartTime) / 1000);
    }
    // Mark as NOT_ANSWERED if it was NOT_VISITED and we're leaving
    const ans = _exam.answers[curQ?.id];
    if (ans && ans.status === 'NOT_VISITED') {
      ans.status = 'NOT_ANSWERED';
      if (!_exam.readonly) _sendAnswer(curQ.id, ans);
    }
  }

  _exam.currentIndex    = Math.max(0, Math.min(idx, _exam.questions.length - 1));
  _exam.questionStartTime = Date.now();
  const q = _exam.questions[_exam.currentIndex];

  // Update subject tab
  if (q.subject !== _exam.activeSubject) {
    _exam.activeSubject = q.subject;
    _renderSubjectTabs();
  }

  document.getElementById('q-progress').textContent = `Q ${_exam.currentIndex + 1} / ${_exam.questions.length}`;
  _renderQuestion(q);
  _renderActions(q);
  _renderPalette();

  // scroll palette btn into view
  const pbtn = document.querySelector(`.palette-btn[data-idx="${_exam.currentIndex}"]`);
  if (pbtn) pbtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function _renderQuestion(q) {
  const ans    = _exam.answers[q.id];
  const ro     = _exam.readonly;
  const isNum  = q.question_type === 'NUMERICAL';
  const isMulti= q.question_type === 'MCQ_MULTIPLE';

  let qTypeLabel = '';
  if (isMulti)  qTypeLabel = ' <span style="font-size:.72rem;background:var(--accent);color:#fff;padding:2px 8px;border-radius:99px;vertical-align:middle;">Multiple Correct</span>';
  if (isNum)    qTypeLabel = ' <span style="font-size:.72rem;background:var(--warning);color:#fff;padding:2px 8px;border-radius:99px;vertical-align:middle;">Numerical</span>';

  let questionHTML = '';
  if (q.question_text) questionHTML += `<div class="question-text">${q.question_text}</div>`;
  if (q.question_image_path) questionHTML += `<img src="/static/${q.question_image_path}" class="question-image" alt="Question">`;

  let answerHTML = '';
  if (isNum) {
    answerHTML = _buildNumpad(q, ans);
  } else {
    const options = [
      { key:'A', val: q.option_a },
      { key:'B', val: q.option_b },
      { key:'C', val: q.option_c },
      { key:'D', val: q.option_d },
    ].filter(o => o.val);

    answerHTML = `<div class="options-grid">`;
    options.forEach(o => {
      let cls = '';
      const selected = ans?.selected_answer?.split(',').map(x=>x.trim()).includes(o.key);
      if (ro) {
        if (o.key === q.correct_answer || q.correct_answer?.split(',').includes(o.key)) cls = 'correct';
        else if (selected) cls = 'incorrect';
      } else {
        if (selected) cls = 'selected';
      }
      answerHTML += `
        <div class="option-item ${cls}" onclick="${ro ? '' : `_selectOption('${q.id}','${o.key}',${isMulti})`}" style="${ro?'cursor:default':''}">
          <div class="option-label">${o.key}</div>
          <div class="option-text">${o.val}</div>
          ${ro && (o.key === q.correct_answer || q.correct_answer?.split(',').includes(o.key)) ? '<span style="margin-left:auto;font-size:1rem;">✅</span>' : ''}
        </div>`;
    });
    if (q.options_image_path) answerHTML += `<img src="/static/${q.options_image_path}" class="question-image" alt="Options">`;
    answerHTML += `</div>`;
  }

  let solutionHTML = '';
  if (ro && (q.solution_text || q.solution_image_path)) {
    solutionHTML = `
      <div style="margin-top:18px;padding:14px 16px;background:var(--success-light);border-radius:10px;border-left:4px solid var(--success);">
        <div style="font-weight:700;font-size:.85rem;color:var(--success);margin-bottom:6px;">📝 Solution</div>
        ${q.solution_text ? `<div class="solution-explanation">${q.solution_text}</div>` : ''}
        ${q.solution_image_path ? `<img src="/static/${q.solution_image_path}" class="question-image" style="margin-top:8px;">` : ''}
      </div>`;
    solutionHTML += `<div style="margin-top:10px;padding:8px 14px;background:var(--primary-light);border-radius:8px;font-size:.85rem;font-weight:700;color:var(--primary);">
      ✓ Correct Answer: ${q.correct_answer}
    </div>`;
  }

  document.getElementById('exam-question-area').innerHTML = `
    <div class="question-card fade-in">
      <div class="question-number-badge">
        Question ${_exam.currentIndex + 1}${qTypeLabel}
        <span style="margin-left:8px;font-size:.72rem;opacity:.7;">${q.subject.charAt(0)+q.subject.slice(1).toLowerCase()}</span>
        <span style="margin-left:auto;font-size:.72rem;opacity:.7;">+${q.marks_correct} / ${q.marks_incorrect}</span>
      </div>
      ${questionHTML}
      ${answerHTML}
      ${solutionHTML}
    </div>`;
}

function _buildNumpad(q, ans) {
  const current = ans?.selected_answer || '';
  return `
    <div class="numerical-input-area">
      <div class="numerical-display" id="num-display">${current || '—'}</div>
      <div class="numpad">
        ${[7,8,9,'⌫',4,5,6,'±',1,2,3,'.',0,'00','C','↵'].map(k => `
          <button class="numpad-btn ${['C','⌫'].includes(String(k))?'clear':''}${['↵','±'].includes(String(k))?'special':''}"
                  onclick="_numpadPress('${q.id}','${k}')">${k}</button>`).join('')}
      </div>
    </div>`;
}

function _numpadPress(qId, key) {
  const ans = _exam.answers[qId];
  let val   = ans.selected_answer || '';

  if (key === 'C')  { val = ''; }
  else if (key === '⌫') { val = val.slice(0,-1); }
  else if (key === '±') { val = val.startsWith('-') ? val.slice(1) : '-'+val; }
  else if (key === '↵') { _saveAndNext(); return; }
  else if (key === '.' && val.includes('.')) { return; }
  else { val += key; }

  ans.selected_answer = val || null;
  ans.status = val ? 'ANSWERED' : 'NOT_ANSWERED';
  document.getElementById('num-display').textContent = val || '—';
}

function _selectOption(qId, key, isMulti) {
  const ans = _exam.answers[qId];
  if (isMulti) {
    const sel = new Set((ans.selected_answer || '').split(',').map(x=>x.trim()).filter(Boolean));
    sel.has(key) ? sel.delete(key) : sel.add(key);
    ans.selected_answer = [...sel].sort().join(',') || null;
  } else {
    ans.selected_answer = (ans.selected_answer === key) ? null : key;
  }
  ans.status = ans.selected_answer ? 'ANSWERED' : 'NOT_ANSWERED';
  _renderQuestion(_exam.questions[_exam.currentIndex]);
  _renderPalette();
}

function _renderActions(q) {
  const ro = _exam.readonly;
  if (ro) {
    document.getElementById('exam-actions').innerHTML = `
      <button class="btn btn-secondary" onclick="_goToQuestion(${_exam.currentIndex-1})" ${_exam.currentIndex===0?'disabled':''}>← Prev</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" onclick="_goToQuestion(${_exam.currentIndex+1})" ${_exam.currentIndex===_exam.questions.length-1?'disabled':''}>Next →</button>`;
    return;
  }
  document.getElementById('exam-actions').innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="_clearResponse('${q.id}')">Clear Response</button>
    <button class="btn btn-sm" style="background:var(--q-marked);color:#fff;" onclick="_markForReview('${q.id}')">Mark for Review</button>
    <div class="spacer"></div>
    <button class="btn btn-secondary btn-sm" onclick="_goToQuestion(${_exam.currentIndex-1})" ${_exam.currentIndex===0?'disabled':''}>← Prev</button>
    <button class="btn btn-primary btn-sm" onclick="_saveAndNext()">Save &amp; Next →</button>`;
}

function _clearResponse(qId) {
  const ans = _exam.answers[qId];
  ans.selected_answer = null;
  ans.status = 'NOT_ANSWERED';
  _sendAnswer(qId, ans);
  _renderQuestion(_exam.questions[_exam.currentIndex]);
  _renderPalette();
}

function _markForReview(qId) {
  const ans = _exam.answers[qId];
  ans.status = ans.selected_answer ? 'ANSWERED_AND_MARKED' : 'MARKED_FOR_REVIEW';
  _sendAnswer(qId, ans);
  _renderPalette();
  _goToQuestion(_exam.currentIndex + 1);
}

function _saveAndNext() {
  const q   = _exam.questions[_exam.currentIndex];
  const ans = _exam.answers[q.id];
  if (ans.selected_answer) ans.status = 'ANSWERED';
  _sendAnswer(q.id, ans);
  _goToQuestion(_exam.currentIndex + 1);
}

async function _sendAnswer(qId, ans) {
  const payload = {
    question_id:       qId,
    selected_answer:   ans.selected_answer,
    status:            ans.status,
    time_spent_seconds: ans.time_spent || 0,
  };
  if (!navigator.onLine) {
    OfflineQueue.push({ url: `/api/attempts/${_exam.attemptId}/answer`, opts: { method:'PATCH', body: payload } });
    return;
  }
  try { await AttemptAPI.answer(_exam.attemptId, payload); } catch {}
}

function _renderPalette() {
  const statsEl = document.getElementById('palette-stats');
  const gridEl  = document.getElementById('palette-grid');
  if (!statsEl || !gridEl) return;

  const counts = { ANSWERED:0, NOT_ANSWERED:0, MARKED_FOR_REVIEW:0, NOT_VISITED:0, ANSWERED_AND_MARKED:0 };
  Object.values(_exam.answers).forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  statsEl.innerHTML = `
    <div class="palette-stat-item"><div class="palette-dot dot-answered"></div>${counts.ANSWERED} Answered</div>
    <div class="palette-stat-item"><div class="palette-dot dot-not-answered"></div>${counts.NOT_ANSWERED} Not Answered</div>
    <div class="palette-stat-item"><div class="palette-dot dot-marked"></div>${counts.MARKED_FOR_REVIEW + counts.ANSWERED_AND_MARKED} Marked</div>
    <div class="palette-stat-item"><div class="palette-dot dot-not-visited"></div>${counts.NOT_VISITED} Not Visited</div>`;

  const bySubject = {};
  _exam.questions.forEach((q,i) => {
    if (!bySubject[q.subject]) bySubject[q.subject] = [];
    bySubject[q.subject].push({ q, i });
  });

  gridEl.innerHTML = Object.entries(bySubject).map(([subj, items]) => `
    <div class="palette-subject-section">
      <div class="palette-subject-label">${subj.charAt(0)+subj.slice(1).toLowerCase()}</div>
      <div class="palette-buttons">
        ${items.map(({q,i}) => {
          const ans = _exam.answers[q.id];
          const statusClass = (ans?.status || 'NOT_VISITED').toLowerCase().replace(/_/g,'-');
          const isCurrent = i === _exam.currentIndex;
          return `<button class="palette-btn ${statusClass} ${isCurrent?'current':''}"
                          data-idx="${i}" onclick="_goToQuestion(${i})">${i+1}</button>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function _startTimer() {
  _exam.timerInterval = setInterval(() => {
    const remaining = Math.max(0, _exam.endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const el   = document.getElementById('exam-timer');
    if (!el) { clearInterval(_exam.timerInterval); return; }
    el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    el.className   = 'exam-timer' + (mins < 5 ? ' danger' : mins < 15 ? ' warning' : '');
    if (remaining <= 0) { clearInterval(_exam.timerInterval); _submitExam(true); }
  }, 1000);
}

async function _submitExam(auto = false) {
  if (_exam.timerInterval) clearInterval(_exam.timerInterval);
  if (_exam.cameraInterval) { clearInterval(_exam.cameraInterval); await CameraAPI.end(_exam.cameraSessionId).catch(()=>{}); }

  // Save current question time
  const curQ = _exam.questions[_exam.currentIndex];
  if (curQ) {
    _exam.answers[curQ.id].time_spent += Math.round((Date.now() - _exam.questionStartTime) / 1000);
    _sendAnswer(curQ.id, _exam.answers[curQ.id]);
  }

  const screen = document.getElementById('exam-screen');
  screen.innerHTML = '<div class="loading-overlay" style="height:100vh;"><div class="spinner"></div><p style="margin-top:12px;color:var(--text2);">Submitting…</p></div>';

  try {
    const result = await AttemptAPI.submit(_exam.attemptId, { auto_submitted: auto });
    screen.classList.remove('active');
    _showResult(result);
  } catch (e) {
    showToast('Submit failed: ' + e.message, 'error');
    screen.classList.remove('active');
  }
}

function _confirmExit() {
  if (_exam.readonly) { document.getElementById('exam-screen').classList.remove('active'); return; }
  if (confirm('Are you sure you want to exit the exam? Your progress will be saved.')) {
    if (_exam.timerInterval) clearInterval(_exam.timerInterval);
    document.getElementById('exam-screen').classList.remove('active');
  }
}

function _showResult(result) {
  const container = document.getElementById('page-content');
  const pct = result.percentage ?? (result.max_score > 0 ? (result.score/result.max_score*100).toFixed(1) : 0);

  container.innerHTML = `
    <div class="result-screen fade-in">
      <div class="result-hero">
        <div style="font-size:3rem;margin-bottom:8px;">${pct >= 70 ? '🏆' : pct >= 50 ? '🎯' : '📚'}</div>
        <div class="result-score">${result.score.toFixed(1)}</div>
        <div class="result-max">out of ${result.max_score.toFixed(0)} marks</div>
        <div class="result-pct">${pct}%</div>
      </div>
      <div class="result-stats-grid">
        <div class="result-stat"><div class="rs-val rs-correct">${result.correct_count}</div><div class="rs-lbl">✅ Correct</div></div>
        <div class="result-stat"><div class="rs-val rs-incorrect">${result.incorrect_count}</div><div class="rs-lbl">❌ Incorrect</div></div>
        <div class="result-stat"><div class="rs-val rs-skip">${result.unattempted_count}</div><div class="rs-lbl">⏭ Skipped</div></div>
        <div class="result-stat"><div class="rs-val">${result.attempted_count}</div><div class="rs-lbl">📝 Attempted</div></div>
        <div class="result-stat"><div class="rs-val">${Math.floor(result.time_taken_seconds/60)}m</div><div class="rs-lbl">⏱ Time Taken</div></div>
        <div class="result-stat"><div class="rs-val">${pct >= 50 ? '✅' : '❌'}</div><div class="rs-lbl">Pass / Fail</div></div>
      </div>
      ${_renderSubjectBreakdown(result.subject_breakdown)}
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:20px;">
        <button class="btn btn-primary" onclick="launchExam({...window._lastExamOpts, readonly:true, attempt_id:${result.attempt_id}})">📖 View Solutions</button>
        <button class="btn btn-secondary" onclick="navigate('#pyq')">Browse More PYQs</button>
        <button class="btn btn-secondary" onclick="navigate('#leaderboard')">🏅 Leaderboard</button>
        <button class="btn btn-secondary" onclick="navigate('#dashboard')">📊 Dashboard</button>
      </div>
    </div>`;

  // Save result to IndexedDB for offline dashboard
  DashboardDB.saveAttemptResult(result);
}

function _renderSubjectBreakdown(breakdown) {
  if (!breakdown || !Object.keys(breakdown).length) return '';
  return `
    <div class="card" style="margin-top:20px;">
      <div class="section-title" style="margin-bottom:14px;">Subject Breakdown</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="font-size:.78rem;color:var(--text3);text-transform:uppercase;border-bottom:2px solid var(--border);">
          <th style="padding:8px;text-align:left;">Subject</th>
          <th style="padding:8px;text-align:center;">Correct</th>
          <th style="padding:8px;text-align:center;">Incorrect</th>
          <th style="padding:8px;text-align:center;">Skipped</th>
          <th style="padding:8px;text-align:right;">Score</th>
        </tr></thead>
        <tbody>
          ${Object.entries(breakdown).map(([s,b]) => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:10px 8px;font-weight:600;">${s.charAt(0)+s.slice(1).toLowerCase()}</td>
              <td style="padding:10px 8px;text-align:center;color:var(--success);">${b.correct}</td>
              <td style="padding:10px 8px;text-align:center;color:var(--danger);">${b.incorrect}</td>
              <td style="padding:10px 8px;text-align:center;color:var(--text3);">${b.unattempted}</td>
              <td style="padding:10px 8px;text-align:right;font-weight:700;color:var(--primary);">${b.score?.toFixed?.(1)||0}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function _startCameraCapture() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(stream => {
    const video = document.createElement('video');
    video.srcObject = stream; video.play();
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    _exam.cameraInterval = setInterval(() => {
      ctx.drawImage(video, 0, 0, 320, 240);
      const b64 = canvas.toDataURL('image/jpeg', 0.6);
      CameraAPI.snapshot(_exam.cameraSessionId, { image_b64: b64 }).catch(()=>{});
    }, 30000); // snapshot every 30 seconds
  }).catch(e => { showToast('Camera access denied — proceeding without proctoring.', 'warning'); });
}
