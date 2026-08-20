import { colormap } from "./colormap.js";

// Scrolling waterfall spectrogram: log-scaled frequency axis (20Hz–~20kHz),
// color-mapped intensity. Scrolls right-to-left one column per frame.
export class Spectrogram {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minFreq = 20;
    this.maxFreq = 20000;
    this.minDb = -100;
    this.maxDb = -10;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
    this.ctx.fillStyle = "#0a0912";
    this.ctx.fillRect(0, 0, w, h);
  }

  render(freqDb, binHz) {
    const { ctx, width, height } = this;
    if (!width || !height) return;

    // shift existing image one pixel to the left using the canvas as its own source
    ctx.drawImage(this.canvas, 1, 0, width - 1, height, 0, 0, width - 1, height);

    const nyquist = binHz * freqDb.length;
    const maxFreq = Math.min(this.maxFreq, nyquist);
    const logMin = Math.log(this.minFreq);
    const logMax = Math.log(maxFreq);

    for (let y = 0; y < height; y++) {
      const frac = 1 - y / height; // top of canvas = high frequency
      const freq = Math.exp(logMin + frac * (logMax - logMin));
      const bin = Math.min(freqDb.length - 1, Math.max(0, Math.round(freq / binHz)));
      const db = freqDb[bin];
      const t = Math.min(1, Math.max(0, (db - this.minDb) / (this.maxDb - this.minDb)));
      const [r, g, b] = colormap(t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(width - 1, y, 1, 1);
    }
  }
}
