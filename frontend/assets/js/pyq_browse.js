/**
 * pyq_browse.js — PYQ browse: Exam → Year → Shift → launch options
 */

let _pyqState = { exams: [], activeExam: null, activeYear: null };

async function renderPyq(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const exams = await PyqAPI.exams();
    _pyqState.exams      = exams;
    _pyqState.activeExam = exams[0]?.type || null;
    _pyqState.activeYear = null;
    _drawPyq(container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}

function _drawPyq(container) {
  const exams = _pyqState.exams;
  container.innerHTML = `
    <div class="section-title">Solved Previous Year Questions</div>
    <div class="section-sub">Browse by exam, year and shift. Attempt in exam mode or view solutions directly.</div>

    <div class="exam-tabs" id="exam-tabs">
      ${exams.map(e => `
        <button class="exam-tab ${e.type === _pyqState.activeExam ? 'active' : ''}"
                onclick="_selectExam('${e.type}')">${e.display_name}</button>`).join('')}
    </div>

    <div id="pyq-year-section"></div>
    <div id="pyq-shift-section"></div>`;

  if (_pyqState.activeExam) _drawYears();
}

function _selectExam(type) {
  _pyqState.activeExam = type;
  _pyqState.activeYear = null;
  document.querySelectorAll('.exam-tab').forEach(el => el.classList.toggle('active', el.textContent.trim() === _pyqState.exams.find(e=>e.type===type)?.display_name));
  document.getElementById('pyq-year-section').innerHTML = '';
  document.getElementById('pyq-shift-section').innerHTML = '';
  _drawYears();
}

function _drawYears() {
  const exam  = _pyqState.exams.find(e => e.type === _pyqState.activeExam);
  if (!exam) return;
  const sec   = document.getElementById('pyq-year-section');
  const years = exam.years;
  sec.innerHTML = `
    <div style="font-weight:700;font-size:.85rem;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Select Year</div>
    <div class="year-grid">
      ${years.map(y => `
        <button class="year-btn ${y.year === _pyqState.activeYear ? 'active' : ''}"
                onclick="_selectYear(${y.year})">${y.year}</button>`).join('')}
    </div>`;
  if (_pyqState.activeYear) _drawShifts();
}

function _selectYear(year) {
  _pyqState.activeYear = year;
  document.querySelectorAll('.year-btn').forEach(el => el.classList.toggle('active', parseInt(el.textContent) === year));
  _drawShifts();
}

function _drawShifts() {
  const exam  = _pyqState.exams.find(e => e.type === _pyqState.activeExam);
  const year  = exam?.years.find(y => y.year === _pyqState.activeYear);
  const sec   = document.getElementById('pyq-shift-section');
  if (!year) return;

  sec.innerHTML = `
    <div style="font-weight:700;font-size:.85rem;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin:16px 0 10px;">
      ${exam.display_name} — ${year.year}
    </div>
    <div class="shift-list">
      ${year.shifts.length === 0
        ? '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📭</div><h3>No shifts available yet</h3></div>'
        : year.shifts.map(sh => _shiftCard(sh, exam)).join('')}
    </div>`;
}

function _shiftCard(shift, exam) {
  const loggedIn = Auth.isLoggedIn();
  return `
    <div class="shift-card fade-in">
      <div class="shift-info">
        <div class="shift-label">${shift.label}</div>
        <div class="shift-meta">
          ${shift.exam_date ? `📅 ${shift.exam_date} &nbsp;·&nbsp; ` : ''}
          📝 ${shift.question_count} Questions
        </div>
      </div>
      <div class="shift-actions">
        <button class="btn btn-primary btn-sm" onclick="window._lastExamOpts={shift_id:${shift.id},title:'${exam.display_name} – ${shift.label}'};launchExam({shift_id:${shift.id},title:'${exam.display_name} – ${shift.label}'})">
          ▶ Attempt
        </button>
        <button class="btn btn-secondary btn-sm" onclick="renderSolutions(${shift.id},'${exam.display_name} – ${shift.label}')">
          📖 Solutions
        </button>
        <div style="position:relative;">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('dl-menu-${shift.id}').classList.toggle('active')">
            ⬇ PDF ▾
          </button>
          <div id="dl-menu-${shift.id}" style="display:none;position:absolute;right:0;top:36px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:8px;min-width:190px;box-shadow:var(--shadow-lg);z-index:50;" class="dl-dropdown">
            <a class="dl-item" href="${loggedIn ? PdfAPI.shiftPaper(shift.id,false) : '#'}" target="_blank" onclick="${loggedIn?'':'requireAuth();return false;'}">📄 Question Paper</a>
            <a class="dl-item" href="${loggedIn ? PdfAPI.shiftPaper(shift.id,true)  : '#'}" target="_blank" onclick="${loggedIn?'':'requireAuth();return false;'}">📄 Paper + OMR Sheet</a>
            <a class="dl-item" href="${loggedIn ? PdfAPI.shiftOmr(shift.id)         : '#'}" target="_blank" onclick="${loggedIn?'':'requireAuth();return false;'}">📋 OMR Only</a>
            <a class="dl-item" href="${loggedIn ? PdfAPI.shiftSolutions(shift.id)   : '#'}" target="_blank" onclick="${loggedIn?'':'requireAuth();return false;'}">✅ Answer Key + Solutions</a>
          </div>
        </div>
      </div>
    </div>`;
}

async function renderSolutions(shiftId, title) {
  if (!requireAuth()) return;
  const container = document.getElementById('page-content');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const questions = await PyqAPI.solutions(shiftId);
    _drawSolutionViewer(container, questions, title, shiftId);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}

function _drawSolutionViewer(container, questions, title, shiftId) {
  const bySubject = {};
  questions.forEach(q => {
    if (!bySubject[q.subject]) bySubject[q.subject] = [];
    bySubject[q.subject].push(q);
  });

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" onclick="navigate('#pyq')">← Back</button>
      <div class="section-title" style="margin-bottom:0;">${title}</div>
      <div style="margin-left:auto;display:flex;gap:8px;">
        <a class="btn btn-ghost btn-sm" href="${PdfAPI.shiftSolutions(shiftId)}" target="_blank">⬇ Download PDF</a>
      </div>
    </div>
    <div class="solution-list">
      ${Object.entries(bySubject).map(([subj, qs]) => `
        <div style="margin-bottom:28px;">
          <div style="font-weight:800;font-size:1rem;color:var(--primary);margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid var(--primary-light);">
            ${subj.charAt(0)+subj.slice(1).toLowerCase()}
          </div>
          ${qs.map(q => _solutionCard(q)).join('')}
        </div>`).join('')}
    </div>`;
}

function _solutionCard(q) {
  const opts = [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]].filter(([,v])=>v);
  const corrSet = new Set((q.correct_answer||'').split(',').map(x=>x.trim()));
  return `
    <div class="solution-card fade-in">
      <div class="solution-card-header">
        <span class="question-number-badge" style="font-size:.78rem;">Q${q.question_number}</span>
        <span style="font-size:.78rem;color:var(--text3);margin-left:4px;">${q.question_type==='NUMERICAL'?'Numerical':'MCQ'}</span>
        <span style="margin-left:auto;font-size:.78rem;color:var(--text3);">+${q.marks_correct} / ${q.marks_incorrect}</span>
      </div>
      <div class="solution-card-body">
        ${q.question_text ? `<div class="question-text" style="margin-bottom:12px;">${q.question_text}</div>` : ''}
        ${q.question_image_path ? `<img src="/static/${q.question_image_path}" class="question-image" style="margin-bottom:12px;">` : ''}
        ${opts.length ? `<div class="options-grid" style="margin-bottom:12px;">
          ${opts.map(([k,v]) => `
            <div class="option-item ${corrSet.has(k)?'correct':''}" style="cursor:default;">
              <div class="option-label" style="${corrSet.has(k)?'background:var(--success);color:#fff;border-color:var(--success);':''}">${k}</div>
              <div class="option-text">${v}</div>
              ${corrSet.has(k) ? '<span style="margin-left:auto;">✅</span>' : ''}
            </div>`).join('')}
        </div>` : ''}
        <div class="solution-answer-badge">✓ Answer: ${q.correct_answer}</div>
        ${q.solution_text ? `<div class="solution-explanation">${q.solution_text}</div>` : ''}
        ${q.solution_image_path ? `<img src="/static/${q.solution_image_path}" class="question-image" style="margin-top:10px;">` : ''}
      </div>
    </div>`;
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.dl-dropdown') && !e.target.textContent?.includes('PDF')) {
    document.querySelectorAll('.dl-dropdown').forEach(el => el.style.display = 'none');
  }
});
JSEOF

cat > /home/claude/examapp/frontend/js/premium.js << 'JSEOF'
/**
 * premium.js — Premium content tree: Engineering / NEET tracks
 * Non-premium users can browse the full tree but are shown paywall on attempt.
 */

async function renderPremium(container) {
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const [tracks, subStatus] = await Promise.all([
      PremiumAPI.tracks(),
      Auth.isLoggedIn() ? SubAPI.status() : Promise.resolve({ is_premium: false }),
    ]);
    _drawPremium(container, tracks, subStatus.is_premium);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`;
  }
}

