import * as THREE from "three";

const INNER_COLOR = new THREE.Color("#6fe3d9"); // cyan core
const OUTER_COLOR = new THREE.Color("#8a6bff"); // nebula edge
const EMBER = new THREE.Color("#ff9466");

// Builds a spiral-galaxy point cloud plus a distant starfield.
// Returns an object with .group (add to scene) and .update(bands, dt).
export function createGalaxy({ count = 22000, branches = 4, radius = 9 } = {}) {
  const group = new THREE.Group();

  // ---- Spiral galaxy ----
  const positions = new Float32Array(count * 3);
  const basePositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const randomness = new Float32Array(count * 3);
  const angles = new Float32Array(count);
  const radii = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const r = Math.pow(Math.random(), 1.6) * radius;
    const branchAngle = ((i % branches) / branches) * Math.PI * 2;
    const spin = r * 0.9;
    const randScale = 0.22 * r + 0.05;

    const rx = (Math.random() - 0.5) * randScale;
    const ry = (Math.random() - 0.5) * randScale * 0.4;
    const rz = (Math.random() - 0.5) * randScale;

    randomness[i3] = rx;
    randomness[i3 + 1] = ry;
    randomness[i3 + 2] = rz;
    angles[i] = branchAngle + spin;
    radii[i] = r;

    const x = Math.cos(branchAngle + spin) * r + rx;
    const y = ry;
    const z = Math.sin(branchAngle + spin) * r + rz;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
    basePositions[i3] = x;
    basePositions[i3 + 1] = y;
    basePositions[i3 + 2] = z;

    const mixed = INNER_COLOR.clone().lerp(OUTER_COLOR, Math.min(1, r / radius));
    if (Math.random() < 0.06) mixed.lerp(EMBER, 0.7); // rare ember flecks
    colors[i3] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    sizes[i] = Math.random() * 1.6 + 0.4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    size: 0.065,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);

  // ---- Distant starfield ----
  const starCount = 3000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  // ---- Core glow ----
  const coreGeo = new THREE.SphereGeometry(0.6, 32, 32);
  const coreMat = new THREE.MeshBasicMaterial({
    color: INNER_COLOR,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  let t = 0;

  function update(bands, dt) {
    t += dt;
    const { low, mid, high, level } = bands;

    // Pulse radius outward with bass, jitter with treble.
    const posAttr = geometry.attributes.position;
    const pulse = 1 + low * 0.35;
    const jitterAmt = high * 0.18;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];
      const jr = radii[i];
      const jitter = Math.sin(t * 6 + jr * 3 + i) * jitterAmt * 0.3;
      posAttr.array[i3] = bx * pulse + jitter;
      posAttr.array[i3 + 1] = by * pulse + jitter * 0.4;
      posAttr.array[i3 + 2] = bz * pulse + jitter;
    }
    posAttr.needsUpdate = true;

    material.size = 0.05 + mid * 0.12;
    material.opacity = 0.75 + level * 0.25;

    points.rotation.y += dt * (0.035 + mid * 0.12);
    stars.rotation.y += dt * 0.004;

    core.scale.setScalar(1 + level * 1.6);
    coreMat.opacity = 0.25 + high * 0.5;

    group.rotation.z = Math.sin(t * 0.05) * 0.03;
  }

  return { group, update };
}
