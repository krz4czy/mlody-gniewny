import * as THREE from "three";

/**
 * Procedural BMW E46 sedan, facelift / LCI (2001–2005): angel eyes, LCI tail lamps.
 * Stage 1 is look-only. Later stages attach physics to the returned Group.
 * Real-world reference (m): length 4.47, width ~1.74, height ~1.41, wheelbase 2.725.
 */

const LENGTH = 4.47;
const WHEELBASE = 2.725;
const REAR_OVERHANG = 0.96;
const TAIL = -LENGTH / 2;
const REAR_AXLE = TAIL + REAR_OVERHANG;
const FRONT_AXLE = REAR_AXLE + WHEELBASE;
const TUB_Z0 = -2.1;
const TUB_Z1 = 2.06;

type V3 = [number, number, number];

function fract(v: number) {
  return v - Math.floor(v);
}

function n3(x: number, y: number, z: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123);
}

function fbm(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const v = (dx: number, dy: number, dz: number) => n3(ix + dx, iy + dy, iz + dz);
  const y0 = lerp(lerp(v(0, 0, 0), v(1, 0, 0), sx), lerp(v(0, 1, 0), v(1, 1, 0), sx), sy);
  const y1 = lerp(lerp(v(0, 0, 1), v(1, 0, 1), sx), lerp(v(0, 1, 1), v(1, 1, 1), sx), sy);
  return lerp(y0, y1, sz);
}

function sample(keys: { z: number; v: number }[], z: number) {
  if (z <= keys[0].z) return keys[0].v;
  const last = keys[keys.length - 1];
  if (z >= last.z) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const s = t * t * (3 - 2 * t);
      return a.v + (b.v - a.v) * s;
    }
  }
  return last.v;
}

const HALF_W = [
  { z: -2.1, v: 0.7 },
  { z: -1.75, v: 0.84 },
  { z: -1.28, v: 0.91 },
  { z: -0.55, v: 0.86 },
  { z: 0.7, v: 0.865 },
  { z: 1.25, v: 0.89 },
  { z: 1.5, v: 0.92 },
  { z: 1.82, v: 0.8 },
  { z: 2.06, v: 0.68 },
];

const BELT_Y = [
  { z: -2.1, v: 0.64 },
  { z: -1.72, v: 0.9 },
  { z: -1.28, v: 0.99 },
  { z: -0.3, v: 0.97 },
  { z: 0.85, v: 0.96 },
  { z: 1.35, v: 0.93 },
  { z: 1.7, v: 0.82 },
  { z: 2.06, v: 0.76 },
];

const ROCKER_Y = [
  { z: -2.1, v: 0.3 },
  { z: -1.5, v: 0.22 },
  { z: 1.5, v: 0.22 },
  { z: 2.06, v: 0.3 },
];

function halfWidth(z: number) {
  return sample(HALF_W, z);
}

function archOpening(z: number) {
  let best = 0;
  for (const axle of [REAR_AXLE, FRONT_AXLE]) {
    const dz = Math.abs(z - axle);
    const radius = 0.42;
    if (dz < radius) best = Math.max(best, Math.sqrt(1 - (dz / radius) ** 2));
  }
  return best;
}

