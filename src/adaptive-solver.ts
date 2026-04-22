import { CubeProgress, normalizeMoveToken, tokenizeAlgorithm } from "./rubik";

export type AdaptivePhase = {
  title: string;
  hint: string;
};

export type MoveExplanation = {
  title: string;
  body: string;
  details: string[];
};

const FACE_COPY: Record<string, { name: string; layer: string }> = {
  U: { name: "haut", layer: "la couche du haut" },
  D: { name: "bas", layer: "la couche du bas" },
  R: { name: "droite", layer: "la couche de droite" },
  L: { name: "gauche", layer: "la couche de gauche" },
  F: { name: "avant", layer: "la couche avant" },
  B: { name: "arrière", layer: "la couche arrière" },
};

export function invertMove(token: string): string {
  const normalized = normalizeMoveToken(token);

  if (!normalized) {
    throw new Error(`Mouvement invalide: ${token}`);
  }

  if (normalized.endsWith("2")) {
    return normalized;
  }

  if (normalized.endsWith("'")) {
    return normalized.slice(0, -1);
  }

  return `${normalized}'`;
}

export function invertAlgorithm(tokens: string[]): string[] {
  return tokens.map((token) => invertMove(token)).reverse();
}

export function appendMoveToHistory(history: string[], token: string): string[] {
  const normalized = normalizeMoveToken(token);

  if (!normalized) {
    return history;
  }

  const next = [...history];
  const previous = next[next.length - 1];

  if (!previous || previous[0] !== normalized[0]) {
    next.push(normalized);
    return next;
  }

  const combinedPower = (movePower(previous) + movePower(normalized)) % 4;
  next.pop();

  if (combinedPower !== 0) {
    next.push(moveFromPower(normalized[0], combinedPower));
  }

  return next;
}

export function simplifyHistory(tokens: string[]): string[] {
  return tokens.reduce<string[]>(
    (history, token) => appendMoveToHistory(history, token),
    [],
  );
}

export function normalizedTokensFromText(value: string): string[] {
  return simplifyHistory(tokenizeAlgorithm(value));
}

export function buildAdaptivePhase(
  remaining: number,
  originalLength: number,
  stageTitle?: string,
): AdaptivePhase {
  if (remaining === 0) {
    return {
      title: "Cube résolu",
      hint: "Le plan personnalisé est terminé. Tu peux remélanger ou repasser au cours débutant.",
    };
  }

  const ratio = originalLength === 0 ? 0 : remaining / originalLength;

  if (ratio > 0.66) {
    return {
      title: stageTitle ?? "Défaire le mélange",
      hint: `Priorité: ${stageTitle ?? "défaire le mélange"}. Le coach annule le mélange dans l'ordre exact inverse.`,
    };
  }

  if (ratio > 0.33) {
    return {
      title: stageTitle ?? "Stabiliser les couches",
      hint: `Priorité: ${stageTitle ?? "stabiliser les couches"}. Garde le cube orienté comme à l'écran et respecte la cible.`,
    };
  }

  return {
    title: stageTitle ?? "Finaliser",
    hint: `Priorité: ${stageTitle ?? "finaliser"}. Les derniers tours réalignent les faces. Continue jusqu'au marqueur OK.`,
  };
}

export function explainAdaptiveMove(
  nextToken: string | null,
  history: string[],
  progress?: CubeProgress,
): MoveExplanation {
  if (!nextToken) {
    return {
      title: "Pourquoi OK ?",
      body: "Il n'y a plus de mouvement à faire: toutes les pièces inspectées sont revenues à leur état résolu.",
      details: ["Tu peux relancer Mélanger pour créer un nouveau tuto adapté."],
    };
  }

  const cancelledMove = history[history.length - 1];
  const face = nextToken[0];
  const faceCopy = FACE_COPY[face] ?? { name: face, layer: "cette couche" };
  const sense = nextToken.endsWith("2")
    ? "demi-tour"
    : nextToken.endsWith("'")
      ? "sens inverse"
      : "sens horaire";
  const stage = progress?.currentStage;
  const cancelledCopy = cancelledMove
    ? `Il annule ${cancelledMove}: faire ${cancelledMove} puis ${nextToken} ramène exactement cette couche en arrière.`
    : "Il continue le chemin de retour calculé depuis l'état actuel du cube.";

  return {
    title: `Pourquoi ${nextToken} ?`,
    body: cancelledCopy,
    details: [
      `Face touchée: ${faceCopy.name}, donc ${faceCopy.layer}.`,
      `Sens: ${sense}.`,
      stage
        ? `Objectif débutant: ${stage.title} (${stage.solved}/${stage.total}).`
        : "Objectif débutant: reconstruire les blocs déjà détectés.",
    ],
  };
}

function movePower(token: string): number {
  if (token.endsWith("2")) {
    return 2;
  }

  if (token.endsWith("'")) {
    return 3;
  }

  return 1;
}

function moveFromPower(face: string, power: number): string {
  if (power === 2) {
    return `${face}2`;
  }

  if (power === 3) {
    return `${face}'`;
  }

  return face;
}
