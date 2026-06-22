// pyq_browse.js — PYQ Browser, Solution Viewer
'use strict';
let _pyqState = { exams: [], activeExam: null, activeYear: null };

registerPage('pyq', async function(el) {
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  const exams = await GET('/api/pyq/exams');
  _pyqState = { exams, activeExam: exams[0]?.type || null, activeYear: null };
  _pyqRender(el);
});

function _pyqRender(el) {
  const { exams, activeExam, activeYear } = _pyqState;
  const examObj = exams.find(e => e.type === activeExam);
  const yearObj  = examObj?.years.find(y => y.year === activeYear);

  el.innerHTML = `<div class="fade-in">
    <div class="page-header"><div class="page-title">Solved Previous Year Questions</div>
    <div class="page-sub">Complete question papers with answers and solutions. Free access for all users.</div></div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap">
      <div class="tabs" style="background:var(--c-bg2);padding:3px;border-radius:var(--radius-sm)">
        ${exams.map(e => `<button class="tab-item ${e.type === activeExam ? 'active' : ''}" onclick="_pyqExam('${e.type}')">${e.display_name}</button>`).join('')}
      </div>
    </div>

    ${examObj ? `<div style="margin-bottom:18px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--c-text4);margin-bottom:10px">Select Year</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${examObj.years.map(y => `<button class="pill-tab ${y.year === activeYear ? 'active' : ''}" onclick="_pyqYear(${y.year})">${y.year}</button>`).join('')}
      </div>
    </div>` : ''}

    <div id="pyq-body">${yearObj ? _pyqShiftsHTML(yearObj, examObj) : `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="empty-title">Select a year</div><div class="empty-sub">Choose a year above to see available papers</div></div>`}</div>
  </div>`;
}

function _pyqExam(type) { _pyqState.activeExam = type; _pyqState.activeYear = null; _pyqRender(document.getElementById('page-content')); }
function _pyqYear(yr)   { _pyqState.activeYear = yr;   _pyqRender(document.getElementById('page-content')); }

// ADD THIS FUNCTION - Minimal PDF download with auth
async function downloadPDF(url) {
    const token = localStorage.getItem('ep_tok');
    if (!token) {
        toast('Please login to download', 'warn');
        go('login');
        return;
    }
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = url.split('/').pop() + '.pdf';
        a.click();
        URL.revokeObjectURL(a.href);
    } catch(e) {
        toast('PDF download failed', 'err');
    }
}

