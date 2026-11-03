export type Screen = "menu" | "play" | "settings" | "garage" | "credits";

let screen: Screen = "menu";
let pauseLatch = false;

export function getScreen() {
  return screen;
}

export function setScreen(next: Screen) {
  screen = next;
  for (const id of ["menu", "settings", "garage"] as const) {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.hidden = id !== next;
  }
  const credits = document.getElementById("credits");
  if (next === "credits") credits?.removeAttribute("hidden");
  else credits?.setAttribute("hidden", "");
  document.body.dataset.screen = next;
  const pause = document.getElementById("btn-pause");
  if (pause) pause.hidden = next !== "play";
  const touch = document.getElementById("touch");
  if (touch) touch.hidden = next !== "play";
  const hud = document.getElementById("hud");
  if (hud) hud.hidden = next !== "play";
}

export function bindShell() {
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.screen as Screen | undefined;
      if (next) setScreen(next);
    });
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape") return;
    setScreen(screen === "play" ? "menu" : "menu");
  });
}

/** Options / Start toggles play and the menu. */
export function pollPause(optionsPressed: boolean) {
  if (optionsPressed && !pauseLatch) {
    if (screen === "play") setScreen("menu");
    else if (screen === "menu") setScreen("play");
    else setScreen("menu");
  }
  pauseLatch = optionsPressed;
}