function halfProfile(z: number) {
  const hw = halfWidth(z);
  const yb = sample(ROCKER_Y, z);
  const yt = sample(BELT_Y, z);
  const arch = archOpening(z);
  const lip = Math.min(yt - 0.08, 0.32 + 0.16 + arch * 0.46);
  const flare = 1 + arch * 0.04;
  const w = hw * flare;
  const pts = [
    new THREE.Vector3(0.06, yb - 0.02, z),
    new THREE.Vector3(w * 0.42, yb, z),
    new THREE.Vector3(w * 0.7, yb + arch * 0.05, z),
    new THREE.Vector3(w * 0.9, THREE.MathUtils.lerp(yb, lip, 0.35 + arch * 0.55), z),
    new THREE.Vector3(w * 0.98, THREE.MathUtils.lerp(lip, yt, 0.22), z),
    new THREE.Vector3(w, THREE.MathUtils.lerp(lip, yt, 0.48), z),
    new THREE.Vector3(w * 0.995, THREE.MathUtils.lerp(lip, yt, 0.72), z),
    new THREE.Vector3(w * 0.96, yt, z),
  ];
  for (const p of pts) {
    if (Math.abs(p.x) < w * 0.72) continue;
    for (const axle of [REAR_AXLE, FRONT_AXLE]) {
      const dz = p.z - axle;
      const opening = 0.4;
      if (Math.abs(dz) < opening) {
        const yArc = 0.32 + Math.sqrt(opening * opening - dz * dz);
        if (p.y < yArc) p.y = yArc;
      }
    }
  }
  return pts;
}

function tubRing(z: number) {
  const right = halfProfile(z);
  const pts: THREE.Vector3[] = [];
  for (let i = right.length - 1; i >= 1; i--) {
    pts.push(new THREE.Vector3(-right[i].x, right[i].y, z));
  }
  for (const p of right) pts.push(p.clone());
  return pts;
}

const PAINT = new THREE.Color("#2c2c2a");
const PRIMER = new THREE.Color("#a45b3d");
const RUST = new THREE.Color("#7a3a18");
const RUST_DARK = new THREE.Color("#3d2416");
const CHALK = new THREE.Color("#6d6a64");

function paintAt(p: THREE.Vector3, target: THREE.Color) {
  const primer =
    p.x < -0.45 && p.z > 0.14 && p.z < 0.98 && p.y > 0.32 && p.y < 1.02;
  target.copy(primer ? PRIMER : PAINT);

  let rust = 0;
  if (p.y < 0.42) rust += ((0.42 - p.y) / 0.42) * 0.95;
  for (const axle of [REAR_AXLE, FRONT_AXLE]) {
    const d = Math.hypot(p.z - axle, p.y - 0.36);
    if (d < 0.55 && Math.abs(p.x) > 0.55) rust += (1 - d / 0.55) * 0.85;
  }
  const patch = fbm(p.x * 2.4, p.y * 2.4, p.z * 2.4);
  if (patch > 0.62) rust += (patch - 0.62) * 2.4;
  rust = THREE.MathUtils.clamp(rust, 0, 1);
  if (!primer && rust < 0.25 && patch > 0.78) {
    target.lerp(CHALK, (patch - 0.78) * 2.2);
  }
  target.lerp(RUST, rust);
  if (rust > 0.65) target.lerp(RUST_DARK, (rust - 0.65) * 1.4);
  const grit = 0.82 + fbm(p.x * 9, p.y * 9, p.z * 9) * 0.28;
  target.multiplyScalar(grit);
}

function applyDents(pos: THREE.BufferAttribute) {
  const dents = [
    { x: -0.86, y: 0.68, z: 0.55, r: 0.2, d: 0.028 },
    { x: 0.9, y: 0.7, z: 1.4, r: 0.18, d: 0.035 },
    { x: -0.88, y: 0.55, z: -1.45, r: 0.16, d: 0.03 },
    { x: 0.84, y: 0.6, z: -0.4, r: 0.14, d: 0.02 },
  ];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (Math.abs(v.x) < 0.45) continue;
    for (const dent of dents) {
      const dx = v.x - dent.x;
      const dy = v.y - dent.y;
      const dz = v.z - dent.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < dent.r) {
        const k = 1 - dist / dent.r;
        v.x += -Math.sign(v.x) * dent.d * k * k;
      }
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
}

