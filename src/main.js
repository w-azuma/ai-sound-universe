import './style.css';
import * as THREE from 'three';

/* ======================================================================
   DOM refs
   ====================================================================== */
const els = {
  setup: document.getElementById('setup'),
  btnMic: document.getElementById('btn-mic'),
  fileInput: document.getElementById('file-input'),

  topbar: document.getElementById('topbar'),
  sourceLabel: document.getElementById('source-label'),
  btnInstruments: document.getElementById('btn-instruments'),
  btnContrast: document.getElementById('btn-contrast'),
  btnSource: document.getElementById('btn-source'),

  playbar: document.getElementById('playbar'),
  btnPlayPause: document.getElementById('btn-playpause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  scrub: document.getElementById('scrub'),
  time: document.getElementById('time'),

  drawer: document.getElementById('drawer'),
  sensitivity: document.getElementById('sensitivity'),
  calibration: document.getElementById('calibration'),

  spectrogram: document.getElementById('spectrogram'),
  spectrum: document.getElementById('spectrum'),
  centroidReadout: document.getElementById('centroid-readout'),

  pitchNote: document.getElementById('pitch-note'),
  pitchHz: document.getElementById('pitch-hz'),
  pitchCents: document.getElementById('pitch-cents'),
  pitchContour: document.getElementById('pitch-contour'),

  meterPeak: document.getElementById('meter-peak'),
  meterRms: document.getElementById('meter-rms'),
  peakValue: document.getElementById('peak-value'),
  rmsValue: document.getElementById('rms-value'),
  classificationTag: document.getElementById('classification-tag'),

  eventLog: document.getElementById('event-log'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnExportPng: document.getElementById('btn-export-png'),
  btnClearLog: document.getElementById('btn-clear-log'),

  alertFlash: document.getElementById('alert-flash'),
  alertBanner: document.getElementById('alert-banner'),
  alertIcon: document.getElementById('alert-icon'),
  alertText: document.getElementById('alert-text'),

  sceneCanvas: document.getElementById('scene'),
};

/* ======================================================================
   Small utilities
   ====================================================================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function dbFromLinear(v) {
  if (v <= 0) return -Infinity;
  return 20 * Math.log10(v);
}

function formatDb(db) {
  if (!isFinite(db)) return '-∞ dB';
  return `${db.toFixed(1)} dB`;
}

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 4-stop perceptual-ish colormap used for the spectrogram / colorbar
const COLORMAP_STOPS = [
  { t: 0.0, c: [10, 14, 28] },
  { t: 0.3, c: [43, 58, 143] },
  { t: 0.55, c: [47, 166, 161] },
  { t: 0.78, c: [231, 163, 62] },
  { t: 1.0, c: [226, 97, 78] },
];
function colormap(t) {
  t = clamp(t, 0, 1);
  for (let i = 0; i < COLORMAP_STOPS.length - 1; i++) {
    const a = COLORMAP_STOPS[i];
    const b = COLORMAP_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const lt = (t - a.t) / (b.t - a.t || 1);
      return [
        Math.round(lerp(a.c[0], b.c[0], lt)),
        Math.round(lerp(a.c[1], b.c[1], lt)),
        Math.round(lerp(a.c[2], b.c[2], lt)),
      ];
    }
  }
  return COLORMAP_STOPS[COLORMAP_STOPS.length - 1].c;
}

// map a frequency (Hz) to a hue (deg) used for fireworks + UI accents:
// low = warm (gold/coral), mid = teal/green, high = violet/blue
function hueFromFrequency(freq) {
  const f = clamp(freq, 60, 6000);
  const t = Math.log(f / 60) / Math.log(6000 / 60); // 0..1 log scale
  // 0 -> 20deg (coral/gold), 0.5 -> 175deg (teal), 1 -> 260deg (violet)
  if (t < 0.5) return lerp(20, 175, t / 0.5);
  return lerp(175, 262, (t - 0.5) / 0.5);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function freqToNote(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return { name: `${name}${octave}`, cents };
}

/* ======================================================================
   Starfield + Fireworks (three.js)
   ====================================================================== */
class FireworksScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);

    this.sparkTexture = this.makeSparkTexture();

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    this.rockets = []; // rising trails before explosion
    this.bursts = []; // exploded particle systems

    this.ambient = 0; // smoothed ambient volume 0..1, drives starfield twinkle

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  makeSparkTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  makeStars() {
    const count = 500;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random();
      positions[i * 3 + 1] = Math.random();
      positions[i * 3 + 2] = 0;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starPhases = phases;
    const mat = new THREE.PointsMaterial({
      size: 2.4,
      map: this.sparkTexture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: new THREE.Color('#c9d3ff'),
      sizeAttenuation: false,
    });
    return new THREE.Points(geo, mat);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    // stars stored as 0..1 -> scale to viewport
    const pos = this.stars.geometry.attributes.position;
    if (!this._starsBase) {
      this._starsBase = pos.array.slice();
    }
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] = this._starsBase[i * 3] * w;
      pos.array[i * 3 + 1] = this._starsBase[i * 3 + 1] * h;
    }
    pos.needsUpdate = true;
  }

  // Launch a rocket that rises then explodes into a burst.
  // intensity: 0..1 (loudness), hue: degrees, spiky: bool (sharp/percussive sound)
  launch(intensity, hue, spiky) {
    const x = this.width * (0.18 + Math.random() * 0.64);
    const startY = 0;
    const apexY = this.height * (0.45 + intensity * 0.32 + Math.random() * 0.08);
    const rocket = {
      x,
      y: startY,
      apexY,
      t: 0,
      duration: 480 + Math.random() * 220,
      intensity,
      hue,
      spiky,
      trail: [],
    };
    this.rockets.push(rocket);
  }

  explode(rocket) {
    const { x, y, intensity, hue, spiky } = rocket;
    const count = spiky
      ? Math.round(46 + intensity * 90)
      : Math.round(28 + intensity * 55);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 2);
    const sizes = new Float32Array(count);

    const baseColor = new THREE.Color().setHSL(hue / 360, 0.75, 0.58);
    const altColor = new THREE.Color().setHSL(((hue + (spiky ? 35 : 12)) % 360) / 360, 0.7, 0.62);

    const baseSpeed = (spiky ? 2.6 : 1.5) + intensity * (spiky ? 3.4 : 2.1);

    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (spiky ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.15);
      const speedJitter = spiky ? 0.55 + Math.random() * 0.9 : 0.8 + Math.random() * 0.3;
      const speed = baseSpeed * speedJitter;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = 0;
      velocities[i * 2] = Math.cos(a) * speed;
      velocities[i * 2 + 1] = Math.sin(a) * speed;
      const mixed = Math.random() < 0.35 ? altColor : baseColor;
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
      sizes[i] = (spiky ? 2.2 : 3.4) + Math.random() * (2 + intensity * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 6,
      map: this.sparkTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.bursts.push({
      points,
      velocities,
      life: 1,
      decay: spiky ? 0.011 + Math.random() * 0.006 : 0.008 + Math.random() * 0.004,
      gravity: 0.045 + Math.random() * 0.02,
      drag: 0.988,
      count,
    });
  }

  update(dtMs, ambientVolume) {
    this.ambient = lerp(this.ambient, ambientVolume, 0.08);

    // twinkle stars a bit faster/brighter with ambient sound
    const starMat = this.stars.material;
    starMat.opacity = 0.35 + Math.sin(performance.now() * 0.0015) * 0.08 + this.ambient * 0.35;

    // rockets: rise then explode
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dtMs;
      const p = clamp(r.t / r.duration, 0, 1);
      const ease = 1 - Math.pow(1 - p, 2);
      r.y = lerp(0, r.apexY, ease);
      if (p >= 1) {
        this.explode(r);
        this.rockets.splice(i, 1);
      }
    }

    // bursts: physics + fade
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      const pos = b.points.geometry.attributes.position;
      for (let j = 0; j < b.count; j++) {
        b.velocities[j * 2] *= b.drag;
        b.velocities[j * 2 + 1] = b.velocities[j * 2 + 1] * b.drag - b.gravity;
        pos.array[j * 3] += b.velocities[j * 2];
        pos.array[j * 3 + 1] += b.velocities[j * 2 + 1];
      }
      pos.needsUpdate = true;
      b.life -= b.decay;
      b.points.material.opacity = clamp(b.life, 0, 1);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.bursts.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* ======================================================================
   Canvas panels: spectrogram / spectrum / pitch contour
   ====================================================================== */
class SpectrogramPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width));
    this.canvas.height = Math.max(1, Math.round(rect.height));
  }
  push(freqData) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    // shift existing image left by 1px
    ctx.drawImage(canvas, -1, 0);
    const n = freqData.length;
    // draw newest column on the right, log-scaled frequency bins
    for (let y = 0; y < h; y++) {
      const t = 1 - y / h; // top = high freq
      const logIndex = Math.pow(t, 2.2) * (n - 1);
      const idx = Math.max(0, Math.min(n - 1, Math.round(logIndex)));
      const v = freqData[idx] / 255;
      const [r, g, b] = colormap(v);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(w - 1, y, 1, 1);
    }
  }
}

class SpectrumPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width));
    this.canvas.height = Math.max(1, Math.round(rect.height));
  }
  draw(freqData, hue) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const n = freqData.length;
    const bars = Math.min(96, n);
    const barW = w / bars;
    const color = `hsl(${hue}, 70%, 62%)`;
    ctx.fillStyle = color;
    for (let i = 0; i < bars; i++) {
      // log-scaled bin sampling for a more musical look
      const t0 = i / bars;
      const t1 = (i + 1) / bars;
      const idx0 = Math.floor(Math.pow(t0, 2) * (n - 1));
      const idx1 = Math.max(idx0 + 1, Math.floor(Math.pow(t1, 2) * (n - 1)));
      let sum = 0;
      let cnt = 0;
      for (let k = idx0; k <= idx1 && k < n; k++) { sum += freqData[k]; cnt++; }
      const v = cnt ? sum / cnt / 255 : 0;
      const barH = v * h;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    }
    ctx.globalAlpha = 1;
  }
}

class PitchContourPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.history = [];
    this.maxPoints = 120;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width));
    this.canvas.height = Math.max(1, Math.round(rect.height));
  }
  push(freqOrNull) {
    this.history.push(freqOrNull);
    if (this.history.length > this.maxPoints) this.history.shift();
    this.draw();
  }
  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const minF = 60;
    const maxF = 1200;
    ctx.strokeStyle = '#e7a33e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    this.history.forEach((f, i) => {
      const x = (i / (this.maxPoints - 1)) * w;
      if (!f) { started = false; return; }
      const t = clamp((Math.log(f) - Math.log(minF)) / (Math.log(maxF) - Math.log(minF)), 0, 1);
      const y = h - t * h;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

/* ======================================================================
   Pitch detection (autocorrelation)
   ====================================================================== */
function detectPitch(buffer, sampleRate) {
  const n = buffer.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null; // too quiet to detect reliably

  // trim to a power-of-two-ish window and remove DC offset
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buffer[i];
  mean /= n;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += (buffer[i] - mean) * (buffer[i + lag] - mean);
    }
    c[lag] = sum;
  }

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;

  let maxVal = -Infinity;
  let maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0) return null;

  // parabolic interpolation around the peak
  const x0 = maxPos < 1 ? maxPos : maxPos - 1;
  const x2 = maxPos + 1 < n ? maxPos + 1 : maxPos;
  let betterPos = maxPos;
  if (x0 !== maxPos && x2 !== maxPos) {
    const s0 = c[x0], s1 = c[maxPos], s2 = c[x2];
    const denom = (s0 - 2 * s1 + s2);
    if (denom !== 0) betterPos = maxPos + 0.5 * (s0 - s2) / denom;
  }

  const freq = sampleRate / betterPos;
  if (freq < 50 || freq > 1600) return null;
  return freq;
}

/* ======================================================================
   Main App
   ====================================================================== */
class App {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.audioEl = null;
    this.mode = null; // 'mic' | 'file'

    this.freqData = null;
    this.timeData = null;

    this.smoothedRms = 0;
    this.lastRmsForOnset = 0;
    this.lastOnsetTime = 0;

    this.eventLog = [];
    this.running = false;
    this.lastFrameTime = performance.now();

    this.scene = new FireworksScene(els.sceneCanvas);
    this.spectrogramPanel = new SpectrogramPanel(els.spectrogram);
    this.spectrumPanel = new SpectrumPanel(els.spectrum);
    this.pitchPanel = new PitchContourPanel(els.pitchContour);

