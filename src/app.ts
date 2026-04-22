import { LESSONS } from "./lessons";
import {
  appendMoveToHistory,
  buildAdaptivePhase,
  explainAdaptiveMove,
  invertAlgorithm,
  simplifyHistory,
} from "./adaptive-solver";
import {
  COLOR_META,
  ColorKey,
  FACE_SCAN_COLOR,
  SCAN_FACE_ORDER,
  ScanGrid,
  cloneScanGrid,
  createEmptyScanGrid,
  createSolvedScanGrid,
  sampleFaceletsFromImage,
  scanGridToHexConfig,
  validateScanGrid,
} from "./photo-scanner";
import {
  Face,
  MoveSource,
  RubikCube,
  normalizeMoveToken,
  randomMove,
  tokenizeAlgorithm,
} from "./rubik";

type Modifier = "" | "'" | "2";
type Mode = "guide" | "adaptive" | "photo" | "free";

const FACE_LABELS: Record<Face, string> = {
  U: "Haut",
  D: "Bas",
  R: "Droite",
  L: "Gauche",
  F: "Avant",
  B: "Arrière",
};

const STORAGE_KEY = "rubi-coach-known-lessons";

export class RubiCoachApp {
  private readonly root: HTMLElement;
  private cube?: RubikCube;
  private lessonIndex = 0;
  private algorithmIndex = 0;
  private practiceIndex = 0;
  private modifier: Modifier = "";
  private mode: Mode = "guide";
  private panelOpen = true;
  private queueCount = 0;
  private activeMove = "";
  private challenge = randomMove();
  private status = "Choisis une étape ou lance la démo.";
  private moveHistory: string[] = [];
  private lastScramble: string[] = [];
  private explanationOpen = false;
  private scanGrid: ScanGrid = createEmptyScanGrid();
  private scanFace: Face = "U";
  private scanPaint: ColorKey = "W";
  private scanPhotos: Partial<Record<Face, string>> = {};
  private scanMessage = "Scanne ou corrige les 6 faces.";
  private readonly knownLessons = new Set<string>();

  constructor(root: HTMLElement) {
    this.root = root;
    this.loadProgress();
    this.mount();
  }

