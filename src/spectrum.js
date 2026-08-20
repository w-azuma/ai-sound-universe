export class SpectrumView {
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
  }

  render(freqDb, binHz) {
    const { ctx, width, height } = this;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);

    const nyquist = binHz * freqDb.length;
    const maxFreq = Math.min(this.maxFreq, nyquist);
    const logMin = Math.log(this.minFreq);
    const logMax = Math.log(maxFreq);

    // gridlines at 100Hz, 1kHz, 10kHz
    ctx.strokeStyle = "rgba(242,239,233,0.08)";
    ctx.fillStyle = "rgba(242,239,233,0.35)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    [100, 1000, 10000].forEach((f) => {
      if (f < this.minFreq || f > maxFreq) return;
      const x = ((Math.log(f) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 4, height - 6);
    });

    // spectrum line + fill
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const frac = x / width;
      const freq = Math.exp(logMin + frac * (logMax - logMin));
      const bin = Math.min(freqDb.length - 1, Math.max(0, Math.round(freq / binHz)));
      const db = freqDb[bin];
      const t = Math.min(1, Math.max(0, (db - this.minDb) / (this.maxDb - this.minDb)));
      const y = height - t * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#6fe3d9";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(111,227,217,0.35)");
    grad.addColorStop(1, "rgba(111,227,217,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();
  }
}