function _drawPremium(container, tracks, isPremium) {
  if (!isPremium) {
    container.innerHTML = `
      <div class="premium-lock-banner" style="margin-bottom:24px;">
        <div class="lock-icon">🔒</div>
        <h3>Unlock Premium Content</h3>
        <p>Get access to DPPs, Chapterwise Tests, and Full Syllabus Mock Tests for JEE and NEET.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="navigate('#subscription')">View Plans</button>
          <button class="btn" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);" onclick="_renderTrackPreview(container,tracks)">Browse Content</button>
        </div>
      </div>` + _trackHTML(tracks, isPremium);
    window._premiumTracks = tracks;
    return;
  }
  container.innerHTML = `
    <div class="section-title">Premium Content</div>
    <div class="section-sub">DPPs, Chapterwise Tests & Full Syllabus Mock Tests — Engineering and NEET.</div>` +
    _trackHTML(tracks, isPremium);
}

function _trackHTML(tracks, isPremium) {
  if (!tracks.length) return '<div class="empty-state"><div class="empty-icon">📭</div><h3>No premium content yet</h3></div>';

  // Tab system for tracks
  const firstTrack = tracks[0];
  return `
    <div class="exam-tabs" id="premium-track-tabs">
      ${tracks.map((t,i) => `
        <button class="exam-tab ${i===0?'active':''}" onclick="_switchPremiumTrack('${t.name}',tracks)">
          ${t.display_name}
        </button>`).join('')}
    </div>
    <div id="premium-track-body">
      ${_renderTrack(firstTrack, isPremium)}
    </div>`;
}

