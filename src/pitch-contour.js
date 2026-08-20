// Plots recent F0 (converted to MIDI note number for a musically even y-axis)
// as a scrolling contour line — useful for seeing intonation/prosody shape.
export class PitchContour {
  constructor(canvas, { historyLen = 240, minMidi = 36, maxMidi = 84 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.historyLen = historyLen;
    this.minMidi = minMidi;
    this.maxMidi = maxMidi;
    this.history = new Array(historyLen).fill(null);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.width = w;
    this.height = h;
  }

  push(freq, confidence) {
    let midi = null;
    if (freq && confidence > 0.35) {
      midi = 69 + 12 * Math.log2(freq / 440);
    }
    this.history.push(midi);
    if (this.history.length > this.historyLen) this.history.shift();
  }

  render() {
    const { ctx, width, height } = this;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);

    // faint octave gridlines
    ctx.strokeStyle = "rgba(242,239,233,0.06)";
    for (let m = this.minMidi; m <= this.maxMidi; m += 12) {
      const y = height - ((m - this.minMidi) / (this.maxMidi - this.minMidi)) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.beginPath();
    let started = false;
    const step = width / (this.historyLen - 1);
    this.history.forEach((midi, i) => {
      const x = i * step;
      if (midi == null) {
        started = false;
        return;
      }
      const clamped = Math.min(this.maxMidi, Math.max(this.minMidi, midi));
      const y = height - ((clamped - this.minMidi) / (this.maxMidi - this.minMidi)) * height;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = "#ff9466";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}
