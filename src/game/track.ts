import * as THREE from "three";
import layout from "./kielce.json";

type Pt = [number, number];

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
  outer: Pt[];
  extras: Pt[][];
  frames: Frame[];
  halfOuter: number;
  halfExtra: number;
  start: { x: number; z: number; yaw: number };
};

const HALF_OUTER = 9;
const HALF_EXTRA = 7;

export function terrainY(x: number, z: number) {
  return Math.sin(x * 0.011) * 2.6 + Math.cos(z * 0.009) * 2.2 + Math.sin((x + z) * 0.0055) * 1.8;
}

function hill(s: number) {
  return Math.sin(s * 0.016) * 3.4 + Math.sin(s * 0.0065 + 0.8) * 5.2;
}

function buildFrames(points: Pt[]) {
  const n = points.length;
  const closed = Math.hypot(points[0][0] - points[n - 1][0], points[0][1] - points[n - 1][1]) < 1.2;
  const count = closed ? n - 1 : n;
  const dist: number[] = [0];
  for (let i = 1; i < count; i++) {
    dist[i] = dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    const prev = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    const cur = points[i];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const h0 = Math.atan2(cur[0] - prev[0], cur[1] - prev[1]);
    const h1 = Math.atan2(next[0] - cur[0], next[1] - cur[1]);
    const turn = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    const bank = Math.max(-0.16, Math.min(0.16, -turn * 1.8));
    frames.push({
      x: cur[0],
      z: cur[1],
      y: terrainY(cur[0], cur[1]) + hill(dist[i]),
      tx,
      tz,
      bank,
      s: dist[i],
    });
  }
  return frames;
}

function road(frames: Frame[], half: number, color: number, lift = 0.08): THREE.Mesh {
  const n = frames.length;
  const verts: number[] = [];
  const idx: number[] = [];
  for (const f of frames) {
    const nx = -f.tz * half;
    const nz = f.tx * half;
    const bankLift = Math.sin(f.bank) * half;
    verts.push(f.x + nx, f.y + bankLift + lift, f.z + nz, f.x - nx, f.y - bankLift + lift, f.z - nz);
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
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

function flatRibbon(points: Pt[], half: number, color: number) {
  const frames = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    return { x: p[0], z: p[1], y: terrainY(p[0], p[1]) + 0.2, tx, tz, bank: 0, s: 0 };
  });
  return road(frames, half, color, 0.04);
}

function barriers(frames: Frame[], side: 1 | -1) {
  const n = frames.length;
  const geo = new THREE.BoxGeometry(1, 0.72, 0.22);
  const mat = new THREE.MeshStandardMaterial({ color: side > 0 ? 0xd5d0c6 : 0xc5bfb4, roughness: 0.62, metalness: 0.2 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = frames[i];
    const b = frames[(i + 1) % n];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    const bank = (a.bank + b.bank) / 2;
    const inset = HALF_OUTER + 0.45;
    const y = (a.y + b.y) / 2 + Math.sin(bank) * inset * side + 0.42;
    dummy.position.set((a.x + b.x) / 2 + nx * inset * side, y, (a.z + b.z) / 2 + nz * inset * side);
    dummy.rotation.set(0, Math.atan2(tx, tz), 0);
    dummy.scale.set(len * 1.02, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function terrain() {
  const geo = new THREE.PlaneGeometry(1700, 1400, 40, 32);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const ox = -30;
  const oz = -165;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    pos.setY(i, terrainY(x, z) - 0.45);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3d5a38, roughness: 1 }));
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  return mesh;
}

export function createTrack() {
  const outer = layout.outer as Pt[];
  const extras = layout.extras as Pt[][];
  const frames = buildFrames(outer);
  const group = new THREE.Group();
  group.name = "circuit";
  group.add(terrain());
  group.add(road(frames, HALF_OUTER + 1.1, 0x3a3d42, 0.02));
  for (const line of extras) group.add(flatRibbon(line, HALF_EXTRA, 0x454952));
  group.add(barriers(frames, 1));
  group.add(barriers(frames, -1));
  const line = road(frames, 0.16, 0xffffff, 0.12);
  line.material = new THREE.MeshBasicMaterial({ color: 0xe8e4d4 });
  group.add(line);
  return {
    group,
    outer,
    extras,
    frames,
    halfOuter: HALF_OUTER,
    halfExtra: HALF_EXTRA,
    start: layout.start,
  } satisfies Track;
}

export function nearestOn(points: Pt[], x: number, z: number) {
  let best = 1e9;
  let signed = 0;
  let nx = 0;
  let nz = 1;
  const n = points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[i + 1];
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a[0]) * abx + (z - a[1]) * abz) / len2;
    t = Math.min(1, Math.max(0, t));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d < best) {
      best = d;
      const len = Math.sqrt(len2);
      nx = abx / len;
      nz = abz / len;
      signed = nx * dz - nz * dx;
    }
  }
  return { dist: best, signed, tx: nx, tz: nz };
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
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d < best) {
      best = d;
      const len = Math.sqrt(len2);
      tx = abx / len;
      tz = abz / len;
      signed = tx * dz - tz * dx;
      y = a.y + (b.y - a.y) * t;
      bank = a.bank + (b.bank - a.bank) * t;
    }
  }
  return { dist: best, signed, tx, tz, y, bank };
}

export function surfaceAt(track: Track, x: number, z: number) {
  const outer = nearestFrame(track.frames, x, z);
  let onAsphalt = Math.abs(outer.signed) <= track.halfOuter;
  let onExtra = false;
  if (!onAsphalt) {
    for (const line of track.extras) {
      if (nearestOn(line, x, z).dist < track.halfExtra) {
        onAsphalt = true;
        onExtra = true;
        break;
      }
    }
  }
  const lateral = Math.max(-track.halfOuter, Math.min(track.halfOuter, outer.signed));
  const roadY = outer.y + Math.sin(outer.bank) * lateral;
  const y = onExtra ? terrainY(x, z) + 0.25 : onAsphalt ? roadY : terrainY(x, z);
  return {
    onAsphalt,
    onExtra,
    outside: !onExtra && outer.signed < -track.halfOuter,
    inside: !onExtra && outer.signed > track.halfOuter,
    outer,
    y,
  };
}
