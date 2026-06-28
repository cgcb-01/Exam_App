/* ════════════════════════════════════════════════════
   OMR.JS — Popup OMR sheet (standard mode)
   ════════════════════════════════════════════════════ */
const OMR={
  qs:[],answers:{},cb:null,
  open(qs,answers,cb){
    this.qs=qs;this.answers=answers;this.cb=cb;
    _ensureOMRPrintStyles();
    openModal('OMR Answer Sheet',this._html(),
      `<button class="btn btn-secondary" onclick="closeModal()">Close</button>
       <button class="btn btn-secondary" onclick="window.print()">🖨 Print</button>`);
  },
  _html(){
    const bySubj={},sOrd=[];
    this.qs.forEach(q=>{if(!bySubj[q.subject]){bySubj[q.subject]=[];sOrd.push(q.subject);}bySubj[q.subject].push(q);});
    let h=`<div class="omr-modal-body" id="omr-sheet">
      <div class="omr-header-strip">
        <div class="omr-institution">EXAMPREP — ONLINE TEST PLATFORM</div>
        <div class="omr-exam-name">Optical Mark Recognition Sheet</div>
      </div>
      <div class="omr-info-row">
        <div class="omr-field-row"><label>Name:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label>Roll No:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label>Date:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label>Shift:</label><div class="omr-field-line"></div></div>
      </div>`;
    sOrd.forEach(subj=>{
      const mcqs=this.qs.filter(q=>q.subject===subj&&q.question_type!=='NUMERICAL');
      const nums=this.qs.filter(q=>q.subject===subj&&q.question_type==='NUMERICAL');
      h+=`<div class="omr-section-h">${subj}</div>`;
      if(mcqs.length){
        h+=`<div style="font-size:9px;font-weight:700;color:#555;margin-bottom:6px;text-transform:uppercase">Section A — Multiple Choice (* = multiple correct)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px" id="omr-mcq-${subj}">`;
        mcqs.forEach(q=>{
          const sel=new Set((this.answers[q.id]?.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
          const isMulti=q.question_type==='MCQ_MULTIPLE';
          h+=`<div class="omr-bubble-row"><div class="omr-q-label">Q${q.question_number}${isMulti?'*':''}.</div>
            <div class="omr-bubbles">${['A','B','C','D'].map(o=>`<div class="omr-bubble ${sel.has(o)?'filled':''}" onclick="OMR._bc(${q.id},'${o}',${isMulti})">${o}</div>`).join('')}</div>
          </div>`;
        });
        h+=`</div>`;
      }
      if(nums.length){
        h+=`<div style="font-size:9px;font-weight:700;color:#555;margin:10px 0 6px;text-transform:uppercase">Section B — Numerical Value</div>`;
        nums.forEach(q=>{
          const val=this.answers[q.id]?.sel||'';
          const neg=val.startsWith('-'),raw=val.replace('-','');
          const dot=raw.indexOf('.');
          let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
          let dp=dot>=0?raw.slice(dot+1).split(''):[];
          while(ip.length<4)ip.unshift('');while(dp.length<2)dp.push('');
          h+=`<div class="omr-num-row"><div class="omr-q-label">Q${q.question_number}.</div>
            <div class="omr-digit-boxes">
              <div class="omr-digit" onclick="OMR._ts(${q.id})" title="Sign" style="font-size:13px;font-weight:900">${neg?'−':'+'}</div>
              ${ip.map((d,i)=>`<div class="omr-digit ${d?'filled-num':''}" onclick="OMR._ed(${q.id},'int',${i})">${d||'·'}</div>`).join('')}
              <div class="omr-dot">.</div>
              ${dp.map((d,i)=>`<div class="omr-digit ${d?'filled-num':''}" onclick="OMR._ed(${q.id},'dec',${i})">${d||'·'}</div>`).join('')}
            </div>
          </div>`;
        });
      }
    });
    const cnt={ANSWERED:0,NOT_ANSWERED:0,NOT_VISITED:0,MARKED_FOR_REVIEW:0};
    Object.values(this.answers).forEach(a=>{if(a&&cnt[a.status]!==undefined)cnt[a.status]++;});
    h+=`<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
      <div style="padding:6px;background:#d4edda;border-radius:4px"><div style="font-size:18px;font-weight:900;color:#155724">${cnt.ANSWERED}</div><div style="font-size:9px;color:#155724;font-weight:700">ANSWERED</div></div>
      <div style="padding:6px;background:#f8d7da;border-radius:4px"><div style="font-size:18px;font-weight:900;color:#721c24">${cnt.NOT_ANSWERED+cnt.NOT_VISITED}</div><div style="font-size:9px;color:#721c24;font-weight:700">NOT ANSWERED</div></div>
      <div style="padding:6px;background:#fff3cd;border-radius:4px"><div style="font-size:18px;font-weight:900;color:#856404">${cnt.MARKED_FOR_REVIEW}</div><div style="font-size:9px;color:#856404;font-weight:700">MARKED</div></div>
    </div>
    <div style="margin-top:10px;padding:7px 10px;background:#fff3cd;border-radius:4px;border:1px solid #ffc107;font-size:10px;color:#856404">
      Instructions: Fill bubbles completely. Do not use pencil. One bubble per question unless marked *.
    </div></div>`;
    return h;
  },
  _bc(qId,opt,isMulti){
    if(!this.answers[qId])this.answers[qId]={sel:null,status:'NOT_ANSWERED',time:0};
    const ans=this.answers[qId];
    if(isMulti){const sel=new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));sel.has(opt)?sel.delete(opt):sel.add(opt);ans.sel=[...sel].sort().join(',')||null;}
    else ans.sel=ans.sel===opt?null:opt;
    ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
    if(this.cb)this.cb(qId,ans);
    document.getElementById('modal-body').innerHTML=this._html();
  },
  _ts(qId){
    const ans=this.answers[qId];if(!ans?.sel)return;
    ans.sel=ans.sel.startsWith('-')?ans.sel.slice(1):'-'+ans.sel;
    if(this.cb)this.cb(qId,ans);
    document.getElementById('modal-body').innerHTML=this._html();
  },
  _ed(qId,part,idx){
    const v=prompt('Enter digit (0-9):');if(v===null)return;
    const d=v.trim().replace(/[^0-9]/g,'').charAt(0)||'';
    const ans=this.answers[qId];if(!ans)return;
    const cur=ans.sel||'',neg=cur.startsWith('-'),raw=cur.replace('-','');
    const dot=raw.indexOf('.');
    let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
    let dp=dot>=0?raw.slice(dot+1).split(''):[];
    while(ip.length<4)ip.unshift('');while(dp.length<2)dp.push('');
    if(part==='int')ip[idx]=d;else dp[idx]=d;
    const iStr=ip.join('').replace(/^0+/,'')||'0',dStr=dp.join('').replace(/0+$/,'');
    const newVal=(neg?'-':'')+iStr+(dStr?'.'+dStr:'');
    ans.sel=(newVal==='0'||newVal==='-0')?null:newVal;
    ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
    if(this.cb)this.cb(qId,ans);
    document.getElementById('modal-body').innerHTML=this._html();
  }
};

function _ensureOMRPrintStyles(){
  if(document.getElementById('omr-ps'))return;
  const s=document.createElement('style');s.id='omr-ps';
  s.textContent=`@media print{#app,#toast-wrap,.modal-head,.modal-foot{display:none!important}.modal-bg{position:static!important;background:none!important}.modal-box{box-shadow:none!important;border:none!important;max-width:100%!important}}`;
  document.head.appendChild(s);
}
