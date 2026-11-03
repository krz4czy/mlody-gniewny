import { startGame } from "./game/game";
import { bindKeys, bindTouch } from "./game/input";
import { bindShell } from "./game/shell";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
if (!canvas) throw new Error("Brak canvas");

bindKeys();
bindTouch(document.body);
bindShell();

void startGame(canvas);
