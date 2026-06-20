/**
 * admin.js — Owner admin panel: stats, insert questions, manage content.
 */

let _adminSection = 'stats';

async function renderAdmin(container) {
  if (!Auth.isAdmin()) { navigate('#home'); return; }
  container.innerHTML = `
    <div class="section-title">Admin Panel</div>
    <div class="admin-grid" style="margin-top:16px;">
      <div class="admin-sidebar">
        ${['stats','add-question','add-exam','add-premium','upload-media'].map(s => `
          <div class="admin-nav-item ${s===_adminSection?'active':''}" onclick="_adminNav('${s}')">
            ${{stats:'📊 Dashboard Stats', 'add-question':'➕ Add Question', 'add-exam':'📂 Add Exam/Year/Shift', 'add-premium':'🏆 Add Premium Content', 'upload-media':'🖼 Upload Media'}[s]}
          </div>`).join('')}
      </div>
      <div id="admin-content"></div>
    </div>`;
  _adminNav(_adminSection);
}

function _adminNav(section) {
  _adminSection = section;
  document.querySelectorAll('.admin-nav-item').forEach(el => {
    el.classList.toggle('active', el.textContent.includes({
      stats:'Stats', 'add-question':'Add Question', 'add-exam':'Add Exam',
      'add-premium':'Premium', 'upload-media':'Upload'
    }[section]));
  });
  const c = document.getElementById('admin-content');
  const map = { stats: _adminStats, 'add-question': _adminAddQuestion,
                'add-exam': _adminAddExam, 'add-premium': _adminAddPremium,
                'upload-media': _adminUploadMedia };
  map[section]?.(c);
}

async function _adminStats(c) {
  c.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    const stats = await AdminAPI.stats();
    c.innerHTML = `
      <div class="dashboard-grid">
        ${Object.entries({ 'Total Users':stats.total_users, 'Active Premium':stats.active_premium,
                            'Total Attempts':stats.total_attempts, 'Total Questions':stats.total_questions })
          .map(([k,v]) => `<div class="dash-stat"><div class="ds-value" style="font-size:2.2rem;">${v}</div><div class="ds-label">${k}</div></div>`).join('')}
      </div>`;
  } catch(e) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${e.message}</h3></div>`; }
}

function _adminAddQuestion(c) {
  c.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-bottom:16px;">Add Question</div>
      <div id="q-add-error" style="display:none;color:var(--danger);margin-bottom:10px;font-size:.85rem;"></div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Container Type</label>
          <select id="q-container-type" class="form-control" onchange="_updateContainerField()">
            <option value="shift_id">PYQ Shift</option>
            <option value="dpp_id">DPP</option>
            <option value="module_id">Module</option>
            <option value="mock_test_id">Mock Test</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Container ID</label>
          <input id="q-container-id" type="number" class="form-control" placeholder="e.g. 1">
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Subject</label>
          <select id="q-subject" class="form-control">
            <option>PHYSICS</option><option>CHEMISTRY</option><option>MATHS</option><option>BIOLOGY</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Question Type</label>
          <select id="q-type" class="form-control" onchange="_toggleNumOptions()">
            <option>MCQ_SINGLE</option><option>MCQ_MULTIPLE</option><option>NUMERICAL</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Question Number</label>
          <input id="q-num" type="number" class="form-control" value="1">
        </div>
        <div class="form-group">
          <label class="form-label">Topic (optional)</label>
          <input id="q-topic" type="text" class="form-control" placeholder="e.g. Kinematics">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Question Format</label>
        <select id="q-format" class="form-control">
          <option value="TEXT">Text</option><option value="IMAGE">Image (provide path)</option><option value="PDF">PDF (provide path)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Question Text</label>
        <textarea id="q-text" class="form-control" rows="3" placeholder="Type the question here..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Question Image Path (if any)</label>
        <input id="q-img" type="text" class="form-control" placeholder="uploads/questions/filename.jpg">
      </div>
      <div id="options-section">
        <div class="grid-2">
          <div class="form-group"><label class="form-label">Option A</label><input id="q-a" class="form-control" placeholder="Option A"></div>
          <div class="form-group"><label class="form-label">Option B</label><input id="q-b" class="form-control" placeholder="Option B"></div>
          <div class="form-group"><label class="form-label">Option C</label><input id="q-c" class="form-control" placeholder="Option C"></div>
          <div class="form-group"><label class="form-label">Option D</label><input id="q-d" class="form-control" placeholder="Option D"></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Correct Answer</label>
          <input id="q-ans" class="form-control" placeholder="A or A,C or 12.5">
        </div>
        <div class="form-group">
          <label class="form-label">Marks: +Correct / -Incorrect</label>
          <div style="display:flex;gap:8px;">
            <input id="q-mark-c" type="number" class="form-control" value="4" step="0.5">
            <input id="q-mark-w" type="number" class="form-control" value="-1" step="0.5">
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Solution (Text)</label>
        <textarea id="q-sol-text" class="form-control" rows="3" placeholder="Full explanation / working..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Solution Image Path (if any)</label>
        <input id="q-sol-img" type="text" class="form-control" placeholder="uploads/questions/solution.jpg">
      </div>
      <button class="btn btn-primary" onclick="_submitQuestion()">➕ Add Question</button>
    </div>`;
}

