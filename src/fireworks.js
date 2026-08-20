import * as THREE from "three";

// A night-sky fireworks show. Rockets rise with a spark trail, then burst into
// one of several shapes/colors chosen by what the sound is doing (loudness,
// tonal vs noisy, low vs high). A faint mirrored copy underneath reads as a
// reflection on still water.

const GROUND_Y = -6;
const SKY_X = 11; // horizontal launch range
const SKY_Z = 4; // depth jitter
const APEX_MIN = 6;
const APEX_MAX = 13;

const PALETTES = {
  voice: [0xff7a94, 0xffb36b, 0xff5da8], // warm rose/gold — human voice
  tonal: [0x6fe3d9, 0x8a6bff, 0xffd76b, 0xff7ad1], // jewel tones — musical pitch
  noise: [0xffffff, 0xdfe8ff, 0xffe9b0], // white/gold glitter — percussive/noisy
  low: [0xffb35c, 0xff8a3d, 0xffd08a], // amber — low rumble, willow-style
  high: [0xbfe3ff, 0xe6d4ff, 0xffffff], // icy blue/violet — high pitched
  ambient: [0x8a6bff, 0x6fe3d9, 0xff9466, 0xffd76b],
};

function pickColor(key) {
  const arr = PALETTES[key] || PALETTES.ambient;
  return new THREE.Color(arr[Math.floor(Math.random() * arr.length)]);
}

function particleVertexShader() {
  return /* glsl */ `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (320.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
}

function particleFragmentShader() {
  return /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      float d = length(uv);
      float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(vColor, alpha);
    }
  `;
}

// A CPU-simulated particle pool rendered with one draw call via a custom
// soft-circle point shader (size + per-particle alpha, unlike stock PointsMaterial).
class ParticleField {
  constructor(max = 6000, opacityMult = 1.0) {
    this.max = max;
    this.list = []; // active particle objects (pooled implicitly by splicing)
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: particleVertexShader(),
      fragmentShader: particleFragmentShader(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this._opacityMult = opacityMult;
  }

  spawn(p) {
    if (this.list.length >= this.max) return;
    this.list.push(p);
  }

  update(dt) {
    const list = this.list;
    let w = 0;
    for (let r = 0; r < list.length; r++) {
      const p = list[r];
      p.life -= dt;
      if (p.life <= 0) continue;

      p.vx *= p.drag;
      p.vy = p.vy * p.drag - p.gravity * dt;
      p.vz *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const frac = Math.max(0, p.life / p.maxLife);
      let alpha = frac;
      if (p.flicker) alpha *= 0.55 + 0.45 * Math.sin(p.phase + p.life * 40);
      alpha *= this._opacityMult;

      const i3 = w * 3;
      this.positions[i3] = p.x;
      this.positions[i3 + 1] = p.y;
      this.positions[i3 + 2] = p.z;
      this.colors[i3] = p.r;
      this.colors[i3 + 1] = p.g;
      this.colors[i3 + 2] = p.b;
      this.sizes[w] = p.size * (0.4 + 0.6 * frac);
      this.alphas[w] = Math.max(0, alpha);

      list[w] = p;
      w++;
    }
    list.length = w;

    this.geometry.setDrawRange(0, w);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

function spawnBurst(field, center, opts) {
  const {
    color,
    count,
    speedMin,
    speedMax,
    gravity,
    drag,
    life,
    lifeVariance = 0.3,
    size,
    shape, // 'sphere' | 'ring' | 'willow' | 'crackle'
    flicker = false,
    secondaryColor = null,
  } = opts;

  for (let i = 0; i < count; i++) {
    let dx, dy, dz;
    if (shape === "ring") {
      const a = Math.random() * Math.PI * 2;
      const tiltJit = (Math.random() - 0.5) * 0.25;
      dx = Math.cos(a);
      dz = Math.sin(a);
      dy = tiltJit;
    } else {
      // uniform-ish distribution on a sphere
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      dx = r * Math.cos(theta);
      dz = r * Math.sin(theta);
      dy = u;
    }
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    const c = secondaryColor && Math.random() < 0.25 ? secondaryColor : color;

    field.spawn({
      x: center.x,
      y: center.y,
      z: center.z,
      vx: dx * speed,
      vy: dy * speed,
      vz: dz * speed,
      gravity,
      drag,
      life: life + (Math.random() - 0.5) * lifeVariance,
      maxLife: life,
      r: c.r,
      g: c.g,
      b: c.b,
      size: size * (0.7 + Math.random() * 0.6),
      flicker,
      phase: Math.random() * 10,
    });
  }
}

const SHAPE_PRESETS = {
  peony: { speedMin: 2.2, speedMax: 4.4, gravity: 2.6, drag: 0.988, life: 1.6, size: 0.42 },
  ring: { speedMin: 3.2, speedMax: 4.2, gravity: 2.2, drag: 0.99, life: 1.5, size: 0.4 },
  willow: { speedMin: 1.6, speedMax: 3.0, gravity: 4.2, drag: 0.978, life: 2.4, size: 0.34 },
  crackle: { speedMin: 1.8, speedMax: 4.6, gravity: 2.0, drag: 0.965, life: 0.9, size: 0.26 },
};

export function createFireworks() {
  const group = new THREE.Group();

  const main = new ParticleField(7000, 1.0);
  group.add(main.points);

  // Mirrored reflection, dimmer, flipped below the "waterline".
  const reflectionGroup = new THREE.Group();
  reflectionGroup.scale.set(1, -1, 1);
  reflectionGroup.position.y = GROUND_Y * 2;
  const reflection = new ParticleField(7000, 0.28);
  reflectionGroup.add(reflection.points);
  group.add(reflectionGroup);
  // share the same simulated particle list conceptually by mirroring spawns (see spawnMirrored)

  // faint water plane so the reflection reads as sitting on a surface
  const waterGeo = new THREE.PlaneGeometry(80, 80);
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.55 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = GROUND_Y + 0.01;
  group.add(water);

  // distant stars
  const starCount = 2200;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.55; // keep them up in the sky
    starPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i3 + 1] = Math.abs(r * Math.cos(phi)) + 2;
    starPositions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 10;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ size: 0.09, color: 0xffffff, transparent: true, opacity: 0.5 });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  const rockets = [];

