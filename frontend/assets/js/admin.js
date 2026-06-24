'use strict';
/* ═══════════════════════════════════════════════════════════════════
   ADMIN PANEL  — Question upload, structure management, stats
   ═══════════════════════════════════════════════════════════════════ */

registerPage('admin', async function(el) {
  if (!Auth.isAdmin()) { toast('Admin access required','err'); go('home'); return; }
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  let stats = {};
  try { stats = await GET('/api/admin/stats'); } catch {}
  window._adminData = { stats, exams:[], subjects:[], dppSets:[], testSets:[], mockTests:[], chapters:[], modules:[], dpps:[] };
  await _adminLoadAll();
  _adminPage(el, 'upload');
});

async function _adminLoadAll() {
  try {
    const [exams, tracks] = await Promise.all([GET('/api/pyq/exams'), GET('/api/premium/tracks')]);
    window._adminData.exams    = exams;
    window._adminData.tracks   = tracks;
    window._adminData.subjects = tracks.flatMap(t => t.subjects);
  } catch {}
}

let _aTab = 'upload';

function _adminPage(el, tab) {
  _aTab = tab;
  el.innerHTML = `<div class="fade-in">
    <div class="page-header"><div class="page-title">Admin Panel</div></div>
    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start">
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);overflow:hidden">
        ${[['upload','Upload Questions'],['structure','Exam Structure'],['premium-struct','Premium Structure'],['media','Media Upload'],['news','Post News'],['stats','Statistics'],['users','User Activity']].map(([k,l])=>
          `<button id="atn-${k}" onclick="_aSwitch('${k}')" style="display:block;width:100%;padding:10px 14px;border:none;background:${k===tab?'var(--c-blue-l)':'none'};color:${k===tab?'var(--c-blue)':'var(--c-text3)'};font-size:12px;font-weight:600;text-align:left;cursor:pointer;border-bottom:1px solid var(--c-border)">${l}</button>`
        ).join('')}
      </div>
      <div id="admin-body" class="fade-in"></div>
    </div>
  </div>`;
  _aLoad(tab);
}

function _aSwitch(k) {
  _aTab = k;
  document.querySelectorAll('[id^="atn-"]').forEach(b => {
    const bk = b.id.slice(4);
    b.style.background = bk===k ? 'var(--c-blue-l)' : 'none';
    b.style.color      = bk===k ? 'var(--c-blue)'   : 'var(--c-text3)';
  });
  const b = document.getElementById('admin-body');
  if (b) { b.className='fade-in'; _aLoad(k); }
}

function _aLoad(k) {
  const b = document.getElementById('admin-body'); if (!b) return;
  const map = { upload:_aUpload, structure:_aStructure, 'premium-struct':_aPremStruct,
                media:_aMedia, news:_aNews, stats:_aStats, users:_aUsers };
  (map[k]||_aStats)(b);
}

/* ═══════════════════════════════════════════════════════════════════
   UPLOAD QUESTIONS — smart wizard
   ═══════════════════════════════════════════════════════════════════ */
function _aUpload(el) {
  el.innerHTML = `<div>
    <div style="font-size:14px;font-weight:800;color:var(--c-text);margin-bottom:4px">Upload Questions</div>
    <div style="font-size:12px;color:var(--c-text3);margin-bottom:16px">Select destination, then add questions one by one.</div>

    <!-- STEP 1: Choose destination -->
    <div class="card" style="margin-bottom:14px"><div class="card-body">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:12px">Step 1 — Choose Destination</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" id="dest-tabs">
        ${['PYQ','DPP','Chapterwise Test','Mock Test'].map((t,i)=>
          `<button class="pill-tab ${i===0?'active':''}" onclick="_destTab('${t}')" id="dtab-${t.replace(' ','-')}">${t}</button>`
        ).join('')}
      </div>
      <div id="dest-form"></div>
    </div></div>

    <!-- STEP 2: Question form (shown after destination selected) -->
    <div id="qform-wrap" style="display:none"></div>
  </div>`;
  _destTab('PYQ');
}