function _switchPremiumTrack(name, tracks) {
  const track = (tracks || window._premiumTracks || []).find(t => t.name === name);
  if (!track) return;
  document.querySelectorAll('.exam-tab').forEach(el =>
    el.classList.toggle('active', el.textContent.trim() === track.display_name));
  const isPremium = Auth.isPremium();
  document.getElementById('premium-track-body').innerHTML = _renderTrack(track, isPremium);
}

function _renderTrack(track, isPremium) {
  if (!track.subjects.length) return '<div class="empty-state"><div class="empty-icon">📭</div><h3>No subjects yet</h3></div>';

  const activeSubj = track.subjects[0];
  return `
    <div class="exam-tabs" style="margin-top:14px;" id="prem-subj-tabs-${track.name}">
      ${track.subjects.map((s,i) => `
        <button class="exam-tab ${i===0?'active':''}"
                onclick="_switchSubject('${track.name}','${s.name}',${JSON.stringify(track).replace(/'/g,"\\'")})" >
          ${s.name.charAt(0)+s.name.slice(1).toLowerCase()}
        </button>`).join('')}
    </div>
    <div id="prem-subj-body-${track.name}">
      ${_renderSubject(activeSubj, isPremium)}
    </div>`;
}

function _switchSubject(trackName, subjName, track) {
  if (typeof track === 'string') track = JSON.parse(track);
  const subj = track.subjects.find(s => s.name === subjName);
  if (!subj) return;
  document.querySelectorAll(`#prem-subj-tabs-${trackName} .exam-tab`).forEach(el =>
    el.classList.toggle('active', el.textContent.trim().toLowerCase() === subjName.toLowerCase().slice(0,1) + subjName.slice(1).toLowerCase()));
  document.getElementById(`prem-subj-body-${trackName}`).innerHTML = _renderSubject(subj, Auth.isPremium());
}

function _renderSubject(subj, isPremium) {
  const lock = !isPremium;
  return `
    <div style="display:flex;flex-direction:column;gap:24px;margin-top:16px;">
      ${subj.dpp_sets.length ? _renderDppSets(subj.dpp_sets, lock) : ''}
      ${subj.test_sets.length ? _renderTestSets(subj.test_sets, lock) : ''}
      ${subj.mock_tests.length ? _renderMockTests(subj.mock_tests, lock) : ''}
    </div>`;
}

