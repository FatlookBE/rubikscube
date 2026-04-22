import type { Face } from "./rubik";

export type ColorKey = "W" | "Y" | "R" | "O" | "G" | "B" | "X";
export type ScanGrid = Record<Face, ColorKey[]>;

export type ScanValidation = {
  complete: boolean;
  valid: boolean;
  message: string;
  counts: Record<ColorKey, number>;
};

export type FaceletSample = {
  colors: ColorKey[];
  confidence: number;
  cellConfidences: number[];
  centerColor: ColorKey;
  centerConfidence: number;
  quality: number;
  warnings: string[];
  dataUrl: string;
};

export type ScanSampleOptions = {
  frameScale?: number;
};

export const SCAN_FACE_ORDER: Face[] = ["U", "R", "F", "D", "L", "B"];

export const FACE_SCAN_COLOR: Record<Face, ColorKey> = {
  U: "W",
  D: "Y",
  R: "R",
  L: "O",
  F: "G",
  B: "B",
};

export const COLOR_META: Record<ColorKey, { label: string; short: string; hex: string }> = {
  W: { label: "Blanc", short: "Bla", hex: "#f8f3e6" },
  Y: { label: "Jaune", short: "Jau", hex: "#ffd23f" },
  R: { label: "Rouge", short: "Rou", hex: "#d92d20" },
  O: { label: "Orange", short: "Ora", hex: "#ff8a1c" },
  G: { label: "Vert", short: "Ver", hex: "#19a974" },
  B: { label: "Bleu", short: "Ble", hex: "#2866cc" },
  X: { label: "Inconnu", short: "?", hex: "#2d3339" },
};

const PALETTE: ColorKey[] = ["W", "Y", "R", "O", "G", "B"];

export function createEmptyScanGrid(): ScanGrid {
  return SCAN_FACE_ORDER.reduce((grid, face) => {
    const cells = Array<ColorKey>(9).fill("X");
    cells[4] = FACE_SCAN_COLOR[face];
    grid[face] = cells;
    return grid;
  }, {} as ScanGrid);
}

export function createSolvedScanGrid(): ScanGrid {
  return SCAN_FACE_ORDER.reduce((grid, face) => {
    grid[face] = Array<ColorKey>(9).fill(FACE_SCAN_COLOR[face]);
    return grid;
  }, {} as ScanGrid);
}

export function cloneScanGrid(grid: ScanGrid): ScanGrid {
  return SCAN_FACE_ORDER.reduce((copy, face) => {
    copy[face] = [...grid[face]];
    return copy;
  }, {} as ScanGrid);
}

export function validateScanGrid(grid: ScanGrid): ScanValidation {
  const counts = getColorCounts(grid);
  const unknown = counts.X;
  const wrongCounts = PALETTE.filter((color) => counts[color] !== 9);

  if (unknown > 0) {
    return {
      complete: false,
      valid: false,
      message: `${unknown} cases restent à corriger.`,
      counts,
    };
  }

  if (wrongCounts.length > 0) {
    return {
      complete: true,
      valid: false,
      message: "Chaque couleur doit apparaître exactement 9 fois.",
      counts,
    };
  }

  return {
    complete: true,
    valid: true,
    message: "Configuration complète.",
    counts,
  };
}

export function scanGridToHexConfig(grid: ScanGrid): Record<Face, string[]> {
  return SCAN_FACE_ORDER.reduce((config, face) => {
    config[face] = grid[face].map((color) => COLOR_META[color].hex);
    return config;
  }, {} as Record<Face, string[]>);
}

export function rotateFaceCellsClockwise(cells: ColorKey[]): ColorKey[] {
  return [cells[6], cells[3], cells[0], cells[7], cells[4], cells[1], cells[8], cells[5], cells[2]];
}

export function rotateFaceCellsCounterClockwise(cells: ColorKey[]): ColorKey[] {
  return [cells[2], cells[5], cells[8], cells[1], cells[4], cells[7], cells[0], cells[3], cells[6]];
}

