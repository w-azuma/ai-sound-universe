// Time-domain autocorrelation pitch detector (ACF2+ style, range-limited for speed)
// plus Hz -> musical note name / cents-deviation conversion.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function detectPitch(buf, sampleRate, { minFreq = 60, maxFreq = 1000 } = {}) {
  const SIZE = buf.length;

  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return { freq: null, confidence: 0 };

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(SIZE - 2, Math.floor(sampleRate / minFreq));

  let bestLag = -1;
  let bestVal = -1;
  const c = new Float32Array(maxLag + 2);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = SIZE - lag;
    for (let j = 0; j < limit; j += 2) {
      // stride 2: halves compute cost, negligible accuracy loss for pitch tracking
      sum += buf[j] * buf[j + lag];
    }
    c[lag] = sum;
    if (sum > bestVal) {
      bestVal = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= minLag || bestLag >= maxLag) return { freq: null, confidence: 0 };

  // parabolic interpolation around the peak for sub-sample precision
  const x1 = c[bestLag - 1] ?? bestVal;
  const x2 = bestVal;
  const x3 = c[bestLag + 1] ?? bestVal;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const refinedLag = a !== 0 ? bestLag - b / (2 * a) : bestLag;

  const freq = sampleRate / refinedLag;

  // normalize confidence against zero-lag energy
  let energy = 0;
  for (let i = 0; i < SIZE; i++) energy += buf[i] * buf[i];
  const confidence = energy > 0 ? Math.max(0, Math.min(1, bestVal / energy)) : 0;

  if (freq < minFreq || freq > maxFreq) return { freq: null, confidence: 0 };
  return { freq, confidence };
}

export function freqToNote(freq) {
  if (!freq || freq <= 0) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return { name: `${name}${octave}`, cents };
}
