export type Quality = "low" | "high";
export type Camera = "near" | "far";
export type TouchLayout = "slider" | "tilt";
export type Units = "kmh" | "mph";

export type Settings = {
  volume: number;
  muted: boolean;
  quality: Quality;
  camera: Camera;
  steerSensitivity: number;
  touchLayout: TouchLayout;
  hud: boolean;
  units: Units;
};

const KEY = "smg-settings";

const defaults: Settings = {
  volume: 0.8,
  muted: false,
  quality: "high",
  camera: "near",
  steerSensitivity: 1,
  touchLayout: "slider",
  hud: true,
  units: "kmh",
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

let state = load();

export function getSettings() {
  return state;
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  paint();
}

function paint() {
  const volume = document.querySelector<HTMLInputElement>("#set-volume");
  const mute = document.querySelector<HTMLInputElement>("#set-mute");
  const sens = document.querySelector<HTMLInputElement>("#set-sens");
  const hud = document.querySelector<HTMLInputElement>("#set-hud");
  const permit = document.querySelector<HTMLButtonElement>("#set-tilt-permit");
  if (volume) volume.value = String(Math.round(state.volume * 100));
  if (mute) mute.checked = state.muted;
  if (sens) sens.value = String(Math.round(state.steerSensitivity * 100));
  if (hud) hud.checked = state.hud;
  if (permit) permit.hidden = state.touchLayout !== "tilt";
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#screen-settings .choice button")) {
    const on =
      btn.dataset.quality === state.quality ||
      btn.dataset.camera === state.camera ||
      btn.dataset.layout === state.touchLayout ||
      btn.dataset.units === state.units;
    btn.setAttribute("aria-pressed", String(on));
  }
}

export function bindSettings() {
  paint();
  document.querySelector("#set-volume")?.addEventListener("input", (e) => {
    updateSettings({ volume: Number((e.target as HTMLInputElement).value) / 100 });
  });
  document.querySelector("#set-mute")?.addEventListener("change", (e) => {
    updateSettings({ muted: (e.target as HTMLInputElement).checked });
  });
  document.querySelector("#set-sens")?.addEventListener("input", (e) => {
    updateSettings({ steerSensitivity: Number((e.target as HTMLInputElement).value) / 100 });
  });
  document.querySelector("#set-hud")?.addEventListener("change", (e) => {
    updateSettings({ hud: (e.target as HTMLInputElement).checked });
  });
  document.querySelector("#screen-settings")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    if (btn.dataset.quality) updateSettings({ quality: btn.dataset.quality as Quality });
    if (btn.dataset.camera) updateSettings({ camera: btn.dataset.camera as Camera });
    if (btn.dataset.layout) updateSettings({ touchLayout: btn.dataset.layout as TouchLayout });
    if (btn.dataset.units) updateSettings({ units: btn.dataset.units as Units });
  });
  document.querySelector("#set-tilt-permit")?.addEventListener("click", async () => {
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (req) {
      try {
        await req.call(DeviceOrientationEvent);
      } catch {
        return;
      }
    }
  });
}

export function audioScale() {
  return state.muted ? 0 : state.volume;
}
