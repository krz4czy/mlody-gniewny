import { startGame } from "./game/game";
import { bindKeys, bindTouch } from "./game/input";
import { bindGarage } from "./game/garage";
import { bindSettings } from "./game/settings";
import { bindShell } from "./game/shell";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
if (!canvas) throw new Error("Brak canvas");

bindKeys();
bindTouch(document.body);
bindShell();
bindSettings();
bindGarage();

void startGame(canvas);
