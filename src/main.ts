import { startGame } from "./game/game";
import { bindKeys, bindTouch } from "./game/input";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
if (!canvas) throw new Error("Brak canvas");

bindKeys();
bindTouch(document.body);
const credits = document.querySelector<HTMLElement>("#credits");
document.querySelector("#credits-btn")?.addEventListener("click", () => credits?.removeAttribute("hidden"));
document.querySelector("#credits-close")?.addEventListener("click", () => credits?.setAttribute("hidden", ""));

void startGame(canvas);