  private mount(): void {
    this.root.innerHTML = `
      <div class="app-shell">
        <section class="stage" aria-label="Cube Rubik interactif"></section>
        <header class="top-hud"></header>
        <aside class="coach-panel"></aside>
        <section class="move-pad" aria-label="Commandes du cube"></section>
      </div>
    `;

    const stage = this.root.querySelector<HTMLElement>(".stage");
    if (!stage) {
      throw new Error("Stage introuvable");
    }

    this.cube = new RubikCube(stage);
    this.cube.onMoveStarted = (token) => {
      this.activeMove = token;
      this.renderTopHud();
    };
    this.cube.onMoveCompleted = (token, source) => this.handleMoveCompleted(token, source);
    this.cube.onQueueChanged = (count) => {
      this.queueCount = count;
      this.renderTopHud();
    };

    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => void this.handleChange(event));
    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    this.render();
  }

  private render(): void {
    this.renderTopHud();
    this.renderCoachPanel();
    this.renderMovePad();
  }

  private renderTopHud(): void {
    const hud = this.root.querySelector<HTMLElement>(".top-hud");
    if (!hud) {
      return;
    }

    const completed = this.knownLessons.size;
    const lesson = LESSONS[this.lessonIndex];
    const badge =
      this.mode === "adaptive"
        ? `${this.adaptiveTokens().length} tours`
        : this.mode === "photo"
          ? "Photo"
        : lesson.badge;

    hud.innerHTML = `
      <div class="brand-block">
        <strong>Rubi Coach</strong>
        <span>${this.mode === "adaptive" ? "tuto adapté au mélange" : this.mode === "photo" ? "scanner 6 faces" : "méthode débutant optimisée"}</span>
      </div>
      <div class="hud-status" aria-live="polite">
        <span class="status-dot ${this.queueCount > 0 || this.activeMove ? "busy" : ""}"></span>
        <span>${escapeHtml(this.activeMove ? `Tour ${this.activeMove}` : this.status)}</span>
      </div>
      <div class="hud-progress" title="Progression">
        <span>${completed}/${LESSONS.length}</span>
        <small>${escapeHtml(badge)}</small>
      </div>
      <button class="icon-button panel-toggle" type="button" data-action="toggle-panel" aria-label="Afficher les leçons">
        ${this.panelOpen ? "×" : "☰"}
      </button>
    `;
  }

  private renderCoachPanel(): void {
    const panel = this.root.querySelector<HTMLElement>(".coach-panel");
    if (!panel) {
      return;
    }

    panel.classList.toggle("is-collapsed", !this.panelOpen);

    if (this.mode === "adaptive") {
      this.renderAdaptivePanel(panel);
      return;
    }

    if (this.mode === "photo") {
      this.renderPhotoPanel(panel);
      return;
    }

    const lesson = LESSONS[this.lessonIndex];
    const algorithm = lesson.algorithms[this.algorithmIndex];
    const tokens = tokenizeAlgorithm(algorithm.moves);
    const expected = tokens[this.practiceIndex] ?? null;
    const done = this.practiceIndex >= tokens.length;

    panel.innerHTML = `
      <div class="panel-scroll">
        <div class="lesson-header">
          <span class="eyebrow">${escapeHtml(lesson.badge)}</span>
          <h1>${escapeHtml(lesson.title)}</h1>
          <p>${escapeHtml(lesson.goal)}</p>
        </div>

        <nav class="lesson-rail" aria-label="Étapes">
          ${LESSONS.map((item, index) => {
            const active = index === this.lessonIndex ? "is-active" : "";
            const known = this.knownLessons.has(item.id) ? "is-known" : "";
            return `
              <button class="lesson-pill ${active} ${known}" type="button" data-action="select-lesson" data-index="${index}">
                <span>${index + 1}</span>
                <strong>${escapeHtml(item.badge)}</strong>
              </button>
            `;
          }).join("")}
        </nav>

        <section class="principle-band">
          <strong>Principe</strong>
          <p>${escapeHtml(lesson.principle)}</p>
        </section>

        <div class="focus-grid">
          ${lesson.focus.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>

        <div class="algorithm-tabs">
          ${lesson.algorithms.map((item, index) => `
            <button class="${index === this.algorithmIndex ? "is-active" : ""}" type="button" data-action="select-algorithm" data-index="${index}">
              ${escapeHtml(item.name)}
            </button>
          `).join("")}
        </div>

        <section class="algorithm-panel">
          <div class="algorithm-title">
            <div>
              <strong>${escapeHtml(algorithm.name)}</strong>
              <p>${escapeHtml(algorithm.purpose)}</p>
            </div>
            <span class="expected-token ${done ? "is-done" : ""}">${done ? "OK" : escapeHtml(expected ?? "-")}</span>
          </div>

          <div class="move-tape" aria-label="Séquence">
            ${tokens.map((token, index) => {
              const active = index === this.practiceIndex ? "is-current" : "";
              const passed = index < this.practiceIndex ? "is-passed" : "";
              return `
                <button class="${active} ${passed}" type="button" data-action="play-token" data-token="${escapeHtml(token)}">
                  ${escapeHtml(token)}
                </button>
              `;
            }).join("")}
          </div>

          <div class="coach-actions">
            <button class="primary" type="button" data-action="play-demo">Démo</button>
            <button type="button" data-action="play-step">${done ? "Revoir" : "Pas"}</button>
            <button type="button" data-action="restart-algorithm">Repartir</button>
            <button type="button" data-action="mark-known">Acquis</button>
          </div>
        </section>

        ${this.renderModeRow()}

        <section class="practice-strip">
          ${this.mode === "guide"
            ? `<span>Cible</span><strong>${done ? "séquence terminée" : escapeHtml(expected ?? "-")}</strong>`
            : `<span>Défi notation</span><strong>${escapeHtml(this.challenge)}</strong><button type="button" data-action="new-challenge">Nouveau</button>`}
        </section>

        <section class="checkpoints">
          <strong>Auto-contrôle</strong>
          ${lesson.checkpoints.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
        </section>
      </div>
    `;
  }

  private renderModeRow(): string {
    return `
      <div class="mode-row" role="group" aria-label="Mode d'entraînement">
        <button class="${this.mode === "guide" ? "is-active" : ""}" type="button" data-action="set-mode" data-mode="guide">Cours</button>
        <button class="${this.mode === "adaptive" ? "is-active" : ""}" type="button" data-action="set-mode" data-mode="adaptive" ${this.moveHistory.length === 0 ? "disabled" : ""}>Mélange</button>
        <button class="${this.mode === "photo" ? "is-active" : ""}" type="button" data-action="set-mode" data-mode="photo">Photo</button>
        <button class="${this.mode === "free" ? "is-active" : ""}" type="button" data-action="set-mode" data-mode="free">Libre</button>
      </div>
    `;
  }

  private renderAdaptivePanel(panel: HTMLElement): void {
    const tokens = this.adaptiveTokens();
    const originalLength = Math.max(this.lastScramble.length, tokens.length);
    const nextToken = tokens[0] ?? null;
    const done = tokens.length === 0;
    const progress = this.cube?.getProgress();
    const phase = buildAdaptivePhase(
      tokens.length,
      originalLength,
      progress?.currentStage.title,
    );
    const explanation = explainAdaptiveMove(nextToken, this.moveHistory, progress);
    const chunk = tokens.slice(0, 10);
    const scramblePreview =
      this.lastScramble.length > 0
        ? this.lastScramble.join(" ")
        : this.moveHistory.slice(-18).join(" ");

    panel.innerHTML = `
      <div class="panel-scroll">
        <div class="lesson-header">
          <span class="eyebrow">Mélange</span>
          <h1>Tuto adapté</h1>
          <p>Le plan se base sur le mélange réel et se recalcule après chaque mouvement.</p>
        </div>

        <section class="adaptive-summary">
          <div>
            <span>Prochain tour</span>
            <strong class="${done ? "is-done" : ""}">${done ? "OK" : escapeHtml(nextToken ?? "-")}</strong>
          </div>
          <div>
            <span>Restants</span>
            <strong>${tokens.length}</strong>
          </div>
        </section>

        <section class="principle-band">
          <strong>${escapeHtml(phase.title)}</strong>
          <p>${escapeHtml(phase.hint)}</p>
        </section>

        ${progress ? this.renderBeginnerMap(progress) : ""}

        <section class="scramble-strip">
          <span>${this.lastScramble.length > 0 ? "Mélange fait" : "Historique actuel"}</span>
          <p>${scramblePreview ? escapeHtml(scramblePreview) : "Cube déjà résolu."}</p>
        </section>

        <section class="algorithm-panel adaptive-plan">
          <div class="algorithm-title">
            <div>
              <strong>Chemin personnalisé</strong>
              <p>${done ? "Le cube est revenu à l'état résolu." : "Fais le premier mouvement en surbrillance, puis laisse le coach changer la cible."}</p>
            </div>
            <span class="expected-token ${done ? "is-done" : ""}">${done ? "OK" : escapeHtml(nextToken ?? "-")}</span>
          </div>

          <div class="move-tape" aria-label="Plan adapté au mélange">
            ${chunk.map((token, index) => `
              <button class="${index === 0 ? "is-current" : ""}" type="button" data-action="play-token" data-token="${escapeHtml(token)}">
                ${escapeHtml(token)}
              </button>
            `).join("")}
            ${tokens.length > chunk.length ? `<span class="remaining-chip">+${tokens.length - chunk.length}</span>` : ""}
          </div>

          <div class="coach-actions">
            <button class="primary" type="button" data-action="play-demo" ${done ? "disabled" : ""}>Solution</button>
            <button type="button" data-action="play-step" ${done ? "disabled" : ""}>Pas</button>
            <button type="button" data-action="toggle-explain">${this.explanationOpen ? "Masquer" : "Pourquoi ?"}</button>
            <button type="button" data-action="restart-adaptive" ${this.lastScramble.length === 0 ? "disabled" : ""}>Repartir</button>
          </div>
        </section>

        ${this.explanationOpen ? `
          <section class="reason-panel">
            <strong>${escapeHtml(explanation.title)}</strong>
            <p>${escapeHtml(explanation.body)}</p>
            ${explanation.details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("")}
          </section>
        ` : ""}

        ${this.renderModeRow()}

        <section class="practice-strip">
          <span>Pièces résolues</span>
          <strong>${progress ? `${progress.solvedPieces}/${progress.totalPieces}` : "analyse..."}</strong>
        </section>

        <section class="checkpoints">
          <strong>Lecture</strong>
          <p>Ne change pas l'orientation du cube entre deux pas.</p>
          <p>Si tu fais un autre mouvement, le plan se met à jour automatiquement.</p>
          <p>Le bouton Solution joue tous les mouvements restants.</p>
        </section>
      </div>
    `;
  }

  private renderBeginnerMap(progress: NonNullable<ReturnType<RubikCube["getProgress"]>>): string {
    return `
      <section class="beginner-map">
        <div class="map-title">
          <strong>Méthode débutant adaptée</strong>
          <span>${progress.solvedPieces}/${progress.totalPieces} pièces</span>
        </div>
        <div class="stage-stack">
          ${progress.stages.map((stage) => `
            <div class="stage-row ${stage.done ? "is-done" : stage.id === progress.currentStage.id ? "is-current" : ""}">
              <span>${stage.done ? "OK" : stage.id === progress.currentStage.id ? "Maintenant" : "Après"}</span>
              <strong>${escapeHtml(stage.title)}</strong>
              <small>${stage.solved}/${stage.total}</small>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  private renderPhotoPanel(panel: HTMLElement): void {
    const validation = validateScanGrid(this.scanGrid);
    const faceColor = FACE_SCAN_COLOR[this.scanFace];
    const cells = this.scanGrid[this.scanFace];
    const photo = this.scanPhotos[this.scanFace];

    panel.innerHTML = `
      <div class="panel-scroll">
        <div class="lesson-header">
          <span class="eyebrow">Photo</span>
          <h1>Scanner le cube</h1>
          <p>Prends ou importe les 6 faces, puis corrige les cases si la lumière trompe la détection.</p>
        </div>

        <nav class="scan-face-tabs" aria-label="Faces à scanner">
          ${SCAN_FACE_ORDER.map((face) => {
            const done = this.scanGrid[face].every((color) => color !== "X");
            return `
              <button class="${face === this.scanFace ? "is-active" : ""} ${done ? "is-done" : ""}" type="button" data-action="select-scan-face" data-face="${face}">
                <span>${face}</span>
                <small>${COLOR_META[FACE_SCAN_COLOR[face]].label}</small>
              </button>
            `;
          }).join("")}
        </nav>

        <section class="scan-summary">
          <div>
            <span>Face active</span>
            <strong>${this.scanFace} · ${COLOR_META[faceColor].label}</strong>
          </div>
          <div>
            <span>Validation</span>
            <strong>${validation.valid ? "OK" : validation.complete ? "À corriger" : "Incomplet"}</strong>
          </div>
        </section>

        <section class="scanner-workbench">
          <label class="photo-drop">
            <input type="file" accept="image/*" capture="environment" data-action="upload-scan-photo" />
            ${photo ? `<img src="${photo}" alt="Photo de la face ${this.scanFace}" />` : `<span>Photo / caméra</span>`}
          </label>

          <div class="scan-grid" aria-label="Grille de stickers scannée">
            ${cells.map((color, index) => `
              <button class="${index === 4 ? "is-center" : ""}" type="button" data-action="paint-scan-cell" data-index="${index}" ${index === 4 ? "disabled" : ""} style="--cell-color: ${COLOR_META[color].hex}">
                <span>${COLOR_META[color].short}</span>
              </button>
            `).join("")}
          </div>
        </section>

        <section class="scan-palette" aria-label="Palette de correction">
          ${(["W", "Y", "R", "O", "G", "B"] as ColorKey[]).map((color) => `
            <button class="${this.scanPaint === color ? "is-active" : ""}" type="button" data-action="select-scan-color" data-color="${color}" style="--swatch: ${COLOR_META[color].hex}">
              <span></span>${COLOR_META[color].label}
            </button>
          `).join("")}
          <button class="${this.scanPaint === "X" ? "is-active" : ""}" type="button" data-action="select-scan-color" data-color="X" style="--swatch: ${COLOR_META.X.hex}">
            <span></span>Effacer
          </button>
        </section>

        <section class="scan-counts">
          ${(["W", "Y", "R", "O", "G", "B"] as ColorKey[]).map((color) => `
            <span class="${validation.counts[color] === 9 ? "is-valid" : ""}" style="--swatch: ${COLOR_META[color].hex}">
              ${COLOR_META[color].short} ${validation.counts[color]}/9
            </span>
          `).join("")}
        </section>

        <section class="principle-band">
          <strong>${escapeHtml(validation.message)}</strong>
          <p>${escapeHtml(this.scanMessage)}</p>
        </section>

        <div class="coach-actions scanner-actions">
          <button class="primary" type="button" data-action="apply-scan" ${validation.valid ? "" : "disabled"}>Appliquer</button>
          <button type="button" data-action="next-scan-face">Suivante</button>
          <button type="button" data-action="fill-solved-scan">Exemple</button>
          <button type="button" data-action="reset-scan">Vider</button>
        </div>

        ${this.renderModeRow()}

        <section class="checkpoints">
          <strong>Mobile</strong>
          <p>Sur téléphone, le bouton Photo / caméra ouvre la caméra arrière quand le navigateur l'autorise.</p>
          <p>Cadre la face le plus à plat possible, puis corrige les 9 cases avec la palette.</p>
          <p>Une seule photo ne suffit pas: il faut les 6 faces.</p>
        </section>
      </div>
    `;
  }

  private renderMovePad(): void {
    const pad = this.root.querySelector<HTMLElement>(".move-pad");
    if (!pad) {
      return;
    }

    const faces: Face[] = ["U", "L", "F", "R", "B", "D"];

    pad.innerHTML = `
      <div class="modifier-row" role="group" aria-label="Sens du mouvement">
        <button class="${this.modifier === "" ? "is-active" : ""}" type="button" data-action="set-modifier" data-modifier="">90</button>
        <button class="${this.modifier === "'" ? "is-active" : ""}" type="button" data-action="set-modifier" data-modifier="'">Inverse</button>
        <button class="${this.modifier === "2" ? "is-active" : ""}" type="button" data-action="set-modifier" data-modifier="2">180</button>
      </div>
      <div class="face-grid">
        ${faces.map((face) => `
          <button class="face-button" type="button" data-action="turn-face" data-face="${face}" data-face-code="${face}">
            <span class="face-code">${face}${this.modifier}</span>
            <small>${FACE_LABELS[face]}</small>
          </button>
        `).join("")}
      </div>
      <div class="utility-row">
        <button type="button" data-action="scramble" aria-label="Mélanger">Mél.</button>
        <button type="button" data-action="open-scanner">Scanner</button>
        <button type="button" data-action="reset-cube">Reset</button>
        <button type="button" data-action="focus-camera">Vue</button>
      </div>
    `;
  }

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");

    if (!target) {
      return;
    }

    const action = target.dataset.action;

    switch (action) {
      case "toggle-panel":
        this.panelOpen = !this.panelOpen;
        this.render();
        break;
      case "select-lesson":
        this.selectLesson(Number(target.dataset.index ?? 0));
        break;
      case "select-algorithm":
        this.selectAlgorithm(Number(target.dataset.index ?? 0));
        break;
      case "play-demo":
        this.playDemo();
        break;
      case "play-step":
        this.playStep();
        break;
      case "restart-algorithm":
        this.practiceIndex = 0;
        this.status = "Séquence remise au début.";
        this.render();
        break;
      case "restart-adaptive":
        this.restartAdaptivePlan();
        break;
      case "toggle-explain":
        this.explanationOpen = !this.explanationOpen;
        this.render();
        break;
      case "mark-known":
        this.markCurrentLessonKnown();
        break;
      case "set-mode":
        this.setMode(target.dataset.mode as Mode);
        this.render();
        break;
      case "select-scan-face":
        this.selectScanFace(target.dataset.face as Face);
        break;
      case "select-scan-color":
        this.scanPaint = (target.dataset.color ?? "W") as ColorKey;
        this.render();
        break;
      case "paint-scan-cell":
        this.paintScanCell(Number(target.dataset.index ?? 0));
        break;
      case "next-scan-face":
        this.selectScanFace(this.nextScanFace());
        break;
      case "fill-solved-scan":
        this.fillSolvedScan();
        break;
      case "reset-scan":
        this.resetScan();
        break;
      case "apply-scan":
        this.applyScanToCube();
        break;
      case "new-challenge":
        this.challenge = randomMove(this.challenge[0] as Face);
        this.status = "Nouveau défi prêt.";
        this.render();
        break;
      case "set-modifier":
        this.modifier = (target.dataset.modifier ?? "") as Modifier;
        this.renderMovePad();
        break;
      case "turn-face":
        this.handleFaceTurn(target.dataset.face as Face);
        break;
      case "scramble":
        this.scrambleCube();
        break;
      case "reset-cube":
        this.resetCube();
        break;
      case "focus-camera":
        this.cube?.focusCamera();
        this.status = "Vue recentrée.";
        this.renderTopHud();
        break;
      case "open-scanner":
        this.setMode("photo");
        this.panelOpen = true;
        this.render();
        break;
      case "play-token":
        this.playSingleToken(target.dataset.token ?? "");
        break;
      default:
        break;
    }
  }

  private async handleChange(event: Event): Promise<void> {
    const target = (event.target as HTMLElement).closest<HTMLInputElement>("[data-action]");

    if (!target || target.dataset.action !== "upload-scan-photo") {
      return;
    }

    const file = target.files?.[0];
    target.value = "";

    if (!file) {
      return;
    }

    this.scanMessage = "Analyse de la photo...";
    this.render();

    try {
      const result = await sampleFaceletsFromImage(file);
      const nextGrid = cloneScanGrid(this.scanGrid);
      nextGrid[this.scanFace] = result.colors;
      nextGrid[this.scanFace][4] = FACE_SCAN_COLOR[this.scanFace];
      this.scanGrid = nextGrid;
      this.scanPhotos[this.scanFace] = result.dataUrl;
      this.scanMessage = "Détection appliquée. Corrige les cases si besoin.";
    } catch (error) {
      this.scanMessage = error instanceof Error ? error.message : "Photo impossible à analyser.";
    }

    this.render();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const activeElement = document.activeElement;
    const isTyping =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement;

    if (isTyping) {
      return;
    }

    const key = event.key.toUpperCase();
    if (!["U", "D", "R", "L", "F", "B"].includes(key)) {
      return;
    }

    event.preventDefault();
    const previousModifier = this.modifier;
    const modifier: Modifier = event.shiftKey ? "'" : previousModifier;
    const token = `${key}${modifier}`;
    this.tryUserMove(token);
  }

  private selectLesson(index: number): void {
    this.mode = "guide";
    this.lessonIndex = clampIndex(index, LESSONS.length);
    this.algorithmIndex = 0;
    this.practiceIndex = 0;
    this.status = `${LESSONS[this.lessonIndex].badge}: ${LESSONS[this.lessonIndex].title}`;
    this.render();
  }

  private selectAlgorithm(index: number): void {
    this.mode = "guide";
    const lesson = LESSONS[this.lessonIndex];
    this.algorithmIndex = clampIndex(index, lesson.algorithms.length);
    this.practiceIndex = 0;
    this.status = `Algorithme: ${lesson.algorithms[this.algorithmIndex].name}`;
    this.render();
  }

  private setMode(mode: Mode): void {
    if (mode === "adaptive" && this.moveHistory.length === 0) {
      this.status = "Mélange d'abord le cube pour créer un tuto adapté.";
      return;
    }

    this.mode = mode === "adaptive" || mode === "photo" || mode === "free" ? mode : "guide";
    this.practiceIndex = 0;

    if (this.mode === "adaptive") {
      this.explanationOpen = true;
      this.status = "Tuto adapté au mélange actif.";
    } else if (this.mode === "photo") {
      this.explanationOpen = false;
      this.status = "Scanner photo actif.";
    } else if (this.mode === "free") {
      this.explanationOpen = false;
      this.status = "Mode libre actif.";
    } else {
      this.explanationOpen = false;
      this.status = "Cours débutant actif.";
    }
  }

  private playDemo(): void {
    const tokens = this.currentTokens();
    this.practiceIndex = 0;
    this.cube?.clearQueue();
    this.cube?.enqueueAlgorithm(tokens, this.mode === "adaptive" ? "adaptive" : "demo");
    this.status = this.mode === "adaptive" ? "Solution adaptée en cours." : "Démo en cours.";
    this.render();
  }

  private playStep(): void {
    const tokens = this.currentTokens();

    if (tokens.length === 0) {
      return;
    }

    if (this.practiceIndex >= tokens.length) {
      this.practiceIndex = 0;
    }

    const index = this.mode === "adaptive" ? 0 : this.practiceIndex;
    this.cube?.enqueueMove(tokens[index], this.mode === "adaptive" ? "adaptive" : "step");
    this.status = this.mode === "adaptive" ? "Pas adapté." : "Pas à pas.";
    this.render();
  }

  private playSingleToken(token: string): void {
    const normalized = normalizeMoveToken(token);

    if (!normalized) {
      return;
    }

    if (this.mode === "adaptive") {
      const expected = this.adaptiveTokens()[0];

      if (normalized !== expected) {
        this.status = `Pour ce mélange, prochain pas: ${expected ?? "OK"}`;
        this.render();
        return;
      }

      this.cube?.enqueueMove(normalized, "adaptive");
      this.status = `Pas adapté: ${normalized}`;
      this.render();
      return;
    }

    this.cube?.enqueueMove(normalized, "free");
    this.status = `Mouvement isolé: ${normalized}`;
    this.renderTopHud();
  }

  private handleFaceTurn(face: Face): void {
    this.tryUserMove(`${face}${this.modifier}`);
  }

  private tryUserMove(rawToken: string): void {
    const token = normalizeMoveToken(rawToken);

    if (!token) {
      return;
    }

    if (this.mode === "guide" || this.mode === "adaptive") {
      const expected =
        this.mode === "adaptive" ? this.adaptiveTokens()[0] : this.currentTokens()[this.practiceIndex];

      if (!expected) {
        this.status =
          this.mode === "adaptive"
            ? "Le cube est résolu. Mélange pour créer un nouveau tuto."
            : "Séquence terminée. Repars au début ou choisis une autre étape.";
        this.render();
        return;
      }

      if (token !== expected) {
        this.status =
          this.mode === "adaptive"
            ? `Pour ce mélange, prochain pas: ${expected}`
            : `Cible attendue: ${expected}`;
        this.render();
        return;
      }
    }

    this.cube?.enqueueMove(token, "user");

    if (this.mode === "free" && token === this.challenge) {
      this.challenge = randomMove(token[0] as Face);
      this.status = "Défi validé.";
    } else {
      this.status = `Mouvement: ${token}`;
    }

    this.render();
  }

  private handleMoveCompleted(token: string, source: MoveSource): void {
    this.activeMove = "";
    this.recordCompletedMove(token, source);

    if (this.mode === "adaptive" || source === "adaptive") {
      this.practiceIndex = 0;
      this.status =
        this.moveHistory.length === 0
          ? "Cube résolu avec le tuto adapté."
          : `Plan mis à jour: ${this.adaptiveTokens().length} tours restants.`;
      this.render();
      return;
    }

    if (source === "demo" || source === "step" || source === "user") {
      const expected = this.currentTokens()[this.practiceIndex];

      if (token === expected) {
        this.practiceIndex += 1;

        if (this.practiceIndex >= this.currentTokens().length) {
          this.status = "Séquence complète.";
        }
      }
    }

    this.render();
  }

  private scrambleCube(): void {
    const scramble = this.cube?.scramble(22) ?? [];
    this.lastScramble = scramble;
    this.moveHistory = simplifyHistory(scramble);
    this.mode = "adaptive";
    this.practiceIndex = 0;
    this.explanationOpen = true;
    this.panelOpen = true;
    this.status = `Tuto adapté créé: ${this.adaptiveTokens().length} tours.`;
    this.render();
  }

  private resetCube(): void {
    this.cube?.reset();
    this.moveHistory = [];
    this.lastScramble = [];
    this.mode = "guide";
    this.practiceIndex = 0;
    this.explanationOpen = false;
    this.status = "Cube remis à zéro.";
    this.render();
  }

  private selectScanFace(face: Face): void {
    if (!SCAN_FACE_ORDER.includes(face)) {
      return;
    }

    this.scanFace = face;
    this.scanPaint = FACE_SCAN_COLOR[face];
    this.scanMessage = `Face ${face}: centre ${COLOR_META[FACE_SCAN_COLOR[face]].label}.`;
    this.render();
  }

  private nextScanFace(): Face {
    const index = SCAN_FACE_ORDER.indexOf(this.scanFace);
    return SCAN_FACE_ORDER[(index + 1) % SCAN_FACE_ORDER.length];
  }

  private paintScanCell(index: number): void {
    if (index < 0 || index > 8 || index === 4) {
      return;
    }

    const nextGrid = cloneScanGrid(this.scanGrid);
    nextGrid[this.scanFace][index] = this.scanPaint;
    this.scanGrid = nextGrid;
    this.scanMessage = `Case ${index + 1} corrigée en ${COLOR_META[this.scanPaint].label}.`;
    this.render();
  }

  private fillSolvedScan(): void {
    this.scanGrid = createSolvedScanGrid();
    this.scanPhotos = {};
    this.scanMessage = "Exemple résolu rempli. Tu peux l'appliquer pour vérifier le rendu.";
    this.render();
  }

  private resetScan(): void {
    this.scanGrid = createEmptyScanGrid();
    this.scanPhotos = {};
    this.scanMessage = "Scan vidé. Les centres restent verrouillés.";
    this.render();
  }

  private applyScanToCube(): void {
    const validation = validateScanGrid(this.scanGrid);

    if (!validation.valid) {
      this.scanMessage = validation.message;
      this.render();
      return;
    }

    this.cube?.applyFaceletColors(scanGridToHexConfig(this.scanGrid));
    this.moveHistory = [];
    this.lastScramble = [];
    this.mode = "photo";
    this.status = "Configuration photo appliquée au cube 3D.";
    this.scanMessage = "Le cube 3D reprend les couleurs scannées. Le solveur photo complet reste à brancher.";
    this.render();
  }

  private restartAdaptivePlan(): void {
    if (this.lastScramble.length === 0) {
      this.status = "Aucun mélange à rejouer.";
      this.render();
      return;
    }

    this.cube?.reset();
    this.cube?.applyAlgorithmInstant(this.lastScramble);
    this.moveHistory = simplifyHistory(this.lastScramble);
    this.mode = "adaptive";
    this.practiceIndex = 0;
    this.explanationOpen = true;
    this.status = "Mélange rejoué. Tuto adapté prêt.";
    this.render();
  }

  private recordCompletedMove(token: string, source: MoveSource): void {
    if (source === "system") {
      return;
    }

    this.moveHistory = appendMoveToHistory(this.moveHistory, token);
  }

  private markCurrentLessonKnown(): void {
    this.knownLessons.add(LESSONS[this.lessonIndex].id);
    this.saveProgress();
    this.status = "Étape marquée acquise.";
    this.render();
  }

  private currentTokens(): string[] {
    if (this.mode === "adaptive") {
      return this.adaptiveTokens();
    }

    const lesson = LESSONS[this.lessonIndex];
    return tokenizeAlgorithm(lesson.algorithms[this.algorithmIndex].moves);
  }

  private adaptiveTokens(): string[] {
    return invertAlgorithm(this.moveHistory);
  }

  private loadProgress(): void {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return;
      }
      const ids = JSON.parse(saved) as string[];
      ids.forEach((id) => this.knownLessons.add(id));
    } catch {
      this.knownLessons.clear();
    }
  }

  private saveProgress(): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.knownLessons]));
  }
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(Math.max(index, 0), Math.max(0, length - 1));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