function buildTub() {
  const zSteps = 120;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= zSteps; i++) {
    const z = THREE.MathUtils.lerp(TUB_Z0, TUB_Z1, i / zSteps);
    rings.push(tubRing(z));
  }
  const n = rings[0].length;
  const positions: number[] = [];
  for (const ring of rings) {
    for (const p of ring) positions.push(p.x, p.y, p.z);
  }
  const indices: number[] = [];
  const inWheel = (ax: number, ay: number, az: number) => {
    if (Math.abs(ax) < 0.38) return false;
    for (const axle of [REAR_AXLE, FRONT_AXLE]) {
      const dist = Math.hypot(az - axle, ay - 0.32);
      if (dist < 0.36 && ay < 0.36 && Math.abs(ax) > 0.45) return true;
    }
    return false;
  };
  for (let i = 0; i < zSteps; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c = (i + 1) * n + j;
      const d = c + 1;
      const pa = rings[i][j];
      const pb = rings[i][j + 1];
      const pc = rings[i + 1][j];
      const cx = (pa.x + pb.x + pc.x) / 3;
      const cy = (pa.y + pb.y + pc.y) / 3;
      const cz = (pa.z + pb.z + pc.z) / 3;
      if (inWheel(cx, cy, cz)) continue;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  applyDents(geo.getAttribute("position") as THREE.BufferAttribute);
  const pos = geo.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    paintAt(v, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.22,
    color: 0xffffff,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "tub";

  const capMat = new THREE.MeshStandardMaterial({
    color: 0x242422,
    roughness: 0.86,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  group.add(mesh);
  group.add(capRing(rings[0], capMat, true));
  group.add(capRing(rings[rings.length - 1], capMat, false));
  return group;
}

function capRing(ring: THREE.Vector3[], mat: THREE.Material, rear: boolean) {
  const positions: number[] = [];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= ring.length;
  cy /= ring.length;
  cz /= ring.length;
  positions.push(cx, cy, cz);
  for (const p of ring) positions.push(p.x, p.y, p.z);
  const indices: number[] = [];
  for (let j = 1; j < ring.length; j++) {
    if (rear) indices.push(0, j + 1, j);
    else indices.push(0, j, j + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function gridMesh(
  uSeg: number,
  vSeg: number,
  fn: (u: number, v: number) => THREE.Vector3,
  mat: THREE.Material,
) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= vSeg; i++) {
    for (let j = 0; j <= uSeg; j++) {
      const p = fn(j / uSeg, i / vSeg);
      positions.push(p.x, p.y, p.z);
    }
  }
  const stride = uSeg + 1;
  for (let i = 0; i < vSeg; i++) {
    for (let j = 0; j < uSeg; j++) {
      const a = i * stride + j;
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function hoodY(z: number) {
  const t = THREE.MathUtils.clamp((z - 0.9) / 1.16, 0, 1);
  return THREE.MathUtils.lerp(1.03, 0.78, t * (0.65 + 0.35 * t));
}

function buildHood() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1a18,
    roughness: 0.55,
    metalness: 0.35,
  });
  return gridMesh(18, 22, (u, v) => {
    const z = THREE.MathUtils.lerp(0.9, 2.08, v);
    const width = THREE.MathUtils.lerp(0.72, 0.5, v * v);
    const x = (u - 0.5) * 2 * width;
    const crown = Math.cos((u - 0.5) * Math.PI) * 0.03;
    const ridge =
      Math.exp(-((Math.abs(x) - 0.18) ** 2) * 90) * 0.012 * (1 - v);
    let y = hoodY(z) + crown + ridge;
    const dx = x + 0.12;
    const dz = z - 1.45;
    const dist = Math.hypot(dx * 1.4, dz);
    if (dist < 0.22) y -= 0.02 * (1 - dist / 0.22) ** 2;
    return new THREE.Vector3(x, y, z);
  }, mat);
}

function buildTrunk() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6e6a60,
    roughness: 0.92,
    metalness: 0.05,
  });
  return gridMesh(14, 12, (u, v) => {
    const z = THREE.MathUtils.lerp(-2.02, -1.42, v);
    const width = THREE.MathUtils.lerp(0.62, 0.74, v);
    const x = (u - 0.5) * 2 * width;
    const crown = Math.cos((u - 0.5) * Math.PI) * 0.02;
    const y = THREE.MathUtils.lerp(1.02, 1.08, v) + crown;
    return new THREE.Vector3(x, y, z);
  }, mat);
}

function buildRoof() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x262624,
    roughness: 0.84,
    metalness: 0.16,
  });
  return gridMesh(10, 16, (u, v) => {
    const z = THREE.MathUtils.lerp(-0.98, 0.42, v);
    const pinch = Math.sin(v * Math.PI);
    const width = THREE.MathUtils.lerp(0.5, 0.62, pinch);
    const x = (u - 0.5) * 2 * width;
    const crown = Math.cos((u - 0.5) * Math.PI) * 0.025;
    const y = 1.34 + crown - (1 - pinch) * 0.03;
    return new THREE.Vector3(x, y, z);
  }, mat);
}

