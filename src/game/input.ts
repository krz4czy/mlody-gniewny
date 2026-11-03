import { getSettings } from "./settings";

export type DriveInput = {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  reset: boolean;
  source: "pad" | "touch" | "keys" | "none";
};

const keys = new Set<string>();

export function bindKeys() {
  const down = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
}

/** Pixels of horizontal drag, past the deadzone, that reach full lock. */
export const STEER_DRAG_PX = 120;
export const STEER_DEAD_PX = 14;

/** Proportional steering from a finger drag. Releases auto-centre (return 0). */
export function steerFromDrag(dx: number) {
  const mag = Math.abs(dx);
  if (mag <= STEER_DEAD_PX) return 0;
  const sign = Math.sign(dx);
  return Math.min(1, Math.max(-1, (sign * (mag - STEER_DEAD_PX)) / STEER_DRAG_PX));
}

export const touch = {
  steer: 0,
  steering: false,
  throttle: false,
  brake: false,
  handbrake: false,
  reset: false,
  active: false,
};

let tiltSteer = 0;
if (typeof window !== "undefined") {
  window.addEventListener("deviceorientation", (e) => {
    const landscape = window.innerWidth > window.innerHeight;
    const signed = landscape ? (e.gamma ?? 0) : (e.beta ?? 0) - 40;
    tiltSteer = Math.max(-1, Math.min(1, signed / 28));
  });
}

function blockCallout(el: HTMLElement | null) {
  if (!el) return;
  const stop = (e: Event) => e.preventDefault();
  el.addEventListener("touchstart", stop, { passive: false });
  el.addEventListener("contextmenu", stop);
  el.addEventListener("selectstart", stop);
}

export function bindTouch(root: HTMLElement) {
  blockCallout(root.querySelector("#touch"));
  blockCallout(root.querySelector("#view"));
  const steerPad = root.querySelector<HTMLElement>("#steer-pad");
  const bindHold = (sel: string, flag: "throttle" | "brake" | "handbrake" | "reset") => {
    const el = root.querySelector<HTMLElement>(sel);
    if (!el) return;
    const on = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      touch[flag] = true;
      touch.active = true;
    };
    const off = () => {
      touch[flag] = false;
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
  };
  bindHold("#btn-gas", "throttle");
  bindHold("#btn-brake", "brake");
  bindHold("#btn-hand", "handbrake");
  bindHold("#btn-reset", "reset");

  if (!steerPad) return;
  let originX = 0;
  const move = (e: PointerEvent) => {
    touch.steer = steerFromDrag(e.clientX - originX);
    touch.active = true;
  };
  steerPad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    originX = e.clientX;
    steerPad.setPointerCapture(e.pointerId);
    touch.steering = true;
    touch.steer = 0;
    touch.active = true;
  });
  steerPad.addEventListener("pointermove", (e) => {
    if (steerPad.hasPointerCapture(e.pointerId)) move(e);
  });
  const clear = () => {
    touch.steer = 0;
    touch.steering = false;
  };
  steerPad.addEventListener("pointerup", clear);
  steerPad.addEventListener("pointercancel", clear);
}

function gamepadInput(): DriveInput | null {
  const pads = navigator.getGamepads?.();
  if (!pads) return null;
  const pad = [...pads].find((g) => g && g.connected);
  if (!pad) return null;
  const axis = (i: number) => pad.axes[i] ?? 0;
  const btn = (i: number) => pad.buttons[i];
  const trigger = (buttonIndex: number, axisIndex: number) => {
    const b = btn(buttonIndex);
    if (b && b.value > 0.05) return b.value;
    const a = axis(axisIndex);
    if (pad.axes.length > axisIndex && a > -0.9) return (a + 1) / 2;
    return 0;
  };
  const steer = Math.abs(axis(0)) > 0.08 ? axis(0) : 0;
  const cross = btn(0)?.pressed || btn(2)?.pressed;
  return {
    throttle: trigger(7, 5),
    brake: trigger(6, 4),
    steer,
    handbrake: Boolean(cross),
    reset: Boolean(btn(3)?.pressed),
    source: "pad",
  };
}

export function readPad() {
  const pads = navigator.getGamepads?.();
  const pad = pads ? [...pads].find((g) => g && g.connected) : null;
  return {
    connected: Boolean(pad),
    options: Boolean(pad?.buttons[9]?.pressed),
  };
}

export function readInput(): DriveInput {
  const pad = gamepadInput();
  if (pad && (pad.throttle > 0.05 || pad.brake > 0.05 || Math.abs(pad.steer) > 0.05 || pad.handbrake || pad.reset)) {
    return pad;
  }
  const tilt = getSettings().touchLayout === "tilt" && !touch.steering ? tiltSteer : touch.steer;
  if (touch.throttle || touch.brake || touch.handbrake || touch.reset || Math.abs(tilt) > 0.02) {
    return {
      throttle: touch.throttle ? 1 : 0,
      brake: touch.brake ? 1 : 0,
      steer: tilt,
      handbrake: touch.handbrake,
      reset: touch.reset,
      source: "touch",
    };
  }
  const steer = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const throttle = keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0;
  const brake = keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0;
  if (throttle || brake || steer || keys.has("Space") || keys.has("KeyR")) {
    return { throttle, brake, steer, handbrake: keys.has("Space"), reset: keys.has("KeyR"), source: "keys" };
  }
  if (pad) return pad;
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, source: "none" };
}
