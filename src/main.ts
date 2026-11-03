import { createViewer } from "./viewer/createViewer";
import { POSES } from "./viewer/poses";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
if (!canvas) throw new Error("Brak canvas");

const params = new URLSearchParams(location.search);
if (params.get("ui") === "0") document.body.dataset.ui = "0";

const viewer = createViewer(canvas);
const dock = document.querySelector("#poses");

if (dock) {
  for (const pose of POSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = pose.label;
    button.addEventListener("click", () => viewer.setPose(pose));
    dock.append(button);
  }
  const spin = document.createElement("button");
  spin.type = "button";
  spin.textContent = "Obrót";
  spin.setAttribute("aria-pressed", params.get("ui") === "0" ? "false" : "true");
  spin.addEventListener("click", () => {
    const next = spin.getAttribute("aria-pressed") !== "true";
    spin.setAttribute("aria-pressed", next ? "true" : "false");
    viewer.setAutoRotate(next);
  });
  dock.append(spin);
}