function strut(a: V3, b: V3, thickness: number, mat: THREE.Material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, len), mat);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  return mesh;
}

function quad(pts: V3[], mat: THREE.Material) {
  const positions = pts.flat();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const double = mat instanceof THREE.MeshStandardMaterial ? mat.clone() : mat;
  if (double instanceof THREE.MeshStandardMaterial) double.side = THREE.DoubleSide;
  return new THREE.Mesh(geo, double);
}

function buildPillars() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x262624,
    roughness: 0.84,
    metalness: 0.16,
  });
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(strut([s * 0.48, 1.32, 0.38], [s * 0.7, 0.98, 0.88], 0.09, mat));
    g.add(strut([s * 0.64, 1.31, 0.08], [s * 0.8, 0.96, 0.08], 0.08, mat));
    const c: V3[] = [
      [s * 0.5, 1.3, -0.9],
      [s * 0.46, 1.16, -1.22],
      [s * 0.84, 0.98, -1.18],
      [s * 0.86, 0.99, -0.66],
    ];
    g.add(quad(c, mat));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.28), mat);
    rail.position.set(s * 0.6, 1.29, -0.28);
    g.add(rail);
  }
  return g;
}

function shapePanel(points: [number, number][], x: number, mat: THREE.Material) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateY(-Math.PI / 2);
  geo.translate(x, 0, 0);
  return new THREE.Mesh(geo, mat);
}

function crackTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "rgba(150, 176, 190, 0.55)";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "rgba(230, 236, 240, 0.9)";
  g.lineWidth = 2;
  const crack = (x: number, y: number, ang: number, len: number, depth: number) => {
    if (depth > 4 || len < 8) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    crack(x2, y2, ang - 0.5, len * 0.62, depth + 1);
    crack(x2, y2, ang + 0.7, len * 0.5, depth + 1);
  };
  crack(340, 90, 2.4, 70, 0);
  crack(340, 90, 0.4, 80, 0);
  crack(180, 40, 1.2, 50, 1);
  g.fillStyle = "rgba(40, 36, 30, 0.28)";
  g.fillRect(0, 190, 512, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildGlass() {
  const g = new THREE.Group();
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x8ea6b8,
    transparent: true,
    opacity: 0.45,
    roughness: 0.16,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const front: [number, number][] = [
    [0.16, 0.98],
    [0.9, 0.99],
    [0.76, 1.27],
    [0.22, 1.29],
  ];
  const rear: [number, number][] = [
    [0.02, 0.98],
    [-0.62, 0.97],
    [-0.92, 1.12],
    [-0.78, 1.27],
    [-0.02, 1.28],
  ];
  for (const s of [-1, 1]) {
    g.add(shapePanel(front, s * 0.8, sideMat));
    g.add(shapePanel(rear, s * 0.79, sideMat));
  }

  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.62, 0.99, 0.9,
        0.62, 0.99, 0.9,
        0.48, 1.29, 0.4,
        -0.48, 1.29, 0.4,
      ],
      3,
    ),
  );
  windGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  windGeo.setIndex([0, 1, 2, 0, 2, 3]);
  windGeo.computeVertexNormals();
  const windMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: crackTexture(),
    transparent: true,
    opacity: 0.8,
    roughness: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  g.add(new THREE.Mesh(windGeo, windMat));

  const rearGeo = new THREE.BufferGeometry();
  rearGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, 1.26, -0.9, 0.5, 1.26, -0.9, 0.46, 1.06, -1.5, -0.46, 1.06, -1.5],
      3,
    ),
  );
  rearGeo.setIndex([0, 2, 1, 0, 3, 2]);
  rearGeo.computeVertexNormals();
  g.add(new THREE.Mesh(rearGeo, sideMat));
  return g;
}

