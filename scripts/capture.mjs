import puppeteer from "puppeteer-core";

const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:47321/";
const shots = [
  ["front34", "/opt/cursor/artifacts/e46_front_34.png"],
  ["rear34", "/opt/cursor/artifacts/e46_rear_34.png"],
  ["side", "/opt/cursor/artifacts/e46_side.png"],
];

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 932, height: 430, deviceScaleFactor: 2 });
  for (const [pose, file] of shots) {
    await page.goto(`${base}?pose=${pose}&ui=0`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector("body[data-ready='1']", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: file, type: "png" });
    console.log("wrote", file);
  }
} finally {
  await browser.close();
}
