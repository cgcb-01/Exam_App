'use strict';
window._ES = { id:null,qs:[],answers:{},cur:0,endTime:0,dur:180,timer:null,qTimer:0,subjects:[],readonly:false,camId:null,camInterval:null,camStream:null,micStream:null,neetMode:false };

// ═══════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════
async function examLaunch(opts) {
  opts = opts || {};
  if (!requireLogin()) return;
  window._lastExamOpts = opts;
  const ov = document.getElementById('exam-overlay');
  ov.style.cssText = 'position:fixed;inset:0;background:var(--c-bg);z-index:1000;display:flex;flex-direction:column;overflow:hidden;';
  ov.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:18px"><div class="spinner" style="width:48px;height:48px;border-width:4px"></div><div style="font-size:14px;font-weight:600;color:var(--c-text3)">Loading exam, please wait...</div></div>';

  try {
    let attempt, questions, camId = null;

    if (opts.readonly && opts.attempt_id) {
      [attempt, questions] = await Promise.all([
        GET('/api/attempts/' + opts.attempt_id),
        GET('/api/attempts/' + opts.attempt_id + '/solutions')
      ]);
      window._ES.readonly = true;
    } else {
      window._ES.readonly = false;
      if (opts.camera) {
        try { const cs = await POST('/api/camera/start', {attempt_context: opts.title||''}); camId = cs.id; } catch(e) { console.warn('cam:', e); }
      }
      attempt = await POST('/api/attempts/start', {
        shift_id: opts.shift_id||null, dpp_id: opts.dpp_id||null,
        module_id: opts.module_id||null, mock_test_id: opts.mock_test_id||null,
        is_offline_attempt: false, camera_session_id: camId
      });
      questions = attempt.questions || [];
    }

    if (!questions || !questions.length) {
      ov.style.display = 'none';
      toast('No questions in this test yet.', 'err', 5000);
      return;
    }

    // Parse started_at safely — backend now appends 'Z' so JS treats as UTC
    const startedAt = new Date(attempt.started_at);
    const startMs   = isNaN(startedAt.getTime()) ? Date.now() : startedAt.getTime();
    const totalMs   = attempt.duration_minutes_allotted * 60 * 1000;
    const usedMs    = Math.max(0, Date.now() - startMs);
    const remMs     = Math.max(30000, totalMs - usedMs); // at least 30 seconds

    // Build subjects in order
    const subjects = [], seen = {};
    questions.forEach(q => { if (!seen[q.subject]) { seen[q.subject] = true; subjects.push(q.subject); }});

    // Build answer map
    const answers = {};
    (attempt.answers || []).forEach(a => { answers[a.question_id] = {sel: a.selected_answer||null, status: a.status||'NOT_VISITED', time: a.time_spent_seconds||0}; });
    questions.forEach(q => { if (!answers[q.id]) answers[q.id] = {sel:null, status:'NOT_VISITED', time:0}; });

    // Set global state ONCE
    window._ES = {
      id: attempt.id, qs: questions, answers, cur: 0,
      qTimer: Date.now(), dur: attempt.duration_minutes_allotted,
      endTime: Date.now() + remMs, timer: null, subjects,
      readonly: window._ES.readonly, camId,
      camInterval: null, camStream: null, micStream: null,
      neetMode: opts.neet_mode || false
    };

    _examBuild(opts.title || 'Exam');
    if (!window._ES.readonly) {
      _timerStart();
      if (opts.camera) _camStart().catch(console.warn);
      if (opts.mic)    _micStart().catch(console.warn);
    }

  } catch(e) {
    document.getElementById('exam-overlay').style.display = 'none';
    toast('Could not load exam: ' + e.message, 'err', 7000);
    console.error('examLaunch:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BUILD EXAM UI
// ═══════════════════════════════════════════════════════════════════════════
function _examBuild(title) {
  const ro   = window._ES.readonly;
  const neet = window._ES.neetMode;
  const camRec = window._ES.camId ? `<div style="display:flex;align-items:center;gap:5px;padding:3px 10px;background:rgba(239,68,68,.2);border-radius:99px;border:1px solid rgba(239,68,68,.4)"><div style="width:7px;height:7px;border-radius:50%;background:#ef4444;animation:blink 1s step-start infinite"></div><span style="font-size:10px;font-weight:700;color:#fca5a5">REC</span></div>` : '';
  const timerOrMode = ro
    ? `<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.85);padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.2)">REVIEW MODE</span>`
    : `<div class="exam-timer-box" id="exam-timer">--:--</div>`;

  document.getElementById('exam-overlay').innerHTML = `
    <div class="exam-topbar">
      <button onclick="_examExit()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:5px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">Exit</button>
      <div class="exam-topbar-title">${title}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${camRec}${timerOrMode}
        <button onclick="_omrOpen()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">OMR</button>
      </div>
    </div>
    ${neet ? _neetLayout() : _jeeLayout(ro)}`;

  _renderChips();
  _renderPalette();
  // Defer _goQ to next tick so DOM is fully painted
  setTimeout(() => _goQ(0), 10);
}

function _jeeLayout(ro) {
  const submitBtn = ro ? '' : `<div class="palette-submit"><button class="btn btn-danger" style="width:100%;padding:10px;font-size:13px;font-weight:700" onclick="_submitConfirm()">Submit Test</button></div>`;
  return `
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
        ${submitBtn}
      </div>
    </div>`;
}

function _neetLayout() {
  return `
    <div style="flex:1;display:grid;grid-template-columns:1fr 340px;overflow:hidden;min-height:0">
      <div style="display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--c-border)">
        <div class="exam-q-toolbar">
          <div id="subj-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          <div class="q-progress" id="q-prog"></div>
        </div>
        <div class="exam-q-scroll"><div id="exam-qarea"></div></div>
        <div class="exam-footer" id="exam-footer"></div>
      </div>
      <div style="display:flex;flex-direction:column;overflow:hidden;background:var(--c-surface)">
        <div style="padding:10px 12px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4)">OMR Answer Sheet</div>
        <div style="flex:1;overflow-y:auto;padding:8px 12px" id="neet-omr-panel"></div>
        <div style="padding:10px;border-top:1px solid var(--c-border)">
          <button class="btn btn-danger" style="width:100%;padding:9px;font-weight:700" onclick="_submitConfirm()">Submit Test</button>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function _renderChips() {
  const el = document.getElementById('subj-chips'); if (!el) return;
  const cur = window._ES.qs[window._ES.cur];
  el.innerHTML = window._ES.subjects.map(s =>
    `<button class="subject-chip ${cur && s===cur.subject?'active':''}" onclick="_jumpSubj('${s}')">${s.charAt(0)+s.slice(1).toLowerCase()}</button>`
  ).join('');
}

window._jumpSubj = s => { const i = window._ES.qs.findIndex(q => q.subject===s); if(i>=0) _goQ(i); };

function _goQ(idx) {
  const ES = window._ES;
  if (ES.cur !== idx) {
    const pq = ES.qs[ES.cur];
    if (pq && ES.answers[pq.id]) {
      ES.answers[pq.id].time += Math.round((Date.now()-ES.qTimer)/1000);
      if (ES.answers[pq.id].status==='NOT_VISITED' && !ES.readonly) {
        ES.answers[pq.id].status = 'NOT_ANSWERED';
        _sendAns(pq.id);
      }
    }
  }
  ES.cur    = Math.max(0, Math.min(idx, ES.qs.length-1));
  ES.qTimer = Date.now();
  const q   = ES.qs[ES.cur]; if (!q) return;
  const pg  = document.getElementById('q-prog');
  if (pg) pg.textContent = `${ES.cur+1} / ${ES.qs.length}`;
  _renderChips();
  _renderQ(q);
  _renderFooter(q);
  _renderPalette();
  if (ES.neetMode) _renderNeetOMR();
  setTimeout(() => document.querySelector(`.pq-btn[data-i="${ES.cur}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}), 50);
}

// ═══════════════════════════════════════════════════════════════════════════
//  QUESTION RENDER
// ═══════════════════════════════════════════════════════════════════════════
function _renderQ(q) {
  const area = document.getElementById('exam-qarea'); if (!area) return;
  const ES   = window._ES;
  const ans  = ES.answers[q.id] || {sel:null,status:'NOT_VISITED',time:0};
  const ro   = ES.readonly;
  const isNum   = q.question_type==='NUMERICAL';
  const isMulti = q.question_type==='MCQ_MULTIPLE';
  const opts    = [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]].filter(([,v])=>v);
  const corr    = new Set((q.correct_answer||'').split(',').map(s=>s.trim()).filter(Boolean));
  const selSet  = new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));

  // Question content
  let qHtml = '';
  if (q.question_text) qHtml += `<div class="q-text">${q.question_text}</div>`;
  if (q.question_image_path) {
    const src = '/static/uploads/' + q.question_image_path.replace(/^uploads[/\\]/,'');
    qHtml += `<div style="margin:10px 0"><img src="${src}" style="max-width:100%;border-radius:8px;border:1px solid var(--c-border);display:block" onerror="this.outerHTML='<div style=\\'padding:8px;background:var(--c-surface2);border-radius:6px;font-size:11px;color:var(--c-text4)\\'>Image not found</div>'" alt="Question image"></div>`;
  }
  if (!qHtml) qHtml = `<div class="q-text" style="color:var(--c-text4);font-style:italic">No question text</div>`;

  // Answer area
  let ansHtml = '';
  if (isNum) {
    ansHtml = `<div class="numpad-wrapper">
      <div class="num-display" id="num-disp">${ans.sel!==null&&ans.sel!==''?ans.sel:'&mdash;'}</div>
      <div class="numpad-grid">
        ${[7,8,9,'DEL',4,5,6,'±',1,2,3,'.','0','00','C','OK'].map(k=>{
          const cls=(k==='DEL'||k==='C')?'del':(k==='±'||k==='OK')?'fn':'';
          return `<button class="numpad-key ${cls}" onclick="examNumKey(${q.id},'${k}')">${k}</button>`;
        }).join('')}
      </div>
    </div>`;
  } else {
    let optsHtml = '';
    opts.forEach(([k,v]) => {
      const isSel = selSet.has(k);
      let cls = '';
      if (ro) cls = corr.has(k)?'correct':isSel?'wrong':'';
      else    cls = isSel?'selected':'';
      const click = ro ? '' : `onclick="examPickOpt(${q.id},'${k}',${isMulti})"`;
      optsHtml += `<div class="option-row ${cls}" ${ro?'style="cursor:default"':''} ${click}>
        <div class="option-key">${k}</div>
        <div class="option-text">${v}</div>
        ${ro&&corr.has(k)?`<span style="margin-left:auto;color:var(--c-green);display:flex">${IC.chk}</span>`:''}
      </div>`;
    });
    if (q.options_image_path) {
      const src = '/static/uploads/' + q.options_image_path.replace(/^uploads[/\\]/,'');
      optsHtml += `<img src="${src}" style="max-width:100%;margin-top:8px;border-radius:8px;border:1px solid var(--c-border)" onerror="this.style.display='none'" alt="Options">`;
    }
    ansHtml = `<div class="options-list">${optsHtml}</div>`;
  }

  // Solution (review mode)
  let solHtml = '';
  if (ro) {
    solHtml = `<div style="margin-top:14px;padding:12px 14px;background:var(--c-green-l);border-radius:var(--radius-sm);border-left:3px solid var(--c-green)">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--c-green);margin-bottom:6px">Answer: ${q.correct_answer||'—'}</div>
      ${q.solution_text?`<div style="font-size:12px;color:var(--c-text2);line-height:1.7">${q.solution_text}</div>`:''}
      ${q.solution_image_path?`<img src="/static/uploads/${q.solution_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;margin-top:8px;border-radius:6px" onerror="this.style.display='none'" alt="Solution">`:''}
    </div>`;
  }

  area.innerHTML = `<div class="exam-q-card fade-in">
    <div class="q-num-row">
      <span class="q-num-pill">Q${q.question_number}</span>
      ${isMulti?'<span class="q-type-pill">Multiple Correct</span>':''}
      ${isNum?'<span class="q-type-pill">Numerical</span>':''}
      <span class="q-marks-pill">+${q.marks_correct} / ${q.marks_incorrect}</span>
    </div>
    ${qHtml}${ansHtml}${solHtml}
  </div>`;
}

// Global handlers (must be on window for onclick= in innerHTML to work)
window.examPickOpt = function(qId, key, isMulti) {
  const ES = window._ES; if (ES.readonly) return;
  const ans = ES.answers[qId]; if (!ans) return;
  if (isMulti) {
    const sel = new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
    sel.has(key) ? sel.delete(key) : sel.add(key);
    ans.sel = [...sel].sort().join(',') || null;
  } else {
    ans.sel = (ans.sel===key) ? null : key;
  }
  ans.status = ans.sel ? 'ANSWERED' : 'NOT_ANSWERED';
  _sendAns(qId);
  _renderQ(ES.qs[ES.cur]);
  _renderPalette();
  if (ES.neetMode) _renderNeetOMR();
};

window.examNumKey = function(qId, k) {
  const ES = window._ES; if (ES.readonly) return;
  const ans = ES.answers[qId]; if (!ans) return;
  let v = ans.sel || '';
  if      (k==='C')   v='';
  else if (k==='DEL') v=v.slice(0,-1);
  else if (k==='±')   v=v.startsWith('-')?v.slice(1):('-'+v);
  else if (k==='OK')  { window._saveNext(); return; }
  else if (k==='.'&&v.includes('.')) return;
  else v+=k;
  ans.sel    = v||null;
  ans.status = v?'ANSWERED':'NOT_ANSWERED';
  const d=document.getElementById('num-disp'); if(d) d.textContent=v||'—';
  _sendAns(qId); _renderPalette();
};

// ═══════════════════════════════════════════════════════════════════════════
//  FOOTER ACTIONS
// ═══════════════════════════════════════════════════════════════════════════
function _renderFooter(q) {
  const el=document.getElementById('exam-footer'); if(!el) return;
  const ES=window._ES, ro=ES.readonly, f=ES.cur===0, l=ES.cur===ES.qs.length-1;
  if (ro) {
    el.innerHTML=`<button class="btn btn-secondary btn-sm" onclick="_goQ(${ES.cur-1})" ${f?'disabled':''}>Previous</button><div style="flex:1"></div><button class="btn btn-primary btn-sm" onclick="_goQ(${ES.cur+1})" ${l?'disabled':''}>Next</button>`;
  } else {
    el.innerHTML=`
      <button class="btn btn-secondary btn-sm" onclick="window._clearR(${q.id})">Clear</button>
      <button class="btn btn-sm" style="background:var(--q-marked);color:#fff;border:none" onclick="window._markR(${q.id})">Mark for Review</button>
      <div style="flex:1"></div>
      <button class="btn btn-secondary btn-sm" onclick="_goQ(${ES.cur-1})" ${f?'disabled':''}>Prev</button>
      <button class="btn btn-primary btn-sm" onclick="window._saveNext()">Save &amp; Next</button>`;
  }
}

window._clearR = qId => { const a=window._ES.answers[qId]; if(!a) return; a.sel=null; a.status='NOT_ANSWERED'; _sendAns(qId); _renderQ(window._ES.qs[window._ES.cur]); _renderPalette(); };
window._markR  = qId => { const a=window._ES.answers[qId]; if(!a) return; a.status=a.sel?'ANSWERED_AND_MARKED':'MARKED_FOR_REVIEW'; _sendAns(qId); _renderPalette(); _goQ(window._ES.cur+1); };
window._saveNext = () => { const q=window._ES.qs[window._ES.cur]; if(!q) return; const a=window._ES.answers[q.id]; if(a&&a.sel) a.status='ANSWERED'; _sendAns(q.id); _goQ(window._ES.cur+1); };

// ═══════════════════════════════════════════════════════════════════════════
//  PALETTE
// ═══════════════════════════════════════════════════════════════════════════
function _renderPalette() {
  const leg=document.getElementById('pal-legend'), grid=document.getElementById('pal-grid');
  if (!leg||!grid) return;
  const ES=window._ES;
  const cnt={NOT_VISITED:0,NOT_ANSWERED:0,ANSWERED:0,MARKED_FOR_REVIEW:0,ANSWERED_AND_MARKED:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  leg.innerHTML=`
    <div class="legend-row"><div class="legend-dot ans"></div>${cnt.ANSWERED} Answered</div>
    <div class="legend-row"><div class="legend-dot na"></div>${cnt.NOT_ANSWERED} Not Ans.</div>
    <div class="legend-row"><div class="legend-dot mrk"></div>${cnt.MARKED_FOR_REVIEW+cnt.ANSWERED_AND_MARKED} Marked</div>
    <div class="legend-row"><div class="legend-dot nv"></div>${cnt.NOT_VISITED} Not Visited</div>`;
  const byS={}, sOrd=[];
  ES.qs.forEach((q,i)=>{if(!byS[q.subject]){byS[q.subject]=[];sOrd.push(q.subject);}byS[q.subject].push({q,i});});
  grid.innerHTML=sOrd.map(s=>`
    <div class="palette-subj-label">${s.charAt(0)+s.slice(1).toLowerCase()}</div>
    <div class="palette-buttons">
      ${byS[s].map(({q,i})=>{
        const a=ES.answers[q.id],st=a?a.status:'NOT_VISITED';
        const c=st==='ANSWERED'?'ans':st==='NOT_ANSWERED'?'na':st==='MARKED_FOR_REVIEW'?'mrk':st==='ANSWERED_AND_MARKED'?'am':'nv';
        return `<button class="pq-btn ${c}${i===ES.cur?' cur':''}" data-i="${i}" onclick="_goQ(${i})">${i+1}</button>`;
      }).join('')}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  NEET OMR PANEL
// ═══════════════════════════════════════════════════════════════════════════
function _renderNeetOMR() {
  const p=document.getElementById('neet-omr-panel'); if(!p) return;
  const ES=window._ES;
  const mcq=ES.qs.filter(q=>q.question_type!=='NUMERICAL');
  const num=ES.qs.filter(q=>q.question_type==='NUMERICAL');
  let h='';
  if(mcq.length){
    h+='<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:6px">Multiple Choice</div>';
    mcq.forEach(q=>{
      const a=ES.answers[q.id]||{sel:null};
      const sel=new Set((a.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
      h+=`<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid var(--c-border)">
        <span style="font-size:10px;font-weight:700;width:30px;text-align:right;color:var(--c-text3);flex-shrink:0">Q${q.question_number}.</span>
        ${['A','B','C','D'].map(o=>{
          const f=sel.has(o);
          return `<div onclick="neetBubble(${q.id},'${o}')" style="width:22px;height:22px;border-radius:50%;border:2px solid ${f?'#111':'#777'};background:${f?'#111':'#fff'};color:${f?'#fff':'#555'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;cursor:pointer;user-select:none;flex-shrink:0;transition:all .1s">${o}</div>`;
        }).join('')}
      </div>`;
    });
  }
  if(num.length){
    h+='<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin:10px 0 6px">Numerical</div>';
    num.forEach(q=>{
      const a=ES.answers[q.id]||{sel:null};
      const idx=ES.qs.indexOf(q);
      h+=`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--c-border)">
        <span style="font-size:10px;font-weight:700;width:30px;text-align:right;color:var(--c-text3);flex-shrink:0">Q${q.question_number}.</span>
        <div onclick="_goQ(${idx})" style="flex:1;padding:3px 8px;border:1.5px solid var(--c-border);border-radius:4px;font-family:monospace;font-size:11px;font-weight:700;color:var(--c-blue);cursor:pointer;min-width:60px;background:var(--c-surface2)">${a.sel||'—'}</div>
      </div>`;
    });
  }
  p.innerHTML=h;
}

window.neetBubble = function(qId, opt) {
  const ES=window._ES; const a=ES.answers[qId]; if(!a) return;
  const q=ES.qs.find(q=>q.id===qId);
  const isMulti=q&&q.question_type==='MCQ_MULTIPLE';
  window.examPickOpt(qId, opt, isMulti);
  _renderNeetOMR();
};

// ═══════════════════════════════════════════════════════════════════════════
//  OMR MODAL
// ═══════════════════════════════════════════════════════════════════════════
window._omrOpen = function() {
  if (window._ES.qs.length) OMR.open(window._ES.qs, window._ES.answers, function(qId,ans) {
    window._ES.answers[qId]=ans; _sendAns(qId); _renderPalette();
    const c=window._ES.qs[window._ES.cur]; if(c&&c.id===qId) _renderQ(c);
  });
};

// ═══════════════════════════════════════════════════════════════════════════
//  SEND ANSWER
// ═══════════════════════════════════════════════════════════════════════════
function _sendAns(qId) {
  if (window._ES.readonly) return;
  const a=window._ES.answers[qId]; if(!a) return;
  const body={question_id:qId, selected_answer:a.sel||null, status:a.status, time_spent_seconds:a.time||0};
  if (!navigator.onLine) { OQ.push({url:`/api/attempts/${window._ES.id}/answer`,opts:{method:'PATCH',body}}); return; }
  PATCH(`/api/attempts/${window._ES.id}/answer`, body).catch(()=>{});
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════════════════════════
function _timerStart() {
  if (window._ES.timer) clearInterval(window._ES.timer);
  window._ES.timer = setInterval(() => {
    const rem=Math.max(0, window._ES.endTime-Date.now());
    const m=Math.floor(rem/60000), s=Math.floor((rem%60000)/1000);
    const el=document.getElementById('exam-timer');
    if (!el) return; // Don't clear interval if element missing; page may be rendering
    el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.className='exam-timer-box'+(m<5?' crit':m<15?' warn':'');
    if (rem<=0) { clearInterval(window._ES.timer); window._ES.timer=null; _doSubmit(true); }
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAMERA / MIC
// ═══════════════════════════════════════════════════════════════════════════
async function _camStart() {
  const stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
  window._ES.camStream=stream;
  const vid=document.createElement('video'); vid.srcObject=stream; vid.autoplay=true; vid.muted=true;
  vid.id='_ep_cam'; vid.style.cssText='position:fixed;bottom:72px;right:12px;width:120px;height:90px;border-radius:8px;border:2px solid var(--c-green);z-index:2000;object-fit:cover;box-shadow:0 4px 14px rgba(0,0,0,.35)';
  document.body.appendChild(vid);
  const can=document.createElement('canvas'); can.width=320; can.height=240; const ctx=can.getContext('2d');
  window._ES.camInterval=setInterval(()=>{
    try{ ctx.drawImage(vid,0,0,320,240); const b64=can.toDataURL('image/jpeg',.5); if(window._ES.camId) POST(`/api/camera/${window._ES.camId}/snapshot`,{image_b64:b64}).catch(()=>{}); }catch{}
  },30000);
  toast('Camera active','ok',2000);
}

async function _micStart() {
  window._ES.micStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  toast('Microphone active','ok',2000);
}

function _stopMedia() {
  try{ if(window._ES.camInterval){clearInterval(window._ES.camInterval);window._ES.camInterval=null;} }catch{}
  try{ if(window._ES.camStream){window._ES.camStream.getTracks().forEach(t=>t.stop());window._ES.camStream=null;} }catch{}
  try{ if(window._ES.micStream){window._ES.micStream.getTracks().forEach(t=>t.stop());window._ES.micStream=null;} }catch{}
  try{ const p=document.getElementById('_ep_cam'); if(p) p.remove(); }catch{}
  if(window._ES.camId) POST(`/api/camera/${window._ES.camId}/end`,{}).catch(()=>{});
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBMIT
// ═══════════════════════════════════════════════════════════════════════════
window._submitConfirm = function() {
  const ES=window._ES;
  const cnt={ANSWERED:0,NOT_ANSWERED:0,NOT_VISITED:0,MARKED_FOR_REVIEW:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  openModal('Submit Test',
    `<div class="modal-body-pad" style="text-align:center">
      <div style="font-size:14px;font-weight:700;color:var(--c-text);margin-bottom:16px">Submit this test now?</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="padding:12px;background:var(--c-green-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-green)">${cnt.ANSWERED}</div><div style="font-size:10px;color:var(--c-green);font-weight:700;margin-top:2px">Answered</div></div>
        <div style="padding:12px;background:var(--c-red-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-red)">${cnt.NOT_ANSWERED+cnt.NOT_VISITED}</div><div style="font-size:10px;color:var(--c-red);font-weight:700;margin-top:2px">Unanswered</div></div>
        <div style="padding:12px;background:var(--c-amber-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-amber)">${cnt.MARKED_FOR_REVIEW}</div><div style="font-size:10px;color:var(--c-amber);font-weight:700;margin-top:2px">For Review</div></div>
      </div>
      <div style="font-size:12px;color:var(--c-text4)">Once submitted you cannot change answers.</div>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Continue Test</button>
     <button class="btn btn-danger" onclick="closeModal();_doSubmit(false)">Submit Now</button>`
  );
};

async function _doSubmit(auto) {
  if (window._ES.timer) { clearInterval(window._ES.timer); window._ES.timer=null; }
  _stopMedia();
  // Flush current question time
  const q=window._ES.qs[window._ES.cur];
  if (q&&window._ES.answers[q.id]) {
    window._ES.answers[q.id].time+=Math.round((Date.now()-window._ES.qTimer)/1000);
    try { await PATCH(`/api/attempts/${window._ES.id}/answer`,{question_id:q.id,selected_answer:window._ES.answers[q.id].sel||null,status:window._ES.answers[q.id].status,time_spent_seconds:window._ES.answers[q.id].time}); } catch{}
  }
  const ov=document.getElementById('exam-overlay');
  ov.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:18px"><div class="spinner" style="width:48px;height:48px;border-width:4px"></div><div style="font-size:14px;font-weight:600;color:var(--c-text3)">Submitting and grading...</div></div>';
  try {
    const r=await POST(`/api/attempts/${window._ES.id}/submit`,{auto_submitted:!!auto});
    ov.style.display='none';
    _showResult(r);
    try { await DashDB.save(r); } catch{}
  } catch(e) {
    ov.style.display='none';
    toast('Submit failed: '+e.message,'err',8000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXIT
// ═══════════════════════════════════════════════════════════════════════════
window._examExit = function() {
  if (window._ES.readonly) { _stopMedia(); document.getElementById('exam-overlay').style.display='none'; return; }
  if (confirm('Exit exam? The timer keeps running. You can resume by re-opening the same test.')) {
    if (window._ES.timer) clearInterval(window._ES.timer);
    _stopMedia();
    document.getElementById('exam-overlay').style.display='none';
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  RESULT
// ═══════════════════════════════════════════════════════════════════════════
function _showResult(r) {
  const el=document.getElementById('page-content');
  const pct=r.percentage||(r.max_score>0?(r.score/r.max_score*100).toFixed(1):0);
  let bk='';
  if (r.subject_breakdown&&Object.keys(r.subject_breakdown).length) {
    bk=`<div class="card" style="margin-top:16px"><div class="card-body">
      <div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Subject Breakdown</div>
      <table class="data-table"><thead><tr><th>Subject</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th style="text-align:right">Score</th></tr></thead>
      <tbody>${Object.entries(r.subject_breakdown).map(([s,b])=>`
        <tr><td style="font-weight:600">${s.charAt(0)+s.slice(1).toLowerCase()}</td>
        <td style="color:var(--c-green);font-weight:700">${b.correct||0}</td>
        <td style="color:var(--c-red);font-weight:700">${b.incorrect||0}</td>
        <td style="color:var(--c-text3)">${b.unattempted||0}</td>
        <td style="text-align:right;font-weight:800;color:var(--c-blue)">${Number(b.score||0).toFixed(1)}</td></tr>`).join('')}
      </tbody></table>
    </div></div>`;
  }
  el.innerHTML=`<div style="max-width:680px;margin:0 auto" class="fade-in">
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
    ${bk}
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px">
      <button class="btn btn-primary" onclick="examLaunch(Object.assign({},window._lastExamOpts,{readonly:true,attempt_id:${r.attempt_id}}))">View Solutions</button>
      <button class="btn btn-secondary" onclick="go('leaderboard')">Leaderboard</button>
      <button class="btn btn-secondary" onclick="go('dashboard')">Dashboard</button>
      <button class="btn btn-secondary" onclick="go('pyq')">More Tests</button>
    </div>
  </div>`;
}
