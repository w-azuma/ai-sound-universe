// A hand-picked, colorblind-safe, perceptually-ordered gradient (viridis-inspired):
// dark violet -> blue -> teal -> green -> yellow. Avoids red/green-only contrast
// so it stays legible for the most common forms of color vision deficiency.

const STOPS = [
  [0.0, [13, 8, 38]],
  [0.15, [42, 27, 94]],
  [0.32, [59, 82, 139]],
  [0.48, [38, 130, 142]],
  [0.65, [53, 172, 116]],
  [0.82, [148, 203, 74]],
  [1.0, [253, 231, 37]],
];

export function colormap(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return [r, g, b];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function colormapCSS(t) {
  const [r, g, b] = colormap(t);
  return `rgb(${r},${g},${b})`;
}

export function cssGradientString() {
  return STOPS.map(([t, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(t * 100)}%`).join(", ");
}
