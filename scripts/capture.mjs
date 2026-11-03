import puppeteer from "puppeteer-core";

const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:47321/";
const shots = [
  ["?demo=drift", "/opt/cursor/artifacts/drift_hud.png"],
  ["?demo=overview", "/opt/cursor/artifacts/track_overview.png"],
  ["?demo=touch", "/opt/cursor/artifacts/touch_controls.png"],
];

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 932, height: 430, deviceScaleFactor: 1 });
  for (const [query, file] of shots) {
    await page.goto(`${base}${query}`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector("body[data-shot]", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 250));
    await page.screenshot({ path: file, type: "png" });
    console.log("wrote", file);
  }

  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("body[data-ready='1']");
  const speed = await page.evaluate(async () => {
    const pad = {
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0, -1, 0.6],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    pad.buttons[7] = { pressed: true, value: 1 };
    navigator.getGamepads = () => [pad];
    await new Promise((r) => setTimeout(r, 1600));
    return document.querySelector("#speed")?.textContent ?? "0";
  });
  console.log("gamepad speed", speed);
} finally {
  await browser.close();
}