window._destTab = function(tab) {
  document.querySelectorAll('[id^="dtab-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('dtab-' + tab.replace(' ','-'));
  if (btn) btn.classList.add('active');

  const df = document.getElementById('dest-form'); if (!df) return;
  document.getElementById('qform-wrap').style.display = 'none';

  if (tab === 'PYQ') {
    const exams = window._adminData.exams || [];
    df.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Exam</label>
          <select id="pyq-exam" class="form-control" onchange="_pyqExamChange()">
            <option value="">-- Select Exam --</option>
            ${exams.map(e=>`<option value="${e.id}" data-type="${e.type}">${e.display_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Year</label>
          <select id="pyq-year" class="form-control" onchange="_pyqYearChange()">
            <option value="">-- Select Year --</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Shift / Paper</label>
          <select id="pyq-shift" class="form-control">
            <option value="">-- Select Shift --</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <label class="form-label">Add new Shift (optional)</label>
          <input id="pyq-new-shift" class="form-control" placeholder="e.g. Apr 25 Shift 1 or Re-Exam">
        </div>
        <button class="btn btn-secondary btn-sm" onclick="_addShift()">Add Shift</button>
        <button class="btn btn-primary btn-sm" onclick="_pyqConfirm()">Use This Shift</button>
      </div>`;
  }
  else if (tab === 'DPP') {
    const subjs = window._adminData.subjects || [];
    df.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select id="dpp-subj" class="form-control" onchange="_dppSubjChange()">
            <option value="">-- Select Subject --</option>
            ${subjs.filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name} (${_trackName(s.id)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">DPP Set</label>
          <select id="dpp-set" class="form-control" onchange="_dppSetChange()">
            <option value="">-- Select Set --</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">DPP (Chapter)</label>
          <select id="dpp-id" class="form-control">
            <option value="">-- Select DPP --</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">Create new DPP Set</label>
            <input id="dpp-new-set" class="form-control" placeholder="Set name e.g. Set 4">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="_createDppSet()">Create</button>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">Create new DPP</label>
            <input id="dpp-new-name" class="form-control" placeholder="DPP title / chapter name">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="_createDpp()">Create</button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_dppConfirm()">Use This DPP</button>`;
  }
  else if (tab === 'Chapterwise Test') {
    const subjs = window._adminData.subjects || [];
    df.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select id="ct-subj" class="form-control" onchange="_ctSubjChange()">
            <option value="">-- Select Subject --</option>
            ${subjs.filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name} (${_trackName(s.id)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Chapter</label>
          <select id="ct-chapter" class="form-control" onchange="_ctChapterChange()">
            <option value="">-- Select Chapter --</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Module</label>
          <select id="ct-module" class="form-control">
            <option value="">-- Select Module --</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">Add Chapter</label>
            <input id="ct-new-ch" class="form-control" placeholder="Chapter name e.g. Kinematics">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="_addChapter()">Add</button>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">Add Module</label>
            <input id="ct-new-mod" class="form-control" placeholder="Module name e.g. Module 4">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="_addModule()">Add</button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_ctConfirm()">Use This Module</button>`;
  }
  else if (tab === 'Mock Test') {
    const subjs = window._adminData.subjects || [];
    df.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select id="mt-subj" class="form-control" onchange="_mtSubjChange()">
            <option value="">-- Select Subject --</option>
            ${subjs.filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name} (${_trackName(s.id)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Mock Test</label>
          <select id="mt-id" class="form-control">
            <option value="">-- Select Mock Test --</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <div class="form-group" style="flex:1;margin:0">
          <label class="form-label">Create new Mock Test</label>
          <input id="mt-new-name" class="form-control" placeholder="e.g. Full Syllabus Mock Test 4">
        </div>
        <input id="mt-new-dur" type="number" class="form-control" style="width:90px" value="180" placeholder="min">
        <button class="btn btn-secondary btn-sm" onclick="_createMock()">Create</button>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_mtConfirm()">Use This Mock Test</button>`;
  }
};

// ── Helper: track name for subject ────────────────────────────────────────────
function _trackName(subjId) {
  const tracks = window._adminData.tracks || [];
  for (const t of tracks) for (const s of t.subjects) if (s.id == subjId) return t.display_name;
  return '';
}

// ── PYQ selectors ─────────────────────────────────────────────────────────────
window._pyqExamChange = async function() {
  const examId = document.getElementById('pyq-exam').value;
  if (!examId) return;
  const exams = window._adminData.exams || [];
  const exam  = exams.find(e => e.id == examId);
  const sel   = document.getElementById('pyq-year');
  sel.innerHTML = '<option value="">-- Select Year --</option>'
    + (exam?.years||[]).sort((a,b)=>b.year-a.year).map(y=>`<option value="${y.id}">${y.year}</option>`).join('');
  document.getElementById('pyq-shift').innerHTML = '<option value="">-- Select Shift --</option>';
};

window._pyqYearChange = function() {
  const yearId = document.getElementById('pyq-year').value;
  if (!yearId) return;
  const exams  = window._adminData.exams || [];
  for (const e of exams) {
    const y = e.years.find(y => y.id == yearId);
    if (y) {
      document.getElementById('pyq-shift').innerHTML = '<option value="">-- Select Shift --</option>'
        + y.shifts.map(s=>`<option value="${s.id}">${s.label}${s.exam_date?' ('+s.exam_date+')':''}</option>`).join('');
      return;
    }
  }
};

window._addShift = async function() {
  const yearId = document.getElementById('pyq-year').value;
  const label  = document.getElementById('pyq-new-shift').value.trim();
  if (!yearId || !label) { toast('Select year and enter shift name','warn'); return; }
  try {
    const fd = new FormData(); fd.append('year_id',yearId); fd.append('label',label);
    const r  = await FORM('/api/admin/shifts', fd);
    toast(`Shift "${label}" created (ID: ${r.id})`,'ok');
    document.getElementById('pyq-new-shift').value = '';
    await _adminLoadAll();
    _pyqYearChange();
  } catch(e) { toast('Error: '+e.message,'err'); }
};

window._pyqConfirm = function() {
  const shiftId = document.getElementById('pyq-shift').value;
  const shiftEl = document.getElementById('pyq-shift');
  const label   = shiftEl.options[shiftEl.selectedIndex]?.text || '';
  if (!shiftId) { toast('Select a shift first','warn'); return; }
  _showQForm({ shift_id: parseInt(shiftId), label: 'PYQ — ' + label });
};

// ── DPP selectors ─────────────────────────────────────────────────────────────
window._dppSubjChange = async function() {
  const subjId = document.getElementById('dpp-subj').value; if (!subjId) return;
  try {
    const tracks = window._adminData.tracks||[];
    let sets = [];
    for (const t of tracks) for (const s of t.subjects) if (s.id==subjId) sets = s.dpp_sets||[];
    const sel = document.getElementById('dpp-set');
    sel.innerHTML = '<option value="">-- Select Set --</option>' + sets.map(ds=>`<option value="${ds.id}">${ds.name} (${ds.questions_per_dpp}Q/DPP)</option>`).join('');
    document.getElementById('dpp-id').innerHTML = '<option value="">-- Select DPP --</option>';
    window._adminData._curDppSets = sets;
  } catch(e) {}
};

window._dppSetChange = function() {
  const setId = document.getElementById('dpp-set').value; if (!setId) return;
  const sets  = window._adminData._curDppSets || [];
  const set   = sets.find(s=>s.id==setId);
  const dpps  = set?.dpps||[];
  document.getElementById('dpp-id').innerHTML = '<option value="">-- Select DPP --</option>'
    + dpps.sort((a,b)=>a.order_index-b.order_index).map(d=>`<option value="${d.id}">${d.title}</option>`).join('');
};

window._createDppSet = async function() {
  const subjId = document.getElementById('dpp-subj').value;
  const name   = document.getElementById('dpp-new-set').value.trim();
  if (!subjId||!name) { toast('Select subject and enter set name','warn'); return; }
  try {
    const fd=new FormData(); fd.append('subject_id',subjId); fd.append('name',name); fd.append('questions_per_dpp','10');
    const r=await FORM('/api/admin/premium/dpp-sets',fd);
    toast(`DPP Set "${name}" created`,'ok');
    document.getElementById('dpp-new-set').value='';
    await _adminLoadAll(); _dppSubjChange();
  } catch(e) { toast(e.message,'err'); }
};

window._createDpp = async function() {
  const setId = document.getElementById('dpp-set').value;
  const title = document.getElementById('dpp-new-name').value.trim();
  if (!setId||!title) { toast('Select set and enter DPP name','warn'); return; }
  try {
    const fd=new FormData(); fd.append('dpp_set_id',setId); fd.append('title',title); fd.append('chapter_name',title); fd.append('order_index','99'); fd.append('duration_minutes','30');
    const r=await FORM('/api/admin/premium/dpps',fd);
    toast(`DPP "${title}" created`,'ok');
    document.getElementById('dpp-new-name').value='';
    await _adminLoadAll(); _dppSubjChange();
    setTimeout(()=>{document.getElementById('dpp-set').value=setId;_dppSetChange();},200);
  } catch(e) { toast(e.message,'err'); }
};

window._dppConfirm = function() {
  const dppId = document.getElementById('dpp-id').value;
  const dppEl = document.getElementById('dpp-id');
  if (!dppId) { toast('Select a DPP','warn'); return; }
  _showQForm({ dpp_id: parseInt(dppId), label: 'DPP — ' + dppEl.options[dppEl.selectedIndex]?.text });
};

// ── Chapterwise Test selectors ─────────────────────────────────────────────────
window._ctSubjChange = async function() {
  const subjId = document.getElementById('ct-subj').value; if (!subjId) return;
  try {
    const tracks = window._adminData.tracks||[];
    let testSets = [];
    for (const t of tracks) for (const s of t.subjects) if (s.id==subjId) testSets = s.test_sets||[];
    // Flatten all chapters across all test sets
    let allChapters = [];
    for (const ts of testSets) {
      const chs = ts.chapters||[];
      allChapters = allChapters.concat(chs.map(ch=>({...ch,setName:ts.name})));
    }
    window._adminData._curChapters = allChapters;
    window._adminData._curTestSets = testSets;
    document.getElementById('ct-chapter').innerHTML = '<option value="">-- Select Chapter --</option>'
      + allChapters.map(ch=>`<option value="${ch.id}">${ch.name}</option>`).join('');
    document.getElementById('ct-module').innerHTML = '<option value="">-- Select Module --</option>';
    // Store for "add chapter" — use first test set
    window._adminData._ctSubjId = subjId;
    window._adminData._ctFirstSetId = testSets[0]?.id;
  } catch(e) {}
};

window._ctChapterChange = function() {
  const chId = document.getElementById('ct-chapter').value; if (!chId) return;
  const chs  = window._adminData._curChapters||[];
  const ch   = chs.find(c=>c.id==chId);
  const mods = ch?.modules||[];
  document.getElementById('ct-module').innerHTML = '<option value="">-- Select Module --</option>'
    + mods.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
};

window._addChapter = async function() {
  const name   = document.getElementById('ct-new-ch').value.trim();
  const setId  = window._adminData._ctFirstSetId;
  if (!name||!setId) { toast('Select subject and enter chapter name','warn'); return; }
  try {
    const fd=new FormData(); fd.append('test_set_id',setId); fd.append('name',name); fd.append('order_index','99');
    await FORM('/api/admin/premium/chapters',fd);
    toast(`Chapter "${name}" added`,'ok');
    document.getElementById('ct-new-ch').value='';
    await _adminLoadAll(); _ctSubjChange();
  } catch(e) { toast(e.message,'err'); }
};

window._addModule = async function() {
  const chId = document.getElementById('ct-chapter').value;
  const name = document.getElementById('ct-new-mod').value.trim();
  if (!chId||!name) { toast('Select chapter and enter module name','warn'); return; }
  try {
    const fd=new FormData(); fd.append('chapter_id',chId); fd.append('name',name); fd.append('order_index','99'); fd.append('duration_minutes','30');
    await FORM('/api/admin/premium/modules',fd);
    toast(`Module "${name}" added`,'ok');
    document.getElementById('ct-new-mod').value='';
    await _adminLoadAll(); _ctSubjChange();
    setTimeout(()=>{document.getElementById('ct-chapter').value=chId;_ctChapterChange();},200);
  } catch(e) { toast(e.message,'err'); }
};

window._ctConfirm = function() {
  const modId = document.getElementById('ct-module').value;
  const modEl = document.getElementById('ct-module');
  if (!modId) { toast('Select a module','warn'); return; }
  _showQForm({ module_id: parseInt(modId), label: 'Chapter Test — ' + modEl.options[modEl.selectedIndex]?.text });
};

// ── Mock Test selectors ───────────────────────────────────────────────────────
window._mtSubjChange = async function() {
  const subjId = document.getElementById('mt-subj').value; if (!subjId) return;
  const tracks = window._adminData.tracks||[];
  let mocks = [];
  for (const t of tracks) for (const s of t.subjects) if (s.id==subjId) mocks = s.mock_tests||[];
  window._adminData._mtSubjId = subjId;
  document.getElementById('mt-id').innerHTML = '<option value="">-- Select Mock Test --</option>'
    + mocks.map(m=>`<option value="${m.id}">${m.title}</option>`).join('');
};

window._createMock = async function() {
  const subjId = document.getElementById('mt-subj').value;
  const title  = document.getElementById('mt-new-name').value.trim();
  const dur    = parseInt(document.getElementById('mt-new-dur').value)||180;
  if (!subjId||!title) { toast('Select subject and enter mock test name','warn'); return; }
  try {
    const fd=new FormData(); fd.append('subject_id',subjId); fd.append('title',title); fd.append('duration_minutes',dur); fd.append('order_index','99');
    const r=await FORM('/api/admin/premium/mock-tests',fd);
    toast(`Mock Test "${title}" created`,'ok');
    document.getElementById('mt-new-name').value='';
    await _adminLoadAll(); _mtSubjChange();
  } catch(e) { toast(e.message,'err'); }
};

window._mtConfirm = function() {
  const mtId = document.getElementById('mt-id').value;
  const mtEl = document.getElementById('mt-id');
  if (!mtId) { toast('Select a mock test','warn'); return; }
  _showQForm({ mock_test_id: parseInt(mtId), label: 'Mock Test — ' + mtEl.options[mtEl.selectedIndex]?.text });
};

// ═══════════════════════════════════════════════════════════════════
//  QUESTION FORM — rich editor with text+LaTeX+image per field
// ═══════════════════════════════════════════════════════════════════
let _qDest = null; // { shift_id|dpp_id|module_id|mock_test_id, label }
let _qNum  = 1;
let _uploadedImgs = {}; // { field: path }

function _showQForm(dest) {
  _qDest = dest; _qNum = 1; _uploadedImgs = {};
  const wrap = document.getElementById('qform-wrap'); if (!wrap) return;
  wrap.style.display = 'block';
  wrap.innerHTML = `<div class="card"><div class="card-body">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:13px;font-weight:800;color:var(--c-text)">Add Questions</div>
        <div style="font-size:11px;color:var(--c-blue);font-weight:600;margin-top:2px">Destination: ${dest.label}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--c-text3)">Q Number:</span>
        <input id="q-num" type="number" class="form-control" style="width:70px" value="${_qNum}">
      </div>
    </div>
    <div id="aq-err" style="display:none;background:var(--c-red-l);color:var(--c-red);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-bottom:12px;border-left:3px solid var(--c-red)"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="form-group" style="margin:0">
        <label class="form-label">Subject</label>
        <select id="aq-subj" class="form-control"><option>PHYSICS</option><option>CHEMISTRY</option><option>MATHS</option><option>BIOLOGY</option></select>
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Question Type</label>
        <select id="aq-type" class="form-control" onchange="_aqTypeChange()"><option value="MCQ_SINGLE">MCQ — Single Correct</option><option value="MCQ_MULTIPLE">MCQ — Multiple Correct</option><option value="NUMERICAL">Numerical / Integer</option></select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div class="form-group" style="margin:0"><label class="form-label">+Marks</label><input id="aq-mc" type="number" class="form-control" value="4" step=".5"></div>
        <div class="form-group" style="margin:0"><label class="form-label">−Marks</label><input id="aq-mw" type="number" class="form-control" value="-1" step=".5"></div>
      </div>
    </div>

    <!-- Question text + image -->
    ${_richField('aq-qtext','Question','aq-qimg','question image (formula, diagram etc.)')}

    <!-- Options (hidden for numerical) -->
    <div id="aq-opts-wrap">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:8px">Options — Text supports LaTeX: use ^{x} for superscript, _{x} for subscript</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${['A','B','C','D'].map(k=>_richField('aq-opt'+k,'Option '+k,'aq-img'+k,'image for option '+k,true)).join('')}
      </div>
    </div>

    <!-- Correct answer -->
    <div class="form-group">
      <label class="form-label">Correct Answer <span style="color:var(--c-text4)">(MCQ: A / A,C  |  Numerical: 12.5)</span></label>
      <input id="aq-ans" class="form-control" placeholder="A  or  A,C  or  12.5">
    </div>

    <!-- Solution -->
    ${_richField('aq-sol','Solution Explanation (optional)','aq-simg','solution image',false,true)}

    <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
      <button class="btn btn-primary" onclick="_aqSubmit()">Add Question &amp; Next</button>
      <button class="btn btn-secondary" onclick="_aqClear()">Clear Form</button>
      <div id="aq-ok" style="display:none;font-size:12px;font-weight:600;color:var(--c-green)"></div>
    </div>
  </div></div>`;
}

function _richField(textId, label, imgId, imgHint, compact=false, optional=false) {
  return `<div class="form-group" style="${compact?'margin-bottom:8px':''}">
    <label class="form-label">${label}${optional?' <span style="color:var(--c-text4)">(optional)</span>':''}</label>
    <div style="display:flex;gap:6px;align-items:flex-start">
      <textarea id="${textId}" class="form-control" rows="${compact?2:3}" placeholder="Type here. LaTeX: ^{superscript} _{subscript}. HTML ok: &lt;sup&gt;&lt;sub&gt;&lt;b&gt;" style="flex:1;resize:vertical"></textarea>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        <label style="display:flex;align-items:center;gap:4px;padding:5px 8px;background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--radius-sm);cursor:pointer;font-size:11px;font-weight:600;color:var(--c-text3);white-space:nowrap">
          <input type="file" accept="image/*" id="${imgId}-file" style="display:none" onchange="_fieldImgPreview('${imgId}')">
          Img
        </label>
        <div id="${imgId}-preview" style="width:48px;height:36px;border-radius:4px;overflow:hidden;border:1px solid var(--c-border);display:none;background:var(--c-surface2)"></div>
      </div>
    </div>
    <div id="${imgId}-path" style="display:none;font-size:10px;color:var(--c-green);margin-top:3px;font-weight:600"></div>
  </div>`;
}

window._fieldImgPreview = async function(fieldId) {
  const file = document.getElementById(fieldId+'-file').files[0]; if (!file) return;
  // Show preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    const p = document.getElementById(fieldId+'-preview');
    if (p) { p.style.display='block'; p.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`; }
  };
  reader.readAsDataURL(file);
  // Upload
  try {
    const fd = new FormData(); fd.append('file', file);
    const r  = await FORM('/api/admin/upload/image', fd);
    _uploadedImgs[fieldId] = r.path;
    const pathEl = document.getElementById(fieldId+'-path');
    if (pathEl) { pathEl.textContent = 'Uploaded: ' + r.path.split('/').pop(); pathEl.style.display='block'; }
    toast('Image uploaded','ok',2000);
  } catch(e) {
    toast('Upload failed: ' + (e.message||e),'err');
    console.error('Upload error:', e);
  }
};

window._aqTypeChange = function() {
  const t = document.getElementById('aq-type')?.value;
  const w = document.getElementById('aq-opts-wrap');
  if (w) w.style.display = t==='NUMERICAL' ? 'none' : '';
};

async function _aqSubmit() {
  const err = document.getElementById('aq-err');
  const ok  = document.getElementById('aq-ok');
  if (err) { err.style.display='none'; err.textContent=''; }
  if (ok)  { ok.style.display='none'; }

  const dest   = _qDest;
  const ans    = (document.getElementById('aq-ans')?.value||'').trim();
  const qtype  = document.getElementById('aq-type')?.value;
  const qtext  = document.getElementById('aq-qtext')?.value||'';
  const qnum   = parseInt(document.getElementById('q-num')?.value)||_qNum;

  if (!dest) { if(err){err.textContent='No destination selected'; err.style.display='block';} return; }
  if (!ans)  { if(err){err.textContent='Correct answer is required'; err.style.display='block';} return; }
  if (!qtext && !_uploadedImgs['aq-qimg']) { if(err){err.textContent='Question text or image required'; err.style.display='block';} return; }

  // Build payload
  const payload = {
    ...dest,
    label: undefined, // remove label from payload
    subject:         document.getElementById('aq-subj')?.value || 'PHYSICS',
    question_type:   qtype,
    question_number: qnum,
    question_format: _uploadedImgs['aq-qimg'] && !qtext ? 'IMAGE' : 'TEXT',
    question_text:   qtext || null,
    question_image_path: _uploadedImgs['aq-qimg'] || null,
    option_a: document.getElementById('aq-optA')?.value || null,
    option_b: document.getElementById('aq-optB')?.value || null,
    option_c: document.getElementById('aq-optC')?.value || null,
    option_d: document.getElementById('aq-optD')?.value || null,
    options_image_path: _uploadedImgs['aq-imgA'] || _uploadedImgs['aq-imgB'] || null,
    correct_answer:  ans,
    marks_correct:   parseFloat(document.getElementById('aq-mc')?.value)||4,
    marks_incorrect: parseFloat(document.getElementById('aq-mw')?.value)||-1,
    solution_format: _uploadedImgs['aq-simg'] && !(document.getElementById('aq-sol')?.value) ? 'IMAGE' : 'TEXT',
    solution_text:   document.getElementById('aq-sol')?.value || null,
    solution_image_path: _uploadedImgs['aq-simg'] || null,
  };
  // Remove label key
  delete payload.label;

  try {
    const r = await POST('/api/admin/questions', payload);
    _qNum = qnum + 1;
    if (document.getElementById('q-num')) document.getElementById('q-num').value = _qNum;
    if (ok) { ok.textContent=`Q${qnum} added (ID ${r.id}). Ready for Q${_qNum}.`; ok.style.display='block'; }
    _uploadedImgs = {};
    _aqClear(false);
  } catch(e) {
    if (err) { err.textContent=e.message; err.style.display='block'; }
  }
}

function _aqClear(clearDest=true) {
  ['aq-qtext','aq-optA','aq-optB','aq-optC','aq-optD','aq-ans','aq-sol'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ['aq-qimg','aq-imgA','aq-imgB','aq-imgC','aq-imgD','aq-simg'].forEach(id=>{
    const p=document.getElementById(id+'-preview'); if(p){p.style.display='none';p.innerHTML='';}
    const pt=document.getElementById(id+'-path'); if(pt){pt.style.display='none';pt.textContent='';}
    const f=document.getElementById(id+'-file'); if(f) f.value='';
  });
  _uploadedImgs = {};
}

/* ═══════════════════════════════════════════════════════════════════
   EXAM STRUCTURE
   ═══════════════════════════════════════════════════════════════════ */
function _aStructure(el) {
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Add Year to Existing Exam</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Exam</label>
          <select id="str-exam" class="form-control">
            ${(window._adminData.exams||[]).map(e=>`<option value="${e.id}">${e.display_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Year</label>
          <input id="str-year" type="number" class="form-control" placeholder="e.g. 2026">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="_strAddYear()">Add Year</button>
    </div></div>

    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Add Shift / Paper to Year</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Exam</label>
          <select id="str-sh-exam" class="form-control" onchange="_strExamYears()">
            ${(window._adminData.exams||[]).map(e=>`<option value="${e.id}">${e.display_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Year</label>
          <select id="str-sh-year" class="form-control"></select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Shift Label</label>
          <input id="str-sh-label" class="form-control" placeholder="e.g. Jan 26 Shift 1 or Re-Exam">
        </div>
      </div>
      <div class="form-group" style="margin-top:8px"><label class="form-label">Exam Date (optional)</label><input id="str-sh-date" class="form-control" placeholder="2026-01-22"></div>
      <button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="_strAddShift()">Add Shift</button>
    </div></div>

    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Create New Exam (if needed)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Type</label>
          <select id="str-etype" class="form-control"><option value="JEE_MAIN">JEE Main</option><option value="JEE_ADVANCED">JEE Advanced</option><option value="NEET">NEET UG</option></select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Display Name</label>
          <input id="str-ename" class="form-control" placeholder="e.g. NEET UG 2026">
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="_strAddExam()">Create Exam</button>
    </div></div>
  </div>`;
  setTimeout(_strExamYears, 100);
}

window._strExamYears = function() {
  const examId = document.getElementById('str-sh-exam')?.value;
  const exam   = (window._adminData.exams||[]).find(e=>e.id==examId);
  const sel    = document.getElementById('str-sh-year'); if(!sel) return;
  sel.innerHTML = (exam?.years||[]).sort((a,b)=>b.year-a.year).map(y=>`<option value="${y.id}">${y.year}</option>`).join('');
};

window._strAddYear = async function() {
  const examId=document.getElementById('str-exam').value, year=document.getElementById('str-year').value;
  if(!examId||!year){toast('Fill all fields','warn');return;}
  try { const fd=new FormData();fd.append('exam_id',examId);fd.append('year',year); const r=await FORM('/api/admin/years',fd); toast(`Year ${year} added (ID:${r.id})`,'ok'); await _adminLoadAll(); _aStructure(document.getElementById('admin-body')); } catch(e){toast(e.message,'err');}
};

window._strAddShift = async function() {
  const yearId=document.getElementById('str-sh-year').value, label=document.getElementById('str-sh-label').value.trim(), date=document.getElementById('str-sh-date').value;
  if(!yearId||!label){toast('Fill all fields','warn');return;}
  try { const fd=new FormData();fd.append('year_id',yearId);fd.append('label',label);if(date)fd.append('exam_date',date); const r=await FORM('/api/admin/shifts',fd); toast(`Shift "${label}" added (ID:${r.id})`,'ok'); document.getElementById('str-sh-label').value=''; await _adminLoadAll(); } catch(e){toast(e.message,'err');}
};

window._strAddExam = async function() {
  const type=document.getElementById('str-etype').value, name=document.getElementById('str-ename').value.trim();
  if(!name){toast('Enter display name','warn');return;}
  try { const fd=new FormData();fd.append('type',type);fd.append('display_name',name); const r=await FORM('/api/admin/exams',fd); toast(`Exam created (ID:${r.id})`,'ok'); await _adminLoadAll(); _aStructure(document.getElementById('admin-body')); } catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════════════
   PREMIUM STRUCTURE (simplified)
   ═══════════════════════════════════════════════════════════════════ */
function _aPremStruct(el) {
  const subjs = window._adminData.subjects||[];
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    <div style="padding:10px 14px;background:var(--c-blue-l);border-radius:var(--radius-sm);font-size:12px;color:var(--c-blue);font-weight:600;border:1px solid var(--c-blue-m)">
      Tip: Most structure is already created. Use the Upload Questions section to add questions via DPP / Chapterwise / Mock Test selectors. Create new items here only when needed.
    </div>
    ${[
      ['Add DPP Set',['subject_id:Subject ID (number)','name:Set Name e.g. Set 4','questions_per_dpp:Questions per DPP'],'dpp-sets'],
      ['Add DPP',['dpp_set_id:DPP Set ID','title:DPP Title','chapter_name:Chapter','order_index:Order','duration_minutes:Duration (min)'],'dpps'],
      ['Add Test Set',['subject_id:Subject ID','name:Set Name'],'test-sets'],
      ['Add Chapter',['test_set_id:Test Set ID','name:Chapter Name','order_index:Order'],'chapters'],
      ['Add Module',['chapter_id:Chapter ID','name:Module Name','order_index:Order','duration_minutes:Duration min'],'modules'],
      ['Add Mock Test',['subject_id:Subject ID','title:Title','duration_minutes:Duration','order_index:Order'],'mock-tests'],
    ].map(([title,fields,ep])=>`
    <details style="border:1px solid var(--c-border);border-radius:var(--radius);overflow:hidden">
      <summary style="padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer;background:var(--c-surface2);user-select:none">${title}</summary>
      <div style="padding:14px">
        ${fields.map(f=>{const[id,ph]=f.split(':');return`<div class="form-group"><label class="form-label">${ph}</label><input id="ps-${ep}-${id}" class="form-control" placeholder="${ph}"></div>`;}).join('')}
        <button class="btn btn-primary btn-sm" onclick="_psCreate('/api/admin/premium/${ep}','${ep}',[${fields.map(f=>`'${f.split(':')[0]}'`).join(',')}])">Create ${title}</button>
        <div id="ps-${ep}-res" style="display:none;margin-top:8px;font-size:11px;color:var(--c-green);font-weight:600"></div>
      </div>
    </details>`).join('')}
    <div style="margin-top:4px;padding:10px 14px;background:var(--c-surface2);border-radius:var(--radius-sm);font-size:11px;color:var(--c-text4)">
      Subject IDs: ${subjs.map(s=>`${s.id}=${s.name}`).join(', ')}
    </div>
  </div>`;
}

window._psCreate = async function(url, ep, fields) {
  const fd=new FormData();
  fields.forEach(f=>{const el=document.getElementById(`ps-${ep}-${f}`);if(el&&el.value)fd.append(f,el.value);});
  const res=document.getElementById(`ps-${ep}-res`);
  try { const r=await FORM(url,fd); toast(`Created (ID:${r.id})`,'ok'); if(res){res.textContent=`Created — ID: ${r.id}`;res.style.display='block';} await _adminLoadAll(); } catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════════════
   MEDIA UPLOAD
   ═══════════════════════════════════════════════════════════════════ */
function _aMedia(el) {
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:4px">Upload Image</div>
      <div style="font-size:11px;color:var(--c-text4);margin-bottom:10px">Copy the path returned and paste into question forms.</div>
      <input id="mi-file" type="file" accept="image/*" class="form-control" style="margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="_doUpload('mi-file','/api/admin/upload/image','mi-res')">Upload</button>
      <div id="mi-res" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm)"></div>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:4px">Upload PDF</div>
      <input id="mp-file" type="file" accept="application/pdf" class="form-control" style="margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="_doUpload('mp-file','/api/admin/upload/pdf','mp-res')">Upload</button>
      <div id="mp-res" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm)"></div>
    </div></div>
  </div>`;
}

window._doUpload = async function(fileId, url, resId) {
  const file=document.getElementById(fileId).files[0]; if(!file){toast('Select a file first','warn');return;}
  const fd=new FormData(); fd.append('file',file);
  const res=document.getElementById(resId);
  try { const r=await FORM(url,fd); if(res){res.textContent=`Path: ${r.path}  (copied to clipboard)`;res.style.display='block';} navigator.clipboard?.writeText(r.path).catch(()=>{}); toast('Uploaded — path copied','ok'); } catch(e){toast('Upload failed: '+(e.message||JSON.stringify(e)),'err');}
};

/* ═══════════════════════════════════════════════════════════════════
   NEWS
   ═══════════════════════════════════════════════════════════════════ */
function _aNews(el) {
  el.innerHTML=`<div class="card"><div class="card-body">
    <div style="font-size:12px;font-weight:800;margin-bottom:14px;color:var(--c-text)">Post Exam News</div>
    <div class="form-group"><label class="form-label">Headline</label><input id="an-title" class="form-control" placeholder="e.g. JEE Main 2026 Answer Key Released"></div>
    <div class="form-group"><label class="form-label">Category</label>
      <select id="an-exam" class="form-control"><option value="">General</option><option value="JEE_MAIN">JEE Main</option><option value="JEE_ADVANCED">JEE Advanced</option><option value="NEET">NEET</option></select></div>
    <div class="form-group"><label class="form-label">Content</label><textarea id="an-body" class="form-control" rows="5" placeholder="Full news content..."></textarea></div>
    <button class="btn btn-primary btn-sm" onclick="_aPostNews()">Publish</button>
  </div></div>`;
}

window._aPostNews = async function() {
  const title=document.getElementById('an-title').value.trim();
  if(!title){toast('Headline required','warn');return;}
  try { await POST('/api/news/',{title,body:document.getElementById('an-body').value||null,exam_type:document.getElementById('an-exam').value||null}); toast('Published','ok'); document.getElementById('an-title').value='';document.getElementById('an-body').value=''; } catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════════════
   STATS + USERS
   ═══════════════════════════════════════════════════════════════════ */
function _aStats(el) {
  const s=window._adminData.stats||{};
  el.innerHTML=`<div class="stat-grid">
    ${[['Total Users',s.total_users||0,'var(--c-blue)'],['Active Premium',s.active_premium||0,'var(--c-green)'],['Total Attempts',s.total_attempts||0,'var(--c-purple)'],['Questions',s.total_questions||0,'var(--c-amber)']].map(([l,v,c])=>`
    <div class="stat-card"><div class="stat-val" style="color:${c}">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
  </div>`;
}

async function _aUsers(el) {
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  try {
    const [ov,da]=await Promise.all([GET('/api/leaderboard/overall?limit=20'),GET('/api/leaderboard/daily?limit=20')]);
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:14px">
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 16px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800">Top Users</div>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>#</th><th>User</th><th>Tests</th><th>Questions</th><th>Streak</th><th>Accuracy</th></tr></thead>
        <tbody>${ov.map(r=>`<tr><td style="font-weight:800">${r.rank}</td><td><div style="font-size:12px;font-weight:600">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td><td>${r.total_tests}</td><td>${r.total_questions}</td><td style="color:var(--c-amber);font-weight:700">${r.streak_days}d</td><td>${r.accuracy.toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 16px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800">Today's Activity</div>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>#</th><th>User</th><th>Questions</th><th>Score</th></tr></thead>
        <tbody>${da.map(r=>`<tr><td style="font-weight:800">${r.rank}</td><td><div style="font-size:12px;font-weight:600">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td><td style="font-weight:800;color:var(--c-blue)">${r.daily_questions_solved}</td><td>${r.daily_score.toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;
  } catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-sub">${e.message}</div></div>`;}
}
