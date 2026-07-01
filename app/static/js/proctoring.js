/**
 * proctoring.js — Optional camera/mic proctoring
 * Sends frame snapshots every 10s to /proctor/check-frame
 */
class Proctor {
  constructor(submissionId, onWarning) {
    this.submissionId = submissionId;
    this.onWarning    = onWarning || (() => {});
    this.stream       = null;
    this.interval     = null;
    this.enabled      = false;
    this._video       = null;
    this._canvas      = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
        audio: true,
      });
      this._video  = document.createElement('video');
      this._canvas = document.createElement('canvas');
      this._canvas.width  = 320;
      this._canvas.height = 240;
      this._video.srcObject = this.stream;
      this._video.play();
      this.enabled = true;

      // Enable toggle indicator
      document.getElementById('proctor-status')?.classList.add('active');

      this.interval = setInterval(() => this._checkFrame(), 10000);
    } catch (e) {
      console.warn('Proctoring unavailable:', e.message);
    }
  }

  stop() {
    this.enabled = false;
    clearInterval(this.interval);
    this.stream?.getTracks().forEach(t => t.stop());
    document.getElementById('proctor-status')?.classList.remove('active');
  }

  async _checkFrame() {
    if (!this.enabled || !this._video || !this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    ctx.drawImage(this._video, 0, 0, 320, 240);
    const frame = this._canvas.toDataURL('image/jpeg', 0.5);
    try {
      const res = await window.AIC.apiPost('/proctor/check-frame', {
        submission_id: this.submissionId,
        frame,
      });
      if (res.warning) this.onWarning(res.warnings);
    } catch(e) {}
  }
}

window.Proctor = Proctor;