  function spawnMirroredTrail(x, y, z, color) {
    main.spawn(trailParticle(x, y, z, color));
    reflection.spawn(trailParticle(x, y, z, color));
  }

  function trailParticle(x, y, z, color) {
    return {
      x: x + (Math.random() - 0.5) * 0.1,
      y,
      z: z + (Math.random() - 0.5) * 0.1,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.2 - Math.random() * 0.3,
      vz: (Math.random() - 0.5) * 0.3,
      gravity: 0.4,
      drag: 0.96,
      life: 0.35 + Math.random() * 0.15,
      maxLife: 0.4,
      r: color.r,
      g: color.g,
      b: color.b,
      size: 0.18,
      flicker: false,
      phase: 0,
    };
  }

  function burst(pos, shapeKey, colorKey, sizeMul = 1) {
    const preset = SHAPE_PRESETS[shapeKey] || SHAPE_PRESETS.peony;
    const color = pickColor(colorKey);
    const secondary = Math.random() < 0.5 ? pickColor(colorKey) : null;
    const count = Math.round(160 * sizeMul + 40);
    const opts = {
      ...preset,
      speedMin: preset.speedMin * (0.7 + sizeMul * 0.5),
      speedMax: preset.speedMax * (0.7 + sizeMul * 0.5),
      size: preset.size * (0.8 + sizeMul * 0.4),
      color,
      secondaryColor: secondary,
      count,
      shape: shapeKey === "willow" ? "sphere" : shapeKey === "crackle" ? "sphere" : shapeKey,
      flicker: shapeKey === "crackle",
    };
    spawnBurst(main, pos, opts);
    spawnBurst(reflection, pos, opts);
  }

  function launchRocket(x, z, colorKey, shapeKey, sizeMul) {
    const apex = APEX_MIN + Math.random() * (APEX_MAX - APEX_MIN);
    const riseTime = 0.9 + Math.random() * 0.5;
    rockets.push({
      x,
      y: GROUND_Y,
      z,
      vy: (apex - GROUND_Y) / riseTime,
      apex,
      color: pickColor(colorKey),
      colorKey,
      shapeKey,
      sizeMul,
      trailTimer: 0,
    });
  }

  let ambientTimer = 0.6;

  function update(bands, dt) {
    const { low, mid, high, level } = bands;

    // --- ambient auto-launches: more frequent & bigger as the sound swells ---
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      const x = (Math.random() - 0.5) * SKY_X * 2;
      const z = (Math.random() - 0.5) * SKY_Z * 2 - 4;
      const keys = ["voice", "tonal", "low", "high", "ambient"];
      const colorKey = keys[Math.floor(Math.random() * keys.length)];
      const shapeKeys = ["peony", "ring", "willow"];
      const shapeKey = shapeKeys[Math.floor(Math.random() * shapeKeys.length)];
      launchRocket(x, z, colorKey, shapeKey, 0.6 + level * 1.2);
      ambientTimer = Math.max(0.35, 1.8 - mid * 1.4 - level * 0.6) + Math.random() * 0.6;
    }

    // --- rockets: rise + trail, burst at apex ---
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy * dt;
      r.vy *= 0.995;
      r.trailTimer -= dt;
      if (r.trailTimer <= 0) {
        spawnMirroredTrail(r.x, r.y, r.z, r.color);
        r.trailTimer = 0.02;
      }
      if (r.y >= r.apex) {
        burst({ x: r.x, y: r.y, z: r.z }, r.shapeKey, r.colorKey, r.sizeMul);
        rockets.splice(i, 1);
      }
    }

    main.update(dt);
    reflection.update(dt);

    stars.rotation.y += dt * 0.002;
  }

  // Called on a detected sound onset — the "big moment" burst.
  function pulse(strength, tag) {
    const colorKey = PALETTES[tag] ? tag : "ambient";
    const shapeKey =
      tag === "noise" ? "crackle" : tag === "low" ? "willow" : tag === "high" ? "ring" : tag === "tonal" ? "ring" : "peony";
    const x = (Math.random() - 0.5) * SKY_X * 1.6;
    const z = (Math.random() - 0.5) * SKY_Z * 1.6 - 3;
    const y = APEX_MIN + Math.random() * (APEX_MAX - APEX_MIN);
    burst({ x, y, z }, shapeKey, colorKey, 0.9 + strength * 1.4);

    if (strength > 0.75) {
      // a big sound gets a companion burst for extra drama
      const x2 = x + (Math.random() - 0.5) * 4;
      const y2 = y + (Math.random() - 0.5) * 2;
      setTimeout(() => burst({ x: x2, y: y2, z }, shapeKey, colorKey, 0.6), 90);
    }
  }

  return { group, update, pulse };
}
