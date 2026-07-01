/**
 * exam_timer.js — Countdown timer for exam sessions.
 * Usage: <div id="exam-timer" data-seconds="10800"></div>
 */
(function() {
  const timerEl = document.getElementById('exam-timer');
  if (!timerEl) return;

  let remaining = parseInt(timerEl.dataset.seconds || '0', 10);

  // Try to restore from sessionStorage (page refresh recovery)
  const storageKey = `aic_timer_${timerEl.dataset.submissionId || 'exam'}`;
  const savedEnd   = sessionStorage.getItem(storageKey);
  if (savedEnd) {
    remaining = Math.max(0, Math.round((parseInt(savedEnd,10) - Date.now()) / 1000));
  } else {
    sessionStorage.setItem(storageKey, Date.now() + remaining * 1000);
  }

  function tick() {
    if (remaining <= 0) {
      timerEl.textContent = '00:00';
      timerEl.className = 'countdown danger';
      sessionStorage.removeItem(storageKey);
      // Auto-submit
      document.dispatchEvent(new CustomEvent('exam:timeout'));
      return;
    }

    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    timerEl.textContent = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    if (remaining <= 300)      timerEl.className = 'countdown danger';
    else if (remaining <= 900) timerEl.className = 'countdown warning';
    else                       timerEl.className = 'countdown';

    remaining--;
  }

  tick();
  const interval = setInterval(tick, 1000);
  // Clean up if page unloads
  window.addEventListener('beforeunload', () => clearInterval(interval));
})();