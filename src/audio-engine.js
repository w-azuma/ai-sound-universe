// Core signal analysis, shared by both the fireworks visual and the instrument
// panels. Produces, once per animation frame:
//  - dBFS frequency spectrum + time-domain samples
//  - Peak/RMS loudness, spectral centroid (Hz) and flatness (0..1 noise-likeness)
//  - a normalized onset/flux value for transient ("sudden/loud sound") detection
//  - smoothed low/mid/high energy bands (0..1) for driving the visual

export class AudioEngine {
  constructor({ fftSize = 2048 } = {}) {
    this.ctx = null;
    this.analyser = null;
    this.fftSize = fftSize;
    this.freqDb = null;
    this.timeData = null;
    this.mode = null; // 'mic' | 'file'
    this.audioEl = null;
    this.source = null;
    this._micStream = null;
    this._prevMag = null;
    this._lastOnsetAt = 0;
    this._smoothedBands = { low: 0, mid: 0, high: 0, level: 0 };
  }

  async _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.35;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;
      this.freqDb = new Float32Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this._prevMag = new Float32Array(this.analyser.frequencyBinCount);
    }
  }

  async useMicrophone() {
    await this._teardown();
    await this._ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this._micStream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.mode = "mic";
  }

  async useFile(file) {
    await this._teardown();
    await this._ensureContext();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    this.audioEl = el;
    this.source = this.ctx.createMediaElementSource(el);
    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.mode = "file";
    await el.play();
  }

  async _teardown() {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {}
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

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  get binHz() {
    return this.analyser ? this.sampleRate / this.analyser.fftSize : 0;
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

  // sensitivity: 0..100 (UI slider) -> lower onset threshold as it increases
  update(sensitivity = 55) {
    if (!this.analyser) return null;

    this.analyser.getFloatFrequencyData(this.freqDb);
    this.analyser.getFloatTimeDomainData(this.timeData);

    // --- loudness (time domain) ---
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = this.timeData[i];
      sumSq += v * v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-8));
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-8));

    // --- spectral features + band energies (frequency domain) ---
    const n = this.freqDb.length;
    const { minDecibels, maxDecibels } = this.analyser;
    const range = maxDecibels - minDecibels;

    let magSum = 0;
    let weightedFreq = 0;
    let logSum = 0;
    let flux = 0;

    const lowEnd = Math.floor(n * 0.1);
    const midEnd = Math.floor(n * 0.4);
    let lowNorm = 0;
    let midNorm = 0;
    let highNorm = 0;

    for (let i = 0; i < n; i++) {
      const db = this.freqDb[i];
      const mag = Math.pow(10, db / 20); // linear magnitude
      const freq = i * this.binHz;
      magSum += mag;
      weightedFreq += mag * freq;
      logSum += Math.log(mag + 1e-8);

      const diff = mag - this._prevMag[i];
      if (diff > 0) flux += diff;
      this._prevMag[i] = mag;

      const norm = Math.min(1, Math.max(0, (db - minDecibels) / range));
      if (i < lowEnd) lowNorm += norm;
      else if (i < midEnd) midNorm += norm;
      else highNorm += norm;
    }
    lowNorm /= Math.max(1, lowEnd);
    midNorm /= Math.max(1, midEnd - lowEnd);
    highNorm /= Math.max(1, n - midEnd);

    const centroidHz = magSum > 1e-6 ? weightedFreq / magSum : 0;
    const meanMag = magSum / n;
    const geoMean = Math.exp(logSum / n);
    const flatness = meanMag > 1e-8 ? Math.min(1, geoMean / meanMag) : 0;
    const fluxNorm = flux / n;

    // smoothed bands for the visual (attack/decay filter)
    const k = 0.35;
    const rawLevel = (lowNorm + midNorm + highNorm) / 3;
    const sb = this._smoothedBands;
    sb.low += (lowNorm - sb.low) * k;
    sb.mid += (midNorm - sb.mid) * k;
    sb.high += (highNorm - sb.high) * k;
    sb.level += (rawLevel - sb.level) * k;

    // onset / transient detection with a refractory window
    const now = performance.now();
    const threshold = 0.02 + (1 - sensitivity / 100) * 0.12;
    let onset = false;
    if (fluxNorm > threshold && now - this._lastOnsetAt > 180) {
      onset = true;
      this._lastOnsetAt = now;
    }

    return {
      freqDb: this.freqDb,
      timeData: this.timeData,
      binHz: this.binHz,
      sampleRate: this.sampleRate,
      peakDb,
      rmsDb,
      centroidHz,
      flatness,
      fluxNorm,
      onset,
      bands: sb,
    };
  }
}
