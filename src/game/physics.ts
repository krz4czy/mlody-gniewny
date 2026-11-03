/** Arcade RWD drift model. Yaw 0 faces +Z. Positive yaw turns the nose toward +X (driver's left). */

export type Phys = {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  yawRate: number;
  steer: number;
  /** Filtered steer command, -1..1. Auto-centres when the input does. */
  steerCmd: number;
  wheelSpin: number;
};

export type DriveInput = {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
};

/** Default GTR: ~450 KM, lighter, stiffer, more grip. */
const MASS = 1280;
const LF = 1.42;
const LR = 1.3;
const INERTIA = 1850;
const MU_F = 1.62;
const MU_R = 1.3;
const GRAV = 9.81;
const WHEEL_R = 0.33;

function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function latCurve(slip: number) {
  const peak = 0.2;
  const x = Math.abs(slip) / peak;
  if (x <= 1) return x * (1.1 - 0.1 * x);
  return Math.max(0.62, 1 / (1 + (x - 1) * 0.4));
}

export function createPhys(x: number, z: number, yaw: number): Phys {
  return { x, z, yaw, vx: 0, vz: 0, yawRate: 0, steer: 0, steerCmd: 0, wheelSpin: 0 };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function stepPhys(p: Phys, input: DriveInput, dt: number, grip: number) {
  const throttle = Math.min(1, Math.max(0, input.throttle));
  const brake = Math.min(1, Math.max(0, input.brake));
  const steerIn = clamp(input.steer, -1, 1);
  const speed0 = Math.hypot(p.vx, p.vz);
  const dead = Math.abs(steerIn) < 0.06 ? 0 : steerIn;
  const slew = dt * (2.4 / (1 + speed0 / 30));
  p.steerCmd = clamp(p.steerCmd + clamp(dead - p.steerCmd, -slew, slew), -1, 1);
  const lock = 0.64 / (1 + speed0 / 50);
  const targetSteer = -p.steerCmd * lock;
  p.steer += (targetSteer - p.steer) * Math.min(1, dt * (5.2 / (1 + speed0 / 34)));

  const fwdX = Math.sin(p.yaw);
  const fwdZ = Math.cos(p.yaw);
  const leftX = Math.cos(p.yaw);
  const leftZ = -Math.sin(p.yaw);
  const vFwd = p.vx * fwdX + p.vz * fwdZ;
  const vLat = p.vx * leftX + p.vz * leftZ;
  const speed = Math.hypot(p.vx, p.vz);

  const loadF = MASS * GRAV * (LR / (LF + LR));
  const loadR = MASS * GRAV * (LF / (LF + LR));
  const transfer = Math.min(0.16, Math.max(-0.16, (throttle - brake) * 0.12));
  const nF = loadF * (1 - transfer);
  const nR = loadR * (1 + transfer);

  let muF = MU_F * grip * (input.handbrake ? 0.94 : 1);
  let muR = MU_R * grip * (1 - throttle * 0.18);
  if (input.handbrake) muR *= 0.64;
  if (brake > 0.2) muF *= 0.9;

  const safe = Math.max(2.2, Math.abs(vFwd));
  const aF = Math.atan2(vLat + p.yawRate * LF, safe) - p.steer;
  const aR = Math.atan2(vLat - p.yawRate * LR, safe);

  const pace = Math.min(1, speed / 5);
  const fyF = -Math.sign(aF || 1) * latCurve(aF) * muF * nF * pace;
  const fyR = -Math.sign(aR || 1) * latCurve(aR) * muR * nR * pace;

  const drive = throttle * 22800 * Math.max(0, 1 - speed / 58);
  const roll = 90 + speed * 12 + speed * speed * 0.32;
  let fx = drive - Math.sign(vFwd || 1) * (roll + brake * 11000);
  if (input.handbrake) fx -= Math.sign(vFwd || 1) * 4200;
  if (speed < 1.2 && throttle < 0.05 && brake > 0.4) {
    fx = -brake * 7000;
  }

  const capF = muF * nF;
  const capR = muR * nR;
  const fxF = Math.max(-capF, Math.min(capF, brake * -5000));
  let fxR = fx - fxF;
  const sliding = Math.abs(aR) > 0.22;
  let fyRUse = fyR;
  let fxRUse = fxR;
  if (sliding) {
    const circ = Math.hypot(fxR, fyR);
    if (circ > capR && circ > 0) {
      fyRUse = (fyR * capR) / circ;
      fxRUse = (fxR * capR) / circ;
    }
  }

  const fxTotal = fxF + fxRUse;
  const fyTotal = fyF + fyRUse;
  p.vx += ((fxTotal * fwdX + fyTotal * leftX) / MASS) * dt;
  p.vz += ((fxTotal * fwdZ + fyTotal * leftZ) / MASS) * dt;
  let vFwd2 = p.vx * fwdX + p.vz * fwdZ;
  let vLat2 = p.vx * leftX + p.vz * leftZ;
  let beta2 = Math.atan2(vLat2, Math.max(3, Math.abs(vFwd2)));
  const slipMag = Math.abs(beta2);
  const yawScale = slipMag > 0.9 ? 0.4 : slipMag > 0.5 ? 0.7 : 1;
  p.yawRate += ((fyF * LF - fyRUse * LR) / INERTIA) * yawScale * dt;
  if (speed < 4) p.yawRate += p.steer * (4 - speed) * 0.22 * dt;

  const opposing = Math.abs(vLat2) > 1.8 && Math.abs(p.steerCmd) > 0.14 && Math.sign(p.steerCmd) !== Math.sign(vLat2);
  const holding = speed > 11 && throttle > 0.4 && brake < 0.2 && Math.abs(p.steerCmd) > 0.16;
  const initiating = input.handbrake && speed > 8 && Math.abs(p.steerCmd) > 0.15;
  if (opposing && speed > 8) {
    vLat2 *= Math.exp(-dt * 4.5 * Math.abs(p.steerCmd));
    p.yawRate += -p.yawRate * Math.min(1, dt * 4);
  } else if (holding || initiating) {
    const mag = Math.abs(p.steerCmd) * (initiating ? 0.55 : 0.36 + 0.28 * throttle);
    const wantBeta = clamp(Math.sign(p.steerCmd) * mag, -0.62, 0.62);
    const wantLat = Math.tan(wantBeta) * Math.max(4, Math.abs(vFwd2));
    vLat2 += (wantLat - vLat2) * Math.min(1, dt * (initiating ? 8 : 3.2));
    const wantYaw = -Math.sign(p.steerCmd) * (0.32 + 0.5 * Math.abs(p.steerCmd)) * Math.min(1, speed / 18);
    p.yawRate += (wantYaw - p.yawRate) * Math.min(1, dt * (initiating ? 7 : 2.4));
  }
  if (Math.abs(p.steerCmd) < 0.1 && speed > 5) {
    vLat2 *= Math.exp(-dt * 4);
    p.yawRate *= Math.exp(-dt * 2.2);
  }
  p.vx = vFwd2 * fwdX + vLat2 * leftX;
  p.vz = vFwd2 * fwdZ + vLat2 * leftZ;

  const yawCap = speed < 8 ? 0.7 : 0.55 + Math.min(0.8, speed / 24);
  p.yawRate = clamp(p.yawRate, -yawCap, yawCap);
  if (Math.abs(vLat2) > Math.abs(vFwd2) * 0.95 && speed > 8) p.yawRate *= Math.exp(-3 * dt);
  const centered = Math.abs(p.steerCmd) < 0.08 && Math.abs(vLat2) < 1.2;
  const damp = speed < 7 ? 1.8 : centered ? 1.3 : Math.abs(vLat2) > 2 ? 0.35 : 0.6;
  p.yawRate *= Math.exp(-damp * dt);

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.yaw = wrap(p.yaw + p.yawRate * dt);
  p.wheelSpin += (vFwd2 / WHEEL_R) * dt;
  return { vFwd: vFwd2, vLat: vLat2, speed: Math.hypot(p.vx, p.vz), slip: Math.abs(aR) };
}

export function forwardOf(yaw: number) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}