function capsuleShape(w: number, h: number) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.absarc(0, -(h / 2 - r), r, Math.PI, Math.PI * 2, false);
  return s;
}

function buildGrille() {
  const g = new THREE.Group();
  g.name = "grille";
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xc8c2b4,
    roughness: 0.38,
    metalness: 1,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.7, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const kidney = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(capsuleShape(0.15, 0.28), { depth: 0.04, bevelEnabled: false }),
      chrome,
    );
    const inner = new THREE.Mesh(
      new THREE.ExtrudeGeometry(capsuleShape(0.12, 0.24), { depth: 0.05, bevelEnabled: false }),
      black,
    );
    inner.position.z = 0.005;
    kidney.add(frame, inner);
    for (let i = 0; i < 7; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.012), chrome);
      slat.position.set(-0.04 + i * 0.013, 0, 0.055);
      kidney.add(slat);
    }
    kidney.position.set(s * 0.11, 0.6, 2.1);
    g.add(kidney);
  }
  const scar = new THREE.Mesh(
    new THREE.CircleGeometry(0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a3834, roughness: 0.6, metalness: 0.5 }),
  );
  scar.position.set(0, 0.8, 2.09);
  g.add(scar);
  return g;
}

function buildHeadlights() {
  const g = new THREE.Group();
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.3 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xd5e4ee,
    transparent: true,
    opacity: 0.28,
    roughness: 0.1,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xf4f8ff,
    emissive: 0xd0e4ff,
    emissiveIntensity: 2.4,
    roughness: 0.25,
  });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0xff8a1e,
    emissive: 0xff6a00,
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const shape = new THREE.Shape();
  shape.moveTo(0.02, 0.02);
  shape.lineTo(0.46, 0.03);
  shape.lineTo(0.44, 0.15);
  shape.lineTo(0.04, 0.2);
  shape.closePath();
  const housingGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
  });

  for (const s of [-1, 1]) {
    const lamp = new THREE.Group();
    const housing = new THREE.Mesh(housingGeo, housingMat);
    const lens = new THREE.Mesh(housingGeo, lensMat);
    lens.position.z = 0.02;
    lamp.add(housing, lens);
    for (const ox of [0.14, 0.27]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.0055, 8, 24), eyeMat);
      ring.position.set(ox, 0.1, 0.11);
      lamp.add(ring);
      const bowl = new THREE.Mesh(
        new THREE.CircleGeometry(0.03, 12),
        new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.4, metalness: 0.6 }),
      );
      bowl.position.set(ox, 0.1, 0.09);
      lamp.add(bowl);
    }
    const amber = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), amberMat);
    amber.position.set(0.4, 0.09, 0.1);
    lamp.add(amber);
    lamp.scale.x = s;
    lamp.position.set(s * 0.2, 0.52, 2.02);
    g.add(lamp);
  }

  const tapeMat = new THREE.MeshStandardMaterial({
    color: 0xd8c07a,
    transparent: true,
    opacity: 0.62,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  for (const ang of [-0.15, 0.22]) {
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.032, 0.01), tapeMat);
    tape.position.set(0.52, 0.64, 2.16);
    tape.rotation.z = ang;
    g.add(tape);
  }
  return g;
}

