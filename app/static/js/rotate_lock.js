/**
 * rotate_lock.js
 * Shows a fullscreen overlay asking the user to rotate to landscape
 * during exam mode on mobile portrait orientation.
 * Injects the overlay DOM if not present.
 */
(function() {
  function ensureOverlay() {
    if (document.getElementById('rotate-lock')) return;
    const div = document.createElement('div');
    div.id = 'rotate-lock';
    div.innerHTML = `
      <div class="rotate-icon">📱</div>
      <p>Please rotate your device to <strong>landscape</strong> for the best exam experience.</p>
    `;
    document.body.appendChild(div);
  }

  function check() {
    if (!document.body.classList.contains('exam-mode')) return;
    ensureOverlay();
    const overlay = document.getElementById('rotate-lock');
    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile   = window.innerWidth <= 900 || 'ontouchstart' in window;
    if (isMobile && isPortrait) {
      overlay.style.display = 'flex';
    } else {
      overlay.style.display = 'none';
    }
  }

  window.addEventListener('resize',      check);
  window.addEventListener('orientationchange', check);
  document.addEventListener('DOMContentLoaded', check);
})();