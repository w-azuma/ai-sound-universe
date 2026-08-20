// Wraps the Web Audio API: either a microphone stream or a decoded file,
// exposing smoothed low/mid/high energy bands plus an overall level.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.freqData = null;
    this.source = null; // MediaStreamAudioSourceNode or MediaElementAudioSourceNode
    this.audioEl = null; // present only in "file" mode
    this.mode = null; // 'mic' | 'file'

    this.bands = { low: 0, mid: 0, high: 0, level: 0 };
    this._smoothed = { low: 0, mid: 0, high: 0, level: 0 };
  }

  async _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.75;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
  }

  async useMicrophone() {
    await this._teardownSource();
    await this._ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.mode = "mic";
    this._micStream = stream;
    return true;
  }

  async useFile(file) {
    await this._teardownSource();
    await this._ensureContext();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.crossOrigin = "anonymous";
    el.loop = true;
    this.audioEl = el;
    this.source = this.ctx.createMediaElementSource(el);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.mode = "file";
    await el.play();
    return true;
  }

  async _teardownSource() {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        /* ignore */
      }
      this.source = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
      this.audioEl = null;
    }
    this.mode = null;
  }

  togglePlayback() {
    if (!this.audioEl) return;
    if (this.audioEl.paused) this.audioEl.play();
    else this.audioEl.pause();
  }

  seek(fraction) {
    if (!this.audioEl || !isFinite(this.audioEl.duration)) return;
    this.audioEl.currentTime = fraction * this.audioEl.duration;
  }

  get progress() {
    if (!this.audioEl || !isFinite(this.audioEl.duration) || this.audioEl.duration === 0) return 0;
    return this.audioEl.currentTime / this.audioEl.duration;
  }

  get isPlaying() {
    return !!this.audioEl && !this.audioEl.paused;
  }

  get times() {
    if (!this.audioEl) return { current: 0, duration: 0 };
    return {
      current: this.audioEl.currentTime || 0,
      duration: isFinite(this.audioEl.duration) ? this.audioEl.duration : 0,
    };
  }

  // Call once per frame. Returns smoothed { low, mid, high, level } in [0,1].
  update() {
    if (!this.analyser) return this._smoothed;
    this.analyser.getByteFrequencyData(this.freqData);

    const n = this.freqData.length;
    const lowEnd = Math.floor(n * 0.1);
    const midEnd = Math.floor(n * 0.4);

    const avg = (from, to) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += this.freqData[i];
      return sum / Math.max(1, to - from) / 255;
    };

    const raw = {
      low: avg(0, lowEnd),
      mid: avg(lowEnd, midEnd),
      high: avg(midEnd, n),
    };
    raw.level = (raw.low + raw.mid + raw.high) / 3;

    const k = 0.35; // attack/decay smoothing
    for (const key of ["low", "mid", "high", "level"]) {
      this._smoothed[key] += (raw[key] - this._smoothed[key]) * k;
    }
    return this._smoothed;
  }
}