export function mirrorFaceCells(cells: ColorKey[]): ColorKey[] {
  return [cells[2], cells[1], cells[0], cells[5], cells[4], cells[3], cells[8], cells[7], cells[6]];
}

export async function sampleFaceletsFromImage(
  file: File,
  options: ScanSampleOptions = {},
): Promise<FaceletSample> {
  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);
  return sampleSquareSource(image, image.naturalWidth, image.naturalHeight, options);
}

export function sampleFaceletsFromVideo(
  video: HTMLVideoElement,
  options: ScanSampleOptions = {},
): FaceletSample {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error("La caméra n'a pas encore d'image exploitable.");
  }

  return sampleSquareSource(video, video.videoWidth, video.videoHeight, options);
}

function sampleSquareSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: ScanSampleOptions,
): FaceletSample {
  const canvas = document.createElement("canvas");
  const size = 360;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas indisponible pour analyser la photo.");
  }

  const cropSize = Math.min(sourceWidth, sourceHeight);
  const cropX = (sourceWidth - cropSize) / 2;
  const cropY = (sourceHeight - cropSize) / 2;
  context.drawImage(source, cropX, cropY, cropSize, cropSize, 0, 0, size, size);

  const frameScale = clamp(options.frameScale ?? 0.68, 0.48, 0.88);
  const frameSize = size * frameScale;
  const frameOffset = (size - frameSize) / 2;
  const cellSize = frameSize / 3;
  const samples = Array.from({ length: 9 }, (_, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return sampleCell(
      context,
      Math.round(frameOffset + col * cellSize + cellSize / 2),
      Math.round(frameOffset + row * cellSize + cellSize / 2),
      cellSize,
    );
  });
  const colors = samples.map((sample) => sample.color);
  const cellConfidences = samples.map((sample) => sample.confidence);
  const confidence =
    samples.reduce((total, sample) => total + sample.confidence, 0) / samples.length;
  const quality = calculateQuality(samples);
  const warnings = describeSampleWarnings(samples, quality);

  return {
    colors,
    confidence,
    cellConfidences,
    centerColor: colors[4],
    centerConfidence: cellConfidences[4],
    quality,
    warnings,
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
  };
}

function getColorCounts(grid: ScanGrid): Record<ColorKey, number> {
  const counts: Record<ColorKey, number> = {
    W: 0,
    Y: 0,
    R: 0,
    O: 0,
    G: 0,
    B: 0,
    X: 0,
  };

  SCAN_FACE_ORDER.forEach((face) => {
    grid[face].forEach((color) => {
      counts[color] += 1;
    });
  });

  return counts;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Impossible de lire cette image.")));
    image.src = dataUrl;
  });
}

function averageSample(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
): { r: number; g: number; b: number } {
  const size = radius * 2 + 1;
  const data = context.getImageData(centerX - radius, centerY - radius, size, size).data;
  const pixels: Array<{ r: number; g: number; b: number; luminance: number }> = [];

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    pixels.push({
      r,
      g,
      b,
      luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    });
  }

  pixels.sort((a, b) => a.luminance - b.luminance);

  const trim = Math.floor(pixels.length * 0.16);
  const kept = pixels.slice(trim, pixels.length - trim);
  const source = kept.length > 0 ? kept : pixels;
  const total = source.reduce(
    (sum, pixel) => ({
      r: sum.r + pixel.r,
      g: sum.g + pixel.g,
      b: sum.b + pixel.b,
    }),
    { r: 0, g: 0, b: 0 },
  );

  return {
    r: total.r / source.length,
    g: total.g / source.length,
    b: total.b / source.length,
  };
}

