import { chromium } from "playwright";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(appUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas.cube-canvas");
    await page.waitForTimeout(900);

    const boot = await page.evaluate(() => ({
      title: document.title,
      hasCoach: Boolean(document.querySelector(".coach-panel")),
      hasMovePad: Boolean(document.querySelector(".move-pad")),
      hasDemoButton: Boolean(document.querySelector('[data-action="play-demo"]')),
    }));

    if (!boot.hasCoach || !boot.hasMovePad || !boot.hasDemoButton) {
      throw new Error(`${viewport.name}: interface incomplète ${JSON.stringify(boot)}`);
    }

    const before = await sampleCanvas(page);
    if (!before.ok) {
      throw new Error(`${viewport.name}: canvas vide ou trop uniforme ${JSON.stringify(before)}`);
    }

    await page.click('[data-action="scramble"]');
    await page.waitForSelector(".adaptive-summary");
    await page.waitForSelector(".beginner-map");
    await page.waitForSelector(".reason-panel");
    const beforeRemaining = await page.textContent(".adaptive-summary div:nth-child(2) strong");
    const beforeTarget = await page.textContent(".adaptive-summary div:first-child strong");
    const stageRows = await page.locator(".stage-row").count();
    const reasonTitle = await page.textContent(".reason-panel strong");

    if (!beforeTarget || beforeTarget.trim() === "OK") {
      throw new Error(`${viewport.name}: cible adaptée manquante`);
    }

    if (stageRows < 7 || !reasonTitle?.includes(beforeTarget.trim())) {
      throw new Error(`${viewport.name}: pédagogie adaptée incomplète`);
    }

    await page.click('[data-action="play-step"]');
    await page.waitForTimeout(900);
    const afterRemaining = await page.textContent(".adaptive-summary div:nth-child(2) strong");

    if (Number(afterRemaining) >= Number(beforeRemaining)) {
      throw new Error(
        `${viewport.name}: le plan adapté ne progresse pas (${beforeRemaining} -> ${afterRemaining})`,
      );
    }

    const after = await sampleCanvas(page);
    if (!after.ok) {
      throw new Error(`${viewport.name}: canvas invalide après interaction ${JSON.stringify(after)}`);
    }

    await page.click('[data-action="reset-cube"]');
    await page.waitForSelector(".lesson-header h1");
    await page.click('[data-action="open-scanner"]');
    await page.waitForSelector(".scan-grid");
    const scanner = await page.evaluate(() => {
      const input = document.querySelector('[data-action="upload-scan-photo"]');
      return {
        tabs: document.querySelectorAll(".scan-face-tabs button").length,
        cells: document.querySelectorAll(".scan-grid button").length,
        palette: document.querySelectorAll(".scan-palette button").length,
        capture: input instanceof HTMLInputElement ? input.getAttribute("capture") : null,
        accept: input instanceof HTMLInputElement ? input.accept : null,
      };
    });

    if (
      scanner.tabs !== 6 ||
      scanner.cells !== 9 ||
      scanner.palette < 7 ||
      scanner.capture !== "environment" ||
      scanner.accept !== "image/*"
    ) {
      throw new Error(`${viewport.name}: scanner photo incomplet ${JSON.stringify(scanner)}`);
    }

    await page.click('[data-action="fill-solved-scan"]');
    await page.waitForSelector(".scan-counts .is-valid");
    await page.click('[data-action="apply-scan"]');
    await page.waitForFunction(() =>
      document.querySelector(".hud-status")?.textContent?.includes("Configuration photo appliquée"),
    );

    const status = await page.textContent(".hud-status");
    await page.screenshot({
      path: `/tmp/rubi-coach-${viewport.name}.png`,
      fullPage: true,
    });

    console.log(
      `${viewport.name}: ok, title="${boot.title}", target="${beforeTarget.trim()}", status="${status?.trim()}", canvasPixels=${after.colored}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.cube-canvas");

    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: "missing-canvas", colored: 0, bright: 0 };
    }

    const probe = document.createElement("canvas");
    probe.width = 180;
    probe.height = 120;
    const context = probe.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return { ok: false, reason: "missing-2d-context", colored: 0, bright: 0 };
    }

    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let colored = 0;
    let bright = 0;

    for (let index = 0; index < pixels.length; index += 16) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);

      if (max - min > 24) {
        colored += 1;
      }

      if (red + green + blue > 145) {
        bright += 1;
      }
    }

    return {
      ok: colored > 45 && bright > 35,
      colored,
      bright,
      width: canvas.width,
      height: canvas.height,
    };
  });
}
