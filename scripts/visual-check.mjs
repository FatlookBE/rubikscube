import { chromium } from "playwright";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173/";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

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
        frameTools: document.querySelectorAll('[data-action="set-scan-frame"]').length,
        rotateTools: document.querySelectorAll('[data-action="rotate-scan-face"]').length,
        mirrorTool: Boolean(document.querySelector('[data-action="mirror-scan-face"]')),
        quality: Boolean(document.querySelector("[data-scan-quality]")),
        qualityBar: Boolean(document.querySelector("[data-scan-quality-bar]")),
        videoSweep: Boolean(document.querySelector('[data-action="toggle-video-sweep"]')),
        sweepFaces: document.querySelectorAll("[data-sweep-face]").length,
        capture: input instanceof HTMLInputElement ? input.getAttribute("capture") : null,
        accept: input instanceof HTMLInputElement ? input.accept : null,
      };
    });

    if (
      scanner.tabs !== 6 ||
      scanner.cells !== 9 ||
      scanner.palette < 7 ||
      scanner.frameTools !== 3 ||
      scanner.rotateTools !== 2 ||
      !scanner.mirrorTool ||
      !scanner.quality ||
      !scanner.qualityBar ||
      !scanner.videoSweep ||
      scanner.sweepFaces !== 6 ||
      scanner.capture !== "environment" ||
      scanner.accept !== "image/*"
    ) {
      throw new Error(`${viewport.name}: scanner photo incomplet ${JSON.stringify(scanner)}`);
    }

    const scrollPreserved = await page.evaluate(() => {
      const scroll = document.querySelector(".coach-panel .panel-scroll");
      const action = document.querySelector('[data-action="mirror-scan-face"]');

      if (!(scroll instanceof HTMLElement) || !(action instanceof HTMLElement)) {
        return { ok: false, before: 0, after: 0 };
      }

      scroll.scrollTop = 240;
      const before = scroll.scrollTop;
      action.click();
      const nextScroll = document.querySelector(".coach-panel .panel-scroll");
      const after = nextScroll instanceof HTMLElement ? nextScroll.scrollTop : 0;

      return { ok: Math.abs(before - after) <= 2, before, after };
    });

    if (!scrollPreserved.ok) {
      throw new Error(`${viewport.name}: scroll scanner non préservé ${JSON.stringify(scrollPreserved)}`);
    }

    await page.click('[data-action="set-scan-frame"][data-scale="0.54"]');
    await page.click('[data-action="rotate-scan-face"][data-direction="right"]');
    await page.click('[data-action="mirror-scan-face"]');
    await page.click('[data-action="start-scan-camera"]');
    await page.waitForSelector(".scan-video");
    const cameraUi = await page.evaluate(() => ({
      grid: document.querySelectorAll(".camera-grid i").length,
      liveCells: [...document.querySelectorAll(".camera-grid i")].every((cell) =>
        cell instanceof HTMLElement && cell.style.getPropertyValue("--live-color"),
      ),
      inset: getComputedStyle(document.querySelector(".camera-grid")).inset,
      hasCapture: Boolean(document.querySelector('[data-action="capture-camera-face"]')),
      hasSweep: Boolean(document.querySelector('[data-action="toggle-video-sweep"]')),
      hasStop: Boolean(document.querySelector('[data-action="stop-scan-camera"]')),
    }));

    if (
      cameraUi.grid !== 9 ||
      !cameraUi.liveCells ||
      !cameraUi.inset ||
      !cameraUi.hasCapture ||
      !cameraUi.hasSweep ||
      !cameraUi.hasStop
    ) {
      throw new Error(`${viewport.name}: scanner caméra incomplet ${JSON.stringify(cameraUi)}`);
    }

    await page.click('[data-action="toggle-video-sweep"]');
    await page.waitForSelector(".video-sweep.is-active");
    const sweepActive = await page.evaluate(() => ({
      status: document.querySelector("[data-sweep-status]")?.textContent ?? "",
      autoDisabled: document.querySelector('[data-action="toggle-auto-capture"]')?.hasAttribute("disabled"),
      captureDisabled: document.querySelector('[data-action="capture-camera-face"]')?.hasAttribute("disabled"),
    }));

    if (
      !sweepActive.status.includes("Balayage actif") ||
      !sweepActive.autoDisabled ||
      !sweepActive.captureDisabled
    ) {
      throw new Error(`${viewport.name}: balayage vidéo inactif ${JSON.stringify(sweepActive)}`);
    }

    await page.click('[data-action="toggle-video-sweep"]');
    await page.waitForFunction(() => !document.querySelector(".video-sweep")?.classList.contains("is-active"));
    await page.click('[data-action="capture-camera-face"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-action="toggle-auto-capture"]')?.textContent?.includes("off"),
    );
    const validatedFace = await page.evaluate(() => ({
      auto: document.querySelector('[data-action="toggle-auto-capture"]')?.textContent?.trim() ?? "",
      message: document.querySelector(".principle-band p")?.textContent ?? "",
    }));

    if (!validatedFace.auto.includes("off") || !validatedFace.message.includes("Capture")) {
      throw new Error(`${viewport.name}: capture auto non stoppée ${JSON.stringify(validatedFace)}`);
    }

    await page.click('[data-action="stop-scan-camera"]');
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