function _toggleNumOptions() {
  const isNum = document.getElementById('q-type').value === 'NUMERICAL';
  document.getElementById('options-section').style.display = isNum ? 'none' : '';
}

async function _submitQuestion() {
  const cType = document.getElementById('q-container-type').value;
  const cId   = parseInt(document.getElementById('q-container-id').value);
  const payload = {
    [cType]: cId,
    subject: document.getElementById('q-subject').value,
    question_type: document.getElementById('q-type').value,
    question_number: parseInt(document.getElementById('q-num').value)||1,
    question_format: document.getElementById('q-format').value,
    question_text: document.getElementById('q-text').value||null,
    question_image_path: document.getElementById('q-img').value||null,
    option_a: document.getElementById('q-a').value||null,
    option_b: document.getElementById('q-b').value||null,
    option_c: document.getElementById('q-c').value||null,
    option_d: document.getElementById('q-d').value||null,
    correct_answer: document.getElementById('q-ans').value,
    marks_correct: parseFloat(document.getElementById('q-mark-c').value)||4,
    marks_incorrect: parseFloat(document.getElementById('q-mark-w').value)||-1,
    solution_format: 'TEXT',
    solution_text: document.getElementById('q-sol-text').value||null,
    solution_image_path: document.getElementById('q-sol-img').value||null,
    topic: document.getElementById('q-topic').value||null,
  };
  try {
    const r = await AdminAPI.createQuestion(payload);
    showToast(`Question #${r.id} added successfully!`, 'success');
    document.getElementById('q-text').value = '';
    document.getElementById('q-ans').value  = '';
    document.getElementById('q-sol-text').value = '';
    document.getElementById('q-num').value = parseInt(document.getElementById('q-num').value)+1;
  } catch(e) {
    const el = document.getElementById('q-add-error');
    el.style.display = 'block'; el.textContent = e.message;
  }
}

