/**
 * omr.js — Interactive OMR sheet overlay.
 * Renders a printable/interactive OMR with bubble filling for MCQ
 * and digit-box entry for numerical questions, synced with exam_engine state.
 */

const OMR = {
  questions: [],
  answers: {},
  onAnswerChange: null,

  open(questions, answers, onAnswerChange) {
    this.questions = questions;
    this.answers   = answers;
    this.onAnswerChange = onAnswerChange;
    this._render();
    document.getElementById('omr-overlay').classList.add('active');
  },

  close() {
    document.getElementById('omr-overlay').classList.remove('active');
  },

  _render() {
    const mcqQs = this.questions.filter(q => ['MCQ_SINGLE','MCQ_MULTIPLE','MATRIX_MATCH'].includes(q.question_type));
    const numQs = this.questions.filter(q => q.question_type === 'NUMERICAL');

    document.getElementById('omr-sheet-body').innerHTML = `
      <div class="omr-title">OMR ANSWER SHEET</div>
      <div class="omr-subtitle">Fill bubbles completely • Use dark pen only • Do NOT use pencil or correction fluid</div>
      <hr class="omr-divider">

      <div class="omr-info-grid">
        <div class="omr-field"><label>Name:</label><div class="omr-field-line"></div></div>
        <div class="omr-field"><label>Roll No:</label><div class="omr-field-line"></div></div>
        <div class="omr-field"><label>Date:</label><div class="omr-field-line"></div></div>
        <div class="omr-field"><label>Shift:</label><div class="omr-field-line"></div></div>
      </div>

      ${mcqQs.length ? this._renderMCQSection(mcqQs) : ''}
      ${numQs.length ? this._renderNumericalSection(numQs) : ''}

      <div class="omr-actions">
        <button class="btn btn-secondary" onclick="OMR.close()">Close</button>
        <button class="btn btn-primary" onclick="window.print()">🖨 Print OMR</button>
      </div>`;
  },

  _renderMCQSection(qs) {
    const bySubject = {};
    qs.forEach(q => {
      if (!bySubject[q.subject]) bySubject[q.subject] = [];
      bySubject[q.subject].push(q);
    });

    let html = `<div class="omr-section-title">Section A — Multiple Choice Questions</div>`;

    Object.entries(bySubject).forEach(([subj, sqs]) => {
      html += `<div style="font-size:.8rem;font-weight:700;color:#555;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.05em;">${subj}</div>`;
      // 2-column layout
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">`;
      sqs.forEach(q => {
        const ans = this.answers[q.id];
        const sel = new Set((ans?.selected_answer || '').split(',').map(x=>x.trim()).filter(Boolean));
        const opts = q.question_type === 'MCQ_MULTIPLE' ? ['A','B','C','D'] : ['A','B','C','D'];
        html += `
          <div class="omr-mcq-row">
            <span class="omr-q-num">Q${q.question_number}.</span>
            <div class="omr-bubbles">
              ${opts.map(o => `
                <div class="omr-bubble ${sel.has(o)?'filled':''}"
                     onclick="OMR._toggleBubble(${q.id},'${o}',${q.question_type==='MCQ_MULTIPLE'})">
                  ${o}
                </div>`).join('')}
            </div>
            ${q.question_type==='MCQ_MULTIPLE' ? '<span style="font-size:.65rem;color:#888;margin-left:4px;">[Multi]</span>' : ''}
          </div>`;
      });
      html += `</div>`;
    });
    return html;
  },

  _renderNumericalSection(qs) {
    let html = `<div class="omr-section-title" style="margin-top:14px;">Section B — Numerical Value Questions</div>`;
    html += `<div style="font-size:.75rem;color:#666;margin-bottom:8px;">Enter answer in the digit boxes. Use ± box for sign. Leave unused boxes blank.</div>`;

    qs.forEach(q => {
      const ans = this.answers[q.id];
      const val = ans?.selected_answer || '';
      // Parse into sign + digits
      const isNeg   = val.startsWith('-');
      const digits  = val.replace('-','').split('');
      const dotIdx  = digits.indexOf('.');
      let intPart   = dotIdx >= 0 ? digits.slice(0, dotIdx) : digits;
      let decPart   = dotIdx >= 0 ? digits.slice(dotIdx+1)  : [];
      while (intPart.length < 4) intPart.unshift('');
      while (decPart.length < 2) decPart.push('');

      html += `
        <div class="omr-num-row">
          <span class="omr-q-num">Q${q.question_number}.</span>
          <div class="omr-num-boxes">
            <div class="omr-num-box" onclick="OMR._toggleSign(${q.id})" title="±">${isNeg?'−':''}</div>
            ${intPart.map((d,i) => `<div class="omr-num-box" onclick="OMR._editNumBox(${q.id},'int',${i})" id="omr-int-${q.id}-${i}">${d}</div>`).join('')}
            <div class="omr-num-dot">.</div>
            ${decPart.map((d,i) => `<div class="omr-num-box" onclick="OMR._editNumBox(${q.id},'dec',${i})" id="omr-dec-${q.id}-${i}">${d}</div>`).join('')}
          </div>
        </div>`;
    });
    return html;
  },

  _toggleBubble(qId, opt, isMulti) {
    if (!this.answers[qId]) this.answers[qId] = { selected_answer: null, status: 'NOT_VISITED', time_spent: 0 };
    const ans = this.answers[qId];
    if (isMulti) {
      const sel = new Set((ans.selected_answer||'').split(',').map(x=>x.trim()).filter(Boolean));
      sel.has(opt) ? sel.delete(opt) : sel.add(opt);
      ans.selected_answer = [...sel].sort().join(',') || null;
    } else {
      ans.selected_answer = (ans.selected_answer === opt) ? null : opt;
    }
    ans.status = ans.selected_answer ? 'ANSWERED' : 'NOT_ANSWERED';
    if (this.onAnswerChange) this.onAnswerChange(qId, ans);
    this._render();
  },

  _toggleSign(qId) {
    const ans = this.answers[qId];
    if (!ans?.selected_answer) return;
    ans.selected_answer = ans.selected_answer.startsWith('-')
      ? ans.selected_answer.slice(1) : '-' + ans.selected_answer;
    if (this.onAnswerChange) this.onAnswerChange(qId, ans);
    this._render();
  },

  _editNumBox(qId, part, idx) {
    const v = prompt('Enter digit (0-9) or leave blank:');
    if (v === null) return;
    const digit = v.trim().replace(/[^0-9]/g,'').charAt(0) || '';
    const ans   = this.answers[qId];
    const cur   = ans?.selected_answer || '';
    const isNeg = cur.startsWith('-');
    const raw   = cur.replace('-','');
    const dotIdx= raw.indexOf('.');
    let intArr  = (dotIdx >= 0 ? raw.slice(0,dotIdx) : raw).split('');
    let decArr  = (dotIdx >= 0 ? raw.slice(dotIdx+1)  : '').split('');
    while (intArr.length < 4) intArr.unshift('');
    while (decArr.length < 2) decArr.push('');

    if (part === 'int') intArr[idx] = digit;
    else decArr[idx] = digit;

    const intStr = intArr.join('').replace(/^0+/,'') || '0';
    const decStr = decArr.join('').replace(/0+$/,'');
    const newVal = (isNeg ? '-' : '') + intStr + (decStr ? '.' + decStr : '');
    ans.selected_answer = newVal === '0' || newVal === '-0' ? null : newVal;
    ans.status = ans.selected_answer ? 'ANSWERED' : 'NOT_ANSWERED';
    if (this.onAnswerChange) this.onAnswerChange(qId, ans);
    this._render();
  },
};
