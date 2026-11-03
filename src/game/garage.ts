import type { Finish, Look } from "../car/loadCar";
import { GTR_SETUP, type Setup } from "./physics";

export type SetupId = "s30" | "s28" | "turbo" | "gtr" | "tgtr";

export type Spec = {
  id: SetupId;
  name: string;
  km: number;
  mass: number;
  grip: number;
  lock: number;
  setup: Setup;
};

export const SPECS: Spec[] = [
  { id: "s30", name: "Seryjne 3.0", km: 231, mass: 1490, grip: 0.92, lock: 0.5, setup: { mass: 1490, inertia: 2300, muF: 1.28, muR: 1.02, lock: 0.5, stiff: 0.26, force: 11720 } },
  { id: "s28", name: "2.8", km: 193, mass: 1450, grip: 0.88, lock: 0.48, setup: { mass: 1450, inertia: 2200, muF: 1.22, muR: 0.98, lock: 0.48, stiff: 0.28, force: 9790 } },
  { id: "turbo", name: "3.0 Turbo", km: 400, mass: 1520, grip: 1, lock: 0.58, setup: { mass: 1520, inertia: 2400, muF: 1.45, muR: 1.18, lock: 0.58, stiff: 0.2, force: 20290 } },
  { id: "gtr", name: "GTR", km: 450, mass: 1280, grip: 1, lock: 0.64, setup: GTR_SETUP },
  { id: "tgtr", name: "Turbo GTR", km: 700, mass: 1220, grip: 1.12, lock: 0.74, setup: { mass: 1220, inertia: 1650, muF: 1.74, muR: 1.42, lock: 0.74, stiff: 0.12, force: 35500 } },
];

const FINISHES: { id: Finish; label: string }[] = [
  { id: "gloss", label: "Połysk" },
  { id: "metallic", label: "Metalik" },
  { id: "pearl", label: "Perła" },
  { id: "matte", label: "Mat" },
  { id: "chrome", label: "Chrom" },
];

const SWATCHES: Record<Finish, string[]> = {
  gloss: ["#f2f2f0", "#c8102e", "#1b1b1b", "#1d4e89", "#f5c518", "#1f7a4d", "#e67e22", "#6c3483"],
  metallic: ["#b8b8b8", "#8e1b1b", "#3a3a3a", "#24557a", "#8a6a2f", "#1e6b5a", "#6b3e8a", "#9aa3ad"],
  pearl: ["#f7e7c1", "#e8b4b8", "#c9d6e5", "#d5c4e8", "#b7e4c7", "#f3d1b0", "#ead7a2", "#d0d0d0"],
  matte: ["#d9d4cc", "#6e2424", "#2b2b2b", "#2c4a3e", "#8c5a2a", "#3d4c6b", "#4a3b32", "#555555"],
  chrome: ["#e8e8e8", "#d4af37", "#c0c0c0", "#1a1a1a", "#8fa6b5", "#b87333", "#dedede", "#6e7f91"],
};

const RIMS = ["#d9d9d9", "#1a1a1a", "#d4af37", "#b87333", "#f4f4f4", "#9b1b30"];

type GarageState = {
  setup: SetupId;
  finish: Finish;
  paint: string;
  rim: string;
  ride: number;
  spoiler: boolean;
  tint: number;
};

const KEY = "smg-garage";
const defaults: GarageState = {
  setup: "gtr",
  finish: "gloss",
  paint: "#c8102e",
  rim: "#d9d9d9",
  ride: 0.25,
  spoiler: false,
  tint: 0.35,
};

function load(): GarageState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...(JSON.parse(raw) as Partial<GarageState>) };
  } catch {
    return { ...defaults };
  }
}

let state = load();
const listeners = new Set<() => void>();

export function onGarage(fn: () => void) {
  listeners.add(fn);
  fn();
}

export function getSpec() {
  return SPECS.find((s) => s.id === state.setup) ?? SPECS[3];
}

export function getLook(): Look {
  return {
    finish: state.finish,
    paint: state.paint,
    rim: state.rim,
    ride: state.ride,
    spoiler: state.spoiler,
    tint: state.tint,
  };
}

function save(patch: Partial<GarageState>) {
  state = { ...state, ...patch };
  localStorage.setItem(KEY, JSON.stringify(state));
  paint();
  listeners.forEach((fn) => fn());
}

function swatch(color: string, selected: boolean) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.background = color;
  btn.setAttribute("aria-pressed", String(selected));
  btn.addEventListener("click", () => btn.dispatchEvent(new CustomEvent("pick", { bubbles: true, detail: color })));
  return btn;
}

function paint() {
  const spec = getSpec();
  document.querySelectorAll<HTMLButtonElement>("#gar-setups button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.setup === state.setup));
  });
  document.querySelectorAll<HTMLButtonElement>("#gar-finishes button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.finish === state.finish));
  });
  const bars: [string, number][] = [
    ["bar-km", spec.km / 700],
    ["bar-mass", 1 - (spec.mass - 1220) / 400],
    ["bar-grip", spec.grip / 1.12],
    ["bar-lock", spec.lock / 0.74],
  ];
  for (const [id, value] of bars) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  }
  const km = document.getElementById("gar-km");
  if (km) km.textContent = `${spec.km} KM`;
  const swatches = document.getElementById("gar-swatches");
  if (swatches) {
    swatches.replaceChildren(
      ...SWATCHES[state.finish].map((color) => {
        const btn = swatch(color, color.toLowerCase() === state.paint.toLowerCase());
        btn.addEventListener("pick", () => save({ paint: color }));
        return btn;
      }),
    );
  }
  const rims = document.getElementById("gar-rims");
  if (rims) {
    rims.replaceChildren(
      ...RIMS.map((color) => {
        const btn = swatch(color, color.toLowerCase() === state.rim.toLowerCase());
        btn.addEventListener("pick", () => save({ rim: color }));
        return btn;
      }),
    );
  }
  const ride = document.querySelector<HTMLInputElement>("#gar-ride");
  const wing = document.querySelector<HTMLInputElement>("#gar-wing");
  const tint = document.querySelector<HTMLInputElement>("#gar-tint");
  if (ride) ride.value = String(Math.round(state.ride * 100));
  if (wing) wing.checked = state.spoiler;
  if (tint) tint.value = String(Math.round(state.tint * 100));
}

export function bindGarage() {
  const setups = document.getElementById("gar-setups");
  if (setups) {
    for (const spec of SPECS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.setup = spec.id;
      btn.textContent = `${spec.name} · ${spec.km} KM`;
      btn.addEventListener("click", () => save({ setup: spec.id }));
      setups.append(btn);
    }
  }
  const finishes = document.getElementById("gar-finishes");
  if (finishes) {
    for (const fin of FINISHES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.finish = fin.id;
      btn.textContent = fin.label;
      btn.addEventListener("click", () => save({ finish: fin.id, paint: SWATCHES[fin.id][0] }));
      finishes.append(btn);
    }
  }
  document.querySelector("#gar-ride")?.addEventListener("input", (e) => {
    save({ ride: Number((e.target as HTMLInputElement).value) / 100 });
  });
  document.querySelector("#gar-wing")?.addEventListener("change", (e) => {
    save({ spoiler: (e.target as HTMLInputElement).checked });
  });
  document.querySelector("#gar-tint")?.addEventListener("input", (e) => {
    save({ tint: Number((e.target as HTMLInputElement).value) / 100 });
  });
  paint();
}
