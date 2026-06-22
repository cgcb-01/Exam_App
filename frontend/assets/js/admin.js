'use strict';
// ─── Admin panel ───────────────────────────────────────────────────────────────
registerPage('admin', async function(el) {
  if (!Auth.isAdmin()) { toast('Admin access required','err'); go('home'); return; }
  el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
  let stats = {};
  try { stats = await GET('/api/admin/stats'); } catch {}
  window._adminStats = stats;
  _adminPage(el, 'stats');
});

let _aTab = 'stats';

function _adminPage(el, tab) {
  _aTab = tab;
  el.innerHTML = `<div class="fade-in">
    <div class="page-header"><div class="page-title">Admin Panel</div><div class="page-sub">Manage content, users, and platform data.</div></div>
    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start">
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);padding:6px;display:flex;flex-direction:column;gap:2px">
        ${[
          ['stats','Overview'],
          ['questions','Add Question'],
          ['image-q','Upload Image Question'],
          ['exams','Exam Structure'],
          ['premium','Premium Structure'],
          ['media','Media Upload'],
          ['news','Post News'],
          ['users','User Stats'],
        ].map(([k,l])=>`<button onclick="_aSwitch('${k}')" id="atn-${k}" style="padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;font-weight:600;border:none;background:${k===tab?'var(--c-blue-l)':'none'};color:${k===tab?'var(--c-blue)':'var(--c-text3)'};cursor:pointer;text-align:left;width:100%;transition:all .15s">${l}</button>`).join('')}
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
    b.style.background = bk===k?'var(--c-blue-l)':'none';
    b.style.color      = bk===k?'var(--c-blue)':'var(--c-text3)';
  });
  _aLoad(k);
}

function _aLoad(k) {
  const b = document.getElementById('admin-body'); if(!b) return;
  const map = {
    stats: _aStats, questions: _aAddQ, 'image-q': _aImageQ,
    exams: _aExams, premium: _aPremium, media: _aMedia,
    news: _aNews, users: _aUsers,
  };
  b.className = 'fade-in';
  (map[k] || _aStats)(b);
}

// ── Overview stats ───────────────────────────────────────────────────────────
function _aStats(el) {
  const s = window._adminStats || {};
  el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      ${[['Total Users',s.total_users||0],['Active Premium',s.active_premium||0],['Total Attempts',s.total_attempts||0],['Total Questions',s.total_questions||0]].map(([l,v])=>`
      <div class="stat-card"><div class="stat-val" style="color:var(--c-blue)">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
    </div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:8px">Quick Actions</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="_aSwitch('questions')">Add Text Question</button>
        <button class="btn btn-primary btn-sm" onclick="_aSwitch('image-q')">Add Image Question</button>
        <button class="btn btn-secondary btn-sm" onclick="_aSwitch('exams')">Manage Exams</button>
        <button class="btn btn-secondary btn-sm" onclick="_aSwitch('news')">Post News</button>
      </div>
    </div></div>`;
}

// ── Add text question ────────────────────────────────────────────────────────
function _aAddQ(el) {
  el.innerHTML = `<div class="card"><div class="card-body">
    <div style="font-size:13px;font-weight:800;margin-bottom:16px;color:var(--c-text)">Add Text Question</div>
    <div id="aq-err" style="display:none;background:var(--c-red-l);color:var(--c-red);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-bottom:12px;border-left:3px solid var(--c-red)"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Place in</label>
        <select id="aq-ctype" class="form-control">
          <option value="shift_id">PYQ Shift</option><option value="dpp_id">DPP</option>
          <option value="module_id">Module</option><option value="mock_test_id">Mock Test</option>
        </select></div>
      <div class="form-group"><label class="form-label">ID (from structure)</label><input id="aq-cid" type="number" class="form-control" placeholder="e.g. 1"></div>
      <div class="form-group"><label class="form-label">Subject</label>
        <select id="aq-subj" class="form-control"><option>PHYSICS</option><option>CHEMISTRY</option><option>MATHS</option><option>BIOLOGY</option></select></div>
      <div class="form-group"><label class="form-label">Question Type</label>
        <select id="aq-qtype" class="form-control" onchange="_aqTypeChange()">
          <option>MCQ_SINGLE</option><option>MCQ_MULTIPLE</option><option>NUMERICAL</option></select></div>
      <div class="form-group"><label class="form-label">Question Number</label><input id="aq-qnum" type="number" class="form-control" value="1"></div>
      <div class="form-group"><label class="form-label">Topic (optional)</label><input id="aq-topic" class="form-control" placeholder="e.g. Kinematics"></div>
    </div>
    <div class="form-group"><label class="form-label">Question Text</label>
      <textarea id="aq-qtext" class="form-control" rows="4" placeholder="Type the full question here. HTML tags like <b>, <sup>, <sub> are supported."></textarea></div>
    <div id="aq-opts">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">Option A</label><input id="aq-a" class="form-control"></div>
        <div class="form-group"><label class="form-label">Option B</label><input id="aq-b" class="form-control"></div>
        <div class="form-group"><label class="form-label">Option C</label><input id="aq-c" class="form-control"></div>
        <div class="form-group"><label class="form-label">Option D</label><input id="aq-d" class="form-control"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Correct Answer</label>
        <input id="aq-ans" class="form-control" placeholder="A or A,C or 12.5 (numerical)"></div>
      <div class="form-group"><label class="form-label">Marks: +correct / −wrong</label>
        <div style="display:flex;gap:6px">
          <input id="aq-mc" type="number" class="form-control" value="4" step=".5">
          <input id="aq-mw" type="number" class="form-control" value="-1" step=".5">
        </div></div>
    </div>
    <div class="form-group"><label class="form-label">Solution Explanation</label>
      <textarea id="aq-sol" class="form-control" rows="3" placeholder="Step by step explanation..."></textarea></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="_aqSubmit()">Add Question</button>
      <button class="btn btn-secondary" onclick="_aqClear()">Clear Form</button>
    </div>
    <div id="aq-success" style="display:none;margin-top:10px;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm);font-size:12px;font-weight:600;border-left:3px solid var(--c-green)"></div>
  </div></div>`;
}

function _aqTypeChange() {
  const t = document.getElementById('aq-qtype')?.value;
  const s = document.getElementById('aq-opts'); if(s) s.style.display = t==='NUMERICAL'?'none':'';
}

async function _aqSubmit() {
  const err = document.getElementById('aq-err');
  const ok  = document.getElementById('aq-success');
  err.style.display='none'; ok.style.display='none';
  const ct  = document.getElementById('aq-ctype').value;
  const cid = parseInt(document.getElementById('aq-cid').value);
  const ans = document.getElementById('aq-ans').value.trim();
  if (!cid) { err.textContent='Container ID required'; err.style.display='block'; return; }
  if (!ans) { err.textContent='Correct answer required'; err.style.display='block'; return; }
  const payload = {
    [ct]: cid,
    subject: document.getElementById('aq-subj').value,
    question_type: document.getElementById('aq-qtype').value,
    question_number: parseInt(document.getElementById('aq-qnum').value)||1,
    question_format: 'TEXT',
    question_text: document.getElementById('aq-qtext').value||null,
    option_a: document.getElementById('aq-a')?.value||null,
    option_b: document.getElementById('aq-b')?.value||null,
    option_c: document.getElementById('aq-c')?.value||null,
    option_d: document.getElementById('aq-d')?.value||null,
    correct_answer: ans,
    marks_correct: parseFloat(document.getElementById('aq-mc').value)||4,
    marks_incorrect: parseFloat(document.getElementById('aq-mw').value)||-1,
    solution_format: 'TEXT',
    solution_text: document.getElementById('aq-sol').value||null,
    topic: document.getElementById('aq-topic').value||null,
  };
  try {
    const r = await POST('/api/admin/questions', payload);
    ok.textContent=`Question #${r.id} added successfully. Q${parseInt(document.getElementById('aq-qnum').value)+1} is ready.`;
    ok.style.display='block';
    document.getElementById('aq-qnum').value = parseInt(document.getElementById('aq-qnum').value)+1;
    ['aq-qtext','aq-a','aq-b','aq-c','aq-d','aq-ans','aq-sol'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  } catch(e) { err.textContent=e.message; err.style.display='block'; }
}