function buildTaillights() {
  const g = new THREE.Group();
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x9a1612,
    emissive: 0x5a0806,
    emissiveIntensity: 0.7,
    roughness: 0.28,
    metalness: 0.08,
  });
  const shape = new THREE.Shape();
  shape.moveTo(-0.2, -0.07);
  shape.lineTo(0.18, -0.06);
  shape.lineTo(0.16, 0.08);
  shape.lineTo(-0.18, 0.09);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -0.05);
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xdeded8,
    roughness: 0.3,
    emissive: 0x333333,
    emissiveIntensity: 0.25,
  });
  for (const s of [-1, 1] as const) {
    const lamp = new THREE.Mesh(geo, lensMat);
    lamp.position.set(s * 0.52, 0.74, -2.06);
    lamp.rotation.y = s * 0.22;
    const rev = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.012), whiteMat);
    rev.position.set(s * 0.4, 0.71, -2.07);
    g.add(lamp, rev);
  }
  return g;
}

function buildBumpers() {
  const g = new THREE.Group();
  const frontMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.9, metalness: 0.08 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.24, 0.16), frontMat);
  bar.position.set(-0.2, 0.4, 2.16);
  const stub = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), frontMat);
  stub.position.set(0.58, 0.36, 2.04);
  stub.rotation.y = 0.5;
  stub.rotation.z = -0.2;
  const foam = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xc2a85a, roughness: 1 }),
  );
  foam.position.set(0.72, 0.4, 2.0);
  const intake = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.08, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 }),
  );
  intake.position.set(-0.15, 0.32, 2.24);
  g.add(bar, stub, foam, intake);

  const tieMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d4, roughness: 0.55 });
  for (const y of [0.34, 0.46]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12), tieMat);
    tie.position.set(0.7, y, 2.08);
    tie.rotation.y = Math.PI / 2;
    g.add(tie);
  }

  const rearMat = new THREE.MeshStandardMaterial({ color: 0x4e4a42, roughness: 0.95, metalness: 0 });
  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.14), rearMat);
  rear.position.set(0, 0.4, -2.12);
  g.add(rear);
  const fasciaMat = new THREE.MeshStandardMaterial({ color: 0x2a2926, roughness: 0.82, metalness: 0.12 });
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.38, 0.06), fasciaMat);
  fascia.position.set(0, 0.74, -2.05);
  g.add(fascia);
  return g;
}

function buildWheel(opts: { steel: boolean; color: number; radius: number; width: number }) {
  const g = new THREE.Group();
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 });
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(opts.radius, opts.radius, opts.width * 0.86, 28),
    tireMat,
  );
  tire.rotation.z = Math.PI / 2;
  g.add(tire);

  const rimMat = new THREE.MeshStandardMaterial({
    color: opts.color,
    roughness: opts.steel ? 0.72 : 0.38,
    metalness: opts.steel ? 0.45 : 0.85,
  });
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(opts.radius * 0.16, opts.radius * 0.16, opts.width * 0.7, 12),
    rimMat,
  );
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);

  const discMat = new THREE.MeshStandardMaterial({ color: 0xb7b1a6, roughness: 0.42, metalness: 0.85 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x8d5a32, roughness: 0.6, metalness: 0.5 });
  for (const side of [1, -1]) {
    const faceX = side * opts.width * 0.46;
    if (opts.steel) {
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(opts.radius * 0.34, opts.radius * 0.55, 0.03, 16),
        rimMat,
      );
      face.rotation.z = Math.PI / 2;
      face.position.x = faceX;
      g.add(face);
    } else {
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, opts.radius * 0.48, 0.035), rimMat);
        spoke.position.y = opts.radius * 0.24;
        const pivot = new THREE.Group();
        pivot.rotation.x = (i / 5) * Math.PI * 2;
        pivot.position.x = faceX;
        pivot.add(spoke);
        g.add(pivot);
      }
    }
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(opts.radius * 0.42, opts.radius * 0.42, 0.012, 18),
      discMat,
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.x = faceX - side * 0.012;
    g.add(disc);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), hatMat);
    hat.rotation.z = Math.PI / 2;
    hat.position.x = faceX + side * 0.012;
    g.add(hat);
  }
  return g;
}

