const OMR = {
  qs: [], answers: {}, cb: null,
  open(qs, answers, cb) {
    this.qs=qs; this.answers=answers; this.cb=cb;
    openModal('OMR Answer Sheet', this._html(), `
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-secondary" onclick="window.print()">Print OMR</button>`);
  },
  _html() {
    const mcq=this.qs.filter(q=>q.question_type!=='NUMERICAL');
    const num=this.qs.filter(q=>q.question_type==='NUMERICAL');
    return `<div class="omr-modal-body">
      <div class="omr-header-strip">
        <div class="omr-institution">EXAMPREP — ONLINE TEST PLATFORM</div>
        <div class="omr-exam-name">Optical Mark Recognition Sheet</div>
      </div>
      <div class="omr-info-row">
        <div class="omr-field-row"><label style="white-space:nowrap">Name:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label style="white-space:nowrap">Roll No:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label style="white-space:nowrap">Date:</label><div class="omr-field-line"></div></div>
        <div class="omr-field-row"><label style="white-space:nowrap">Shift:</label><div class="omr-field-line"></div></div>
      </div>
      ${mcq.length?`<div class="omr-section-h">Section A — Multiple Choice</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px" id="omr-mcq">
        ${mcq.map(q=>{
          const sel=new Set((this.answers[q.id]?.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
          return `<div class="omr-bubble-row">
            <div class="omr-q-label">Q${q.question_number}.</div>
            <div class="omr-bubbles">${['A','B','C','D'].map(o=>`
              <div class="omr-bubble ${sel.has(o)?'filled':''}" onclick="OMR._bubbleClick(${q.id},'${o}',${q.question_type==='MCQ_MULTIPLE'})">${o}</div>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`:''}
      ${num.length?`<div class="omr-section-h" style="margin-top:14px">Section B — Numerical Value</div>
      ${num.map(q=>{
        const val=this.answers[q.id]?.sel||'';
        const neg=val.startsWith('-'); const raw=val.replace('-','');
        const dot=raw.indexOf('.');
        let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
        let dp=dot>=0?raw.slice(dot+1).split(''):[];
        while(ip.length<4)ip.unshift(''); while(dp.length<2)dp.push('');
        return `<div class="omr-num-row">
          <div class="omr-q-label">Q${q.question_number}.</div>
          <div class="omr-digit-boxes">
            <div class="omr-digit" onclick="OMR._toggleSign(${q.id})" title="Toggle sign" style="font-size:14px;font-weight:800">${neg?'−':' '}</div>
            ${ip.map((d,i)=>`<div class="omr-digit" onclick="OMR._editDigit(${q.id},'int',${i})">${d}</div>`).join('')}
            <div class="omr-dot">.</div>
            ${dp.map((d,i)=>`<div class="omr-digit" onclick="OMR._editDigit(${q.id},'dec',${i})">${d}</div>`).join('')}
          </div>
        </div>`;
      }).join('')}`:''}
      <div style="margin-top:14px;padding:10px 12px;background:#fff3cd;border-radius:6px;border:1px solid #ffc107;font-size:11px;color:#856404">
        Instructions: Fill bubbles completely. Do not use pencil. Do not make stray marks. Each question has only one correct answer unless marked [Multi].
      </div>
    </div>`;
  },
  _bubbleClick(qId, opt, isMulti) {
    if (!this.answers[qId]) this.answers[qId]={sel:null,status:'NOT_ANSWERED',time:0};
    const ans=this.answers[qId];
    if (isMulti) {
      const sel=new Set((ans.sel||'').split(',').map(s=>s.trim()).filter(Boolean));
      sel.has(opt)?sel.delete(opt):sel.add(opt);
      ans.sel=[...sel].sort().join(',')||null;
    } else {
      ans.sel=ans.sel===opt?null:opt;
    }
    ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
    if (this.cb) this.cb(qId, ans);
    document.getElementById('modal-body').innerHTML=this._html();
  },
  _toggleSign(qId) {
    const ans=this.answers[qId]; if (!ans?.sel) return;
    ans.sel=ans.sel.startsWith('-')?ans.sel.slice(1):'-'+ans.sel;
    if (this.cb) this.cb(qId,ans);
    document.getElementById('modal-body').innerHTML=this._html();
  },
  _editDigit(qId, part, idx) {
    const v=prompt('Enter digit (0-9):'); if (v===null) return;
    const d=v.trim().replace(/[^0-9]/g,'').charAt(0)||'';
    const ans=this.answers[qId]; const cur=ans?.sel||'';
    const neg=cur.startsWith('-'); const raw=cur.replace('-','');
    const dot=raw.indexOf('.');
    let ip=dot>=0?raw.slice(0,dot).split(''):raw.split('');
    let dp=dot>=0?raw.slice(dot+1).split(''):[];
    while(ip.length<4)ip.unshift(''); while(dp.length<2)dp.push('');
    if(part==='int')ip[idx]=d; else dp[idx]=d;
    const iStr=ip.join('').replace(/^0+/,'')||'0';
    const dStr=dp.join('').replace(/0+$/,'');
    const newVal=(neg?'-':'')+iStr+(dStr?'.'+dStr:'');
    ans.sel=newVal==='0'||newVal==='-0'?null:newVal;
    ans.status=ans.sel?'ANSWERED':'NOT_ANSWERED';
    if (this.cb) this.cb(qId, ans);
    document.getElementById('modal-body').innerHTML=this._html();
  }
};
