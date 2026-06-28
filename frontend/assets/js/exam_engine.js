'use strict';
window._ES = {
  id:null,qs:[],answers:{},cur:0,endTime:0,dur:180,
  timer:null,qTimer:0,subjects:[],readonly:false,
  camId:null,camInterval:null,camStream:null,micStream:null,
  neetMode:false,jeeOMRMode:false
};

// ═══════════════════════════════════════════════════════════
//  PRE-EXAM MODAL — camera/mic/layout choice
// ═══════════════════════════════════════════════════════════
async function examLaunch(opts){
  opts=opts||{};
  if(!requireLogin())return;
  window._lastExamOpts=opts;
  if(opts.readonly){await _examLoad(opts);return;}
  // Detect exam type
  const isNEET=opts.exam_type==='NEET'||opts.neet_mode;
  openModal('Start Exam',`
  <div style="padding:2px 0">
    <div style="font-size:13px;font-weight:700;color:var(--c-text);margin-bottom:16px">${opts.title||'Exam'}</div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:8px">Layout Mode</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">

      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1.5px solid var(--c-blue);border-radius:var(--radius);cursor:pointer;background:var(--c-blue-l)">
        <input type="radio" name="layout" value="standard" checked style="margin-top:2px;accent-color:var(--c-blue)">
        <div><div style="font-size:12px;font-weight:700;color:var(--c-text)">Standard Online Mode</div>
        <div style="font-size:11px;color:var(--c-text4)">One question at a time with palette sidebar</div></div>
      </label>

      ${isNEET?`<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:var(--radius);cursor:pointer" id="neet-layout-opt">
        <input type="radio" name="layout" value="neet" style="margin-top:2px;accent-color:var(--c-blue)" onchange="document.getElementById('neet-layout-opt').style.borderColor='var(--c-blue)';document.getElementById('neet-layout-opt').style.background='var(--c-blue-l)'">
        <div><div style="font-size:12px;font-weight:700;color:var(--c-text)"> NEET Book Layout (Offline-style)</div>
        <div style="font-size:11px;color:var(--c-text4)">Left: Printed question paper (2-col, read-only, scroll). Right: OMR sheet to mark answers.</div></div>
      </label>`:`<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:var(--radius);cursor:pointer" id="jee-layout-opt">
        <input type="radio" name="layout" value="jeeomr" style="margin-top:2px;accent-color:var(--c-blue)" onchange="document.getElementById('jee-layout-opt').style.borderColor='var(--c-blue)';document.getElementById('jee-layout-opt').style.background='var(--c-blue-l)'">
        <div><div style="font-size:12px;font-weight:700;color:var(--c-text)"> JEE OMR Mode (Offline-style)</div>
        <div style="font-size:11px;color:var(--c-text4)">Left: Question paper (read-only, scroll). Right: JEE OMR sheet with bubble + numerical boxes.</div></div>
      </label>`}
    </div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:8px">Proctoring (optional)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:var(--radius);cursor:pointer">
        <input type="checkbox" id="opt-cam" style="width:14px;height:14px;accent-color:var(--c-blue)">
        <div><div style="font-size:12px;font-weight:600;color:var(--c-text)"> Camera</div>
        <div style="font-size:10px;color:var(--c-text4)">Video proctoring</div></div>
      </label>
      <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1.5px solid var(--c-border);border-radius:var(--radius);cursor:pointer">
        <input type="checkbox" id="opt-mic" style="width:14px;height:14px;accent-color:var(--c-blue)">
        <div><div style="font-size:12px;font-weight:600;color:var(--c-text)"> Microphone</div>
        <div style="font-size:10px;color:var(--c-text4)">Audio monitoring</div></div>
      </label>
    </div>
    <div style="padding:8px 12px;background:var(--c-amber-l);border-radius:var(--radius-sm);font-size:11px;color:#92400e">
      ⏱ Duration: <b>${opts.duration_minutes||opts.dur||180} minutes</b>
    </div>
  </div>`,
  `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
   <button class="btn btn-primary" onclick="_preExamStart()">Start Exam →</button>`
  );
  window._preExamOpts=opts;
}

window._preExamStart=async function(){
  const layout=document.querySelector('input[name="layout"]:checked')?.value||'standard';
  const cam=document.getElementById('opt-cam')?.checked||false;
  const mic=document.getElementById('opt-mic')?.checked||false;
  closeModal();
  await _examLoad({...window._preExamOpts,
    camera:cam,mic:mic,
    neet_mode:layout==='neet',
    jee_omr_mode:layout==='jeeomr'
  });
};

// ═══════════════════════════════════════════════════════════
//  LOAD
// ═══════════════════════════════════════════════════════════
async function _examLoad(opts){
  const ov=document.getElementById('exam-overlay');
  ov.style.cssText='position:fixed;inset:0;background:var(--c-bg);z-index:1000;display:flex;flex-direction:column;overflow:hidden;';
  ov.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:18px"><div class="spinner" style="width:48px;height:48px;border-width:4px"></div><div style="font-size:14px;font-weight:600;color:var(--c-text3)">Loading exam…</div></div>';
  try{
    let attempt,questions,camId=null;
    if(opts.readonly&&opts.attempt_id){
      [attempt,questions]=await Promise.all([GET('/api/attempts/'+opts.attempt_id),GET('/api/attempts/'+opts.attempt_id+'/solutions')]);
      window._ES.readonly=true;
    }else{
      window._ES.readonly=false;
      if(opts.camera){try{const cs=await POST('/api/camera/start',{attempt_context:opts.title||''});camId=cs.id;}catch(e){console.warn('cam:',e);}}
      attempt=await POST('/api/attempts/start',{shift_id:opts.shift_id||null,dpp_id:opts.dpp_id||null,module_id:opts.module_id||null,mock_test_id:opts.mock_test_id||null,is_offline_attempt:false,camera_session_id:camId});
      questions=attempt.questions||[];
    }
    if(!questions||!questions.length){ov.style.display='none';toast('No questions in this test yet.','err',5000);return;}
    const startMs=new Date(attempt.started_at).getTime()||Date.now();
    const remMs=Math.max(30000,(attempt.duration_minutes_allotted*60000)-(Date.now()-startMs));
    const subjects=[],seen={};
    questions.forEach(q=>{if(!seen[q.subject]){seen[q.subject]=true;subjects.push(q.subject);}});
    const answers={};
    (attempt.answers||[]).forEach(a=>{answers[a.question_id]={sel:a.selected_answer||null,status:a.status||'NOT_VISITED',time:a.time_spent_seconds||0};});
    questions.forEach(q=>{if(!answers[q.id])answers[q.id]={sel:null,status:'NOT_VISITED',time:0};});
    window._ES={id:attempt.id,qs:questions,answers,cur:0,qTimer:Date.now(),
      dur:attempt.duration_minutes_allotted,endTime:Date.now()+remMs,
      timer:null,subjects,readonly:window._ES.readonly,camId,
      camInterval:null,camStream:null,micStream:null,
      neetMode:opts.neet_mode||false,jeeOMRMode:opts.jee_omr_mode||false};
    _examBuild(opts.title||'Exam');
    if(!window._ES.readonly){
      _timerStart();
      if(opts.camera)_camStart().catch(e=>toast('Camera: '+e.message,'warn',3000));
      if(opts.mic)_micStart().catch(e=>toast('Mic: '+e.message,'warn',3000));
    }
  }catch(e){ov.style.display='none';toast('Could not load: '+e.message,'err',7000);}
}