function buildWheels() {
  const g = new THREE.Group();
  g.name = "wheels";
  const specs = [
    { x: -0.78, z: FRONT_AXLE, camber: 0.09, steel: true, color: 0x6a5e4c, radius: 0.315, width: 0.18 },
    { x: 0.78, z: FRONT_AXLE, camber: 0.09, steel: false, color: 0xd0d0c8, radius: 0.305, width: 0.19 },
    { x: -0.8, z: REAR_AXLE, camber: 0.045, steel: false, color: 0x2a2a28, radius: 0.33, width: 0.22 },
    { x: 0.8, z: REAR_AXLE, camber: 0.045, steel: true, color: 0x8d8474, radius: 0.322, width: 0.21 },
  ];
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1, side: THREE.DoubleSide });
  for (const s of specs) {
    const wheel = buildWheel(s);
    wheel.position.set(s.x, s.radius, s.z);
    wheel.rotation.z = Math.sign(s.x) * s.camber;
    g.add(wheel);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.36, 18), wellMat);
    well.position.set(Math.sign(s.x) * 0.4, s.radius, s.z);
    well.rotation.y = s.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(well);
  }
  return g;
}

function plateTexture() {
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 114;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f4f4f0";
  g.fillRect(0, 0, 520, 114);
  g.strokeStyle = "#1a1a1a";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 514, 108);
  g.fillStyle = "#1d4e9e";
  g.fillRect(8, 8, 52, 98);
  g.fillStyle = "#f4d76a";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(34 + Math.cos(a) * 16, 40 + Math.sin(a) * 16, 2.1, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#ffffff";
  g.font = "bold 18px sans-serif";
  g.textAlign = "center";
  g.fillText("PL", 34, 84);
  g.fillStyle = "#161616";
  g.font = "bold 64px sans-serif";
  g.textAlign = "left";
  g.fillText("WGM 6RUZ", 78, 78);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildDetails(plate: THREE.Texture | null) {
  const g = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({
    map: plate,
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.05,
  });
  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.012), plateMat);
  frontPlate.position.set(-0.08, 0.4, 2.25);
  frontPlate.rotation.y = 0.04;
  const rearPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.012), plateMat);
  rearPlate.position.set(0.02, 0.58, -2.09);
  g.add(frontPlate, rearPlate);

  const holeMat = new THREE.MeshStandardMaterial({ color: 0x100c0a, roughness: 1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x8a4218, roughness: 0.95, metalness: 0.1 });
  const holes = [
    { y: 0.48, z: -1.15, r: 0.05, side: -1 },
    { y: 0.32, z: 0.2, r: 0.038, side: -1 },
    { y: 0.5, z: -1.5, r: 0.032, side: 1 },
  ];
  for (const h of holes) {
    const x = h.side * (halfWidth(h.z) + 0.01);
    const cavity = new THREE.Mesh(new THREE.CircleGeometry(h.r, 12), holeMat);
    const rim = new THREE.Mesh(new THREE.RingGeometry(h.r * 0.82, h.r * 1.28, 12), rimMat);
    for (const m of [cavity, rim]) {
      m.position.set(x, h.y, h.z);
      m.rotation.y = h.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    rim.position.x += h.side * 0.003;
    g.add(cavity, rim);
  }

  const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 });
  const handles = [
    { x: -0.9, z: 0.55, rot: 0 },
    { x: 0.9, z: 0.55, rot: 0 },
    { x: -0.89, z: -0.42, rot: 0.7 },
    { x: 0.9, z: -0.42, rot: 0 },
  ];
  for (const h of handles) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.12), handleMat);
    handle.position.set(h.x, 0.74, h.z);
    handle.rotation.x = h.rot;
    g.add(handle);
  }

  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.7, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mirrorMat);
    pod.scale.set(1.3, 0.85, 1.6);
    pod.position.set(s * 0.96, 1.05, 0.72);
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.045, 10),
      new THREE.MeshStandardMaterial({ color: s < 0 ? 0x22262a : 0xc9b27a, roughness: 0.2, metalness: 0.6 }),
    );
    glass.position.set(s * 1.04, 1.05, 0.72);
    glass.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(pod, glass);
  }

  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.45, metalness: 0.8 });
  for (const s of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 1.55), trimMat);
    trim.position.set(s * 0.875, 0.985, -0.05);
    g.add(trim);
  }

  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.045, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.7 }),
  );
  spoiler.position.set(0.03, 1.12, -1.82);
  spoiler.rotation.z = -0.03;
  spoiler.rotation.y = 0.04;
  g.add(spoiler);

  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: 0x5c331c, roughness: 0.55, metalness: 0.6 }),
  );
  exhaust.rotation.x = Math.PI / 2 + 0.35;
  exhaust.position.set(-0.32, 0.16, -2.22);
  g.add(exhaust);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }),
  );
  antenna.position.set(0.15, 1.4, -0.7);
  antenna.rotation.z = 0.6;
  g.add(antenna);

  for (const z of [1.02, 0.1, -0.9]) {
    for (const s of [-1, 1]) {
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.58, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x0e0e0c, roughness: 0.8 }),
      );
      seam.position.set(s * (halfWidth(z) + 0.012), 0.64, z);
      g.add(seam);
    }
  }
  return g;
}

