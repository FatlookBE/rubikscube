import type { Face } from "./rubik";

export type ColorKey = "W" | "Y" | "R" | "O" | "G" | "B" | "X";
export type ScanGrid = Record<Face, ColorKey[]>;

export type ScanValidation = {
  complete: boolean;
  valid: boolean;
  message: string;
  counts: Record<ColorKey, number>;
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

export async function sampleFaceletsFromImage(file: File): Promise<{
  colors: ColorKey[];
  dataUrl: string;
}> {
  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 360;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas indisponible pour analyser la photo.");
  }

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const cropX = (image.naturalWidth - cropSize) / 2;
  const cropY = (image.naturalHeight - cropSize) / 2;
  context.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, size, size);

  const cellSize = size / 3;
  const colors = Array.from({ length: 9 }, (_, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const sample = averageSample(
      context,
      Math.round(col * cellSize + cellSize / 2),
      Math.round(row * cellSize + cellSize / 2),
      Math.round(cellSize * 0.2),
    );
    return classifyColor(sample);
  });

  return { colors, dataUrl };
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
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let index = 0; index < data.length; index += 4) {
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
}

function classifyColor({ r, g, b }: { r: number; g: number; b: number }): ColorKey {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < 0.22 && v > 0.5) {
    return "W";
  }

  if (h >= 42 && h <= 78) {
    return "Y";
  }

  if (h >= 18 && h < 42) {
    return "O";
  }

  if (h < 18 || h >= 338) {
    return "R";
  }

  if (h >= 78 && h < 175) {
    return "G";
  }

  if (h >= 175 && h < 265) {
    return "B";
  }

  return nearestPaletteColor(r, g, b);
}

function nearestPaletteColor(r: number, g: number, b: number): ColorKey {
  let nearest: ColorKey = "W";
  let bestDistance = Number.POSITIVE_INFINITY;

  PALETTE.forEach((color) => {
    const rgb = hexToRgb(COLOR_META[color].hex);
    const distance =
      Math.pow(r - rgb.r, 2) +
      Math.pow(g - rgb.g, 2) +
      Math.pow(b - rgb.b, 2);

    if (distance < bestDistance) {
      nearest = color;
      bestDistance = distance;
    }
  });

  return nearest;
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