function _aqClear() {
  ['aq-qtext','aq-a','aq-b','aq-c','aq-d','aq-ans','aq-sol','aq-topic'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
}

// ── Add image question ───────────────────────────────────────────────────────
function _aImageQ(el) {
  el.innerHTML = `<div class="card"><div class="card-body">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px;color:var(--c-text)">Add Image-Based Question</div>
    <div style="font-size:12px;color:var(--c-text3);margin-bottom:16px">Upload the question image and/or solution image. The PDF export will embed the image directly.</div>
    <div id="iq-err" style="display:none;background:var(--c-red-l);color:var(--c-red);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-bottom:12px;border-left:3px solid var(--c-red)"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Container Type</label>
        <select id="iq-ctype" class="form-control"><option value="shift_id">PYQ Shift</option><option value="dpp_id">DPP</option><option value="module_id">Module</option><option value="mock_test_id">Mock Test</option></select></div>
      <div class="form-group"><label class="form-label">Container ID</label><input id="iq-cid" type="number" class="form-control" placeholder="e.g. 1"></div>
      <div class="form-group"><label class="form-label">Subject</label>
        <select id="iq-subj" class="form-control"><option>PHYSICS</option><option>CHEMISTRY</option><option>MATHS</option><option>BIOLOGY</option></select></div>
      <div class="form-group"><label class="form-label">Question Type</label>
        <select id="iq-qtype" class="form-control"><option>MCQ_SINGLE</option><option>MCQ_MULTIPLE</option><option>NUMERICAL</option></select></div>
      <div class="form-group"><label class="form-label">Q Number</label><input id="iq-qnum" type="number" class="form-control" value="1"></div>
      <div class="form-group"><label class="form-label">Correct Answer</label><input id="iq-ans" class="form-control" placeholder="A or A,C or 12.5"></div>
      <div class="form-group"><label class="form-label">+Marks</label><input id="iq-mc" type="number" class="form-control" value="4" step=".5"></div>
      <div class="form-group"><label class="form-label">−Marks</label><input id="iq-mw" type="number" class="form-control" value="-1" step=".5"></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:6px">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--c-text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Question Image</div>
        <div id="qimg-drop" onclick="document.getElementById('qimg-file').click()" style="border:2px dashed var(--c-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:all .15s;background:var(--c-surface2)" onmouseover="this.style.borderColor='var(--c-blue)'" onmouseout="this.style.borderColor='var(--c-border)'">
          <div style="font-size:11px;color:var(--c-text4)">Click to upload question image<br><span style="font-size:10px">JPG, PNG, WebP — max 5MB</span></div>
          <div id="qimg-preview" style="margin-top:10px"></div>
        </div>
        <input id="qimg-file" type="file" accept="image/*" style="display:none" onchange="_previewImg('qimg','qimg-preview')">
        <input id="qimg-path" type="text" class="form-control" style="margin-top:6px;font-size:11px" placeholder="Or paste existing path">
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--c-text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Solution Image (optional)</div>
        <div id="simg-drop" onclick="document.getElementById('simg-file').click()" style="border:2px dashed var(--c-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:all .15s;background:var(--c-surface2)" onmouseover="this.style.borderColor='var(--c-blue)'" onmouseout="this.style.borderColor='var(--c-border)'">
          <div style="font-size:11px;color:var(--c-text4)">Click to upload solution image<br><span style="font-size:10px">JPG, PNG — max 5MB</span></div>
          <div id="simg-preview" style="margin-top:10px"></div>
        </div>
        <input id="simg-file" type="file" accept="image/*" style="display:none" onchange="_previewImg('simg','simg-preview')">
        <input id="simg-path" type="text" class="form-control" style="margin-top:6px;font-size:11px" placeholder="Or paste existing path">
        <div class="form-group" style="margin-top:8px"><label class="form-label">Solution Text (optional)</label><textarea id="iq-sol" class="form-control" rows="2" placeholder="Additional text explanation"></textarea></div>
      </div>
    </div>

    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" onclick="_iqSubmit()">Upload & Add Question</button>
    </div>
    <div id="iq-success" style="display:none;margin-top:10px;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm);font-size:12px;font-weight:600;border-left:3px solid var(--c-green)"></div>
  </div></div>`;
}

function _previewImg(prefix, previewId) {
  const file = document.getElementById(prefix+'-file').files[0];
  if (!file) return;
  const preview = document.getElementById(previewId);
  const reader  = new FileReader();
  reader.onload = e => {
    preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:150px;border-radius:6px;margin-top:6px;object-fit:contain">`;
  };
  reader.readAsDataURL(file);
}

async function _iqSubmit() {
  const err = document.getElementById('iq-err');
  const ok  = document.getElementById('iq-success');
  err.style.display='none'; ok.style.display='none';

  const cid = parseInt(document.getElementById('iq-cid').value);
  const ans = document.getElementById('iq-ans').value.trim();
  if (!cid) { err.textContent='Container ID required'; err.style.display='block'; return; }
  if (!ans) { err.textContent='Correct answer required'; err.style.display='block'; return; }

  // Upload question image if selected
  let qImgPath = document.getElementById('qimg-path').value.trim() || null;
  const qImgFile = document.getElementById('qimg-file').files[0];
  if (qImgFile) {
    try {
      const fd = new FormData(); fd.append('file', qImgFile);
      const r = await FORM('/api/admin/upload/image', fd);
      qImgPath = r.path;
    } catch(e) { err.textContent='Image upload failed: '+e.message; err.style.display='block'; return; }
  }

  // Upload solution image if selected
  let sImgPath = document.getElementById('simg-path').value.trim() || null;
  const sImgFile = document.getElementById('simg-file').files[0];
  if (sImgFile) {
    try {
      const fd = new FormData(); fd.append('file', sImgFile);
      const r = await FORM('/api/admin/upload/image', fd);
      sImgPath = r.path;
    } catch {}
  }

  const ct = document.getElementById('iq-ctype').value;
  const payload = {
    [ct]: cid,
    subject: document.getElementById('iq-subj').value,
    question_type: document.getElementById('iq-qtype').value,
    question_number: parseInt(document.getElementById('iq-qnum').value)||1,
    question_format: qImgPath ? 'IMAGE' : 'TEXT',
    question_image_path: qImgPath,
    correct_answer: ans,
    marks_correct: parseFloat(document.getElementById('iq-mc').value)||4,
    marks_incorrect: parseFloat(document.getElementById('iq-mw').value)||-1,
    solution_format: sImgPath ? 'IMAGE' : 'TEXT',
    solution_image_path: sImgPath,
    solution_text: document.getElementById('iq-sol').value||null,
  };

  try {
    const r = await POST('/api/admin/questions', payload);
    ok.textContent = `Question #${r.id} with image added successfully.`;
    ok.style.display = 'block';
    document.getElementById('iq-qnum').value = parseInt(document.getElementById('iq-qnum').value)+1;
    document.getElementById('qimg-path').value='';
    document.getElementById('simg-path').value='';
    document.getElementById('qimg-preview').innerHTML='';
    document.getElementById('simg-preview').innerHTML='';
    document.getElementById('iq-sol').value='';
    document.getElementById('qimg-file').value='';
    document.getElementById('simg-file').value='';
  } catch(e) { err.textContent=e.message; err.style.display='block'; }
}

// ── Exam structure ───────────────────────────────────────────────────────────
function _aExams(el) {
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
    ${[
      ['Create Exam', 'ex', [['type','Exam Type (JEE_MAIN/JEE_ADVANCED/NEET)'],['display_name','Display Name e.g. JEE Main']], 'exams'],
      ['Create Year', 'yr', [['exam_id','Exam ID'],['year','Year e.g. 2025']], 'years'],
      ['Create Shift','sh', [['year_id','Year ID'],['label','Shift Label e.g. Jan 25 Shift 1'],['exam_date','Date (optional) e.g. 2025-01-22']], 'shifts'],
    ].map(([title,pfx,fields,ep])=>`
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">${title}</div>
      ${fields.map(([id,ph])=>`<div class="form-group"><label class="form-label">${ph}</label><input id="${pfx}-${id}" class="form-control" placeholder="${ph}"></div>`).join('')}
      <button class="btn btn-primary btn-sm" onclick="_aFormPost('/api/admin/${ep}','${pfx}',[${fields.map(([id])=>`'${id}'`).join(',')}])">Create ${title}</button>
      <div id="${pfx}-res" style="display:none;margin-top:8px;font-size:11px;font-weight:600;color:var(--c-green)"></div>
    </div></div>`).join('')}
  </div>`;
}

async function _aFormPost(url, pfx, fields) {
  const fd = new FormData();
  fields.forEach(f => { const el=document.getElementById(`${pfx}-${f}`); if(el&&el.value) fd.append(f,el.value); });
  const res = document.getElementById(`${pfx}-res`);
  try {
    const r = await FORM(url, fd);
    toast(`Created (ID: ${r.id})`,'ok');
    if(res){res.textContent=`Created successfully — ID: ${r.id}`;res.style.display='block';}
  } catch(e) { toast(e.message,'err'); }
}

// ── Premium structure ─────────────────────────────────────────────────────────
function _aPremium(el) {
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
    <div style="font-size:12px;color:var(--c-text3);margin-bottom:4px;padding:10px 14px;background:var(--c-blue-l);border-radius:var(--radius-sm);border:1px solid var(--c-blue-m)">Build the hierarchy: Track → Subject → {DPP Set → DPP} or {Test Set → Chapter → Module} or Mock Test</div>
    ${[
      ['Track','track',[['name','Name: ENGINEERING or NEET'],['display_name','Display Name']],'tracks'],
      ['Subject','subj',[['track_id','Track ID'],['name','PHYSICS/CHEMISTRY/MATHS/BIOLOGY'],['is_active','true or false']],'subjects'],
      ['DPP Set','dset',[['subject_id','Subject ID'],['name','Set Name'],['questions_per_dpp','Questions per DPP']],'dpp-sets'],
      ['DPP','dpp',[['dpp_set_id','DPP Set ID'],['title','DPP Title'],['chapter_name','Chapter'],['order_index','Order'],['duration_minutes','Duration (min)']],'dpps'],
      ['Test Set','tset',[['subject_id','Subject ID'],['name','Set Name']],'test-sets'],
      ['Chapter','chap',[['test_set_id','Test Set ID'],['name','Chapter Name'],['order_index','Order']],'chapters'],
      ['Module','mod',[['chapter_id','Chapter ID'],['name','Module Name'],['order_index','Order'],['duration_minutes','Duration (min)']],'modules'],
      ['Mock Test','mock',[['subject_id','Subject ID'],['title','Mock Test Title'],['duration_minutes','Duration (min)'],['order_index','Order']],'mock-tests'],
    ].map(([title,pfx,fields,ep])=>`
    <details style="border:1px solid var(--c-border);border-radius:var(--radius);overflow:hidden">
      <summary style="padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer;background:var(--c-surface2);user-select:none">Add ${title}</summary>
      <div style="padding:14px">
        ${fields.map(([id,ph])=>`<div class="form-group"><label class="form-label">${ph}</label><input id="${pfx}-${id}" class="form-control" placeholder="${ph}"></div>`).join('')}
        <button class="btn btn-primary btn-sm" onclick="_aFormPost('/api/admin/premium/${ep}','${pfx}',[${fields.map(([id])=>`'${id}'`).join(',')}])">Create ${title}</button>
      </div>
    </details>`).join('')}
  </div>`;
}

// ── Media upload ─────────────────────────────────────────────────────────────
function _aMedia(el) {
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px;color:var(--c-text)">Upload Image</div>
      <div style="font-size:11px;color:var(--c-text4);margin-bottom:12px">Upload question/solution images. The path returned can be pasted into question forms.</div>
      <input id="mi-file" type="file" accept="image/*" class="form-control" style="margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="_doUpload('mi-file','/api/admin/upload/image','mi-res')">Upload Image</button>
      <div id="mi-res" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm)"></div>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px;color:var(--c-text)">Upload PDF</div>
      <div style="font-size:11px;color:var(--c-text4);margin-bottom:12px">Upload solution PDFs for reference.</div>
      <input id="mp-file" type="file" accept="application/pdf" class="form-control" style="margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="_doUpload('mp-file','/api/admin/upload/pdf','mp-res')">Upload PDF</button>
      <div id="mp-res" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm)"></div>
    </div></div>
  </div>`;
}

async function _doUpload(fileId, url, resId) {
  const file = document.getElementById(fileId).files[0];
  if (!file) { toast('Select a file first','warn'); return; }
  const fd = new FormData(); fd.append('file', file);
  const res = document.getElementById(resId);
  try {
    const r = await FORM(url, fd);
    res.textContent = `Uploaded: ${r.path}  (copied to clipboard)`;
    res.style.display = 'block';
    navigator.clipboard?.writeText(r.path).catch(()=>{});
    toast('Uploaded — path copied to clipboard','ok');
  } catch(e) { toast(e.message,'err'); }
}

// ── News ──────────────────────────────────────────────────────────────────────
function _aNews(el) {
  el.innerHTML = `<div class="card"><div class="card-body">
    <div style="font-size:12px;font-weight:800;margin-bottom:14px;color:var(--c-text)">Post Exam News / Update</div>
    <div class="form-group"><label class="form-label">Headline</label><input id="an-title" class="form-control" placeholder="e.g. JEE Main 2025 Answer Key Released"></div>
    <div class="form-group"><label class="form-label">Exam Category</label>
      <select id="an-exam" class="form-control"><option value="">General / All</option><option value="JEE_MAIN">JEE Main</option><option value="JEE_ADVANCED">JEE Advanced</option><option value="NEET">NEET</option></select></div>
    <div class="form-group"><label class="form-label">News Body</label><textarea id="an-body" class="form-control" rows="5" placeholder="Full news content..."></textarea></div>
    <button class="btn btn-primary btn-sm" onclick="_aPostNews()">Publish Now</button>
  </div></div>`;
}

async function _aPostNews() {
  const title = document.getElementById('an-title').value.trim();
  if (!title) { toast('Headline required','warn'); return; }
  try {
    await POST('/api/news/', { title, body: document.getElementById('an-body').value||null, exam_type: document.getElementById('an-exam').value||null });
    toast('News published','ok');
    document.getElementById('an-title').value='';
    document.getElementById('an-body').value='';
  } catch(e) { toast(e.message,'err'); }
}

// ── User stats ────────────────────────────────────────────────────────────────
async function _aUsers(el) {
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  try {
    const [overall, daily] = await Promise.all([GET('/api/leaderboard/overall?limit=20'), GET('/api/leaderboard/daily?limit=20')]);
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 16px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800;color:var(--c-text)">Top Users by Performance</div>
        <div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>#</th><th>User</th><th>Tests</th><th>Questions</th><th>DPPs</th><th>Streak</th><th>Accuracy</th></tr></thead>
          <tbody>${overall.map(r=>`<tr>
            <td style="font-weight:800">${r.rank}</td>
            <td><div style="font-weight:600;font-size:12px">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td>
            <td>${r.total_tests}</td><td>${r.total_questions}</td><td>${r.total_dpps}</td>
            <td style="color:var(--c-amber);font-weight:700">${r.streak_days}d</td>
            <td>${r.accuracy.toFixed(1)}%</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 16px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800;color:var(--c-text)">Today's Activity</div>
        <div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>#</th><th>User</th><th>Questions Today</th><th>Score Today</th></tr></thead>
          <tbody>${daily.map(r=>`<tr>
            <td style="font-weight:800">${r.rank}</td>
            <td><div style="font-weight:600;font-size:12px">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td>
            <td style="font-weight:800;color:var(--c-blue)">${r.daily_questions_solved}</td>
            <td>${r.daily_score.toFixed(1)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>`;
  } catch(e) { el.innerHTML=`<div class="empty-state"><div class="empty-sub">${e.message}</div></div>`; }
}
