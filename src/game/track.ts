import * as THREE from "three";

type Frame = {
  x: number;
  z: number;
  y: number;
  tx: number;
  tz: number;
  bank: number;
  s: number;
};

export type Track = {
  group: THREE.Group;
  outer: [number, number][];
  extras: [number, number][][];
  frames: Frame[];
  halfOuter: number;
  halfExtra: number;
  start: { x: number; z: number; yaw: number };
};

const HALF = 14;
let grassFloor = -8;

/** Stadium with 58 m corners and a gentle weave on one straight. */
function ovalSamples() {
  const R = 58;
  const L = 160;
  const straight = 24;
  const arc = 40;
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < straight; i++) {
    const x = -L / 2 + (L * i) / straight;
    const weave = Math.sin((i / straight) * Math.PI) ** 2 * 8;
    out.push({ x, z: -R + weave });
  }
  for (let i = 0; i < arc; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / arc;
    out.push({ x: L / 2 + Math.cos(a) * R, z: Math.sin(a) * R });
  }
  for (let i = 0; i < straight; i++) {
    const x = L / 2 - (L * i) / straight;
    out.push({ x, z: R });
  }
  for (let i = 0; i < arc; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / arc;
    out.push({ x: -L / 2 + Math.cos(a) * R, z: Math.sin(a) * R });
  }
  return out;
}

function buildFrames(samples: { x: number; z: number }[]) {
  const n = samples.length;
  const dist = [0];
  for (let i = 1; i < n; i++) dist[i] = dist[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
  const lap = dist[n - 1] + Math.hypot(samples[0].x - samples[n - 1].x, samples[0].z - samples[n - 1].z);
  const frames: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n];
    const next = samples[(i + 1) % n];
    const cur = samples[i];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const h0 = Math.atan2(cur.x - prev.x, cur.z - prev.z);
    const h1 = Math.atan2(next.x - cur.x, next.z - cur.z);
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    const u = dist[i] / lap;
    const y = 5.2 * Math.sin(u * Math.PI * 2) + 2.1 * Math.sin(u * Math.PI * 4 + 0.4);
    frames.push({
      x: cur.x,
      z: cur.z,
      y,
      tx,
      tz,
      bank: Math.max(-0.1, Math.min(0.1, -turn * 1.4)),
      s: dist[i],
    });
  }
  return frames;
}

function pointAt(f: Frame, lateral: number, extraY = 0) {
  return new THREE.Vector3(f.x - f.tz * lateral, f.y + Math.sin(f.bank) * lateral + extraY, f.z + f.tx * lateral);
}

function ribbon(frames: Frame[], d0: number, d1: number, y0: number, y1: number, material: THREE.Material) {
  const n = frames.length;
  const verts: number[] = [];
  const idx: number[] = [];
  for (const f of frames) {
    const a = pointAt(f, d0, y0);
    const b = pointAt(f, d1, y1);
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function addScenery(group: THREE.Group, frames: Frame[], grassY: number) {
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.38, 8, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0x6a5430, roughness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.ceil(frames.length / 8));
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, poles.count);
  const dummy = new THREE.Object3D();
  let pi = 0;
  for (let i = 0; i < frames.length && pi < poles.count; i += 8) {
    const f = frames[i];
    const d = HALF + 6.5;
    dummy.position.set(f.x - f.tz * d, f.y + 3.5, f.z + f.tx * d);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(pi, dummy.matrix);
    dummy.position.y = f.y + 7.1;
    dummy.updateMatrix();
    lamps.setMatrixAt(pi, dummy.matrix);
    pi++;
  }
  poles.count = pi;
  lamps.count = pi;
  group.add(poles, lamps);

  const trunk = new THREE.CylinderGeometry(0.25, 0.4, 2.2, 5);
  const crown = new THREE.ConeGeometry(1.7, 3.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1 });
  const treeCount = 32;
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crown, crownMat, treeCount);
  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * Math.PI * 2 + 0.2;
    const r = 168 + (i % 3) * 8;
    dummy.position.set(Math.cos(a) * r, grassY + 1.1, Math.sin(a) * r);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = grassY + 3.4;
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  }
  group.add(trunks, crowns);

  const box = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.8 });
  const containers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.5, 6), box, 6);
  for (let i = 0; i < 6; i++) {
    const f = frames[(40 + i * 3) % frames.length];
    const d = HALF + 10 + (i % 2) * 3;
    dummy.position.set(f.x - f.tz * d, grassY + 1.25, f.z + f.tx * d);
    dummy.rotation.set(0, Math.atan2(f.tx, f.tz), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    containers.setMatrixAt(i, dummy.matrix);
  }
  group.add(containers);

  const tyre = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95 }), 16);
  let ti = 0;
  for (const at of [12, 70]) {
    const f = frames[at % frames.length];
    for (let k = 0; k < 4; k++) {
      dummy.position.set(f.x - f.tz * (HALF + 2.2), f.y + 0.2 + k * 0.28, f.z + f.tx * (HALF + 2.2));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tyre.setMatrixAt(ti++, dummy.matrix);
      dummy.position.set(f.x - f.tz * (HALF + 3.3), f.y + 0.2 + k * 0.28, f.z + f.tx * (HALF + 3.3));
      dummy.updateMatrix();
      tyre.setMatrixAt(ti++, dummy.matrix);
    }
  }
  group.add(tyre);

  const stand = new THREE.Group();
  const f = frames[Math.floor(frames.length * 0.02)];
  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x243044, roughness: 0.7 }));
  base.position.set(f.x - f.tz * (HALF + 12), grassY + 1.6, f.z + f.tx * (HALF + 12));
  base.rotation.y = Math.atan2(f.tx, f.tz);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.35, 7), new THREE.MeshStandardMaterial({ color: 0xd7dde6, roughness: 0.5 }));
  roof.position.copy(base.position);
  roof.position.y = grassY + 4.2;
  roof.rotation.y = base.rotation.y;
  stand.add(base, roof);
  group.add(stand);
}

