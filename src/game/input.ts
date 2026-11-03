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

export const touch = {
  steer: 0,
  throttle: false,
  brake: false,
  handbrake: false,
  reset: false,
  active: false,
};

export function bindTouch(root: HTMLElement) {
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
  const move = (e: PointerEvent) => {
    const rect = steerPad.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    touch.steer = Math.min(1, Math.max(-1, (x - 0.5) * 2.1));
    touch.active = true;
  };
  steerPad.addEventListener("pointerdown", (e) => {
    steerPad.setPointerCapture(e.pointerId);
    move(e);
  });
  steerPad.addEventListener("pointermove", (e) => {
    if (steerPad.hasPointerCapture(e.pointerId)) move(e);
  });
  const clear = () => {
    touch.steer = 0;
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
    reset: Boolean(btn(3)?.pressed || btn(9)?.pressed),
    source: "pad",
  };
}

export function readInput(): DriveInput {
  const pad = gamepadInput();
  if (pad && (pad.throttle > 0.05 || pad.brake > 0.05 || Math.abs(pad.steer) > 0.05 || pad.handbrake || pad.reset)) {
    return pad;
  }
  if (touch.throttle || touch.brake || touch.handbrake || touch.reset || Math.abs(touch.steer) > 0.02) {
    return {
      throttle: touch.throttle ? 1 : 0,
      brake: touch.brake ? 1 : 0,
      steer: touch.steer,
      handbrake: touch.handbrake,
      reset: touch.reset,
      source: touch.active ? "touch" : "none",
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
