import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/bmw-m3-coupe-e46.glb`;

/** Wheel hubs in the GLB's inch space (X right, Y forward, Z up). */
const HUBS = [
  { front: true, x: -31.4, y: 57.6, z: 13.1 },
  { front: true, x: 31.4, y: 57.6, z: 13.1 },
  { front: false, x: -31.6, y: -49.5, z: 13.3 },
  { front: false, x: 31.8, y: -49.5, z: 13.3 },
];

const WHEEL_MATERIALS = new Set(["llanta", "M305_rin", "disk"]);

export type CarWheel = {
  steer: THREE.Group;
  spin: THREE.Group;
  front: boolean;
};

export type Finish = "gloss" | "metallic" | "pearl" | "matte" | "chrome";

export type Look = {
  finish: Finish;
  paint: string;
  rim: string;
  ride: number;
  spoiler: boolean;
  tint: number;
};

export type CarVisual = {
  root: THREE.Group;
  wheels: CarWheel[];
  applyLook: (look: Look) => void;
};

const FINISH: Record<Finish, { metalness: number; roughness: number; clearcoat: number; iridescence: number }> = {
  gloss: { metalness: 0.12, roughness: 0.16, clearcoat: 0.85, iridescence: 0 },
  metallic: { metalness: 0.84, roughness: 0.3, clearcoat: 0.4, iridescence: 0 },
  pearl: { metalness: 0.38, roughness: 0.2, clearcoat: 1, iridescence: 0.85 },
  matte: { metalness: 0, roughness: 0.94, clearcoat: 0, iridescence: 0 },
  chrome: { metalness: 1, roughness: 0.04, clearcoat: 1, iridescence: 0 },
};

function materialName(mesh: THREE.Mesh) {
  const mat = mesh.material;
  const first = Array.isArray(mat) ? mat[0] : mat;
  return first?.name ?? "";
}

function classify(x: number, y: number, z: number, loose: boolean) {
  const radMax = loose ? 16 : 14.2;
  const dxMax = loose ? 9 : 6.8;
  let best = -1;
  let bestD = 1e9;
  for (let i = 0; i < HUBS.length; i++) {
    const h = HUBS[i];
    const dx = x - h.x;
    const dy = y - h.y;
    const dz = z - h.z;
    if (Math.abs(dx) > dxMax) continue;
    if (Math.hypot(dy, dz) > radMax) continue;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function gather(
  pos: THREE.BufferAttribute,
  norm: THREE.BufferAttribute | null,
  uv: THREE.BufferAttribute | null,
  ids: number[],
  origin: { x: number; y: number; z: number } | null,
) {
  const p = new Float32Array(ids.length * 3);
  const n = norm ? new Float32Array(ids.length * 3) : null;
  const t = uv ? new Float32Array(ids.length * 2) : null;
  for (let i = 0; i < ids.length; i++) {
    const vi = ids[i];
    p[i * 3] = pos.getX(vi) - (origin?.x ?? 0);
    p[i * 3 + 1] = pos.getY(vi) - (origin?.y ?? 0);
    p[i * 3 + 2] = pos.getZ(vi) - (origin?.z ?? 0);
    if (n && norm) {
      n[i * 3] = norm.getX(vi);
      n[i * 3 + 1] = norm.getY(vi);
      n[i * 3 + 2] = norm.getZ(vi);
    }
    if (t && uv) {
      t[i * 2] = uv.getX(vi);
      t[i * 2 + 1] = uv.getY(vi);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  if (n) geo.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  else geo.computeVertexNormals();
  if (t) geo.setAttribute("uv", new THREE.BufferAttribute(t, 2));
  return geo;
}

function splitMesh(mesh: THREE.Mesh, wheels: CarWheel[]) {
  const name = materialName(mesh);
  const loose = WHEEL_MATERIALS.has(name);
  const tire = name === "material";
  if (!loose && !tire) return;

  const geo = mesh.geometry;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const norm = geo.getAttribute("normal") as THREE.BufferAttribute | null;
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute | null;
  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const buckets: number[][] = [[], [], [], []];
  const body: number[] = [];

  const at = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)] as const;
  for (let t = 0; t < triCount; t++) {
    const ia = index ? index.getX(t * 3) : t * 3;
    const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const a = at(ia);
    const b = at(ib);
    const c = at(ic);
    const w = classify((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3, loose);
    (w >= 0 ? buckets[w] : body).push(ia, ib, ic);
  }

  if (body.length) {
    mesh.geometry = gather(pos, norm, uv, body, null);
    geo.dispose();
  } else {
    mesh.visible = false;
  }

  buckets.forEach((ids, i) => {
    if (!ids.length) return;
    const part = new THREE.Mesh(gather(pos, norm, uv, ids, HUBS[i]), mesh.material);
    part.castShadow = true;
    part.receiveShadow = true;
    wheels[i].spin.add(part);
  });
}

export async function loadCar(): Promise<CarVisual> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;

  let anchor: THREE.Object3D = model;
  model.traverse((obj: THREE.Object3D) => {
    if (obj.name.replaceAll("_", " ").includes("Collada visual scene")) anchor = obj;
  });
  const wheels: CarWheel[] = HUBS.map((hub) => {
    const steer = new THREE.Group();
    steer.position.set(hub.x, hub.y, hub.z);
    const spin = new THREE.Group();
    steer.add(spin);
    anchor.add(steer);
    return { steer, spin, front: hub.front };
  });

  const meshes: THREE.Mesh[] = [];
  model.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  for (const mesh of meshes) splitMesh(mesh, wheels);

  const root = new THREE.Group();
  root.name = "e46";
  root.userData = { type: "car", model: "e46-m3-coupe", wheelsSeparate: true };
  root.rotation.y = Math.PI;
  root.scale.setScalar(0.0254);
  root.add(model);
  root.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const body: THREE.MeshPhysicalMaterial[] = [];
  const rims: THREE.MeshStandardMaterial[] = [];
  let glass: THREE.MeshStandardMaterial | null = null;
  const bodyMeshes: THREE.Object3D[] = [];
  model.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const name = mat?.name ?? "";
    if (name === "M305") {
      const paint = new THREE.MeshPhysicalMaterial({ color: mat.color, roughness: 0.2, metalness: 0.2 });
      mesh.material = paint;
      body.push(paint);
      bodyMeshes.push(mesh);
    } else if (name === "llanta" || name === "M305_rin" || name === "disk") {
      const rim = mat.clone();
      mesh.material = rim;
      rims.push(rim);
    } else if (name === "vidrios") {
      glass = mat.clone();
      glass.transparent = true;
      mesh.material = glass;
    }
  });

  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.45, roughness: 0.4 });
  const spoiler = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(64, 7, 2.4), spoilerMat);
  wing.position.set(0, -79, 51);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5, 12), spoilerMat);
  leg.position.set(-26, -77, 45);
  const legR = leg.clone();
  legR.position.x = 26;
  spoiler.add(wing, leg, legR);
  anchor.add(spoiler);

  const applyLook = (look: Look) => {
    const fin = FINISH[look.finish] ?? FINISH.gloss;
    for (const paint of body) {
      paint.color.set(look.paint);
      paint.metalness = fin.metalness;
      paint.roughness = fin.roughness;
      paint.clearcoat = fin.clearcoat;
      paint.iridescence = fin.iridescence;
    }
    for (const rim of rims) rim.color.set(look.rim);
    if (glass) {
      const tint = Math.min(1, Math.max(0, look.tint));
      glass.color.setRGB(0.15 + (1 - tint) * 0.45, 0.2 + (1 - tint) * 0.55, 0.22 + (1 - tint) * 0.4);
      glass.opacity = 0.28 + tint * 0.62;
    }
    const drop = Math.min(1, Math.max(0, look.ride)) * 5.5;
    for (const mesh of bodyMeshes) mesh.position.z = -drop;
    spoiler.position.z = -drop;
    spoiler.visible = look.spoiler;
  };

  return { root, wheels, applyLook };
}
