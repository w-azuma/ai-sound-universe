import * as THREE from "three";

// A cinematic black hole: a light-swallowing event horizon, a thin bright
// photon ring hugging it, a vertical "halo" ring standing in for gravitational
// lensing (the Interstellar-style loop above/below the disk), a swirling
// Keplerian accretion disk that heats up toward the center, twin polar jets
// that surge with loudness, and expanding shockwave rings on sudden sounds.

const DISK_NEUTRAL = new THREE.Color(0xffffff);
const DISK_HOT_TINT = new THREE.Color(0xd8fbff);
const RING_WARM = new THREE.Color(0xfff3d6);
const RING_HOT = new THREE.Color(0xeaffff);
const HALO_COOL = new THREE.Color(0xbfe3ff);
const HALO_HOT = new THREE.Color(0xe6d4ff);
const JET_COLOR = new THREE.Color(0xdcefff);

export function createBlackHole({ diskCount = 16000, horizonRadius = 1.1, diskInner = 1.5, diskOuter = 9.5, jetCount = 2600 } = {}) {
  const group = new THREE.Group();

  // Everything in the disk plane lives in `tilt`, angled for a 3/4 cinematic view.
  const tilt = new THREE.Group();
  tilt.rotation.x = THREE.MathUtils.degToRad(74);
  group.add(tilt);

  // ---- Event horizon ----
  const horizonGeo = new THREE.SphereGeometry(horizonRadius, 64, 64);
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  tilt.add(horizon);

  // ---- Photon ring (bright edge right at the horizon) ----
  const ringGeo = new THREE.TorusGeometry(horizonRadius * 1.04, 0.028, 16, 160);
  const ringMat = new THREE.MeshBasicMaterial({
    color: RING_WARM.clone(),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const photonRing = new THREE.Mesh(ringGeo, ringMat);
  photonRing.rotation.x = Math.PI / 2;
  tilt.add(photonRing);

  // ---- Lensing halo: a vertical ring standing outside the tilt group so it
  // reads as light bent up and over the hole, independent of disk rotation ----
  const haloGeo = new THREE.TorusGeometry(horizonRadius * 1.9, 0.045, 16, 160);
  const haloMat = new THREE.MeshBasicMaterial({
    color: HALO_COOL.clone(),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  group.add(halo);

  // ---- Accretion disk ----
  const positions = new Float32Array(diskCount * 3);
  const baseY = new Float32Array(diskCount);
  const colors = new Float32Array(diskCount * 3);
  const radii = new Float32Array(diskCount);
  const speed = new Float32Array(diskCount);
  const angleState = new Float32Array(diskCount);

  const hot = new THREE.Color("#fffaf0");
  const warm = new THREE.Color("#ffb35c");
  const ember = new THREE.Color("#ff5b3d");
  const cool = new THREE.Color("#7a2f22");

  for (let i = 0; i < diskCount; i++) {
    const i3 = i * 3;
    const r = diskInner + Math.pow(Math.random(), 1.7) * (diskOuter - diskInner);
    const angle = Math.random() * Math.PI * 2;
    const t = (r - diskInner) / (diskOuter - diskInner);
    const thickness = THREE.MathUtils.lerp(0.28, 0.02, t);
    const y = (Math.random() - 0.5) * thickness;

    radii[i] = r;
    angleState[i] = angle;
    speed[i] = 1.15 / Math.sqrt(r); // faster near the center, Kepler-ish
    baseY[i] = y;

    positions[i3] = Math.cos(angle) * r;
    positions[i3 + 1] = y;
    positions[i3 + 2] = Math.sin(angle) * r;

    let c;
    if (t < 0.12) c = hot.clone().lerp(warm, t / 0.12);
    else if (t < 0.45) c = warm.clone().lerp(ember, (t - 0.12) / 0.33);
    else c = ember.clone().lerp(cool, (t - 0.45) / 0.55);
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const disk = new THREE.Points(geometry, material);
  tilt.add(disk);

  // ---- Polar jets: twin light-beams that surge outward with loudness ----
  const jetU = new Float32Array(jetCount); // 0..1 position along the beam template
  const jetSide = new Int8Array(jetCount); // +1 up, -1 down
  const jetSpin = new Float32Array(jetCount);
  const jetPositions = new Float32Array(jetCount * 3);
  const jetColors = new Float32Array(jetCount * 3);

  for (let i = 0; i < jetCount; i++) {
    jetU[i] = Math.random();
    jetSide[i] = i % 2 === 0 ? 1 : -1;
    jetSpin[i] = Math.random() * Math.PI * 2;
    const c = JET_COLOR;
    jetColors[i * 3] = c.r;
    jetColors[i * 3 + 1] = c.g;
    jetColors[i * 3 + 2] = c.b;
  }

  const jetGeo = new THREE.BufferGeometry();
  jetGeo.setAttribute("position", new THREE.BufferAttribute(jetPositions, 3));
  jetGeo.setAttribute("color", new THREE.BufferAttribute(jetColors, 3));
  const jetMat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const jets = new THREE.Points(jetGeo, jetMat);
  tilt.add(jets);

  // ---- Distant starfield ----
  const starCount = 4000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const r = 45 + Math.random() * 70;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.1,
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // ---- Onset shockwaves: expanding rings spawned by pulse() ----
  const shockwaves = [];
  function spawnShockwave(strength = 1) {
    const geo = new THREE.TorusGeometry(horizonRadius * 1.1, 0.04, 12, 96);
    const col = strength > 0.7 ? 0xffe6c2 : 0xbfe3ff;
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    tilt.add(mesh);
    shockwaves.push({ mesh, age: 0, life: 1.1 + strength * 0.4, strength });
  }

  let t = 0;
  let levelSmooth = 0;

  function update(bands, dt) {
    t += dt;
    const { low, mid, high, level } = bands;
    levelSmooth += (level - levelSmooth) * 0.08;

    const speedMul = 1 + mid * 2.4;
    const posAttr = geometry.attributes.position;
    const bulge = 1 + low * 0.1;
    for (let i = 0; i < diskCount; i++) {
      const i3 = i * 3;
      angleState[i] += speed[i] * dt * speedMul;
      const r = radii[i] * bulge;
      const jitter = Math.sin(t * 7 + radii[i] * 2.2 + i) * high * 0.05;
      posAttr.array[i3] = Math.cos(angleState[i]) * r;
      posAttr.array[i3 + 1] = baseY[i] + jitter;
      posAttr.array[i3 + 2] = Math.sin(angleState[i]) * r;
    }
    posAttr.needsUpdate = true;

    material.size = 0.045 + mid * 0.05 + levelSmooth * 0.03;
    material.opacity = 0.7 + level * 0.28;
    material.color.copy(DISK_NEUTRAL).lerp(DISK_HOT_TINT, Math.min(1, levelSmooth * 1.6));

    photonRing.material.opacity = 0.75 + level * 0.25;
    photonRing.scale.setScalar(1 + low * 0.09 + levelSmooth * 0.05);
    ringMat.color.copy(RING_WARM).lerp(RING_HOT, Math.min(1, levelSmooth * 1.8));

    haloMat.opacity = 0.28 + high * 0.42 + levelSmooth * 0.15;
    haloMat.color.copy(HALO_COOL).lerp(HALO_HOT, Math.min(1, high * 1.5));
    halo.rotation.z += dt * (0.06 + levelSmooth * 0.1);
    halo.rotation.y += dt * 0.015;
    halo.scale.setScalar(1 + levelSmooth * 0.35);

    horizon.scale.setScalar(1 + low * 0.04);

    // --- polar jets: length and brightness track smoothed loudness ---
    const jetLength = 1.5 + levelSmooth * 13 + low * 4;
    const jetOpacity = Math.max(0, levelSmooth * 1.4 - 0.05);
    jetMat.opacity = Math.min(0.9, jetOpacity);
    const jetPosAttr = jetGeo.attributes.position;
    for (let i = 0; i < jetCount; i++) {
      const i3 = i * 3;
      const u = (jetU[i] + t * 0.15) % 1;
      const dist = horizonRadius * 1.15 + u * jetLength;
      const spread = 0.15 + u * 0.5 * (0.4 + high);
      const ang = jetSpin[i] + t * 1.4 + u * 6;
      jetPosAttr.array[i3] = Math.cos(ang) * spread;
      jetPosAttr.array[i3 + 1] = dist * jetSide[i];
      jetPosAttr.array[i3 + 2] = Math.sin(ang) * spread;
    }
    jetPosAttr.needsUpdate = true;

    // --- shockwaves ---
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.age += dt;
      const p = Math.min(1, sw.age / sw.life);
      const scale = 1 + p * (10 + sw.strength * 6);
      sw.mesh.scale.setScalar(scale);
      sw.mesh.material.opacity = 0.85 * (1 - p);
      if (p >= 1) {
        tilt.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        shockwaves.splice(i, 1);
      }
    }

    stars.rotation.y += dt * 0.003;
    group.rotation.y += dt * (0.015 + mid * 0.02);
  }

  return { group, update, pulse: spawnShockwave };
}