function _adminAddExam(c) {
  c.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-bottom:16px;">Create Exam / Year / Shift</div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        <div>
          <div style="font-weight:700;margin-bottom:10px;">New Exam</div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Type</label>
              <select id="ex-type" class="form-control"><option>JEE_MAIN</option><option>JEE_ADVANCED</option><option>NEET</option></select></div>
            <div class="form-group"><label class="form-label">Display Name</label><input id="ex-name" class="form-control" placeholder="JEE Main"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="_createExam()">Create Exam</button>
        </div>
        <hr class="divider">
        <div>
          <div style="font-weight:700;margin-bottom:10px;">New Year</div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Exam ID</label><input id="yr-exam" type="number" class="form-control"></div>
            <div class="form-group"><label class="form-label">Year</label><input id="yr-year" type="number" class="form-control" placeholder="2025"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="_createYear()">Create Year</button>
        </div>
        <hr class="divider">
        <div>
          <div style="font-weight:700;margin-bottom:10px;">New Shift</div>
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Year ID</label><input id="sh-year" type="number" class="form-control"></div>
            <div class="form-group"><label class="form-label">Label</label><input id="sh-label" class="form-control" placeholder="Jan 25 Shift 1"></div>
            <div class="form-group"><label class="form-label">Date (optional)</label><input id="sh-date" class="form-control" placeholder="2025-01-22"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="_createShift()">Create Shift</button>
        </div>
      </div>
    </div>`;
}

async function _createExam() {
  const fd = new FormData();
  fd.append('type', document.getElementById('ex-type').value);
  fd.append('display_name', document.getElementById('ex-name').value);
  try { const r = await AdminAPI.createExam(fd); showToast(`Exam created (ID: ${r.id})`, 'success'); }
  catch(e) { showToast(e.message, 'error'); }
}
async function _createYear() {
  const fd = new FormData();
  fd.append('exam_id', document.getElementById('yr-exam').value);
  fd.append('year', document.getElementById('yr-year').value);
  try { const r = await AdminAPI.createYear(fd); showToast(`Year created (ID: ${r.id})`, 'success'); }
  catch(e) { showToast(e.message, 'error'); }
}
async function _createShift() {
  const fd = new FormData();
  fd.append('year_id', document.getElementById('sh-year').value);
  fd.append('label', document.getElementById('sh-label').value);
  const d = document.getElementById('sh-date').value;
  if (d) fd.append('exam_date', d);
  try { const r = await AdminAPI.createShift(fd); showToast(`Shift created (ID: ${r.id})`, 'success'); }
  catch(e) { showToast(e.message, 'error'); }
}

function _adminAddPremium(c) {
  c.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-bottom:16px;">Add Premium Content Structure</div>
      <div style="font-size:.82rem;color:var(--text3);margin-bottom:14px;">
        Build the hierarchy: Track → Subject → DPP Set → DPP or Test Set → Chapter → Module or Mock Test
      </div>
      ${[
        ['Track', [['name','Name (ENGINEERING/NEET)',''],['display_name','Display Name','Engineering (JEE)']], '_createTrack'],
        ['Subject', [['track_id','Track ID','number'],['name','Subject (PHYSICS/CHEMISTRY/MATHS/BIOLOGY)',''],['is_active','Active (true/false)','']], '_createSubject'],
        ['DPP Set', [['subject_id','Subject ID','number'],['name','Set Name','Set 1'],['questions_per_dpp','Questions per DPP','number']], '_createDppSet'],
        ['DPP', [['dpp_set_id','DPP Set ID','number'],['title','Title','DPP 1 – Kinematics'],['chapter_name','Chapter',''],['order_index','Order','number'],['duration_minutes','Duration (min)','number']], '_createDpp'],
        ['Test Set', [['subject_id','Subject ID','number'],['name','Set Name','Set 1']], '_createTestSet'],
        ['Chapter', [['test_set_id','Test Set ID','number'],['name','Chapter Name',''],['order_index','Order','number']], '_createChapter'],
        ['Module', [['chapter_id','Chapter ID','number'],['name','Module Name','Module 1'],['order_index','Order','number'],['duration_minutes','Duration (min)','number']], '_createModule'],
        ['Mock Test', [['subject_id','Subject ID','number'],['title','Title','Full Mock Test 1'],['duration_minutes','Duration (min)','number'],['order_index','Order','number']], '_createMock'],
      ].map(([label, fields, fn]) => `
        <details style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
          <summary style="padding:10px 14px;font-weight:600;cursor:pointer;background:var(--surface2);">➕ Add ${label}</summary>
          <div style="padding:14px;">
            ${fields.map(([id,ph,type]) => `
              <div class="form-group">
                <label class="form-label">${ph}</label>
                <input id="pm-${fn}-${id}" class="form-control" type="${type==='number'?'number':'text'}" placeholder="${ph}">
              </div>`).join('')}
            <button class="btn btn-primary btn-sm" onclick="${fn}(${JSON.stringify(fields.map(([id])=>id))})">Create ${label}</button>
          </div>
        </details>`).join('')}
    </div>`;
}