function nearestFrame(frames: Frame[], x: number, z: number) {
  let best = 1e9;
  let signed = 0;
  let tx = 0;
  let tz = 1;
  let y = 0;
  let bank = 0;
  const n = frames.length;
  for (let i = 0; i < n; i++) {
    const a = frames[i];
    const b = frames[(i + 1) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.min(1, Math.max(0, t));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      const len = Math.sqrt(len2);
      tx = abx / len;
      tz = abz / len;
      signed = tx * (z - pz) - tz * (x - px);
      y = a.y + (b.y - a.y) * t;
      bank = a.bank + (b.bank - a.bank) * t;
    }
  }
  return { dist: best, signed, tx, tz, y, bank };
}

export function createTrack() {
  const samples = ovalSamples();
  const frames = buildFrames(samples);
  const grassY = Math.min(...frames.map((f) => f.y)) - 1.2;
  grassFloor = grassY;
  const group = new THREE.Group();
  group.name = "drift-arena";

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(240, 48),
    new THREE.MeshStandardMaterial({ color: 0x3e6b45, roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = grassY;
  grass.receiveShadow = true;
  group.add(grass);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.92, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ color: 0xded8cc, roughness: 0.8, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide });
  lineMat.polygonOffset = true;
  lineMat.polygonOffsetFactor = -1;
  lineMat.polygonOffsetUnits = -1;

  group.add(ribbon(frames, -HALF, HALF, 0.02, 0.02, asphalt));
  group.add(ribbon(frames, HALF, HALF + 0.85, 0.02, 0.28, curb));
  group.add(ribbon(frames, -HALF, -(HALF + 0.85), 0.02, 0.28, curb));
  group.add(ribbon(frames, HALF + 0.7, HALF + 1.05, 0.28, 1.15, wallMat));
  group.add(ribbon(frames, -(HALF + 0.7), -(HALF + 1.05), 0.28, 1.15, wallMat));
  group.add(ribbon(frames, -0.16, 0.16, 0.05, 0.05, lineMat));
  addScenery(group, frames, grassY);

  const f0 = frames[0];
  return {
    group,
    outer: frames.map((f) => [f.x, f.z] as [number, number]),
    extras: [],
    frames,
    halfOuter: HALF - 0.9,
    halfExtra: 0,
    start: { x: f0.x, z: f0.z, yaw: Math.atan2(f0.tx, f0.tz) },
  } satisfies Track;
}

export function surfaceAt(track: Track, x: number, z: number) {
  const outer = nearestFrame(track.frames, x, z);
  const limit = track.halfOuter;
  const lateral = Math.max(-HALF, Math.min(HALF, outer.signed));
  const roadY = outer.y + Math.sin(outer.bank) * lateral;
  const onAsphalt = Math.abs(outer.signed) <= HALF + 0.6;
  return {
    onAsphalt,
    onExtra: false,
    outside: outer.signed < -limit,
    inside: outer.signed > limit,
    outer,
    y: Math.abs(outer.signed) < HALF + 8 ? roadY : grassFloor,
  };
}
