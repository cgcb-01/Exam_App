/**
 * omr_input.js
 * NEET OMR bubble interaction:
 * - Click a bubble to fill/unfill
 * - Once filled, clicking a different bubble in the same row switches
 * - Builds omrSnapshot = { "Q1": "A", ... } for submission
 */
class OMRInput {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.snapshot  = {};   // { "Q1": "A", ... }
    if (this.container) this._bindEvents();
  }

  _bindEvents() {
    this.container.addEventListener('click', (e) => {
      const bubble = e.target.closest('.omr-bubble');
      if (!bubble) return;

      const row    = bubble.closest('.omr-question-row');
      const qNum   = row?.dataset.qNum;
      const option = bubble.dataset.option;
      if (!qNum || !option) return;

      const prevFilled = row.querySelector('.omr-bubble.filled');
      const alreadyThis = prevFilled === bubble;

      // Unfill all in row
      row.querySelectorAll('.omr-bubble').forEach(b => {
        b.classList.remove('filled');
        b.setAttribute('aria-checked', 'false');
      });

      if (!alreadyThis) {
        bubble.classList.add('filled');
        bubble.setAttribute('aria-checked', 'true');
        this.snapshot[`Q${qNum}`] = option;
      } else {
        delete this.snapshot[`Q${qNum}`];
      }

      document.dispatchEvent(new CustomEvent('omr:change', {
        detail: { qNum, option: alreadyThis ? null : option, snapshot: this.snapshot }
      }));
    });
  }

  getSnapshot() { return { ...this.snapshot }; }

  getAnsweredCount() { return Object.keys(this.snapshot).length; }
}

window.OMRInput = OMRInput;