function _renderDppSets(dppSets, lock) {
  return `
    <div>
      <div style="font-weight:800;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        📋 DPP — All Chapters ${lock ? '<span class="premium-badge">⭐ Premium</span>' : ''}
      </div>
      ${dppSets.map(ds => `
        <div class="card" style="margin-bottom:12px;">
          <div style="font-weight:700;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
            ${ds.name}
            <span style="font-size:.78rem;color:var(--text3);">${ds.questions_per_dpp} Q per DPP</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            ${ds.dpps.map(d => `
              <div style="display:flex;align-items:center;padding:8px 12px;background:var(--surface2);border-radius:8px;gap:10px;">
                <span style="font-size:.85rem;flex:1;">${d.title}</span>
                <span style="font-size:.75rem;color:var(--text3);">⏱ ${d.duration_minutes}m · 📝 ${d.question_count}Q</span>
                ${lock ? `
                  <button class="btn btn-sm btn-ghost" onclick="navigate('#subscription')">🔒 Unlock</button>
                ` : `
                  <button class="btn btn-sm btn-primary" onclick="window._lastExamOpts={dpp_id:${d.id},title:'${d.title}'};launchExam({dpp_id:${d.id},title:'${d.title}'})">▶ Attempt</button>
                  <a class="btn btn-sm btn-secondary" href="${PdfAPI.dppPaper(d.id)}" target="_blank">⬇ PDF</a>
                  <a class="btn btn-sm btn-ghost"    href="${PdfAPI.dppSolutions(d.id)}" target="_blank">📖 Solutions</a>
                `}
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function _renderTestSets(testSets, lock) {
  return `
    <div>
      <div style="font-weight:800;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        📚 Chapterwise Tests ${lock ? '<span class="premium-badge">⭐ Premium</span>' : ''}
      </div>
      ${testSets.map(ts => `
        <div class="card" style="margin-bottom:12px;">
          <div style="font-weight:700;margin-bottom:10px;">${ts.name}</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${ts.chapters.map(ch => `
              <details style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                <summary style="padding:10px 14px;font-weight:600;font-size:.88rem;cursor:pointer;background:var(--surface2);list-style:none;display:flex;align-items:center;justify-content:space-between;">
                  ${ch.name}
                  <span style="font-size:.75rem;color:var(--text3);">${ch.modules.length} Module(s)</span>
                </summary>
                <div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px;">
                  ${ch.modules.map(m => `
                    <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:var(--bg2);border-radius:7px;">
                      <span style="font-size:.85rem;flex:1;">${m.name}</span>
                      <span style="font-size:.75rem;color:var(--text3);">⏱ ${m.duration_minutes}m · 📝 ${m.question_count}Q</span>
                      ${lock ? `
                        <button class="btn btn-sm btn-ghost" onclick="navigate('#subscription')">🔒 Unlock</button>
                      ` : `
                        <button class="btn btn-sm btn-primary" onclick="window._lastExamOpts={module_id:${m.id},title:'${ch.name} – ${m.name}'};launchExam({module_id:${m.id},title:'${ch.name} – ${m.name}'})">▶ Attempt</button>
                        <a class="btn btn-sm btn-secondary" href="${PdfAPI.modulePaper(m.id)}" target="_blank">⬇ PDF</a>
                      `}
                    </div>`).join('')}
                </div>
              </details>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function _renderMockTests(mocks, lock) {
  return `
    <div>
      <div style="font-weight:800;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        🏆 Full Syllabus Mock Tests ${lock ? '<span class="premium-badge">⭐ Premium</span>' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${mocks.map(m => `
          <div style="display:flex;align-items:center;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;gap:12px;">
            <span style="font-size:1.4rem;">📝</span>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:.9rem;">${m.title}</div>
              <div style="font-size:.78rem;color:var(--text3);">⏱ ${m.duration_minutes} min · 📝 ${m.question_count} Questions</div>
            </div>
            ${lock ? `
              <button class="btn btn-sm btn-ghost" onclick="navigate('#subscription')">🔒 Unlock</button>
            ` : `
              <button class="btn btn-sm btn-primary" onclick="window._lastExamOpts={mock_test_id:${m.id},title:'${m.title}'};launchExam({mock_test_id:${m.id},title:'${m.title}'})">▶ Full Test</button>
              <a class="btn btn-sm btn-secondary" href="${PdfAPI.mockPaper(m.id,true)}" target="_blank">⬇ Paper+OMR</a>
            `}
          </div>`).join('')}
      </div>
    </div>`;
}
