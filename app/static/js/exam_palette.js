/**
 * exam_palette.js
 * JEE-style question palette: tracks state per question,
 * handles save/mark/clear/navigate actions.
 * Communicates with backend via /exams/{id}/save-answer.
 */
class ExamPalette {
  constructor(config) {
    this.examId       = config.examId;
    this.submissionId = config.submissionId;
    this.totalQ       = config.totalQ;
    this.currentQ     = 0;
    // States: 'not_visited'|'not_answered'|'answered'|'marked'|'answered_marked'
    this.states       = Array(config.totalQ).fill('not_visited');
    this.answers      = Array(config.totalQ).fill(null);
    this.timings      = Array(config.totalQ).fill(0);
    this._startTime   = Date.now();
    this._render();
  }

  _render() {
    const grid = document.getElementById('palette-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this.states.forEach((state, i) => {
      const btn = document.createElement('button');
      btn.className = `palette-btn ${state} ${i === this.currentQ ? 'current' : ''}`;
      btn.textContent = i + 1;
      btn.onclick = () => this.navigateTo(i);
      grid.appendChild(btn);
    });
  }

  navigateTo(index) {
    this._recordTime();
    this.currentQ = index;
    this._startTime = Date.now();
    if (this.states[index] === 'not_visited') {
      this.states[index] = 'not_answered';
    }
    document.dispatchEvent(new CustomEvent('palette:navigate', { detail: { index } }));
    this._render();
  }

  setAnswer(index, answer) {
    this.answers[index] = answer;
    if (this.states[index] === 'marked' || this.states[index] === 'answered_marked') {
      this.states[index] = 'answered_marked';
    } else {
      this.states[index] = answer !== null ? 'answered' : 'not_answered';
    }
    this._render();
    this._saveAnswer(index, 'unattempted');
  }

  markForReview(index, withAnswer = false) {
    this.states[index] = withAnswer && this.answers[index] !== null
      ? 'answered_marked'
      : 'marked';
    this._render();
    this._saveAnswer(index, 'marked_review');
  }

  clearResponse(index) {
    this.answers[index] = null;
    this.states[index]  = 'not_answered';
    this._render();
    this._saveAnswer(index, 'unattempted');
  }

  _recordTime() {
    this.timings[this.currentQ] += Math.round((Date.now() - this._startTime) / 1000);
  }

  async _saveAnswer(index, status) {
    const qId = document.querySelector(`[data-q-index="${index}"]`)?.dataset.qId;
    if (!qId) return;
    try {
      await window.AIC.apiPost(`/exams/${this.examId}/save-answer`, {
        submission_id: this.submissionId,
        question_id:   qId,
        answer:        this.answers[index],
        status,
        time_spent:    this.timings[index],
      });
    } catch(e) {
      console.warn('Save answer error:', e);
    }
  }

  getSummary() {
    return {
      answered:  this.states.filter(s => s === 'answered' || s === 'answered_marked').length,
      marked:    this.states.filter(s => s === 'marked' || s === 'answered_marked').length,
      not_answered: this.states.filter(s => s === 'not_answered').length,
      not_visited:  this.states.filter(s => s === 'not_visited').length,
    };
  }
}

window.ExamPalette = ExamPalette;