// ═══════════════════════════════════════════════════════════
//  BUILD UI
// ═══════════════════════════════════════════════════════════
function _examBuild(title){
  const ro=window._ES.readonly,neet=window._ES.neetMode,jeeOMR=window._ES.jeeOMRMode;
  const camRec=window._ES.camId?`<div style="display:flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(239,68,68,.2);border-radius:99px;border:1px solid rgba(239,68,68,.4)"><div style="width:6px;height:6px;border-radius:50%;background:#ef4444;animation:blink 1s step-start infinite"></div><span style="font-size:9px;font-weight:700;color:#fca5a5">REC</span></div>`:'';
  const timer=ro?`<span style="background:rgba(255,255,255,.12);color:rgba(255,255,255,.85);padding:4px 14px;border-radius:99px;font-size:11px;font-weight:700">REVIEW</span>`:`<div class="exam-timer-box" id="exam-timer">--:--</div>`;
  document.getElementById('exam-overlay').innerHTML=`
    <div class="exam-topbar">
      <button onclick="_examExit()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Exit</button>
      <div class="exam-topbar-title">${title}</div>
      <div style="display:flex;align-items:center;gap:8px">${camRec}${timer}
        ${(neet||jeeOMR)?'':`<button onclick="_omrOpen()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">OMR</button>`}
      </div>
    </div>
    ${neet?_buildNeetBook(ro):jeeOMR?_buildJeeOMR(ro):_buildStandard(ro)}`;
  if(neet){_renderBookPaper();_renderOMRSheet();}
  else if(jeeOMR){_renderBookPaper();_renderJeeOMRPanel();}
  else{_renderChips();_renderPalette();setTimeout(()=>_goQ(0),10);}
}