    this.bindUI();
  }

  bindUI() {
    els.btnMic.addEventListener('click', () => this.startMic());
    els.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.startFile(file);
    });

    els.btnInstruments.addEventListener('click', () => {
      els.drawer.classList.toggle('hidden');
      els.btnInstruments.classList.toggle('active');
      els.btnInstruments.textContent = els.drawer.classList.contains('hidden') ? '計器 ▸' : '計器 ▾';
    });

    els.btnContrast.addEventListener('click', () => {
      document.body.classList.toggle('high-contrast');
      els.btnContrast.classList.toggle('active');
    });

    els.btnSource.addEventListener('click', () => this.returnToSetup());

    els.btnPlayPause.addEventListener('click', () => {
      if (!this.audioEl) return;
      if (this.audioEl.paused) this.audioEl.play();
      else this.audioEl.pause();
    });

    els.scrub.addEventListener('input', () => {
      if (!this.audioEl || !isFinite(this.audioEl.duration)) return;
      const frac = Number(els.scrub.value) / 1000;
      this.audioEl.currentTime = frac * this.audioEl.duration;
    });

    els.btnExportCsv.addEventListener('click', () => this.exportCsv());
    els.btnExportPng.addEventListener('click', () => this.exportPng());
    els.btnClearLog.addEventListener('click', () => this.clearLog());
  }

  async ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
  }

  setupAnalyser() {
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeData = new Float32Array(this.analyser.fftSize);
  }

  async startMic() {
    try {
      await this.ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.setupAnalyser();
      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);
      this.mode = 'mic';
      this.mediaStream = stream;

      els.sourceLabel.textContent = 'マイク入力';
      this.enterMainView(false);
    } catch (err) {
      alert('マイクを使用できませんでした。ブラウザの設定でマイクへのアクセスを許可してください。');
    }
  }

  async startFile(file) {
    await this.ensureAudioContext();
    this.setupAnalyser();

    if (!this.audioEl) {
      this.audioEl = document.createElement('audio');
      this.audioEl.crossOrigin = 'anonymous';
      document.body.appendChild(this.audioEl);
      this.audioEl.addEventListener('timeupdate', () => this.updatePlaybar());
      this.audioEl.addEventListener('loadedmetadata', () => this.updatePlaybar());
      this.audioEl.addEventListener('play', () => this.setPlayIcon(true));
      this.audioEl.addEventListener('pause', () => this.setPlayIcon(false));
      this.audioEl.addEventListener('ended', () => this.setPlayIcon(false));
      this.fileSourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
      this.fileSourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }

    const url = URL.createObjectURL(file);
    this.audioEl.src = url;
    this.mode = 'file';
    els.sourceLabel.textContent = file.name;
    this.audioEl.play();
    this.enterMainView(true);
  }

  enterMainView(showPlaybar) {
    els.setup.classList.add('hidden');
    els.topbar.classList.remove('hidden');
    els.drawer.classList.remove('hidden');
    els.btnInstruments.classList.add('active');
    els.btnInstruments.textContent = '計器 ▾';
    els.playbar.classList.toggle('hidden', !showPlaybar);
    if (!this.running) {
      this.running = true;
      this.lastFrameTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  returnToSetup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    this.mode = null;
    els.setup.classList.remove('hidden');
    els.topbar.classList.add('hidden');
    els.playbar.classList.add('hidden');
    els.fileInput.value = '';
  }

  setPlayIcon(isPlaying) {
    els.iconPlay.style.display = isPlaying ? 'none' : '';
    els.iconPause.style.display = isPlaying ? '' : 'none';
  }

  updatePlaybar() {
    if (!this.audioEl || !isFinite(this.audioEl.duration)) return;
    const frac = this.audioEl.currentTime / this.audioEl.duration;
    els.scrub.value = String(Math.round(frac * 1000));
    els.time.textContent = formatTime(this.audioEl.currentTime);
  }

  spectralCentroid(freqData, sampleRate, fftSize) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < freqData.length; i++) {
      const freq = (i * sampleRate) / fftSize;
      const mag = freqData[i] / 255;
      num += freq * mag;
      den += mag;
    }
    return den > 0 ? num / den : 0;
  }

  classify(centroid) {
    if (centroid < 300) return { label: '低音 (Low)', hue: hueFromFrequency(180) };
    if (centroid < 2000) return { label: '中音 (Mid)', hue: hueFromFrequency(900) };
    return { label: '高音 (High)', hue: hueFromFrequency(3500) };
  }

  logEvent(type, levelDb, timeSec) {
    const entry = { t: timeSec, type, level: levelDb };
    this.eventLog.push(entry);
    const li = document.createElement('li');
    li.innerHTML = `<span class="ev-time">${formatTime(timeSec)}</span><span class="ev-type">${type}</span><span class="ev-level">${formatDb(levelDb)}</span>`;
    els.eventLog.appendChild(li);
    els.eventLog.scrollTop = els.eventLog.scrollHeight;
    // keep DOM list bounded
    while (els.eventLog.children.length > 200) els.eventLog.removeChild(els.eventLog.firstChild);
  }

  flashAlert(text) {
    els.alertText.textContent = text;
    els.alertBanner.classList.remove('hidden');
    els.alertFlash.style.transition = 'none';
    els.alertFlash.style.opacity = '0.9';
    requestAnimationFrame(() => {
      els.alertFlash.style.transition = 'opacity 0.6s ease';
      els.alertFlash.style.opacity = '0';
    });
    clearTimeout(this._alertTimer);
    this._alertTimer = setTimeout(() => els.alertBanner.classList.add('hidden'), 1300);
  }

  exportCsv() {
    if (!this.eventLog.length) return;
    const rows = ['time_sec,type,level_db'];
    for (const e of this.eventLog) rows.push(`${e.t.toFixed(2)},${e.type},${e.level.toFixed(1)}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'soundsight-events.csv';
    a.click();
  }

  exportPng() {
    const url = els.sceneCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soundsight-scene.png';
    a.click();
  }

  clearLog() {
    this.eventLog = [];
    els.eventLog.innerHTML = '';
  }

  loop(now) {
    if (!this.running) return;
    const dt = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getFloatTimeDomainData(this.timeData);

      // --- level metering ---
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const v = this.timeData[i];
        sumSq += v * v;
        const av = Math.abs(v);
        if (av > peak) peak = av;
      }
      const rms = Math.sqrt(sumSq / this.timeData.length);
      const calOffset = Number(els.calibration.value) || 0;
      const rmsDb = clamp(dbFromLinear(rms) + calOffset, -60, 0);
      const peakDb = clamp(dbFromLinear(peak) + calOffset, -60, 0);

      els.meterRms.style.width = `${((rmsDb + 60) / 60) * 100}%`;
      els.meterPeak.style.width = `${((peakDb + 60) / 60) * 100}%`;
      els.rmsValue.textContent = formatDb(rmsDb);
      els.peakValue.textContent = formatDb(peakDb);

      this.smoothedRms = lerp(this.smoothedRms, rms, 0.25);

      // --- spectral centroid / classification ---
      const centroid = this.spectralCentroid(this.freqData, this.audioCtx.sampleRate, this.analyser.fftSize);
      els.centroidReadout.textContent = `重心 ${Math.round(centroid)} Hz`;
      const cls = this.classify(centroid);
      els.classificationTag.textContent = this.smoothedRms > 0.008 ? cls.label : '待機中';
      els.classificationTag.classList.toggle('active', this.smoothedRms > 0.008);

      // --- pitch ---
      const freq = detectPitch(this.timeData, this.audioCtx.sampleRate);
      if (freq) {
        const note = freqToNote(freq);
        els.pitchNote.textContent = note.name;
        els.pitchHz.textContent = `${freq.toFixed(1)} Hz`;
        els.pitchCents.textContent = `${note.cents > 0 ? '+' : ''}${note.cents} cent`;
      } else {
        els.pitchNote.textContent = '—';
        els.pitchHz.textContent = '— Hz';
        els.pitchCents.textContent = '— cent';
      }
      this.pitchPanel.push(freq);

      // --- panels ---
      this.spectrogramPanel.push(this.freqData);
      this.spectrumPanel.draw(this.freqData, cls.hue);

      // --- onset / firework trigger ---
      const sensitivity = Number(els.sensitivity.value) / 100; // 0..1
      const threshold = lerp(0.09, 0.008, sensitivity); // higher sensitivity -> lower threshold
      const delta = rms - this.lastRmsForOnset;
      const nowSec = this.mode === 'file' && this.audioEl ? this.audioEl.currentTime : now / 1000;
      const minGapMs = 160;

      if (delta > threshold && rms > 0.02 && now - this.lastOnsetTime > minGapMs) {
        this.lastOnsetTime = now;
        const intensity = clamp((peakDb + 50) / 50, 0.12, 1); // -50..0dB -> 0..1
        const spiky = delta > threshold * 2.2 || peakDb > -6;
        this.scene.launch(intensity, cls.hue, spiky);
        this.logEvent(cls.label, peakDb, nowSec);
        this.flashAlert(`${cls.label} を検出`);
      }
      this.lastRmsForOnset = lerp(this.lastRmsForOnset, rms, 0.35);
    }

    this.scene.update(dt, this.smoothedRms * 6);
    requestAnimationFrame((t) => this.loop(t));
  }
}

new App();