function sampleCell(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  cellSize: number,
): { color: ColorKey; confidence: number } {
  const offset = cellSize * 0.18;
  const radius = Math.max(4, Math.round(cellSize * 0.085));
  const probes = [
    [0, 0],
    [-offset, 0],
    [offset, 0],
    [0, -offset],
    [0, offset],
  ].map(([dx, dy]) =>
    classifyColor(
      averageSample(context, Math.round(centerX + dx), Math.round(centerY + dy), radius),
    ),
  );
  const buckets = new Map<ColorKey, { weight: number; count: number }>();
  let totalWeight = 0;

  probes.forEach((probe) => {
    const current = buckets.get(probe.color) ?? { weight: 0, count: 0 };
    current.weight += Math.max(0.05, probe.confidence);
    current.count += 1;
    buckets.set(probe.color, current);
    totalWeight += Math.max(0.05, probe.confidence);
  });

  const best = [...buckets.entries()]
    .map(([color, bucket]) => ({
      color,
      agreement: bucket.weight / Math.max(totalWeight, 0.001),
      count: bucket.count,
      weight: bucket.weight,
    }))
    .sort((a, b) => b.weight - a.weight)[0];
  const averageConfidence =
    probes.reduce((total, probe) => total + probe.confidence, 0) / probes.length;
  const confidence = clamp01(best.agreement * 0.68 + averageConfidence * 0.24 + (best.count / probes.length) * 0.08);

  if (confidence < 0.26 || best.count < 2) {
    return { color: "X", confidence };
  }

  return { color: best.color, confidence };
}

function calculateQuality(samples: Array<{ color: ColorKey; confidence: number }>): number {
  const averageConfidence =
    samples.reduce((total, sample) => total + sample.confidence, 0) / samples.length;
  const unknownPenalty = samples.filter((sample) => sample.color === "X").length / samples.length;
  const weakPenalty =
    samples.filter((sample) => sample.confidence < 0.42).length / samples.length;

  return clamp01(averageConfidence * 0.9 + 0.1 - unknownPenalty * 0.45 - weakPenalty * 0.2);
}

function describeSampleWarnings(
  samples: Array<{ color: ColorKey; confidence: number }>,
  quality: number,
): string[] {
  const warnings: string[] = [];
  const unknownCount = samples.filter((sample) => sample.color === "X").length;
  const weakCount = samples.filter((sample) => sample.confidence < 0.42).length;

  if (unknownCount > 0) {
    warnings.push(`${unknownCount} sticker${unknownCount > 1 ? "s" : ""} incertain${unknownCount > 1 ? "s" : ""}`);
  }

  if (quality < 0.5) {
    warnings.push("cadrage ou lumière à améliorer");
  } else if (weakCount > 2) {
    warnings.push("plusieurs stickers à vérifier");
  }

  return warnings.slice(0, 2);
}

function classifyColor({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): { color: ColorKey; confidence: number } {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < 0.22 && v > 0.5) {
    return {
      color: "W",
      confidence: clamp01((0.26 - s) / 0.26) * 0.65 + clamp01((v - 0.5) / 0.5) * 0.35,
    };
  }

  const hueMatches: Array<{ color: ColorKey; center: number; spread: number }> = [
    { color: "R", center: 0, spread: 28 },
    { color: "O", center: 30, spread: 26 },
    { color: "Y", center: 58, spread: 25 },
    { color: "G", center: 126, spread: 54 },
    { color: "B", center: 220, spread: 48 },
  ];
  const match = hueMatches
    .map((entry) => ({
      color: entry.color,
      confidence:
        clamp01(1 - hueDistance(h, entry.center) / entry.spread) * 0.72 +
        clamp01((s - 0.18) / 0.62) * 0.2 +
        clamp01(v / 0.78) * 0.08,
    }))
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (match.confidence >= 0.24) {
    return match;
  }

  return nearestPaletteColor(r, g, b);
}

function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
): { color: ColorKey; confidence: number } {
  let nearest: ColorKey = "W";
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondDistance = Number.POSITIVE_INFINITY;

  PALETTE.forEach((color) => {
    const rgb = hexToRgb(COLOR_META[color].hex);
    const distance =
      Math.pow(r - rgb.r, 2) +
      Math.pow(g - rgb.g, 2) +
      Math.pow(b - rgb.b, 2);

    if (distance < bestDistance) {
      secondDistance = bestDistance;
      nearest = color;
      bestDistance = distance;
    } else if (distance < secondDistance) {
      secondDistance = distance;
    }
  });

  return {
    color: nearest,
    confidence: clamp01((secondDistance - bestDistance) / Math.max(secondDistance, 1)),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