// ═══════════════════════════════════════════════════════════
//  STANDARD LAYOUT
// ═══════════════════════════════════════════════════════════
function _buildStandard(ro){
  const sub=ro?'':` <div class="palette-submit"><button class="btn btn-danger" style="width:100%;padding:10px;font-size:13px;font-weight:700" onclick="_submitConfirm()">Submit Test</button></div>`;
  return`<div class="exam-body">
    <div class="exam-q-panel">
      <div class="exam-q-toolbar"><div id="subj-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div><div class="q-progress" id="q-prog"></div></div>
      <div class="exam-q-scroll"><div id="exam-qarea"></div></div>
      <div class="exam-footer" id="exam-footer"></div>
    </div>
    <div class="exam-palette">
      <div class="palette-top"><div class="palette-title">Palette</div><div class="palette-legend" id="pal-legend"></div></div>
      <div class="palette-grid-wrap" id="pal-grid"></div>${sub}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  NEET BOOK LAYOUT — LEFT: printed paper (2-col, read-only)
//                     RIGHT: OMR sheet (interactive)
// ═══════════════════════════════════════════════════════════
function _buildNeetBook(ro){
  return`<div style="flex:1;display:grid;grid-template-columns:1fr 400px;overflow:hidden;min-height:0">
    <!-- LEFT: Question paper book style -->
    <div style="overflow-y:auto;background:#fdf6e3;border-right:3px solid #c8a000;padding:0" id="book-paper">
      <div style="background:#1a1a2e;color:#e0e0ff;padding:8px 16px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.1em;position:sticky;top:0;z-index:10">
        QUESTION PAPER — READ ONLY (Scroll to read all questions)
      </div>
      <div id="book-questions" style="padding:12px 16px;column-count:2;column-gap:20px;column-rule:1px solid #c8b06a;font-size:12px;line-height:1.7;color:#2d2000"></div>
    </div>
    <!-- RIGHT: OMR Sheet -->
    <div style="display:flex;flex-direction:column;overflow:hidden;background:#fff9e6">
      <div style="background:#1a1a2e;color:#e0e0ff;padding:8px 14px;font-size:11px;font-weight:800;letter-spacing:.08em;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span>📋 OMR ANSWER SHEET</span>
        <div style="display:flex;gap:6px">
          <span id="omr-timer-mini" style="font-size:12px;font-weight:900;color:#fbbf24;font-family:monospace">--:--</span>
          <button onclick="window.print()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer">🖨</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:10px 12px" id="omr-right-panel"></div>
      ${ro?'':`<div style="padding:10px;border-top:2px solid #c8a000;background:#fff3cd">
        <button class="btn btn-danger" style="width:100%;padding:9px;font-weight:700;font-size:13px" onclick="_submitConfirm()">Submit Test</button>
      </div>`}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  JEE OMR LAYOUT — LEFT: printed paper  RIGHT: JEE OMR
// ═══════════════════════════════════════════════════════════
function _buildJeeOMR(ro){
  return`<div style="flex:1;display:grid;grid-template-columns:1fr 360px;overflow:hidden;min-height:0">
    <div style="overflow-y:auto;background:#f0f4f8;border-right:3px solid #334155;padding:0" id="book-paper">
      <div style="background:#0f172a;color:#94a3b8;padding:8px 16px;text-align:center;font-size:11px;font-weight:800;letter-spacing:.1em;position:sticky;top:0;z-index:10">
        QUESTION PAPER — READ ONLY
      </div>
      <div id="book-questions" style="padding:12px 16px;column-count:2;column-gap:18px;column-rule:1px solid #cbd5e1;font-size:12px;line-height:1.7;color:#1e293b"></div>
    </div>
    <div style="display:flex;flex-direction:column;overflow:hidden;background:#f8fafc">
      <div style="background:#0f172a;color:#94a3b8;padding:8px 14px;font-size:11px;font-weight:800;letter-spacing:.08em;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <span>JEE OMR SHEET</span>
        <div style="display:flex;gap:6px">
          <span id="omr-timer-mini" style="font-size:12px;font-weight:900;color:#fbbf24;font-family:monospace">--:--</span>
          <button onclick="window.print()" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer">🖨</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:8px 10px" id="omr-right-panel"></div>
      ${ro?'':`<div style="padding:10px;border-top:1px solid var(--c-border)">
        <button class="btn btn-danger" style="width:100%;padding:9px;font-weight:700" onclick="_submitConfirm()">Submit Test</button>
      </div>`}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  BOOK PAPER RENDER (LEFT side — ALL questions printed, read-only)
// ═══════════════════════════════════════════════════════════
function _renderBookPaper(){
  const el=document.getElementById('book-questions');if(!el)return;
  const ES=window._ES;
  const isNEET=ES.neetMode;
  const bg=isNEET?'#fdf6e3':'#f0f4f8';
  const borderClr=isNEET?'#c8a000':'#334155';
  let h='';
  // Group by subject
  const bySubj={},sOrd=[];
  ES.qs.forEach(q=>{if(!bySubj[q.subject]){bySubj[q.subject]=[];sOrd.push(q.subject);}bySubj[q.subject].push(q);});
  sOrd.forEach(subj=>{
    h+=`<div style="break-inside:avoid;column-span:all;margin-bottom:10px;margin-top:6px">
      <div style="background:${borderClr};color:#fff;padding:4px 12px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border-radius:2px">${subj}</div>
    </div>`;
    bySubj[subj].forEach(q=>{
      const isNum=q.question_type==='NUMERICAL',isMulti=q.question_type==='MCQ_MULTIPLE';
      h+=`<div style="break-inside:avoid;margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed ${isNEET?'#c8b06a':'#cbd5e1'}">
        <div style="font-size:11px;font-weight:800;color:${isNEET?'#5c3d00':'#1e3a5f'};margin-bottom:4px">
          Q${q.question_number}${isMulti?' <span style="font-size:9px;color:#e67e22">[Multi]</span>':''} ${isNum?' <span style="font-size:9px;color:#2980b9">[Num]</span>':''}
          <span style="float:right;font-size:9px;font-weight:600;color:#888">+${q.marks_correct}/${q.marks_incorrect}</span>
        </div>
        ${q.question_text?`<div style="font-size:12px;color:${isNEET?'#2d1a00':'#1e293b'};margin-bottom:6px;line-height:1.6">${q.question_text}</div>`:''}
        ${q.question_image_path?`<img src="/static/uploads/${q.question_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;border-radius:4px;margin-bottom:6px;border:1px solid ${isNEET?'#c8b06a':'#cbd5e1'}" onerror="this.style.display='none'">`:''}
        ${!isNum?`<div style="display:flex;flex-direction:column;gap:2px">
          ${['A','B','C','D'].filter(k=>q['option_'+k.toLowerCase()]).map(k=>`
            <div style="font-size:11px;color:${isNEET?'#3d2000':'#334155'}">
              <span style="font-weight:700;min-width:16px;display:inline-block">(${k})</span> ${q['option_'+k.toLowerCase()]}
            </div>`).join('')}
          ${q.options_image_path?`<img src="/static/uploads/${q.options_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;margin-top:4px" onerror="this.style.display='none'">`:'' }
        </div>`:`<div style="font-size:11px;color:#666;font-style:italic">Write answer in OMR box →</div>`}
      </div>`;
    });
  });
  el.innerHTML=h;
}

// ═══════════════════════════════════════════════════════════
//  NEET OMR RIGHT PANEL — full interactive OMR bubbles
// ═══════════════════════════════════════════════════════════
function _renderOMRSheet(){
  const el=document.getElementById('omr-right-panel');if(!el)return;
  const ES=window._ES;
  const bySubj={},sOrd=[];
  ES.qs.forEach(q=>{if(!bySubj[q.subject]){bySubj[q.subject]=[];sOrd.push(q.subject);}bySubj[q.subject].push(q);});
  let h=`<div style="font-family:'Courier New',monospace">
    <div style="text-align:center;font-size:9px;font-weight:800;letter-spacing:.12em;color:#5c3d00;border:2px solid #c8a000;padding:4px;margin-bottom:8px;border-radius:3px">
      NEET OMR — MARK YOUR ANSWERS HERE
    </div>`;
  sOrd.forEach(subj=>{
    const mcqs=bySubj[subj].filter(q=>q.question_type!=='NUMERICAL');
    const nums=bySubj[subj].filter(q=>q.question_type==='NUMERICAL');
    h+=`<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#5c3d00;border-bottom:2px solid #c8a000;margin-bottom:6px;padding-bottom:2px">${subj}</div>`;
    if(mcqs.length){
      h+=`<div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:700">SECTION A — MULTIPLE CHOICE</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px 8px;margin-bottom:10px">`;
      mcqs.forEach(q=>{
        const sel=new Set((ES.answers[q.id]?.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
        const isMulti=q.question_type==='MCQ_MULTIPLE';
        const status=ES.answers[q.id]?.status||'NOT_VISITED';
        h+=`<div style="display:flex;align-items:center;gap:3px;padding:2px 0;border-bottom:1px dotted #e0c97a">
          <span style="font-size:8px;font-weight:900;width:22px;text-align:right;color:#5c3d00;flex-shrink:0">${q.question_number}${isMulti?'*':''}</span>
          ${['A','B','C','D'].map(o=>{
            const f=sel.has(o);
            return`<div onclick="omrBubbleClick(${q.id},'${o}',${isMulti})" style="width:20px;height:20px;border-radius:50%;border:1.5px solid ${f?'#2c1a00':'#c8a000'};background:${f?'#2c1a00':'transparent'};color:${f?'#fff9e6':'#5c3d00'};display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;cursor:pointer;user-select:none;transition:all .1s;flex-shrink:0">${o}</div>`;
          }).join('')}
        </div>`;
      });
      h+=`</div>`;
    }
    if(nums.length){
      h+=`<div style="font-size:8px;color:#888;margin-bottom:4px;font-weight:700">SECTION B — NUMERICAL</div>`;
      nums.forEach(q=>{
        const val=ES.answers[q.id]?.sel||'';
        const idx=ES.qs.indexOf(q);
        h+=`<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px dotted #e0c97a;margin-bottom:2px">
          <span style="font-size:8px;font-weight:900;width:22px;text-align:right;color:#5c3d00;flex-shrink:0">${q.question_number}</span>
          ${_numericOMRBoxes(q.id,val,true)}
        </div>`;
      });
      h+=`<div style="height:6px"></div>`;
    }
  });
  // Summary
  const cnt={ANSWERED:0,NOT_ANSWERED:0,NOT_VISITED:0,MARKED_FOR_REVIEW:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  h+=`<div style="margin-top:10px;padding:8px;background:#fff3cd;border-radius:4px;border:1px solid #c8a000">
    <div style="font-size:9px;font-weight:800;color:#5c3d00;margin-bottom:4px">SUMMARY</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:center">
      <div style="background:#d4edda;border-radius:3px;padding:4px"><div style="font-size:16px;font-weight:900;color:#155724">${cnt.ANSWERED}</div><div style="font-size:8px;color:#155724;font-weight:700">ANSWERED</div></div>
      <div style="background:#f8d7da;border-radius:3px;padding:4px"><div style="font-size:16px;font-weight:900;color:#721c24">${cnt.NOT_ANSWERED+cnt.NOT_VISITED}</div><div style="font-size:8px;color:#721c24;font-weight:700">NOT ANSWERED</div></div>
    </div>
  </div></div>`;
  el.innerHTML=h;
}

// ═══════════════════════════════════════════════════════════
//  JEE OMR RIGHT PANEL
// ═══════════════════════════════════════════════════════════
function _renderJeeOMRPanel(){
  const el=document.getElementById('omr-right-panel');if(!el)return;
  const ES=window._ES;
  const bySubj={},sOrd=[];
  ES.qs.forEach(q=>{if(!bySubj[q.subject]){bySubj[q.subject]=[];sOrd.push(q.subject);}bySubj[q.subject].push(q);});
  let h=`<div style="font-family:'Courier New',monospace;font-size:10px">
    <div style="text-align:center;font-size:9px;font-weight:800;letter-spacing:.1em;color:#94a3b8;border:1px solid #334155;padding:3px;margin-bottom:8px;border-radius:2px">
      JEE OMR RESPONSE SHEET
    </div>`;
  sOrd.forEach(subj=>{
    const mcqs=bySubj[subj].filter(q=>q.question_type!=='NUMERICAL');
    const nums=bySubj[subj].filter(q=>q.question_type==='NUMERICAL');
    const multi=bySubj[subj].filter(q=>q.question_type==='MCQ_MULTIPLE');
    h+=`<div style="font-size:9px;font-weight:800;color:#60a5fa;border-bottom:1px solid #1e293b;margin-bottom:5px;padding-bottom:2px;text-transform:uppercase">${subj}${multi.length?' <span style="font-size:8px;color:#94a3b8">(* = multi)</span>':''}</div>`;
    if(mcqs.length){
      h+=`<div style="font-size:8px;color:#64748b;margin-bottom:3px;font-weight:700">MCQ</div>`;
      mcqs.forEach(q=>{
        const sel=new Set((ES.answers[q.id]?.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
        const isMulti=q.question_type==='MCQ_MULTIPLE';
        h+=`<div style="display:flex;align-items:center;gap:2px;padding:2px 0;border-bottom:1px solid #0f172a;margin-bottom:1px">
          <span style="font-size:8px;font-weight:900;width:20px;text-align:right;color:#60a5fa;flex-shrink:0">${q.question_number}${isMulti?'*':''}.</span>
          ${['A','B','C','D'].map(o=>{
            const f=sel.has(o);
            return`<div onclick="omrBubbleClick(${q.id},'${o}',${isMulti})" style="width:17px;height:17px;border-radius:50%;border:1.5px solid ${f?'#60a5fa':'#334155'};background:${f?'#60a5fa':'transparent'};color:${f?'#0f172a':'#64748b'};display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:900;cursor:pointer;flex-shrink:0">${o}</div>`;
          }).join('')}
        </div>`;
      });
    }
    if(nums.length){
      h+=`<div style="font-size:8px;color:#64748b;margin:5px 0 3px;font-weight:700">NUMERICAL</div>`;
      nums.forEach(q=>{
        const val=ES.answers[q.id]?.sel||'';
        h+=`<div style="display:flex;align-items:center;gap:3px;padding:2px 0;border-bottom:1px solid #0f172a;margin-bottom:2px">
          <span style="font-size:8px;font-weight:900;width:20px;text-align:right;color:#60a5fa;flex-shrink:0">${q.question_number}.</span>
          ${_numericOMRBoxes(q.id,val,false)}
        </div>`;
      });
    }
    h+=`<div style="height:8px"></div>`;
  });
  const cnt={ANSWERED:0,NOT_ANSWERED:0,NOT_VISITED:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  h+=`<div style="margin-top:6px;padding:6px;background:#0f172a;border-radius:3px;display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:center">
    <div><div style="font-size:14px;font-weight:900;color:#22c55e">${cnt.ANSWERED}</div><div style="font-size:8px;color:#4ade80">ANS</div></div>
    <div><div style="font-size:14px;font-weight:900;color:#ef4444">${cnt.NOT_ANSWERED+cnt.NOT_VISITED}</div><div style="font-size:8px;color:#f87171">UNANS</div></div>
  </div></div>`;
  el.innerHTML=h;
}

// Numeric OMR boxes helper
function _numericOMRBoxes(qId,val,neetStyle){
  const neg=val.startsWith('-'),raw=val.replace('-','');
  const dot=raw.indexOf('.');
  let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
  let dp=dot>=0?raw.slice(dot+1).split(''):[];
  while(ip.length<4)ip.unshift('');
  while(dp.length<2)dp.push('');
  const bStyle=neetStyle
    ?`width:16px;height:20px;border:1.5px solid #c8a000;border-radius:2px;background:FILL;color:CLR;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;cursor:pointer;flex-shrink:0`
    :`width:15px;height:18px;border:1px solid #334155;border-radius:2px;background:FILL;color:CLR;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;cursor:pointer;flex-shrink:0`;
  const filled=neetStyle?'#2c1a00':'#1d4ed8', filledTxt=neetStyle?'#fff9e6':'#fff';
  const empty='transparent', emptyTxt=neetStyle?'#c8a000':'#64748b';
  return`
    <div onclick="omrNumSign(${qId})" style="${bStyle.replace('FILL',neg?filled:empty).replace('CLR',neg?filledTxt:emptyTxt)}">${neg?'−':'+'}</div>
    ${ip.map((d,i)=>`<div onclick="omrNumDigit(${qId},'int',${i})" style="${bStyle.replace('FILL',d?filled:empty).replace('CLR',d?filledTxt:emptyTxt)}">${d||'·'}</div>`).join('')}
    <div style="font-size:9px;font-weight:900;color:${neetStyle?'#5c3d00':'#64748b'};padding:0 1px">.</div>
    ${dp.map((d,i)=>`<div onclick="omrNumDigit(${qId},'dec',${i})" style="${bStyle.replace('FILL',d?filled:empty).replace('CLR',d?filledTxt:emptyTxt)}">${d||'·'}</div>`).join('')}
  `;
}

// Global OMR bubble click (used by both panels)
window.omrBubbleClick=function(qId,opt,isMulti){
  const ES=window._ES;if(ES.readonly)return;
  const ans=ES.answers[qId];if(!ans)return;
  if(isMulti){
    const sel=new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
    sel.has(opt)?sel.delete(opt):sel.add(opt);
    ans.sel=[...sel].sort().join(',')||null;
  }else{ans.sel=ans.sel===opt?null:opt;}
  ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
  _sendAns(qId);
  if(ES.neetMode)_renderOMRSheet();
  if(ES.jeeOMRMode)_renderJeeOMRPanel();
};

window.omrNumSign=function(qId){
  const ans=window._ES.answers[qId];if(!ans||!ans.sel)return;
  ans.sel=ans.sel.startsWith('-')?ans.sel.slice(1):'-'+ans.sel;
  ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
  _sendAns(qId);
  if(window._ES.neetMode)_renderOMRSheet();
  if(window._ES.jeeOMRMode)_renderJeeOMRPanel();
};

window.omrNumDigit=function(qId,part,idx){
  const v=prompt('Enter digit (0-9):');if(v===null)return;
  const d=v.trim().replace(/[^0-9]/g,'').charAt(0)||'';
  const ans=window._ES.answers[qId];if(!ans)return;
  const cur=ans.sel||'',neg=cur.startsWith('-'),raw=cur.replace('-','');
  const dot=raw.indexOf('.');
  let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
  let dp=dot>=0?raw.slice(dot+1).split(''):[];
  while(ip.length<4)ip.unshift('');while(dp.length<2)dp.push('');
  if(part==='int')ip[idx]=d;else dp[idx]=d;
  const iStr=ip.join('').replace(/^0+/,'')||'0';
  const dStr=dp.join('').replace(/0+$/,'');
  const newVal=(neg?'-':'')+iStr+(dStr?'.'+dStr:'');
  ans.sel=(newVal==='0'||newVal==='-0')?null:newVal;
  ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
  _sendAns(qId);
  if(window._ES.neetMode)_renderOMRSheet();
  if(window._ES.jeeOMRMode)_renderJeeOMRPanel();
};

// ═══════════════════════════════════════════════════════════
//  STANDARD — chips, question, footer, palette
// ═══════════════════════════════════════════════════════════
function _renderChips(){
  const el=document.getElementById('subj-chips');if(!el)return;
  const cur=window._ES.qs[window._ES.cur];
  el.innerHTML=window._ES.subjects.map(s=>`<button class="subject-chip ${cur&&s===cur.subject?'active':''}" onclick="_jumpSubj('${s}')">${s.charAt(0)+s.slice(1).toLowerCase()}</button>`).join('');
}
window._jumpSubj=s=>{const i=window._ES.qs.findIndex(q=>q.subject===s);if(i>=0)_goQ(i);};

function _goQ(idx){
  const ES=window._ES;
  if(ES.cur!==idx){
    const pq=ES.qs[ES.cur];
    if(pq&&ES.answers[pq.id]){
      ES.answers[pq.id].time+=Math.round((Date.now()-ES.qTimer)/1000);
      if(ES.answers[pq.id].status==='NOT_VISITED'&&!ES.readonly){ES.answers[pq.id].status='NOT_ANSWERED';_sendAns(pq.id);}
    }
  }
  ES.cur=Math.max(0,Math.min(idx,ES.qs.length-1));ES.qTimer=Date.now();
  const q=ES.qs[ES.cur];if(!q)return;
  const pg=document.getElementById('q-prog');if(pg)pg.textContent=`${ES.cur+1} / ${ES.qs.length}`;
  _renderChips();_renderQ(q);_renderFooter(q);_renderPalette();
  setTimeout(()=>document.querySelector(`.pq-btn[data-i="${ES.cur}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}),50);
}

function _renderQ(q){
  const area=document.getElementById('exam-qarea');if(!area)return;
  const ES=window._ES,ans=ES.answers[q.id]||{sel:null,status:'NOT_VISITED',time:0},ro=ES.readonly;
  const isNum=q.question_type==='NUMERICAL',isMulti=q.question_type==='MCQ_MULTIPLE';
  const opts=[['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]].filter(([,v])=>v);
  const corr=new Set((q.correct_answer||'').split(',').map(s=>s.trim()).filter(Boolean));
  const selSet=new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
  let qHtml='';
  if(q.question_text)qHtml+=`<div class="q-text">${q.question_text}</div>`;
  if(q.question_image_path)qHtml+=`<div style="margin:10px 0"><img src="/static/uploads/${q.question_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;border-radius:8px;border:1px solid var(--c-border)" onerror="this.outerHTML='<div style=\'padding:6px;background:var(--c-surface2);border-radius:4px;font-size:11px;color:var(--c-text4)\'>Image not found</div>'" alt="Q image"></div>`;
  if(!qHtml)qHtml=`<div class="q-text" style="color:var(--c-text4);font-style:italic">No question text</div>`;
  let ansHtml='';
  if(isNum){
    ansHtml=`<div class="numpad-wrapper"><div class="num-display" id="num-disp">${ans.sel!==null&&ans.sel!==''?ans.sel:'&mdash;'}</div>
      <div class="numpad-grid">${[7,8,9,'DEL',4,5,6,'±',1,2,3,'.','0','00','C','OK'].map(k=>`<button class="numpad-key ${k==='DEL'||k==='C'?'del':k==='±'||k==='OK'?'fn':''}" onclick="examNumKey(${q.id},'${k}')">${k}</button>`).join('')}</div></div>`;
  }else{
    let optsHtml='';
    opts.forEach(([k,v])=>{
      const isSel=selSet.has(k);
      let cls=ro?(corr.has(k)?'correct':isSel?'wrong':''):(isSel?'selected':'');
      const click=ro?'':`onclick="examPickOpt(${q.id},'${k}',${isMulti})"`;
      optsHtml+=`<div class="option-row ${cls}" ${ro?'style="cursor:default"':''} ${click}><div class="option-key">${k}</div><div class="option-text">${v}</div>${ro&&corr.has(k)?`<span style="margin-left:auto;color:var(--c-green)">${IC.chk}</span>`:''}</div>`;
    });
    if(q.options_image_path)optsHtml+=`<img src="/static/uploads/${q.options_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;margin-top:8px;border-radius:6px" onerror="this.style.display='none'">`;
    ansHtml=`<div class="options-list">${optsHtml}</div>`;
  }
  let solHtml='';
  if(ro)solHtml=`<div style="margin-top:14px;padding:12px;background:var(--c-green-l);border-radius:var(--radius-sm);border-left:3px solid var(--c-green)"><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:var(--c-green);margin-bottom:6px">Answer: ${q.correct_answer||'—'}</div>${q.solution_text?`<div style="font-size:12px;color:var(--c-text2);line-height:1.7">${q.solution_text}</div>`:''}${q.solution_image_path?`<img src="/static/uploads/${q.solution_image_path.replace(/^uploads[/\\]/,'')}" style="max-width:100%;margin-top:8px;border-radius:6px" onerror="this.style.display='none'">`:''}</div>`;
  area.innerHTML=`<div class="exam-q-card fade-in"><div class="q-num-row"><span class="q-num-pill">Q${q.question_number}</span>${isMulti?'<span class="q-type-pill">Multiple Correct</span>':''}${isNum?'<span class="q-type-pill">Numerical</span>':''}<span class="q-marks-pill">+${q.marks_correct} / ${q.marks_incorrect}</span></div>${qHtml}${ansHtml}${solHtml}</div>`;
}

window.examPickOpt=function(qId,key,isMulti){
  const ES=window._ES;if(ES.readonly)return;
  const ans=ES.answers[qId];if(!ans)return;
  if(isMulti){const sel=new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));sel.has(key)?sel.delete(key):sel.add(key);ans.sel=[...sel].sort().join(',')||null;}
  else ans.sel=ans.sel===key?null:key;
  ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
  _sendAns(qId);_renderQ(ES.qs[ES.cur]);_renderPalette();
};

window.examNumKey=function(qId,k){
  const ES=window._ES;if(ES.readonly)return;
  const ans=ES.answers[qId];if(!ans)return;
  let v=ans.sel||'';
  if(k==='C')v='';
  else if(k==='DEL')v=v.slice(0,-1);
  else if(k==='±')v=v.startsWith('-')?v.slice(1):('-'+v);
  else if(k==='OK'){window._saveNext();return;}
  else if(k==='.'&&v.includes('.'))return;
  else if(v.replace('-','').replace('.','').length>=8)return;
  else v+=k;
  ans.sel=v||null;ans.status=v?'ANSWERED':'NOT_ANSWERED';
  const d=document.getElementById('num-disp');if(d)d.textContent=v||'—';
  _sendAns(qId);_renderPalette();
};

function _renderFooter(q){
  const el=document.getElementById('exam-footer');if(!el)return;
  const ES=window._ES,ro=ES.readonly,f=ES.cur===0,l=ES.cur===ES.qs.length-1;
  if(ro)el.innerHTML=`<button class="btn btn-secondary btn-sm" onclick="_goQ(${ES.cur-1})" ${f?'disabled':''}>Previous</button><div style="flex:1"></div><button class="btn btn-primary btn-sm" onclick="_goQ(${ES.cur+1})" ${l?'disabled':''}>Next</button>`;
  else el.innerHTML=`<button class="btn btn-secondary btn-sm" onclick="window._clearR(${q.id})">Clear</button><button class="btn btn-sm" style="background:var(--q-marked);color:#fff;border:none" onclick="window._markR(${q.id})">Mark & Review</button><div style="flex:1"></div><button class="btn btn-secondary btn-sm" onclick="_goQ(${ES.cur-1})" ${f?'disabled':''}>Prev</button><button class="btn btn-primary btn-sm" onclick="window._saveNext()">Save & Next</button>`;
}
window._clearR=qId=>{const a=window._ES.answers[qId];if(!a)return;a.sel=null;a.status='NOT_ANSWERED';_sendAns(qId);_renderQ(window._ES.qs[window._ES.cur]);_renderPalette();};
window._markR=qId=>{const a=window._ES.answers[qId];if(!a)return;a.status=a.sel?'ANSWERED_AND_MARKED':'MARKED_FOR_REVIEW';_sendAns(qId);_renderPalette();_goQ(window._ES.cur+1);};
window._saveNext=()=>{const q=window._ES.qs[window._ES.cur];if(!q)return;const a=window._ES.answers[q.id];if(a&&a.sel)a.status='ANSWERED';_sendAns(q.id);_goQ(window._ES.cur+1);};

function _renderPalette(){
  const leg=document.getElementById('pal-legend'),grid=document.getElementById('pal-grid');
  if(!leg||!grid)return;
  const ES=window._ES;
  const cnt={NOT_VISITED:0,NOT_ANSWERED:0,ANSWERED:0,MARKED_FOR_REVIEW:0,ANSWERED_AND_MARKED:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  leg.innerHTML=`<div class="legend-row"><div class="legend-dot ans"></div>${cnt.ANSWERED} Ans</div><div class="legend-row"><div class="legend-dot na"></div>${cnt.NOT_ANSWERED} NA</div><div class="legend-row"><div class="legend-dot mrk"></div>${cnt.MARKED_FOR_REVIEW+cnt.ANSWERED_AND_MARKED} Mrk</div><div class="legend-row"><div class="legend-dot nv"></div>${cnt.NOT_VISITED} NV</div>`;
  const byS={},sOrd=[];
  ES.qs.forEach((q,i)=>{if(!byS[q.subject]){byS[q.subject]=[];sOrd.push(q.subject);}byS[q.subject].push({q,i});});
  grid.innerHTML=sOrd.map(s=>`<div class="palette-subj-label">${s.charAt(0)+s.slice(1).toLowerCase()}</div><div class="palette-buttons">${byS[s].map(({q,i})=>{const a=ES.answers[q.id],st=a?a.status:'NOT_VISITED';const c=st==='ANSWERED'?'ans':st==='NOT_ANSWERED'?'na':st==='MARKED_FOR_REVIEW'?'mrk':st==='ANSWERED_AND_MARKED'?'am':'nv';return`<button class="pq-btn ${c}${i===ES.cur?' cur':''}" data-i="${i}" onclick="_goQ(${i})">${i+1}</button>`;}).join('')}</div>`).join('');
}

window._omrOpen=function(){if(window._ES.qs.length)OMR.open(window._ES.qs,window._ES.answers,function(qId,ans){window._ES.answers[qId]=ans;_sendAns(qId);_renderPalette();const c=window._ES.qs[window._ES.cur];if(c&&c.id===qId)_renderQ(c);});};

function _sendAns(qId){
  if(window._ES.readonly)return;
  const a=window._ES.answers[qId];if(!a)return;
  const body={question_id:qId,selected_answer:a.sel||null,status:a.status,time_spent_seconds:a.time||0};
  if(!navigator.onLine){OQ.push({url:`/api/attempts/${window._ES.id}/answer`,opts:{method:'PATCH',body}});return;}
  PATCH(`/api/attempts/${window._ES.id}/answer`,body).catch(()=>{});
}

function _timerStart(){
  if(window._ES.timer)clearInterval(window._ES.timer);
  window._ES.timer=setInterval(()=>{
    const rem=Math.max(0,window._ES.endTime-Date.now());
    const m=Math.floor(rem/60000),s=Math.floor((rem%60000)/1000);
    const ts=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const el=document.getElementById('exam-timer');
    if(el){el.textContent=ts;el.className='exam-timer-box'+(m<5?' crit':m<15?' warn':'');}
    const mini=document.getElementById('omr-timer-mini');if(mini)mini.textContent=ts;
    if(rem<=0){clearInterval(window._ES.timer);window._ES.timer=null;_doSubmit(true);}
  },1000);
}

async function _camStart(){
  const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
  window._ES.camStream=stream;
  const vid=document.createElement('video');vid.srcObject=stream;vid.autoplay=true;vid.muted=true;
  vid.id='_ep_cam';vid.style.cssText='position:fixed;bottom:72px;right:12px;width:110px;height:82px;border-radius:8px;border:2px solid var(--c-green);z-index:2000;object-fit:cover;box-shadow:0 4px 14px rgba(0,0,0,.35)';
  document.body.appendChild(vid);
  const can=document.createElement('canvas');can.width=320;can.height=240;const ctx=can.getContext('2d');
  window._ES.camInterval=setInterval(()=>{try{ctx.drawImage(vid,0,0,320,240);const b64=can.toDataURL('image/jpeg',.5);if(window._ES.camId)POST(`/api/camera/${window._ES.camId}/snapshot`,{image_b64:b64}).catch(()=>{});}catch{}},30000);
  toast('Camera active','ok',2000);
}

async function _micStart(){
  const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  window._ES.micStream=stream;
  // Show mic indicator
  const topbar=document.querySelector('.exam-topbar > div:last-child');
  if(topbar){const m=document.createElement('div');m.id='_mic_ind';m.style.cssText='display:flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(34,197,94,.15);border-radius:99px;border:1px solid rgba(34,197,94,.3)';m.innerHTML='<span style="font-size:11px">🎤</span><span style="font-size:9px;font-weight:700;color:#86efac">MIC</span>';topbar.prepend(m);}
  toast('🎤 Microphone active','ok',2000);
}

function _stopMedia(){
  try{if(window._ES.camInterval){clearInterval(window._ES.camInterval);window._ES.camInterval=null;}}catch{}
  try{if(window._ES.camStream){window._ES.camStream.getTracks().forEach(t=>t.stop());window._ES.camStream=null;}}catch{}
  try{if(window._ES.micStream){window._ES.micStream.getTracks().forEach(t=>t.stop());window._ES.micStream=null;}}catch{}
  try{const p=document.getElementById('_ep_cam');if(p)p.remove();}catch{}
  try{const m=document.getElementById('_mic_ind');if(m)m.remove();}catch{}
  if(window._ES.camId)POST(`/api/camera/${window._ES.camId}/end`,{}).catch(()=>{});
}

window._submitConfirm=function(){
  const ES=window._ES;
  const cnt={ANSWERED:0,NOT_ANSWERED:0,NOT_VISITED:0,MARKED_FOR_REVIEW:0};
  Object.values(ES.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
  openModal('Submit Test',`<div class="modal-body-pad" style="text-align:center">
    <div style="font-size:14px;font-weight:700;color:var(--c-text);margin-bottom:16px">Submit this test now?</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="padding:12px;background:var(--c-green-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-green)">${cnt.ANSWERED}</div><div style="font-size:10px;color:var(--c-green);font-weight:700">Answered</div></div>
      <div style="padding:12px;background:var(--c-red-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-red)">${cnt.NOT_ANSWERED+cnt.NOT_VISITED}</div><div style="font-size:10px;color:var(--c-red);font-weight:700">Unanswered</div></div>
      <div style="padding:12px;background:var(--c-amber-l);border-radius:var(--radius)"><div style="font-size:22px;font-weight:900;color:var(--c-amber)">${cnt.MARKED_FOR_REVIEW}</div><div style="font-size:10px;color:var(--c-amber);font-weight:700">Marked</div></div>
    </div>
    <div style="font-size:12px;color:var(--c-text4)">Once submitted you cannot change answers.</div>
  </div>`,`<button class="btn btn-secondary" onclick="closeModal()">Continue</button><button class="btn btn-danger" onclick="closeModal();_doSubmit(false)">Submit Now</button>`);
};

async function _doSubmit(auto){
  if(window._ES.timer){clearInterval(window._ES.timer);window._ES.timer=null;}
  _stopMedia();
  const q=window._ES.qs[window._ES.cur];
  if(q&&window._ES.answers[q.id]){window._ES.answers[q.id].time+=Math.round((Date.now()-window._ES.qTimer)/1000);try{await PATCH(`/api/attempts/${window._ES.id}/answer`,{question_id:q.id,selected_answer:window._ES.answers[q.id].sel||null,status:window._ES.answers[q.id].status,time_spent_seconds:window._ES.answers[q.id].time});}catch{}}
  const ov=document.getElementById('exam-overlay');
  ov.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:18px"><div class="spinner" style="width:48px;height:48px;border-width:4px"></div><div style="font-size:14px;font-weight:600;color:var(--c-text3)">Submitting…</div></div>';
  try{const r=await POST(`/api/attempts/${window._ES.id}/submit`,{auto_submitted:!!auto});ov.style.display='none';_showResult(r);try{await DashDB.save(r);}catch{}}
  catch(e){ov.style.display='none';toast('Submit failed: '+e.message,'err',8000);}
}

window._examExit=function(){
  if(window._ES.readonly){_stopMedia();document.getElementById('exam-overlay').style.display='none';return;}
  if(confirm('Exit? Timer keeps running. You can resume by re-opening the same test.')){
    if(window._ES.timer)clearInterval(window._ES.timer);
    _stopMedia();document.getElementById('exam-overlay').style.display='none';
  }
};

function _showResult(r){
  const el=document.getElementById('page-content');
  const pct=r.percentage||(r.max_score>0?(r.score/r.max_score*100).toFixed(1):0);
  let bk='';
  if(r.subject_breakdown&&Object.keys(r.subject_breakdown).length){
    bk=`<div class="card" style="margin-top:16px"><div class="card-body"><div style="font-size:12px;font-weight:800;color:var(--c-text);margin-bottom:12px">Subject Breakdown</div><table class="data-table"><thead><tr><th>Subject</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th style="text-align:right">Score</th></tr></thead><tbody>${Object.entries(r.subject_breakdown).map(([s,b])=>`<tr><td style="font-weight:600">${s.charAt(0)+s.slice(1).toLowerCase()}</td><td style="color:var(--c-green);font-weight:700">${b.correct||0}</td><td style="color:var(--c-red);font-weight:700">${b.incorrect||0}</td><td style="color:var(--c-text3)">${b.unattempted||0}</td><td style="text-align:right;font-weight:800;color:var(--c-blue)">${Number(b.score||0).toFixed(1)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  el.innerHTML=`<div style="max-width:680px;margin:0 auto" class="fade-in">
    <div class="result-hero"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;opacity:.75;margin-bottom:10px">Test Complete</div>
      <div class="result-score-num">${Number(r.score).toFixed(1)}</div><div class="result-score-den">out of ${Number(r.max_score).toFixed(0)}</div><div class="result-pct">${pct}%</div></div>
    <div class="result-grid">
      <div class="result-cell"><div class="result-cell-val rc-correct">${r.correct_count}</div><div class="result-cell-lbl">Correct</div></div>
      <div class="result-cell"><div class="result-cell-val rc-wrong">${r.incorrect_count}</div><div class="result-cell-lbl">Wrong</div></div>
      <div class="result-cell"><div class="result-cell-val rc-skip">${r.unattempted_count}</div><div class="result-cell-lbl">Skipped</div></div>
      <div class="result-cell"><div class="result-cell-val">${r.attempted_count}</div><div class="result-cell-lbl">Attempted</div></div>
      <div class="result-cell"><div class="result-cell-val">${Math.floor(r.time_taken_seconds/60)}m ${r.time_taken_seconds%60}s</div><div class="result-cell-lbl">Time</div></div>
      <div class="result-cell"><div class="result-cell-val" style="color:${Number(pct)>=35?'var(--c-green)':'var(--c-red)'}">${Number(pct)>=35?'Pass':'Fail'}</div><div class="result-cell-lbl">Result</div></div>
    </div>${bk}
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px">
      <button class="btn btn-primary" onclick="examLaunch(Object.assign({},window._lastExamOpts,{readonly:true,attempt_id:${r.attempt_id}}))">View Solutions</button>
      <button class="btn btn-secondary" onclick="go('leaderboard')">Leaderboard</button>
      <button class="btn btn-secondary" onclick="go('dashboard')">Dashboard</button>
      <button class="btn btn-secondary" onclick="go('pyq')">More Tests</button>
    </div>
  </div>`;
}