function buildInterior() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.9 });
  const foam = new THREE.MeshStandardMaterial({ color: 0xc2a37a, roughness: 0.85 });
  for (const s of [-1, 1]) {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.45), cloth);
    cushion.position.set(s * 0.36, 0.72, 0.12);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.1), cloth);
    back.position.set(s * 0.36, 1.02, -0.02);
    back.rotation.x = -0.3;
    g.add(cushion, back);
  }
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.03), foam);
  tear.position.set(-0.46, 1.02, 0.04);
  g.add(tear);

  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.75 }),
  );
  dash.position.set(0, 0.92, 0.55);
  g.add(dash);

  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.016, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55 }),
  );
  wheel.add(rim);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.14, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.5 }),
    );
    spoke.position.y = 0.02;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 3) * Math.PI * 2;
    pivot.add(spoke);
    wheel.add(pivot);
  }
  wheel.position.set(-0.36, 1.02, 0.42);
  wheel.rotation.x = 0.55;
  g.add(wheel);

  const shifter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }),
  );
  shifter.position.set(0.08, 0.58, 0.18);
  shifter.rotation.x = 0.3;
  g.add(shifter);

  const rearSeat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.4), cloth);
  rearSeat.position.set(0, 0.62, -0.55);
  g.add(rearSeat);
  return g;
}

export function createCar() {
  const car = new THREE.Group();
  car.name = "e46";
  car.userData = { type: "car", model: "e46-lci-sedan", stage: 1 };
  car.add(buildTub());
  car.add(buildHood());
  car.add(buildTrunk());
  car.add(buildRoof());
  car.add(buildPillars());
  car.add(buildGlass());
  car.add(buildGrille());
  car.add(buildHeadlights());
  car.add(buildTaillights());
  car.add(buildBumpers());
  car.add(buildWheels());
  car.add(buildDetails(plateTexture()));
  car.add(buildInterior());
  car.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return car;
}
