'use strict';
/* ════════════════════════════════════════════════════════════════════
   ADMIN PANEL
   ════════════════════════════════════════════════════════════════════ */

let AD={exams:[],tracks:[],subjects:[],loaded:false};

async function _uploadFetch(url,formData){
  const tok=Auth.token();
  const res=await fetch(url,{
    method:'POST',
    headers:tok?{'Authorization':'Bearer '+tok}:{},
    body:formData
  });
  const ct=res.headers.get('content-type')||'';
  const data=ct.includes('json')?await res.json():await res.text();
  if(!res.ok)throw new Error((data?.detail)||`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

registerPage('admin',async function(el){
  if(!Auth.isAdmin()){toast('Admin access required','err');go('home');return;}
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  await _adLoad();
  _adRender(el,'upload');
});

async function _adLoad(){
  try{
    const[exams,tracks,stats]=await Promise.all([
      GET('/api/pyq/exams'),
      GET('/api/premium/tracks'),
      GET('/api/admin/stats').catch(()=>({}))
    ]);
    AD.exams=exams||[];AD.tracks=tracks||[];AD.stats=stats||{};
    AD.subjects=(tracks||[]).flatMap(t=>(t.subjects||[]).map(s=>({...s,trackName:t.display_name,trackId:t.id})));
    AD.loaded=true;
  }catch(e){console.error('Admin load:',e);}
}

function _adRender(el,tab){
  el.innerHTML=`<div class="fade-in">
    <div class="page-header" style="margin-bottom:14px"><div class="page-title">Admin Panel</div></div>
    <div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:start">
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-lg);overflow:hidden;position:sticky;top:72px">
        ${[['upload',' Upload Qs'],['dpp',' DPP Manager'],['chap',' Chapterwise'],['mock',' Mock Tests'],['pyq',' PYQ Structure'],['media',' Media'],['news',' News'],['stats',' Stats'],['users',' Users']].map(([k,l])=>
          `<button id="abn-${k}" onclick="_adSw('${k}')" style="display:block;width:100%;padding:10px 14px;border:none;border-bottom:1px solid var(--c-border);background:${k===tab?'var(--c-blue-l)':'none'};color:${k===tab?'var(--c-blue)':'var(--c-text3)'};font-size:12px;font-weight:600;text-align:left;cursor:pointer">${l}</button>`
        ).join('')}
      </div>
      <div id="admin-body" class="fade-in"></div>
    </div>
  </div>`;
  _adLoad$(tab);
}

function _adSw(k){
  document.querySelectorAll('[id^="abn-"]').forEach(b=>{b.style.background=b.id==='abn-'+k?'var(--c-blue-l)':'none';b.style.color=b.id==='abn-'+k?'var(--c-blue)':'var(--c-text3)';});
  _adLoad$(k);
}

function _adLoad$(k){
  const b=document.getElementById('admin-body');if(!b)return;
  b.className='fade-in';
  ({upload:_adUpload,dpp:_adDpp,chap:_adChap,mock:_adMock,pyq:_adPyq,media:_adMedia,news:_adNews,stats:_adStats,users:_adUsers}[k]||_adStats)(b);
}

/* ═══════════════════════════════════════════════════════════
   UPLOAD QUESTIONS
   ═══════════════════════════════════════════════════════════ */
let _dest=null,_qNum=1,_imgs={};

function _adUpload(el){
  el.innerHTML=`<div>
    <div class="card" style="margin-bottom:14px"><div class="card-body" style="padding:16px 18px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--c-blue);margin-bottom:12px">Step 1 — Destination</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap" id="dest-tabs">
        ${['PYQ','DPP','Chapterwise','Mock Test'].map((t,i)=>`<button class="pill-tab ${i===0?'active':''}" onclick="_dstClick('${t}',this)">${t}</button>`).join('')}
      </div>
      <div id="dest-sel"></div>
    </div></div>
    <div id="qform-wrap" style="display:none"></div>
  </div>`;
  _dstClick('PYQ',el.querySelector('.pill-tab'));
}

function _dstClick(tab,btn){
  document.querySelectorAll('.pill-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');_dest=null;
  document.getElementById('qform-wrap').style.display='none';
  const ds=document.getElementById('dest-sel');if(!ds)return;
  if(tab==='PYQ')ds.innerHTML=_dstPYQ();
  else if(tab==='DPP')ds.innerHTML=_dstDPP();
  else if(tab==='Chapterwise')ds.innerHTML=_dstChap();
  else if(tab==='Mock Test')ds.innerHTML=_dstMock();
}

/* ── PYQ destination ── */
function _dstPYQ(){return`<div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Exam</label>
      <select id="p-exam" class="form-control" onchange="_pExCh()"><option value="">Select…</option>
      ${AD.exams.map(e=>`<option value="${e.id}">${e.display_name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Year</label>
      <select id="p-year" class="form-control" onchange="_pYrCh()"><option value="">Select…</option></select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Shift</label>
      <select id="p-shift" class="form-control"><option value="">Select…</option></select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Add Year (if missing)</label>
      <div style="display:flex;gap:6px"><input id="p-ny" type="number" class="form-control" placeholder="e.g. 2026" style="width:100px"><button class="btn btn-secondary btn-sm" onclick="_addYear()">Add</button></div></div>
    <div class="form-group" style="margin:0"><label class="form-label">Add Shift (if missing)</label>
      <div style="display:flex;gap:6px"><input id="p-ns" class="form-control" placeholder="e.g. Apr 26 Shift 1"><button class="btn btn-secondary btn-sm" onclick="_addShift()">Add</button></div></div>
  </div>
  <button class="btn btn-primary btn-sm" onclick="_cfmPYQ()">Use This Shift →</button>
</div>`;}

window._pExCh=function(){const id=document.getElementById('p-exam').value,e=AD.exams.find(e=>e.id==id);const yr=document.getElementById('p-year');yr.innerHTML='<option value="">Select…</option>'+(e?.years||[]).sort((a,b)=>b.year-a.year).map(y=>`<option value="${y.id}">${y.year}</option>`).join('');document.getElementById('p-shift').innerHTML='<option value="">Select…</option>';};
window._pYrCh=function(){const yid=document.getElementById('p-year').value;for(const e of AD.exams){const y=(e.years||[]).find(y=>y.id==yid);if(y){document.getElementById('p-shift').innerHTML='<option value="">Select…</option>'+(y.shifts||[]).map(s=>`<option value="${s.id}">${s.label} — ${s.question_count}Q</option>`).join('');return;}}};
window._addYear=async function(){const eid=document.getElementById('p-exam').value,yr=document.getElementById('p-ny').value;if(!eid||!yr){toast('Select exam + year','warn');return;}const fd=new FormData();fd.append('exam_id',eid);fd.append('year',yr);try{await _uploadFetch('/api/admin/years',fd);toast(`Year ${yr} added`,'ok');document.getElementById('p-ny').value='';await _adLoad();_pExCh();}catch(e){toast(e.message,'err');}};
window._addShift=async function(){const yid=document.getElementById('p-year').value,lbl=document.getElementById('p-ns').value.trim();if(!yid||!lbl){toast('Select year + label','warn');return;}const fd=new FormData();fd.append('year_id',yid);fd.append('label',lbl);try{await _uploadFetch('/api/admin/shifts',fd);toast(`Shift "${lbl}" added`,'ok');document.getElementById('p-ns').value='';await _adLoad();_pYrCh();}catch(e){toast(e.message,'err');}};
window._cfmPYQ=function(){const se=document.getElementById('p-shift'),sid=se.value;if(!sid){toast('Select a shift','warn');return;}const ee=document.getElementById('p-exam');_dest={shift_id:parseInt(sid),label:`PYQ: ${ee.options[ee.selectedIndex]?.text} — ${se.options[se.selectedIndex]?.text}`};_showQForm();};

/* ── DPP destination ── */
function _dstDPP(){return`<div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Track</label>
      <select id="d-trk" class="form-control" onchange="_dTrkCh()"><option value="">Select…</option>
      ${AD.tracks.map(t=>`<option value="${t.id}">${t.display_name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Subject</label>
      <select id="d-sub" class="form-control" onchange="_dSubCh()"><option value="">Select…</option></select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">DPP Set</label>
      <select id="d-set" class="form-control" onchange="_dSetCh()"><option value="">Select…</option></select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Chapter DPP</label>
      <select id="d-dpp" class="form-control"><option value="">Select…</option></select></div>
  </div>
  <div style="background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--radius);padding:10px;margin-bottom:10px">
    <div style="font-size:10px;font-weight:700;color:var(--c-text4);margin-bottom:6px"> CREATE MISSING</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">New DPP Set</label>
        <div style="display:flex;gap:4px"><input id="d-nset" class="form-control" placeholder="e.g. Set 1 (10Q)" style="font-size:11px"><button class="btn btn-secondary btn-sm" onclick="_mkDppSet()">Create</button></div></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">New Chapter DPP</label>
        <div style="display:flex;gap:4px"><input id="d-ndpp" class="form-control" placeholder="e.g. Kinematics" style="font-size:11px"><button class="btn btn-secondary btn-sm" onclick="_mkDpp()">Create</button></div></div>
    </div>
  </div>
  <button class="btn btn-primary btn-sm" onclick="_cfmDPP()">Use This DPP →</button>
</div>`;}

window._dTrkCh=function(){const tid=document.getElementById('d-trk').value,t=AD.tracks.find(t=>t.id==tid);document.getElementById('d-sub').innerHTML='<option value="">Select…</option>'+(t?.subjects||[]).filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');document.getElementById('d-set').innerHTML='<option value="">Select…</option>';document.getElementById('d-dpp').innerHTML='<option value="">Select…</option>';};
window._dSubCh=function(){const sid=document.getElementById('d-sub').value,tid=document.getElementById('d-trk').value,t=AD.tracks.find(t=>t.id==tid),s=(t?.subjects||[]).find(s=>s.id==sid);window._curSets=s?.dpp_sets||[];window._curSubId=sid;document.getElementById('d-set').innerHTML='<option value="">Select…</option>'+(window._curSets||[]).map(ds=>`<option value="${ds.id}">${ds.name} (${(ds.dpps||[]).length} ch)</option>`).join('');document.getElementById('d-dpp').innerHTML='<option value="">Select…</option>';};
window._dSetCh=function(){const setId=document.getElementById('d-set').value,set=(window._curSets||[]).find(s=>s.id==setId);window._curSetId=setId;document.getElementById('d-dpp').innerHTML='<option value="">Select…</option>'+(set?.dpps||[]).sort((a,b)=>a.order_index-b.order_index).map(d=>`<option value="${d.id}">${d.chapter_name||d.title} (${d.question_count}Q)</option>`).join('');};
window._mkDppSet=async function(){const sid=document.getElementById('d-sub').value,name=document.getElementById('d-nset').value.trim();if(!sid){toast('Select subject first','warn');return;}if(!name){toast('Enter set name','warn');return;}const fd=new FormData();fd.append('subject_id',sid);fd.append('name',name);fd.append('questions_per_dpp','10');try{const r=await _uploadFetch('/api/admin/premium/dpp-sets',fd);toast(`Set "${name}" created (ID:${r.id})`,'ok');document.getElementById('d-nset').value='';const tid=document.getElementById('d-trk').value;await _adLoad();if(tid){document.getElementById('d-trk').value=tid;_dTrkCh();}setTimeout(()=>{const sv=document.getElementById('d-sub').value;if(sid){document.getElementById('d-sub').value=sid;_dSubCh();}},100);}catch(e){toast(e.message,'err');}};
window._mkDpp=async function(){const setId=document.getElementById('d-set').value,ch=document.getElementById('d-ndpp').value.trim();if(!setId){toast('Select DPP set first','warn');return;}if(!ch){toast('Enter chapter name','warn');return;}const fd=new FormData();fd.append('dpp_set_id',setId);fd.append('title','DPP — '+ch);fd.append('chapter_name',ch);fd.append('order_index','99');fd.append('duration_minutes','30');try{const r=await _uploadFetch('/api/admin/premium/dpps',fd);toast(`Chapter "${ch}" created`,'ok');document.getElementById('d-ndpp').value='';const tid=document.getElementById('d-trk').value,sid=document.getElementById('d-sub').value;await _adLoad();if(tid){document.getElementById('d-trk').value=tid;_dTrkCh();}setTimeout(()=>{if(sid){document.getElementById('d-sub').value=sid;_dSubCh();}setTimeout(()=>{if(setId){document.getElementById('d-set').value=setId;_dSetCh();}},100);},100);}catch(e){toast(e.message,'err');}};
window._cfmDPP=function(){const de=document.getElementById('d-dpp'),did=de.value;if(!did){toast('Select a DPP','warn');return;}_dest={dpp_id:parseInt(did),label:'DPP: '+de.options[de.selectedIndex]?.text};_showQForm();};

/* ── Chapterwise destination ── */
function _dstChap(){return`<div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Track</label>
      <select id="c-trk" class="form-control" onchange="_cTrkCh()"><option value="">Select…</option>
      ${AD.tracks.map(t=>`<option value="${t.id}">${t.display_name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Subject</label>
      <select id="c-sub" class="form-control" onchange="_cSubCh()"><option value="">Select…</option></select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Chapter</label>
      <select id="c-ch" class="form-control" onchange="_cChCh()"><option value="">Select…</option></select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Module</label>
      <select id="c-mod" class="form-control"><option value="">Select…</option></select></div>
  </div>
  <div style="background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--radius);padding:10px;margin-bottom:10px">
    <div style="font-size:10px;font-weight:700;color:var(--c-text4);margin-bottom:6px"> CREATE MISSING</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">New Chapter</label>
        <div style="display:flex;gap:4px"><input id="c-nch" class="form-control" placeholder="e.g. Thermodynamics" style="font-size:11px"><button class="btn btn-secondary btn-sm" onclick="_mkChap()">Add</button></div></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">New Module</label>
        <div style="display:flex;gap:4px"><input id="c-nmod" class="form-control" placeholder="e.g. Module 1" style="font-size:11px"><button class="btn btn-secondary btn-sm" onclick="_mkMod()">Add</button></div></div>
    </div>
  </div>
  <button class="btn btn-primary btn-sm" onclick="_cfmChap()">Use This Module →</button>
</div>`;}

window._cTrkCh=function(){const tid=document.getElementById('c-trk').value,t=AD.tracks.find(t=>t.id==tid);document.getElementById('c-sub').innerHTML='<option value="">Select…</option>'+(t?.subjects||[]).filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');document.getElementById('c-ch').innerHTML='<option value="">Select…</option>';document.getElementById('c-mod').innerHTML='<option value="">Select…</option>';};
window._cSubCh=function(){const sid=document.getElementById('c-sub').value,tid=document.getElementById('c-trk').value,t=AD.tracks.find(t=>t.id==tid),s=(t?.subjects||[]).find(s=>s.id==sid);const chs=[];(s?.test_sets||[]).forEach(ts=>(ts.chapters||[]).forEach(ch=>chs.push({...ch,tsId:ts.id})));window._curChs=chs;window._curTsId=(s?.test_sets||[])[0]?.id;document.getElementById('c-ch').innerHTML='<option value="">Select…</option>'+chs.map(ch=>`<option value="${ch.id}">${ch.name} (${(ch.modules||[]).length}M)</option>`).join('');document.getElementById('c-mod').innerHTML='<option value="">Select…</option>';};
window._cChCh=function(){const chId=document.getElementById('c-ch').value,ch=(window._curChs||[]).find(c=>c.id==chId);document.getElementById('c-mod').innerHTML='<option value="">Select…</option>'+(ch?.modules||[]).map(m=>`<option value="${m.id}">${m.name} (${m.question_count}Q)</option>`).join('');};
window._mkChap=async function(){const name=document.getElementById('c-nch').value.trim(),tsId=window._curTsId;if(!name){toast('Enter chapter name','warn');return;}if(!tsId){toast('Select subject first','warn');return;}const fd=new FormData();fd.append('test_set_id',tsId);fd.append('name',name);fd.append('order_index',String((window._curChs||[]).length+1));try{const r=await _uploadFetch('/api/admin/premium/chapters',fd);toast(`Chapter "${name}" added`,'ok');document.getElementById('c-nch').value='';const tid=document.getElementById('c-trk').value,sid=document.getElementById('c-sub').value;await _adLoad();if(tid){document.getElementById('c-trk').value=tid;_cTrkCh();}setTimeout(()=>{if(sid){document.getElementById('c-sub').value=sid;_cSubCh();}},100);}catch(e){toast(e.message,'err');}};
window._mkMod=async function(){const chId=document.getElementById('c-ch').value,name=document.getElementById('c-nmod').value.trim();if(!chId){toast('Select chapter first','warn');return;}if(!name){toast('Enter module name','warn');return;}const ch=(window._curChs||[]).find(c=>c.id==chId);const fd=new FormData();fd.append('chapter_id',chId);fd.append('name',name);fd.append('order_index',String((ch?.modules||[]).length+1));fd.append('duration_minutes','30');try{const r=await _uploadFetch('/api/admin/premium/modules',fd);toast(`Module "${name}" added`,'ok');document.getElementById('c-nmod').value='';const tid=document.getElementById('c-trk').value,sid=document.getElementById('c-sub').value,cid=chId;await _adLoad();if(tid){document.getElementById('c-trk').value=tid;_cTrkCh();}setTimeout(()=>{if(sid){document.getElementById('c-sub').value=sid;_cSubCh();}setTimeout(()=>{if(cid){document.getElementById('c-ch').value=cid;_cChCh();}},100);},100);}catch(e){toast(e.message,'err');}};
window._cfmChap=function(){const me=document.getElementById('c-mod'),mid=me.value;if(!mid){toast('Select a module','warn');return;}_dest={module_id:parseInt(mid),label:'Chapter Test: '+me.options[me.selectedIndex]?.text};_showQForm();};

/* ── Mock Test destination ── */
function _dstMock(){return`<div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
    <div class="form-group" style="margin:0"><label class="form-label">Track</label>
      <select id="m-trk" class="form-control" onchange="_mTrkCh()"><option value="">Select…</option>
      ${AD.tracks.map(t=>`<option value="${t.id}">${t.display_name}</option>`).join('')}</select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Subject</label>
      <select id="m-sub" class="form-control" onchange="_mSubCh()"><option value="">Select…</option></select></div>
  </div>
  <div class="form-group"><label class="form-label">Mock Test</label>
    <select id="m-mt" class="form-control"><option value="">Select…</option></select></div>
  <div style="background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--radius);padding:10px;margin-bottom:10px">
    <div style="font-size:10px;font-weight:700;color:var(--c-text4);margin-bottom:6px">➕ CREATE MOCK TEST</div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end">
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Title</label>
        <input id="m-ntitle" class="form-control" placeholder="e.g. Full Mock Test 4" style="font-size:11px"></div>
      <div class="form-group" style="margin:0"><label class="form-label" style="font-size:10px">Min</label>
        <input id="m-ndur" type="number" class="form-control" value="180" style="width:70px"></div>
      <button class="btn btn-secondary btn-sm" onclick="_mkMock()">Create</button>
    </div>
  </div>
  <button class="btn btn-primary btn-sm" onclick="_cfmMock()">Use This Mock →</button>
</div>`;}

window._mTrkCh=function(){const tid=document.getElementById('m-trk').value,t=AD.tracks.find(t=>t.id==tid);document.getElementById('m-sub').innerHTML='<option value="">Select…</option>'+(t?.subjects||[]).filter(s=>s.is_active).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');document.getElementById('m-mt').innerHTML='<option value="">Select…</option>';};
window._mSubCh=function(){const sid=document.getElementById('m-sub').value,tid=document.getElementById('m-trk').value,t=AD.tracks.find(t=>t.id==tid),s=(t?.subjects||[]).find(s=>s.id==sid);document.getElementById('m-mt').innerHTML='<option value="">Select…</option>'+(s?.mock_tests||[]).map(m=>`<option value="${m.id}">${m.title} (${m.question_count}Q)</option>`).join('');};
window._mkMock=async function(){const sid=document.getElementById('m-sub').value,title=document.getElementById('m-ntitle').value.trim(),dur=document.getElementById('m-ndur').value||180;if(!sid){toast('Select subject','warn');return;}if(!title){toast('Enter title','warn');return;}const fd=new FormData();fd.append('subject_id',sid);fd.append('title',title);fd.append('duration_minutes',dur);fd.append('order_index','99');try{const r=await _uploadFetch('/api/admin/premium/mock-tests',fd);toast(`"${title}" created`,'ok');document.getElementById('m-ntitle').value='';const tid=document.getElementById('m-trk').value;await _adLoad();if(tid){document.getElementById('m-trk').value=tid;_mTrkCh();}setTimeout(()=>{const sv=document.getElementById('m-sub').value;if(sid){document.getElementById('m-sub').value=sid;_mSubCh();}},100);}catch(e){toast(e.message,'err');}};
window._cfmMock=function(){const me=document.getElementById('m-mt'),mid=me.value;if(!mid){toast('Select a mock test','warn');return;}_dest={mock_test_id:parseInt(mid),label:'Mock: '+me.options[me.selectedIndex]?.text};_showQForm();};

/* ═══════════════════════════════════════════════════════════
   QUESTION FORM
   ═══════════════════════════════════════════════════════════ */
function _showQForm(){
  const sec=document.getElementById('qform-wrap');if(!sec)return;
  sec.style.display='block';_qNum=1;_imgs={};
  sec.innerHTML=`<div class="card"><div class="card-body" style="padding:16px 18px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div><div style="font-size:13px;font-weight:800;color:var(--c-text)">Add Questions</div>
        <div style="font-size:11px;color:var(--c-blue);margin-top:2px">${_dest?.label||''}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;color:var(--c-text3);font-weight:600">Q#</span>
        <input id="qf-num" type="number" class="form-control" style="width:60px" value="1"></div>
    </div>
    <div id="qf-err" style="display:none;background:var(--c-red-l);color:var(--c-red);padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-bottom:10px;border-left:3px solid var(--c-red)"></div>
    <div id="qf-ok" style="display:none;padding:8px 12px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm);font-size:12px;margin-bottom:10px;border-left:3px solid var(--c-green)"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;margin-bottom:12px;align-items:end">
      <div class="form-group" style="margin:0"><label class="form-label">Subject</label>
        <select id="qf-subj" class="form-control"><option>PHYSICS</option><option>CHEMISTRY</option><option>MATHS</option><option>BIOLOGY</option></select></div>
      <div class="form-group" style="margin:0"><label class="form-label">Type</label>
        <select id="qf-type" class="form-control" onchange="_qfType()">
          <option value="MCQ_SINGLE">MCQ Single</option>
          <option value="MCQ_MULTIPLE">MCQ Multiple</option>
          <option value="NUMERICAL">Numerical</option>
        </select></div>
      <div class="form-group" style="margin:0"><label class="form-label">+Marks</label>
        <input id="qf-mc" type="number" class="form-control" style="width:62px" value="4" step=".5"></div>
      <div class="form-group" style="margin:0"><label class="form-label">−Marks</label>
        <input id="qf-mw" type="number" class="form-control" style="width:62px" value="-1" step=".5"></div>
    </div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:6px">Question</div>
    ${_rf('qf-qt','Question text (LaTeX/HTML ok)','qf-qi')}
    <div id="qf-opts-wrap">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin:10px 0 6px">Options</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${['A','B','C','D'].map(k=>_rf('qf-o'+k,'Option '+k,'qf-oi'+k,true)).join('')}
      </div>
    </div>
    <div class="form-group" style="margin-top:10px">
      <label class="form-label">Correct Answer <span style="color:var(--c-text4);font-weight:500">(A | A,C | 42.5)</span></label>
      <input id="qf-ans" class="form-control" placeholder="e.g. B or A,C or 12.5">
    </div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--c-text4);margin-bottom:6px">Solution (optional)</div>
    ${_rf('qf-sol','Solution explanation','qf-si')}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-primary" id="qf-btn" onclick="_qfSub()">Add Question & Continue</button>
      <button class="btn btn-secondary" onclick="_qfClr()">Clear</button>
    </div>
  </div></div>`;
}

// Rich field: textarea + image upload button
function _rf(tid,ph,iid,compact=false){
  const h=compact?'44px':'64px',rows=compact?2:3;
  return`<div class="form-group" style="margin-bottom:${compact?'8px':'12px'}">
    <div style="display:flex;gap:6px;align-items:flex-start">
      <textarea id="${tid}" class="form-control" rows="${rows}" placeholder="${ph}" style="flex:1;resize:vertical;min-height:${h}"></textarea>
      <div>
        <label title="Upload image" style="display:flex;align-items:center;justify-content:center;width:36px;height:${h};background:var(--c-surface2);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--c-text3);font-size:9px;font-weight:700;flex-direction:column;gap:2px" onmouseover="this.style.borderColor='var(--c-blue)'" onmouseout="this.style.borderColor='var(--c-border)'">
          <input type="file" accept="image/*" id="${iid}-f" style="display:none" onchange="_imgUp('${iid}',this)">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>IMG
        </label>
        <div id="${iid}-p" style="width:36px;height:26px;margin-top:2px;border-radius:3px;overflow:hidden;border:1px solid var(--c-border);display:none"></div>
      </div>
    </div>
    <div id="${iid}-s" style="display:none;font-size:10px;margin-top:2px"></div>
  </div>`;
}

// ═══ THE KEY FIX: image upload uses _uploadFetch NOT FORM() ═══
window._imgUp=async function(fid,input){
  const file=input.files[0];if(!file)return;
  // Instant preview
  const reader=new FileReader();
  reader.onload=e=>{const p=document.getElementById(fid+'-p');if(p){p.style.display='block';p.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;}}
  reader.readAsDataURL(file);
  const s=document.getElementById(fid+'-s');
  if(s){s.textContent=' Uploading…';s.style.color='var(--c-blue)';s.style.display='block';}
  try{
    const fd=new FormData();fd.append('file',file);
    const r=await _uploadFetch('/api/admin/upload/image',fd);
    _imgs[fid]=r.path;
    if(s){s.textContent='✓ '+r.path.split('/').pop();s.style.color='var(--c-green)';}
    toast('Image uploaded','ok',1500);
  }catch(e){
    if(s){s.textContent='✗ '+e.message;s.style.color='var(--c-red)';}
    toast('Upload failed: '+e.message,'err',4000);
    const p=document.getElementById(fid+'-p');if(p){p.style.display='none';p.innerHTML='';}
    input.value='';
  }
};

window._qfType=function(){const t=document.getElementById('qf-type')?.value;const w=document.getElementById('qf-opts-wrap');if(w)w.style.display=t==='NUMERICAL'?'none':'';};

async function _qfSub(){
  const err=document.getElementById('qf-err'),ok=document.getElementById('qf-ok'),btn=document.getElementById('qf-btn');
  err.style.display='none';ok.style.display='none';
  if(!_dest){err.textContent='No destination selected (Step 1).';err.style.display='block';return;}
  const ans=(document.getElementById('qf-ans')?.value||'').trim();
  const qt=document.getElementById('qf-qt')?.value||'';
  const qnum=parseInt(document.getElementById('qf-num')?.value)||_qNum;
  if(!ans){err.textContent='Correct answer is required.';err.style.display='block';return;}
  if(!qt&&!_imgs['qf-qi']){err.textContent='Question text or image required.';err.style.display='block';return;}
  const payload={..._dest,
    subject:document.getElementById('qf-subj')?.value||'PHYSICS',
    question_type:document.getElementById('qf-type')?.value||'MCQ_SINGLE',
    question_number:qnum,
    question_format:(_imgs['qf-qi']&&!qt)?'IMAGE':'TEXT',
    question_text:qt||null,
    question_image_path:_imgs['qf-qi']||null,
    option_a:document.getElementById('qf-oA')?.value||null,
    option_b:document.getElementById('qf-oB')?.value||null,
    option_c:document.getElementById('qf-oC')?.value||null,
    option_d:document.getElementById('qf-oD')?.value||null,
    options_image_path:_imgs['qf-oiA']||_imgs['qf-oiB']||null,
    correct_answer:ans,
    marks_correct:parseFloat(document.getElementById('qf-mc')?.value)||4,
    marks_incorrect:parseFloat(document.getElementById('qf-mw')?.value)||-1,
    solution_format:(_imgs['qf-si']&&!document.getElementById('qf-sol')?.value)?'IMAGE':'TEXT',
    solution_text:document.getElementById('qf-sol')?.value||null,
    solution_image_path:_imgs['qf-si']||null,
  };
  delete payload.label;
  if(btn){btn.disabled=true;btn.textContent='Adding…';}
  try{
    const r=await POST('/api/admin/questions',payload);
    _qNum=qnum+1;
    if(document.getElementById('qf-num'))document.getElementById('qf-num').value=_qNum;
    ok.textContent=`✓ Q${qnum} added (ID: ${r.id}). Ready for Q${_qNum}.`;ok.style.display='block';
    _qfClr();
    document.getElementById('qform-wrap')?.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){err.textContent=e.message||String(e);err.style.display='block';}
  finally{if(btn){btn.disabled=false;btn.textContent='Add Question & Continue';}}
}

function _qfClr(){
  ['qf-qt','qf-oA','qf-oB','qf-oC','qf-oD','qf-ans','qf-sol'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  ['qf-qi','qf-oiA','qf-oiB','qf-oiC','qf-oiD','qf-si'].forEach(id=>{
    const p=document.getElementById(id+'-p');if(p){p.style.display='none';p.innerHTML='';}
    const s=document.getElementById(id+'-s');if(s){s.style.display='none';s.textContent='';}
    const f=document.getElementById(id+'-f');if(f)f.value='';
  });
  _imgs={};
}

/* ═══════════════════════════════════════════════════════════
   DPP MANAGER TAB
   ═══════════════════════════════════════════════════════════ */
function _adDpp(el){
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    ${AD.tracks.map(trk=>`
    <div class="card"><div class="card-body">
      <div style="font-size:13px;font-weight:800;color:var(--c-blue);margin-bottom:10px"> ${trk.display_name}</div>
      ${(trk.subjects||[]).map(s=>{
        const sets=s.dpp_sets||[];
        return`<div style="margin-bottom:10px;padding:10px;background:var(--c-surface2);border-radius:var(--radius);border:1px solid var(--c-border)">
          <div style="font-size:11px;font-weight:700;color:var(--c-text);margin-bottom:6px">${s.name}
            <span style="font-size:10px;color:var(--c-text4);font-weight:400"> — ${sets.length} set(s)</span>
          </div>
          ${sets.map(ds=>`<div style="margin-bottom:4px;padding:4px 8px;background:var(--c-surface);border-radius:4px;border:1px solid var(--c-border)">
            <span style="font-size:11px;font-weight:600;color:var(--c-text)">${ds.name}</span>
            <span style="font-size:10px;color:var(--c-text4);margin-left:6px">${(ds.dpps||[]).length} chapters: ${(ds.dpps||[]).map(d=>d.chapter_name||d.title).join(', ')}</span>
          </div>`).join('')}
          <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
            <input placeholder="New Set name…" id="dnqs-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);flex:1;min-width:140px">
            <button class="btn btn-secondary btn-sm" onclick="_qdSet(${s.id},'dnqs-${s.id}')">+ DPP Set</button>
          </div>
          ${sets.length?`<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            <select id="dnqss-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text)">${sets.map(ds=>`<option value="${ds.id}">${ds.name}</option>`).join('')}</select>
            <input placeholder="Chapter name…" id="dnqd-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);flex:1;min-width:140px">
            <button class="btn btn-secondary btn-sm" onclick="_qdDpp('dnqss-${s.id}','dnqd-${s.id}')">+ Chapter DPP</button>
          </div>`:''}
        </div>`;
      }).join('')}
    </div></div>`).join('')}
  </div>`;
}

window._qdSet=async function(sid,iid){
  const name=document.getElementById(iid)?.value.trim();
  if(!name){toast('Enter set name','warn');return;}
  const fd=new FormData();fd.append('subject_id',sid);fd.append('name',name);fd.append('questions_per_dpp','10');
  try{const r=await _uploadFetch('/api/admin/premium/dpp-sets',fd);toast(`"${name}" created`,'ok');document.getElementById(iid).value='';await _adLoad();_adDpp(document.getElementById('admin-body'));}
  catch(e){toast(e.message,'err');}
};

window._qdDpp=async function(ssid,iid){
  const setId=document.getElementById(ssid)?.value,ch=document.getElementById(iid)?.value.trim();
  if(!setId){toast('Select a DPP set','warn');return;}if(!ch){toast('Enter chapter name','warn');return;}
  const fd=new FormData();fd.append('dpp_set_id',setId);fd.append('title','DPP — '+ch);fd.append('chapter_name',ch);fd.append('order_index','99');fd.append('duration_minutes','30');
  try{const r=await _uploadFetch('/api/admin/premium/dpps',fd);toast(`Chapter "${ch}" added`,'ok');document.getElementById(iid).value='';await _adLoad();_adDpp(document.getElementById('admin-body'));}
  catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════
   CHAPTERWISE MANAGER TAB
   ═══════════════════════════════════════════════════════════ */
function _adChap(el){
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    ${AD.tracks.map(trk=>`
    <div class="card"><div class="card-body">
      <div style="font-size:13px;font-weight:800;color:var(--c-blue);margin-bottom:10px"> ${trk.display_name}</div>
      ${(trk.subjects||[]).map(s=>{
        const chs=(s.test_sets||[]).flatMap(ts=>(ts.chapters||[]).map(ch=>({...ch,tsId:ts.id})));
        const tsId=(s.test_sets||[])[0]?.id;
        return`<div style="margin-bottom:10px;padding:10px;background:var(--c-surface2);border-radius:var(--radius);border:1px solid var(--c-border)">
          <div style="font-size:11px;font-weight:700;color:var(--c-text);margin-bottom:4px">${s.name}
            <span style="font-size:10px;color:var(--c-text4);font-weight:400"> — ${chs.length} chapters</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">
            ${chs.map(ch=>`<span style="padding:2px 7px;background:var(--c-surface);border:1px solid var(--c-border);border-radius:3px;font-size:10px;color:var(--c-text3)">${ch.name} <span style="color:var(--c-blue)">(${(ch.modules||[]).length}M)</span></span>`).join('')}
          </div>
          ${tsId?`<div style="display:flex;gap:4px">
            <input placeholder="New chapter…" id="chnq-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);flex:1">
            <button class="btn btn-secondary btn-sm" onclick="_qCh(${tsId},'chnq-${s.id}')">+ Chapter</button>
          </div>`:'<div style="font-size:10px;color:var(--c-red)">No test set — create one in Premium Structure tab</div>'}
          ${chs.length?`<div style="display:flex;gap:4px;margin-top:4px">
            <select id="chs-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text)">${chs.map(ch=>`<option value="${ch.id}">${ch.name}</option>`).join('')}</select>
            <input placeholder="New module…" id="chm-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);flex:1">
            <button class="btn btn-secondary btn-sm" onclick="_qMod('chs-${s.id}','chm-${s.id}')">+ Module</button>
          </div>`:''}
        </div>`;
      }).join('')}
    </div></div>`).join('')}
  </div>`;
}

window._qCh=async function(tsId,iid){
  const name=document.getElementById(iid)?.value.trim();
  if(!name){toast('Enter chapter name','warn');return;}
  const fd=new FormData();fd.append('test_set_id',tsId);fd.append('name',name);fd.append('order_index','99');
  try{const r=await _uploadFetch('/api/admin/premium/chapters',fd);toast(`"${name}" added`,'ok');document.getElementById(iid).value='';await _adLoad();_adChap(document.getElementById('admin-body'));}
  catch(e){toast(e.message,'err');}
};

window._qMod=async function(ssid,iid){
  const chId=document.getElementById(ssid)?.value,name=document.getElementById(iid)?.value.trim();
  if(!chId||!name){toast('Select chapter and enter name','warn');return;}
  const fd=new FormData();fd.append('chapter_id',chId);fd.append('name',name);fd.append('order_index','99');fd.append('duration_minutes','30');
  try{const r=await _uploadFetch('/api/admin/premium/modules',fd);toast(`Module "${name}" added`,'ok');document.getElementById(iid).value='';await _adLoad();_adChap(document.getElementById('admin-body'));}
  catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════
   MOCK TESTS MANAGER TAB
   ═══════════════════════════════════════════════════════════ */
function _adMock(el){
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    ${AD.tracks.map(trk=>`
    <div class="card"><div class="card-body">
      <div style="font-size:13px;font-weight:800;color:var(--c-blue);margin-bottom:10px">🎯 ${trk.display_name}</div>
      ${(trk.subjects||[]).map(s=>`
        <div style="margin-bottom:10px;padding:10px;background:var(--c-surface2);border-radius:var(--radius);border:1px solid var(--c-border)">
          <div style="font-size:11px;font-weight:700;color:var(--c-text);margin-bottom:4px">${s.name}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px">
            ${(s.mock_tests||[]).map(mt=>`<span style="padding:2px 7px;background:var(--c-surface);border:1px solid var(--c-border);border-radius:3px;font-size:10px;color:var(--c-text3)">${mt.title} (${mt.question_count}Q)</span>`).join('') || '<span style="font-size:10px;color:var(--c-text4)">No mocks yet</span>'}
          </div>
          <div style="display:flex;gap:4px">
            <input placeholder="Mock test title…" id="mtnq-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);flex:1">
            <input type="number" value="180" id="mtnd-${s.id}" style="padding:4px 8px;border:1px solid var(--c-border);border-radius:4px;font-size:11px;background:var(--c-surface);color:var(--c-text);width:70px" placeholder="min">
            <button class="btn btn-secondary btn-sm" onclick="_qMt(${s.id},'mtnq-${s.id}','mtnd-${s.id}')">+ Mock</button>
          </div>
        </div>`).join('')}
    </div></div>`).join('')}
  </div>`;
}

window._qMt=async function(sid,tid,did){
  const title=document.getElementById(tid)?.value.trim(),dur=document.getElementById(did)?.value||180;
  if(!title){toast('Enter title','warn');return;}
  const fd=new FormData();fd.append('subject_id',sid);fd.append('title',title);fd.append('duration_minutes',dur);fd.append('order_index','99');
  try{const r=await _uploadFetch('/api/admin/premium/mock-tests',fd);toast(`"${title}" created`,'ok');document.getElementById(tid).value='';await _adLoad();_adMock(document.getElementById('admin-body'));}
  catch(e){toast(e.message,'err');}
};

/* ═══════════════════════════════════════════════════════════
   PYQ STRUCTURE
   ═══════════════════════════════════════════════════════════ */
function _adPyq(el){
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:10px">Current PYQ Structure</div>
      <div style="max-height:250px;overflow-y:auto">
        ${AD.exams.map(e=>`<div style="margin-bottom:8px">
          <div style="font-size:12px;font-weight:800;color:var(--c-blue)">${e.display_name}</div>
          ${(e.years||[]).sort((a,b)=>b.year-a.year).map(y=>`<div style="padding-left:12px;margin-top:3px">
            <span style="font-size:11px;font-weight:700">${y.year}</span>
            <span style="font-size:10px;color:var(--c-text4);margin-left:6px">${(y.shifts||[]).map(s=>s.label+'('+s.question_count+'Q)').join(', ')}</span>
          </div>`).join('')}
        </div>`).join('')}
      </div>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:10px">Add Year</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0"><label class="form-label">Exam</label>
          <select id="ps-ex" class="form-control">${AD.exams.map(e=>`<option value="${e.id}">${e.display_name}</option>`).join('')}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Year</label>
          <input id="ps-yr" type="number" class="form-control" placeholder="e.g. 2027"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_psAddYear()">Add Year</button>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:10px">Add Shift/Paper</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0"><label class="form-label">Exam</label>
          <select id="ps2-ex" class="form-control" onchange="_ps2ExCh()">${AD.exams.map(e=>`<option value="${e.id}">${e.display_name}</option>`).join('')}</select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Year</label>
          <select id="ps2-yr" class="form-control"></select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Shift Label</label>
          <input id="ps2-lbl" class="form-control" placeholder="e.g. Jan 26 Shift 1"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_psAddShift()">Add Shift</button>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:10px">Create Exam Type</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group" style="margin:0"><label class="form-label">Type</label>
          <select id="ps3-t" class="form-control"><option value="JEE_MAIN">JEE Main</option><option value="JEE_ADVANCED">JEE Advanced</option><option value="NEET">NEET</option></select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Display Name</label>
          <input id="ps3-n" class="form-control" placeholder="e.g. NEET UG 2026"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="_psCreateExam()">Create Exam</button>
    </div></div>
  </div>`;
  setTimeout(_ps2ExCh,50);
}

window._psAddYear=async function(){const eid=document.getElementById('ps-ex').value,yr=document.getElementById('ps-yr').value;if(!eid||!yr){toast('Fill all','warn');return;}const fd=new FormData();fd.append('exam_id',eid);fd.append('year',yr);try{await _uploadFetch('/api/admin/years',fd);toast(`Year ${yr} added`,'ok');document.getElementById('ps-yr').value='';await _adLoad();_adPyq(document.getElementById('admin-body'));}catch(e){toast(e.message,'err');}};
window._ps2ExCh=function(){const id=document.getElementById('ps2-ex')?.value,e=AD.exams.find(e=>e.id==id);const s=document.getElementById('ps2-yr');if(!s)return;s.innerHTML=(e?.years||[]).sort((a,b)=>b.year-a.year).map(y=>`<option value="${y.id}">${y.year}</option>`).join('');};
window._psAddShift=async function(){const yid=document.getElementById('ps2-yr').value,lbl=document.getElementById('ps2-lbl').value.trim();if(!yid||!lbl){toast('Fill all','warn');return;}const fd=new FormData();fd.append('year_id',yid);fd.append('label',lbl);try{await _uploadFetch('/api/admin/shifts',fd);toast('Shift added','ok');document.getElementById('ps2-lbl').value='';await _adLoad();_adPyq(document.getElementById('admin-body'));}catch(e){toast(e.message,'err');}};
window._psCreateExam=async function(){const t=document.getElementById('ps3-t').value,n=document.getElementById('ps3-n').value.trim();if(!n){toast('Enter name','warn');return;}const fd=new FormData();fd.append('type',t);fd.append('display_name',n);try{await _uploadFetch('/api/admin/exams',fd);toast('Exam created','ok');await _adLoad();_adPyq(document.getElementById('admin-body'));}catch(e){toast(e.message,'err');}};

/* ═══════════════════════════════════════════════════════════
   MEDIA UPLOAD
   ═══════════════════════════════════════════════════════════ */
function _adMedia(el){
  el.innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px">Upload Image</div>
      <div style="font-size:11px;color:var(--c-text4);margin-bottom:10px">For question/solution images. Path is auto-copied to clipboard.</div>
      <input id="mdi-f" type="file" accept="image/*" class="form-control" style="margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="_mdiUp()">Upload Image</button>
      <div id="mdi-r" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm);word-break:break-all"></div>
    </div></div>
    <div class="card"><div class="card-body">
      <div style="font-size:12px;font-weight:800;margin-bottom:4px">Upload PDF</div>
      <input id="mdp-f" type="file" accept="application/pdf" class="form-control" style="margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="_mdpUp()">Upload PDF</button>
      <div id="mdp-r" style="display:none;margin-top:8px;font-size:11px;font-weight:600;padding:8px;background:var(--c-green-l);color:var(--c-green);border-radius:var(--radius-sm);word-break:break-all"></div>
    </div></div>
  </div>`;
}

window._mdiUp=async function(){
  const f=document.getElementById('mdi-f')?.files[0];
  if(!f){toast('Select an image','warn');return;}
  const btn=event?.target;if(btn){btn.disabled=true;btn.textContent='Uploading…';}
  try{const fd=new FormData();fd.append('file',f);const r=await _uploadFetch('/api/admin/upload/image',fd);const el=document.getElementById('mdi-r');if(el){el.textContent='✓ Path: '+r.path;el.style.display='block';}navigator.clipboard?.writeText(r.path).catch(()=>{});toast('Uploaded! Path copied.','ok');}
  catch(e){toast('Failed: '+e.message,'err');}
  finally{if(btn){btn.disabled=false;btn.textContent='Upload Image';}}
};

window._mdpUp=async function(){
  const f=document.getElementById('mdp-f')?.files[0];
  if(!f){toast('Select a PDF','warn');return;}
  const btn=event?.target;if(btn){btn.disabled=true;btn.textContent='Uploading…';}
  try{const fd=new FormData();fd.append('file',f);const r=await _uploadFetch('/api/admin/upload/pdf',fd);const el=document.getElementById('mdp-r');if(el){el.textContent='✓ Path: '+r.path;el.style.display='block';}navigator.clipboard?.writeText(r.path).catch(()=>{});toast('PDF uploaded!','ok');}
  catch(e){toast('Failed: '+e.message,'err');}
  finally{if(btn){btn.disabled=false;btn.textContent='Upload PDF';}}
};

/* NEWS */
function _adNews(el){el.innerHTML=`<div class="card"><div class="card-body"><div style="font-size:12px;font-weight:800;margin-bottom:12px">Post News</div><div class="form-group"><label class="form-label">Headline</label><input id="an-t" class="form-control" placeholder="e.g. JEE Main 2026 Answer Key Released"></div><div class="form-group"><label class="form-label">Category</label><select id="an-c" class="form-control"><option value="">General</option><option value="JEE_MAIN">JEE Main</option><option value="JEE_ADVANCED">JEE Advanced</option><option value="NEET">NEET</option></select></div><div class="form-group"><label class="form-label">Body</label><textarea id="an-b" class="form-control" rows="5"></textarea></div><button class="btn btn-primary btn-sm" onclick="_anPost()">Publish</button></div></div>`;}
window._anPost=async function(){const t=document.getElementById('an-t').value.trim();if(!t){toast('Headline required','warn');return;}try{await POST('/api/news/',{title:t,body:document.getElementById('an-b').value||null,exam_type:document.getElementById('an-c').value||null});toast('Published','ok');document.getElementById('an-t').value='';document.getElementById('an-b').value='';}catch(e){toast(e.message,'err');}};

/* STATS */
function _adStats(el){const s=AD.stats||{};el.innerHTML=`<div class="stat-grid">${[['Users',s.total_users||0,'var(--c-blue)'],['Premium',s.active_premium||0,'var(--c-green)'],['Attempts',s.total_attempts||0,'var(--c-purple)'],['Questions',s.total_questions||0,'var(--c-amber)']].map(([l,v,c])=>`<div class="stat-card"><div class="stat-val" style="color:${c}">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}</div>`;}

/* USERS */
async function _adUsers(el){
  el.innerHTML='<div class="loading-center"><div class="spinner"></div></div>';
  try{
    const[ov,da]=await Promise.all([GET('/api/leaderboard/overall?limit=20'),GET('/api/leaderboard/daily?limit=20')]);
    el.innerHTML=`<div style="display:flex;flex-direction:column;gap:14px">
      <div class="card" style="overflow:hidden"><div style="padding:10px 14px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800">Top Users</div>
      <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>#</th><th>User</th><th>Tests</th><th>Qs</th><th>Streak</th><th>Acc%</th></tr></thead>
      <tbody>${ov.map(r=>`<tr><td style="font-weight:800">${r.rank}</td><td><div style="font-size:12px;font-weight:600">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td><td>${r.total_tests}</td><td>${r.total_questions}</td><td style="color:var(--c-amber);font-weight:700">${r.streak_days}d</td><td>${r.accuracy.toFixed(1)}%</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="overflow:hidden"><div style="padding:10px 14px;background:var(--c-surface2);border-bottom:1px solid var(--c-border);font-size:12px;font-weight:800">Today</div>
      <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>#</th><th>User</th><th>Qs</th><th>Score</th></tr></thead>
      <tbody>${da.map(r=>`<tr><td style="font-weight:800">${r.rank}</td><td><div style="font-size:12px;font-weight:600">${r.full_name||'—'}</div><div style="font-size:10px;color:var(--c-text4)">${r.email}</div></td><td style="font-weight:800;color:var(--c-blue)">${r.daily_questions_solved}</td><td>${r.daily_score.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>`;
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-sub">${e.message}</div></div>`;}
}