async function _createTrack(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createTrack-${f}`).value));
  try { const r = await AdminAPI.createTrack(fd); showToast(`Track created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createSubject(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createSubject-${f}`).value));
  try { const r = await AdminAPI.createSubject(fd); showToast(`Subject created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createDppSet(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createDppSet-${f}`).value));
  try { const r = await AdminAPI.createDppSet(fd); showToast(`DPP Set created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createDpp(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createDpp-${f}`).value));
  try { const r = await AdminAPI.createDpp(fd); showToast(`DPP created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createTestSet(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createTestSet-${f}`).value));
  try { const r = await AdminAPI.createTestSet(fd); showToast(`Test Set created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createChapter(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createChapter-${f}`).value));
  try { const r = await AdminAPI.createChapter(fd); showToast(`Chapter created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createModule(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createModule-${f}`).value));
  try { const r = await AdminAPI.createModule(fd); showToast(`Module created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}
async function _createMock(fields) {
  const fd = new FormData();
  fields.forEach(f => fd.append(f, document.getElementById(`pm-_createMock-${f}`).value));
  try { const r = await AdminAPI.createMock(fd); showToast(`Mock Test created (ID: ${r.id})`, 'success'); } catch(e) { showToast(e.message,'error'); }
}

function _adminUploadMedia(c) {
  c.innerHTML = `
    <div class="card">
      <div class="section-title" style="margin-bottom:16px;">Upload Media</div>
      <div style="display:flex;flex-direction:column;gap:20px;">
        <div>
          <div style="font-weight:700;margin-bottom:10px;">Upload Question Image</div>
          <input id="upload-img-file" type="file" accept="image/*" class="form-control">
          <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="_uploadImg()">Upload Image</button>
          <div id="upload-img-result" style="margin-top:8px;font-size:.82rem;color:var(--success);"></div>
        </div>
        <hr class="divider">
        <div>
          <div style="font-weight:700;margin-bottom:10px;">Upload Solution PDF</div>
          <input id="upload-pdf-file" type="file" accept="application/pdf" class="form-control">
          <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="_uploadPdf()">Upload PDF</button>
          <div id="upload-pdf-result" style="margin-top:8px;font-size:.82rem;color:var(--success);"></div>
        </div>
      </div>
    </div>`;
}

async function _uploadImg() {
  const file = document.getElementById('upload-img-file').files[0];
  if (!file) { showToast('Select an image first.','warning'); return; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await AdminAPI.uploadImage(fd);
    document.getElementById('upload-img-result').textContent = `✓ Uploaded: ${r.path}`;
    navigator.clipboard?.writeText(r.path).catch(()=>{});
    showToast('Image uploaded! Path copied to clipboard.','success');
  } catch(e) { showToast(e.message,'error'); }
}

async function _uploadPdf() {
  const file = document.getElementById('upload-pdf-file').files[0];
  if (!file) { showToast('Select a PDF first.','warning'); return; }
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await AdminAPI.uploadPdf(fd);
    document.getElementById('upload-pdf-result').textContent = `✓ Uploaded: ${r.path}`;
    navigator.clipboard?.writeText(r.path).catch(()=>{});
    showToast('PDF uploaded! Path copied to clipboard.','success');
  } catch(e) { showToast(e.message,'error'); }
}
