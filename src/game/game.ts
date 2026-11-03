import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadCar, type CarWheel } from "../car/loadCar";
import { readInput, readPad, type DriveInput } from "./input";
import { getSpec, getLook, onGarage } from "./garage";
import { audioScale, getSettings } from "./settings";
import { getScreen, pollPause, setScreen } from "./shell";
import { createPhys, forwardOf, stepPhys, type Phys } from "./physics";
import { createTrack, surfaceAt, type Track } from "./track";

type AudioBits = {
  ctx: AudioContext;
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  squeal: GainNode;
};

function makeAudio(): AudioBits | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1600;
  bp.Q.value = 0.7;
  const squeal = ctx.createGain();
  squeal.gain.value = 0;
  noise.connect(bp);
  bp.connect(squeal);
  squeal.connect(ctx.destination);
  noise.start();
  return { ctx, osc, filter, gain, squeal };
}

function smokeTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, "rgba(230,230,230,0.7)");
  grd.addColorStop(1, "rgba(230,230,230,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function startGame(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const applyQuality = () => {
    const low = getSettings().quality === "low";
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = !low;
    sun.castShadow = !low;
  };
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb7c3ce);
  scene.fog = new THREE.Fog(0xb7c3ce, 120, 2200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;

  const hemi = new THREE.HemisphereLight(0xd5e4f2, 0x3d4a32, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.1);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 280;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun, sun.target);
  applyQuality();

  const track = createTrack();
  scene.add(track.group);
  const car = await loadCar();
  scene.add(car.root);
  onGarage(() => car.applyLook(getLook()));

  const tex = smokeTexture();
  const smokeMat = new THREE.SpriteMaterial({ map: tex ?? undefined, transparent: true, depthWrite: false, color: 0xdedede });
  const smokes: { sprite: THREE.Sprite; life: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const sprite = new THREE.Sprite(smokeMat);
    sprite.visible = false;
    sprite.scale.set(1.6, 1.6, 1.6);
    scene.add(sprite);
    smokes.push({ sprite, life: 0 });
  }
  const markGeo = new THREE.PlaneGeometry(0.35, 0.9);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.45, depthWrite: false });
  const marks: THREE.Mesh[] = [];
  for (let i = 0; i < 160; i++) {
    const m = new THREE.Mesh(markGeo, markMat);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    marks.push(m);
  }
  let markCursor = 0;

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);
  const params = new URLSearchParams(location.search);
  const demo = params.get("demo");
  const shot = params.get("shot");
  if (demo || shot === "track") setScreen("play");
  else if (shot === "garage") setScreen("garage");
  else setScreen("menu");
  const phys = createPhys(track.start.x, track.start.z, track.start.yaw);
  let drift = 0;
  let combo = 1;
  let driftTime = 0;
  let best = Number(localStorage.getItem("smg-best") ?? "0") || 0;
  let audio: AudioBits | null = null;
  let resetLatch = false;
  let elapsed = 0;
  const camPos = new THREE.Vector3(phys.x, 6, phys.z - 12);
  const look = new THREE.Vector3();
  const wheelPos = new THREE.Vector3();

  const hud = {
    speed: document.querySelector("#speed")!,
    drift: document.querySelector("#drift")!,
    combo: document.querySelector("#combo")!,
    best: document.querySelector("#best")!,
    pad: document.querySelector("#pad")!,
  };
  const fmt = (n: number) => Math.floor(n).toLocaleString("pl-PL");
  hud.best.textContent = fmt(best);

  const ensureAudio = () => {
    if (!audio) audio = makeAudio();
    if (audio && audio.ctx.state === "suspended") void audio.ctx.resume();
  };
  window.addEventListener("pointerdown", ensureAudio, { once: true });
  window.addEventListener("keydown", ensureAudio, { once: true });

  const placeCar = () => {
    const g = surfaceAt(track, phys.x, phys.z);
    const fx = Math.sin(phys.yaw);
    const fz = Math.cos(phys.yaw);
    const ahead = surfaceAt(track, phys.x + fx * 2.2, phys.z + fz * 2.2);
    const side = surfaceAt(track, phys.x + Math.cos(phys.yaw) * 1.2, phys.z - Math.sin(phys.yaw) * 1.2);
    const pitch = Math.atan2(ahead.y - g.y, 2.2);
    const roll = Math.atan2(side.y - g.y, 1.2);
    car.root.position.set(phys.x, g.y + 0.02, phys.z);
    car.root.rotation.order = "YXZ";
    car.root.rotation.y = Math.PI + phys.yaw;
    car.root.rotation.x = -pitch;
    car.root.rotation.z = -roll;
    for (const w of car.wheels) {
      w.spin.rotation.x = -phys.wheelSpin;
      w.steer.rotation.z = w.front ? phys.steer : 0;
    }
  };

  const resetCar = () => {
    phys.x = track.start.x;
    phys.z = track.start.z;
    phys.yaw = track.start.yaw;
    phys.vx = 0;
    phys.vz = 0;
    phys.yawRate = 0;
    phys.steer = 0;
    phys.steerCmd = 0;
    drift = 0;
    combo = 1;
    driftTime = 0;
  };

  const spawnSmoke = (x: number, y: number, z: number) => {
    const slot = smokes.find((s) => s.life <= 0) ?? smokes[0];
    slot.life = 0.8;
    slot.sprite.visible = true;
    slot.sprite.position.set(x, y, z);
    slot.sprite.material.opacity = 0.55;
    slot.sprite.scale.set(1.2, 1.2, 1.2);
  };

  const dropMark = (x: number, z: number, yaw: number) => {
    const m = marks[markCursor % marks.length];
    markCursor++;
    m.visible = true;
    m.position.set(x, surfaceAt(track, x, z).y + 0.05, z);
    m.rotation.y = yaw;
  };

  const demoInput = (t: number): DriveInput | null => {
    if (demo !== "drift") return null;
    if (t < 2.2) return { throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, source: "keys" };
    if (t < 2.9) return { throttle: 1, brake: 0, steer: -0.75, handbrake: true, reset: false, source: "keys" };
    if (t < 8) return { throttle: 0.85, brake: 0, steer: 0.4, handbrake: false, reset: false, source: "keys" };
    return { throttle: 0.7, brake: 0, steer: 0.2, handbrake: false, reset: false, source: "keys" };
  };

  const clock = new THREE.Clock();
  let simAcc = 0;
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);
  placeCar();
  document.body.dataset.ready = "1";
  let appliedQuality = "";
  let showAngle = 0.8;
  let orbiting = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (getScreen() !== "garage") return;
    orbiting = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!orbiting) return;
    showAngle += e.movementX * 0.01;
  });
  const endOrbit = () => {
    orbiting = false;
  };
  canvas.addEventListener("pointerup", endOrbit);
  canvas.addEventListener("pointercancel", endOrbit);

  const tick = () => {
    const quality = getSettings().quality;
    if (quality !== appliedQuality) {
      appliedQuality = quality;
      applyQuality();
    }
    const playing = getScreen() === "play";
    const padMeta = readPad();
    document.body.classList.toggle("pad-on", padMeta.connected);
    pollPause(padMeta.options);
    if (!playing && !demo) {
      clock.getDelta();
      placeCar();
      camera.up.set(0, 1, 0);
      if (getScreen() === "garage") {
        if (!orbiting) showAngle += 0.004;
        const gy = surfaceAt(track, phys.x, phys.z).y;
        camera.position.set(phys.x + Math.sin(showAngle) * 6.4, gy + 1.7, phys.z + Math.cos(showAngle) * 6.4);
        camera.lookAt(phys.x, gy + 0.75, phys.z);
        document.body.dataset.shot = "garage";
      } else {
        const f0 = forwardOf(phys.yaw);
        const gy = surfaceAt(track, phys.x, phys.z).y;
        camera.position.set(phys.x - f0.x * 8, gy + 3.2, phys.z - f0.z * 8);
        camera.lookAt(phys.x, gy + 0.8, phys.z);
        if (!document.body.dataset.shot) document.body.dataset.shot = "menu";
      }
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
      return;
    }
    simAcc = Math.min(0.25, simAcc + clock.getDelta());
    const dt = 1 / 60;
    let steps = 0;
    let input = demoInput(elapsed) ?? readInput();
    let slipAngle = 0;
    let vFwd = 0;
    while (simAcc >= dt && steps < 15) {
      simAcc -= dt;
      steps++;
      elapsed += dt;
      const raw = demoInput(elapsed) ?? readInput();
      const sens = getSettings().steerSensitivity;
      input = { ...raw, steer: Math.min(1, Math.max(-1, raw.steer * sens)) };
      if (input.reset && !resetLatch) resetCar();
      resetLatch = input.reset;

      const before = surfaceAt(track, phys.x, phys.z);
      const spec = getSpec();
      const grip = (before.onAsphalt ? 1 : 1.35) * spec.grip;
      const slip = stepPhys(phys, input, dt, grip, spec.setup);
      slipAngle = slip.slip;
      vFwd = slip.vFwd;
      const hit = surfaceAt(track, phys.x, phys.z);
      if (!hit.onAsphalt) {
        const k = Math.exp(-0.4 * dt);
        phys.vx *= k;
        phys.vz *= k;
      }
      const shove = (need: number, dir: number) => {
        phys.x += -hit.outer.tz * need * dir;
        phys.z += hit.outer.tx * need * dir;
        const outX = hit.outer.tz * dir;
        const outZ = -hit.outer.tx * dir;
        const outward = phys.vx * outX + phys.vz * outZ;
        if (outward > 0) {
          phys.vx -= outX * outward * 1.15;
          phys.vz -= outZ * outward * 1.15;
        }
        phys.yawRate *= 0.92;
      };
      if (hit.outside) shove(-track.halfOuter - hit.outer.signed, 1);
      else if (hit.inside) shove(hit.outer.signed - track.halfOuter, -1);
      const fx = Math.sin(phys.yaw);
      const fz = Math.cos(phys.yaw);
      const slope = (surfaceAt(track, phys.x + fx * 2, phys.z + fz * 2).y - hit.y) / 2;
      phys.vx -= fx * 9.81 * slope * dt;
      phys.vz -= fz * 9.81 * slope * dt;
    }
    if (steps === 0) {
      requestAnimationFrame(tick);
      return;
    }

    const speedKmh = Math.hypot(phys.vx, phys.vz) * 3.6;
    const units = getSettings().units;
    const angle = (slipAngle * 180) / Math.PI;
    const drifting = speedKmh > 28 && angle > 12;
    if (drifting) {
      driftTime += dt * steps;
      combo = 1 + Math.min(4, driftTime * 0.35);
      drift += angle * (speedKmh / 40) * combo * dt * steps * 12;
    } else if (driftTime > 0.35) {
      if (drift > best) {
        best = drift;
        localStorage.setItem("smg-best", String(best));
      }
      driftTime = 0;
      combo = 1;
      drift = 0;
    } else {
      driftTime = 0;
    }
    const shown = units === "mph" ? speedKmh * 0.621371 : speedKmh;
    hud.speed.textContent = `${Math.round(shown)}`;
    const unitEl = document.querySelector("#unit");
    if (unitEl) unitEl.textContent = units === "mph" ? "mph" : "km/h";
    const hudEl = document.querySelector<HTMLElement>("#hud");
    if (hudEl && getScreen() === "play") hudEl.hidden = !getSettings().hud;
    hud.drift.textContent = fmt(drift);
    hud.combo.textContent = drifting ? `x${combo.toFixed(1)}` : "—";
    hud.best.textContent = fmt(best);
    hud.pad.textContent =
      input.source === "pad" ? "Pad połączony" : input.source === "touch" ? "Dotyk" : input.source === "keys" ? "Klawiatura" : "Podłącz pad albo użyj dotyku";

    if (audio) {
      const vol = audioScale();
      const rpm = 18 + Math.abs(vFwd) * 3.1 + input.throttle * 22;
      audio.osc.frequency.value = 38 + rpm * 3.4;
      audio.filter.frequency.value = 280 + input.throttle * 900 + Math.abs(vFwd) * 18;
      audio.gain.gain.value = vol * (0.012 + input.throttle * 0.03 + Math.min(0.02, Math.abs(vFwd) * 0.0004));
      audio.squeal.gain.value = vol * (drifting ? Math.min(0.05, (angle - 12) * 0.0015) : 0);
    }

    placeCar();
    if (drifting) {
      for (const w of car.wheels.filter((wheel) => !wheel.front)) {
        w.steer.getWorldPosition(wheelPos);
        if (markCursor % 2 === 0) dropMark(wheelPos.x, wheelPos.z, phys.yaw);
        if (Math.random() < 0.7) spawnSmoke(wheelPos.x, surfaceAt(track, wheelPos.x, wheelPos.z).y + 0.25, wheelPos.z);
      }
    }
    for (const s of smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.sprite.position.y += dt * 0.8;
      s.sprite.material.opacity = Math.max(0, s.life);
      s.sprite.scale.multiplyScalar(1 + dt * 0.8);
      if (s.life <= 0) s.sprite.visible = false;
    }

    if (demo === "overview") {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of track.outer) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minZ = Math.min(minZ, p[1]);
        maxZ = Math.max(maxZ, p[1]);
      }
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      camera.position.set(cx, 720, cz + 0.2);
      camera.up.set(0, 0, -1);
      camera.lookAt(cx, 0, cz);
      document.body.dataset.shot = "overview";
    } else {
      camera.up.set(0, 1, 0);
      const f = forwardOf(phys.yaw);
      const farCam = getSettings().camera === "far";
      const dist = farCam ? 11.5 : 6.6;
      const camY = farCam ? 4.1 : 2.2;
      const groundY = surfaceAt(track, phys.x, phys.z).y;
      const desired = new THREE.Vector3(phys.x - f.x * dist + f.z * 0.2, groundY + camY, phys.z - f.z * dist);
      camPos.lerp(desired, Math.min(1, 1 - Math.exp(-4 * dt * steps)));
      camera.position.copy(camPos);
      look.set(phys.x + f.x * 5, groundY + 0.8, phys.z + f.z * 5);
      camera.lookAt(look);
      if (shot === "track") {
        const i = Math.floor(track.frames.length * 0.33);
        const frame = track.frames[i];
        const aim = track.frames[Math.min(track.frames.length - 1, i + 10)];
        camera.position.set(frame.x + frame.tz * 24, frame.y + 8, frame.z - frame.tx * 16);
        camera.lookAt(aim.x, aim.y + 0.8, aim.z);
        document.body.dataset.shot = "track";
      }
      if (demo === "drift" && elapsed > 3.25) document.body.dataset.shot = "drift";
      if (demo === "touch") document.body.dataset.shot = "touch";
    }

    sun.position.set(phys.x + 40, 90, phys.z + 20);
    sun.target.position.set(phys.x, 0, phys.z);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  return { phys, track, wheels: car.wheels as CarWheel[], reset: resetCar };
}

export type Running = {
  phys: Phys;
  track: Track;
};
