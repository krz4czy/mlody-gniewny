/** Arcade RWD drift model. Yaw 0 faces +Z. Positive yaw turns the nose toward +X (driver's left). */

export type Phys = {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  yawRate: number;
  steer: number;
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
  return { x, z, yaw, vx: 0, vz: 0, yawRate: 0, steer: 0, wheelSpin: 0 };
}

export function stepPhys(p: Phys, input: DriveInput, dt: number, grip: number) {
  const throttle = Math.min(1, Math.max(0, input.throttle));
  const brake = Math.min(1, Math.max(0, input.brake));
  const steerIn = Math.min(1, Math.max(-1, input.steer));
  const targetSteer = -steerIn * 0.72;
  p.steer += (targetSteer - p.steer) * Math.min(1, dt * 8);

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

  let muF = MU_F * grip * (input.handbrake ? 0.95 : 1);
  let muR = MU_R * grip * (1 - throttle * 0.34);
  if (input.handbrake) muR *= 0.48;
  if (brake > 0.2) muF *= 0.9;

  const beta = Math.atan2(vLat, Math.max(3, Math.abs(vFwd)));
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
  const yawScale = Math.abs(beta) > 0.45 ? 0.3 : 1;
  const yawAcc = ((fyF * LF - fyRUse * LR) / INERTIA) * yawScale;
  p.yawRate += yawAcc * dt;
  if (speed < 3) p.yawRate += p.steer * (3 - speed) * 0.7 * dt;
  if (input.handbrake && Math.abs(steerIn) > 0.2 && speed > 10) {
    p.yawRate += -steerIn * 0.4 * dt;
  }
  if (Math.abs(beta) > 0.26 && speed > 12 && throttle > 0.35) {
    const desired = -steerIn * 0.85;
    p.yawRate += (desired - p.yawRate) * Math.min(1, dt * 3.5);
  }
  const damp = Math.abs(steerIn) < 0.08 && Math.abs(aR) < 0.12 ? 1.4 : 0.35;
  p.yawRate *= Math.exp(-damp * dt);

  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.yaw = wrap(p.yaw + p.yawRate * dt);
  p.wheelSpin += (vFwd / WHEEL_R) * dt;
  return { vFwd, vLat, speed, slip: Math.abs(aR) };
}

export function forwardOf(yaw: number) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}