function _pyqShiftsHTML(year, exam) {
  if (!year.shifts.length) return '<div class="empty-state"><div class="empty-title">No papers available for this year</div></div>';
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${year.shifts.map(sh => `
    <div class="card" style="overflow:visible">
      <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:13px;font-weight:700;color:var(--c-text);margin-bottom:3px">${sh.label}</div>
          <div style="font-size:11px;color:var(--c-text4)">${sh.exam_date ? sh.exam_date + ' &middot; ' : ''}${sh.question_count} Questions</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="examLaunch({shift_id:${sh.id},title:'${exam.display_name} \u2013 ${sh.label}'})">
            ${IC.play}&nbsp;Attempt
          </button>
          <button class="btn btn-secondary btn-sm" onclick="_pyqSolutions(${sh.id},'${exam.display_name} \u2013 ${sh.label}')">
            ${IC.eye}&nbsp;Solutions
          </button>
          <div style="position:relative;display:inline-block" id="dlwrap-${sh.id}">
            <button class="btn btn-secondary btn-sm" onclick="_pyqDlToggle(${sh.id})">
              ${IC.dl}&nbsp;PDF&nbsp;<svg viewBox="0 0 24 24" width="9" height="9" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="dlmenu-${sh.id}" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius);box-shadow:var(--shadow-lg);z-index:200;padding:4px;min-width:196px">
              ${[['Question Paper',`/api/pdf/shift/${sh.id}/paper`],['Paper + OMR Sheet',`/api/pdf/shift/${sh.id}/paper?include_omr=true`],['Answer Key + Solutions',`/api/pdf/shift/${sh.id}/solutions`],['Blank OMR Sheet',`/api/pdf/shift/${sh.id}/omr`]].map(([l,u]) => `<a href="#" onclick="event.preventDefault();downloadPDF('${u}')" class="dl-row" style="display:block;padding:7px 12px;font-size:12px;font-weight:500;color:var(--c-text2);border-radius:5px;white-space:nowrap" onmouseover="this.style.background='var(--c-bg2)'" onmouseout="this.style.background=''">${l}</a>`).join('')}
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="lbPerTest('SHIFT',${sh.id},'${sh.label}')">Leaderboard</button>
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

function _pyqDlToggle(shiftId) {
  if (!requireLogin('Please login to download')) return;
  document.querySelectorAll('[id^="dlmenu-"]').forEach(m => { if (m.id !== 'dlmenu-' + shiftId) m.style.display = 'none'; });
  const m = document.getElementById('dlmenu-' + shiftId);
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
  if (m.style.display === 'block') {
    setTimeout(() => document.addEventListener('click', function h(e) { if (!e.target.closest('#dlwrap-'+shiftId)) { m.style.display='none'; document.removeEventListener('click',h); }}, {once:false}), 10);
  }
}

async function _pyqSolutions(shiftId, title) {
  if (!requireLogin()) return;
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  const qs = await GET(`/api/pyq/shifts/${shiftId}/solutions`);
  _renderSolutionViewer(el, qs, title, shiftId);
}

function _renderSolutionViewer(el, qs, title, shiftId) {
  const bySubj = {};
  qs.forEach(q => { (bySubj[q.subject] || (bySubj[q.subject] = [])).push(q); });
  el.innerHTML = `<div class="fade-in">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="go('pyq')">
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>&nbsp;Back
      </button>
      <div style="flex:1;font-size:15px;font-weight:800;color:var(--c-text);letter-spacing:-.3px">${title}</div>
      ${shiftId ? `<a href="#" onclick="event.preventDefault();downloadPDF('/api/pdf/shift/${shiftId}/solutions')" class="btn btn-secondary btn-sm">${IC.dl}&nbsp;Download PDF</a>` : ''}
    </div>
    ${Object.entries(bySubj).map(([subj, sqs]) => `
    <div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--c-blue);padding-bottom:8px;border-bottom:2px solid var(--c-blue-l);margin-bottom:14px">${subj}</div>
      ${sqs.map(q => _solutionCard(q)).join('')}
    </div>`).join('')}
  </div>`;
}

function _solutionCard(q) {
  const opts = [['A', q.option_a],['B', q.option_b],['C', q.option_c],['D', q.option_d]].filter(([, v]) => v);
  const corr = new Set((q.correct_answer || '').split(',').map(s => s.trim()));
  return `<div class="card" style="margin-bottom:10px;overflow:hidden">
    <div style="padding:10px 16px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);display:flex;align-items:center;gap:8px">
      <span class="badge badge-blue">Q${q.question_number}</span>
      <span class="badge badge-gray">${q.question_type === 'NUMERICAL' ? 'Numerical' : q.question_type === 'MCQ_MULTIPLE' ? 'Multiple Correct' : 'Single Correct'}</span>
      <span style="margin-left:auto;font-size:10px;color:var(--c-text4)">+${q.marks_correct} / ${q.marks_incorrect}</span>
    </div>
    <div style="padding:14px 16px">
      ${q.question_text ? `<div style="font-size:13px;line-height:1.75;color:var(--c-text);margin-bottom:12px">${q.question_text}</div>` : ''}
      ${opts.length ? `<div class="options-list" style="margin-bottom:12px">${opts.map(([k,v]) => `
        <div class="option-row ${corr.has(k) ? 'correct' : ''}" style="cursor:default;padding:9px 12px">
          <div class="option-key" style="${corr.has(k) ? 'background:var(--c-green);border-color:var(--c-green);color:#fff' : ''}">${k}</div>
          <div class="option-text">${v}</div>
          ${corr.has(k) ? `<span style="margin-left:auto;color:var(--c-green)">${IC.chk}</span>` : ''}
        </div>`).join('')}</div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--c-green-l);border-radius:var(--radius-sm);margin-bottom:${q.solution_text ? '10px' : '0'}">
        <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--c-green)">Answer</span>
        <span style="font-size:13px;font-weight:800;color:var(--c-green)">${q.correct_answer}</span>
      </div>
      ${q.solution_text ? `<div style="font-size:12px;color:var(--c-text2);line-height:1.7;padding:10px 12px;background:var(--c-surface2);border-radius:var(--radius-sm);border-left:3px solid var(--c-blue)">${q.solution_text}</div>` : ''}
    </div>
  </div>`;
}