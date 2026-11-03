import * as THREE from "three";
import layout from "./kielce.json";

type Pt = [number, number];

export type Track = {
  group: THREE.Group;
  outer: Pt[];
  extras: Pt[][];
  halfOuter: number;
  halfExtra: number;
  start: { x: number; z: number; yaw: number };
};

const HALF_OUTER = 9;
const HALF_EXTRA = 7;

function ribbon(points: Pt[], half: number, y: number, color: number) {
  const verts: number[] = [];
  const idx: number[] = [];
  const n = points.length;
  const closed = Math.hypot(points[0][0] - points[n - 1][0], points[0][1] - points[n - 1][1]) < 0.8;
  const count = closed ? n - 1 : n;
  for (let i = 0; i < count; i++) {
    const prev = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    const cur = points[i];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    if (!closed && i === 0) {
      tx = points[1][0] - cur[0];
      tz = points[1][1] - cur[1];
    }
    if (!closed && i === count - 1) {
      tx = cur[0] - points[i - 1][0];
      tz = cur[1] - points[i - 1][1];
    }
    const len = Math.hypot(tx, tz) || 1;
    const nx = (-tz / len) * half;
    const nz = (tx / len) * half;
    verts.push(cur[0] + nx, y, cur[1] + nz, cur[0] - nx, y, cur[1] - nz);
  }
  const seg = closed ? count : count - 1;
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    const b = ((i + 1) % count) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function walls(points: Pt[], half: number) {
  const n = points.length - 1;
  const dummy = new THREE.Object3D();
  const geo = new THREE.BoxGeometry(1.5, 0.8, 0.75);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.86 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.castShadow = true;
  for (let i = 0; i < n; i += 1) {
    const cur = points[i];
    const next = points[i + 1];
    const tx = next[0] - cur[0];
    const tz = next[1] - cur[1];
    const len = Math.hypot(tx, tz) || 1;
    // CCW loop: outside is to the right of travel.
    const nx = tz / len;
    const nz = -tx / len;
    dummy.position.set(cur[0] + nx * half, 0.4, cur[1] + nz * half);
    dummy.rotation.set(0, Math.atan2(tx, tz), 0);
    dummy.scale.set(Math.min(2.2, len * 0.55), 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function createTrack() {
  const outer = layout.outer as Pt[];
  const extras = layout.extras as Pt[][];
  const group = new THREE.Group();
  group.name = "tor-kielce";
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48),
    new THREE.MeshStandardMaterial({ color: 0x3d5a38, roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);
  group.add(ribbon(outer, HALF_OUTER + 1.2, 0.02, 0x3a3d42));
  for (const line of extras) group.add(ribbon(line, HALF_EXTRA, 0.03, 0x454952));
  group.add(walls(outer, HALF_OUTER + 1.4));

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e4d4 });
  group.add(new THREE.Mesh(ribbon(outer, 0.18, 0.045, 0xffffff).geometry, lineMat));
  return {
    group,
    outer,
    extras,
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

export function surfaceAt(track: Track, x: number, z: number) {
  const outer = nearestOn(track.outer, x, z);
  let onAsphalt = Math.abs(outer.signed) < track.halfOuter || outer.dist < track.halfOuter;
  if (!onAsphalt) {
    for (const line of track.extras) {
      if (nearestOn(line, x, z).dist < track.halfExtra) {
        onAsphalt = true;
        break;
      }
    }
  }
  const outside = outer.signed < -track.halfOuter;
  return { onAsphalt, outside, outer };
}
