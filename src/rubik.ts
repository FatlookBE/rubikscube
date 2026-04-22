import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Axis = "x" | "y" | "z";
export type Face = "U" | "D" | "R" | "L" | "F" | "B";
export type MoveSource = "user" | "demo" | "step" | "free" | "adaptive" | "system";

export type MoveSpec = {
  token: string;
  face: Face;
  axis: Axis;
  layer: -1 | 1;
  dir: -1 | 1;
  turns: 1 | 2;
};

export type FaceletColorConfig = Record<Face, string[]>;

type Coord = Record<Axis, number>;

type Cubie = {
  id: string;
  mesh: THREE.Group;
  coord: Coord;
};

export type BeginnerStageProgress = {
  id:
    | "white-cross"
    | "white-corners"
    | "second-layer"
    | "yellow-cross"
    | "yellow-face"
    | "yellow-corners"
    | "last-edges";
  title: string;
  done: boolean;
  solved: number;
  total: number;
  hint: string;
};

export type CubeProgress = {
  solved: boolean;
  solvedPieces: number;
  totalPieces: number;
  currentStage: BeginnerStageProgress;
  stages: BeginnerStageProgress[];
};

type PieceState = {
  cubie: Cubie;
  original: Coord;
  isEdge: boolean;
  isCorner: boolean;
  solved: boolean;
};

type QueuedMove = {
  move: MoveSpec;
  source: MoveSource;
};

type ActiveMove = QueuedMove & {
  pivot: THREE.Object3D;
  selected: Cubie[];
  elapsed: number;
  duration: number;
  totalAngle: number;
};

const FACE_CONFIG: Record<Face, { axis: Axis; layer: -1 | 1; normalSign: -1 | 1 }> = {
  R: { axis: "x", layer: 1, normalSign: 1 },
  L: { axis: "x", layer: -1, normalSign: -1 },
  U: { axis: "y", layer: 1, normalSign: 1 },
  D: { axis: "y", layer: -1, normalSign: -1 },
  F: { axis: "z", layer: 1, normalSign: 1 },
  B: { axis: "z", layer: -1, normalSign: -1 },
};

const FACE_ORDER: Face[] = ["U", "L", "F", "R", "B", "D"];

const FACE_STICKERS: Array<{
  face: Face;
  axis: Axis;
  sign: -1 | 1;
  color: string;
}> = [
  { face: "U", axis: "y", sign: 1, color: "#f8f3e6" },
  { face: "D", axis: "y", sign: -1, color: "#ffd23f" },
  { face: "F", axis: "z", sign: 1, color: "#19a974" },
  { face: "B", axis: "z", sign: -1, color: "#2866cc" },
  { face: "R", axis: "x", sign: 1, color: "#d92d20" },
  { face: "L", axis: "x", sign: -1, color: "#ff8a1c" },
];

export function tokenizeAlgorithm(algorithm: string): string[] {
  return algorithm
    .replace(/[’`]/g, "'")
    .split(/\s+/)
    .map((token) => normalizeMoveToken(token))
    .filter((token): token is string => Boolean(token));
}

export function normalizeMoveToken(rawToken: string): string | null {
  const token = rawToken.trim().replace(/[’`]/g, "'").toUpperCase();
  const match = /^([UDRLFB])([2']?)$/.exec(token);
  return match ? `${match[1]}${match[2] ?? ""}` : null;
}

export function parseMoveToken(rawToken: string): MoveSpec {
  const token = normalizeMoveToken(rawToken);

  if (!token) {
    throw new Error(`Mouvement invalide: ${rawToken}`);
  }

  const face = token[0] as Face;
  const config = FACE_CONFIG[face];
  const isPrime = token.endsWith("'");
  const turns = token.endsWith("2") ? 2 : 1;
  let dir: -1 | 1 = config.normalSign === 1 ? -1 : 1;

  if (isPrime) {
    dir = (dir * -1) as -1 | 1;
  }

  return {
    token,
    face,
    axis: config.axis,
    layer: config.layer,
    dir,
    turns,
  };
}

export function randomMove(previousFace?: Face): string {
  const availableFaces = FACE_ORDER.filter((face) => face !== previousFace);
  const face = availableFaces[Math.floor(Math.random() * availableFaces.length)];
  const suffixes = ["", "'", "2"];
  return `${face}${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

export class RubikCube {
  onMoveStarted?: (token: string, source: MoveSource) => void;
  onMoveCompleted?: (token: string, source: MoveSource) => void;
  onQueueChanged?: (remaining: number) => void;

  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  private readonly controls: OrbitControls;
  private readonly timer = new THREE.Timer();
  private readonly cubieSize = 0.96;
  private readonly spacing = 1.08;
  private readonly cubies: Cubie[] = [];
  private readonly queue: QueuedMove[] = [];
  private readonly plasticMaterial = new THREE.MeshStandardMaterial({
    color: "#16181b",
    roughness: 0.62,
    metalness: 0.05,
  });
  private readonly solvedCoreMaterial = new THREE.MeshStandardMaterial({
    color: "#243f38",
    emissive: "#0a2f26",
    emissiveIntensity: 0.28,
    roughness: 0.58,
    metalness: 0.05,
  });
  private readonly stickerMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly coreGeometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  private readonly stickerGeometries = {
    x: new THREE.BoxGeometry(0.035, 0.74, 0.74),
    y: new THREE.BoxGeometry(0.74, 0.035, 0.74),
    z: new THREE.BoxGeometry(0.74, 0.74, 0.035),
  };

  private resizeObserver?: ResizeObserver;
  private frameId = 0;
  private currentMove: ActiveMove | null = null;
  private baseDuration = 0.34;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color("#111316");
    this.scene.fog = new THREE.Fog("#111316", 10, 22);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "cube-canvas";
    this.container.appendChild(this.renderer.domElement);

    this.camera.position.set(4.8, 4.2, 6.3);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 9;
    this.controls.target.set(0, 0, 0);
    this.timer.connect(document);

    this.createWorld();
    this.createCube();
    this.bindResize();
    this.resize();
    this.frameId = window.requestAnimationFrame(this.animate);
  }

  dispose(): void {
    window.cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.renderer.dispose();
    this.coreGeometry.dispose();
    Object.values(this.stickerGeometries).forEach((geometry) => geometry.dispose());
    this.plasticMaterial.dispose();
    this.solvedCoreMaterial.dispose();
    this.stickerMaterials.forEach((material) => material.dispose());
  }

  setSpeed(speed: number): void {
    this.baseDuration = THREE.MathUtils.clamp(0.5 / speed, 0.16, 0.64);
  }

  reset(): void {
    this.queue.length = 0;
    this.currentMove?.pivot.removeFromParent();
    this.currentMove = null;
    this.cubies.forEach((cubie) => {
      cubie.mesh.removeFromParent();
      cubie.mesh.clear();
    });
    this.cubies.length = 0;
    this.createCube();
    this.onQueueChanged?.(0);
  }

  focusCamera(): void {
    this.camera.position.set(4.8, 4.2, 6.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  clearQueue(): void {
    this.queue.length = 0;
    this.onQueueChanged?.(0);
  }

  enqueueMove(token: string, source: MoveSource = "user"): void {
    this.queue.push({ move: parseMoveToken(token), source });
    this.onQueueChanged?.(this.queue.length);
  }

  enqueueAlgorithm(tokens: string[], source: MoveSource = "demo"): void {
    tokens.forEach((token) => this.queue.push({ move: parseMoveToken(token), source }));
    this.onQueueChanged?.(this.queue.length);
  }

  scramble(count = 20): string[] {
    this.queue.length = 0;
    let previousFace: Face | undefined;
    const tokens: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const token = randomMove(previousFace);
      previousFace = token[0] as Face;
      tokens.push(token);
    }

    this.applyAlgorithmInstant(tokens);
    this.onQueueChanged?.(0);
    return tokens;
  }

  applyAlgorithmInstant(tokens: string[]): void {
    tokens.forEach((token) => this.applyMoveInstant(parseMoveToken(token)));
  }

  applyFaceletColors(facelets: FaceletColorConfig): void {
    this.reset();
    this.cubies.forEach((cubie) => {
      const coord = parseCoord(cubie.id);

      cubie.mesh.children.forEach((child) => {
        const face = child.name as Face;

        if (!FACE_CONFIG[face]) {
          return;
        }

        const index = faceletIndex(face, coord);
        const color = facelets[face]?.[index];

        if (!color) {
          return;
        }

        (child as THREE.Mesh).material = this.getStickerMaterial(color);
      });
    });
  }

  getProgress(): CubeProgress {
    this.scene.updateMatrixWorld(true);
    const pieces = this.cubies.map((cubie) => this.getPieceState(cubie));
    const movablePieces = pieces.filter((piece) => piece.isEdge || piece.isCorner);
    const whiteEdges = pieces.filter(
      (piece) => piece.original.y === 1 && piece.isEdge,
    );
    const whiteCorners = pieces.filter(
      (piece) => piece.original.y === 1 && piece.isCorner,
    );
    const middleEdges = pieces.filter(
      (piece) => piece.original.y === 0 && piece.isEdge,
    );
    const yellowEdges = pieces.filter(
      (piece) => piece.original.y === -1 && piece.isEdge,
    );
    const yellowCorners = pieces.filter(
      (piece) => piece.original.y === -1 && piece.isCorner,
    );
    const firstLayer = [...whiteEdges, ...whiteCorners];
    const firstTwoLayers = [...firstLayer, ...middleEdges];
    const yellowLayer = [...yellowEdges, ...yellowCorners];
    const solvedPieces = movablePieces.filter((piece) => piece.solved).length;
    const allSolved = solvedPieces === movablePieces.length;
    const stages: BeginnerStageProgress[] = [
      makeStage(
        "white-cross",
        "Croix blanche",
        whiteEdges,
        (piece) => piece.solved,
        "Récupère les quatre arêtes blanches autour du centre blanc.",
      ),
      makeStage(
        "white-corners",
        "Coins blancs",
        firstLayer,
        (piece) => piece.solved,
        "Complète les coins pour stabiliser la première couche.",
      ),
      makeStage(
        "second-layer",
        "Deuxième couronne",
        firstTwoLayers,
        (piece) => piece.solved,
        "Remets les arêtes du milieu sans casser la face blanche.",
      ),
      makeStage(
        "yellow-cross",
        "Croix jaune",
        yellowEdges,
        (piece) => this.isStickerOnFace(piece.cubie, "D"),
        "Oriente les arêtes jaunes sur la dernière face.",
      ),
      makeStage(
        "yellow-face",
        "Face jaune",
        yellowLayer,
        (piece) => this.isStickerOnFace(piece.cubie, "D"),
        "Retourne les coins jaunes jusqu'à avoir une face jaune pleine.",
      ),
      makeStage(
        "yellow-corners",
        "Coins jaunes",
        yellowCorners,
        (piece) => piece.solved,
        "Place chaque coin jaune au bon emplacement.",
      ),
      makeStage(
        "last-edges",
        "Dernières arêtes",
        movablePieces,
        (piece) => piece.solved,
        "Permute les dernières arêtes pour finir le cube.",
      ),
    ];

    this.updateProgressHighlights(movablePieces);

    return {
      solved: allSolved,
      solvedPieces,
      totalPieces: movablePieces.length,
      currentStage: stages.find((stage) => !stage.done) ?? stages[stages.length - 1],
      stages,
    };
  }

  private readonly animate = (timestamp?: number): void => {
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    this.controls.update();
    this.updateActiveMove(delta);
    this.renderer.render(this.scene, this.camera);
    this.frameId = window.requestAnimationFrame(this.animate);
  };

  private createWorld(): void {
    const hemisphere = new THREE.HemisphereLight("#f9f2dc", "#15191f", 1.35);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight("#fff4dd", 2.6);
    key.position.set(5, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 18;
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight("#7ec8ff", 1.2);
    rim.position.set(-6, 3, -5);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.4, 96),
      new THREE.MeshStandardMaterial({
        color: "#171a1e",
        roughness: 0.84,
        metalness: 0.04,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(10, 20, "#30363d", "#20252a");
    grid.position.y = -2.23;
    this.scene.add(grid);
  }

  private createCube(): void {
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          if (x === 0 && y === 0 && z === 0) {
            continue;
          }

          const coord = { x, y, z };
          const mesh = this.createCubieMesh(coord);
          this.scene.add(mesh);
          this.cubies.push({
            id: `${x}:${y}:${z}`,
            mesh,
            coord,
          });
        }
      }
    }
  }

  private createCubieMesh(coord: Coord): THREE.Group {
    const group = new THREE.Group();
    group.position.set(coord.x * this.spacing, coord.y * this.spacing, coord.z * this.spacing);

    const core = new THREE.Mesh(this.coreGeometry, this.plasticMaterial);
    core.name = "core";
    core.castShadow = true;
    core.receiveShadow = true;
    group.add(core);

    FACE_STICKERS.forEach((sticker) => {
      if (coord[sticker.axis] !== sticker.sign) {
        return;
      }

      const material = this.getStickerMaterial(sticker.color);
      const stickerMesh = new THREE.Mesh(this.stickerGeometries[sticker.axis], material);
      const inset = this.cubieSize / 2 + 0.02;
      stickerMesh.position[sticker.axis] = sticker.sign * inset;
      stickerMesh.castShadow = true;
      stickerMesh.receiveShadow = true;
      stickerMesh.name = sticker.face;
      group.add(stickerMesh);
    });

    return group;
  }

  private getStickerMaterial(color: string): THREE.MeshStandardMaterial {
    const existing = this.stickerMaterials.get(color);

    if (existing) {
      return existing;
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0,
    });
    this.stickerMaterials.set(color, material);
    return material;
  }

  private bindResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    window.addEventListener("orientationchange", () => this.resize());
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private updateActiveMove(delta: number): void {
    if (!this.currentMove) {
      this.startNextMove();
      return;
    }

    const active = this.currentMove;
    active.elapsed += delta;
    const progress = Math.min(1, active.elapsed / active.duration);
    const eased = easeOutCubic(progress);
    active.pivot.rotation[active.move.axis] = active.totalAngle * eased;

    if (progress >= 1) {
      this.finishActiveMove();
    }
  }

  private startNextMove(): void {
    const next = this.queue.shift();

    if (!next) {
      return;
    }

    const selected = this.cubies.filter((cubie) => cubie.coord[next.move.axis] === next.move.layer);
    const pivot = new THREE.Object3D();
    this.scene.add(pivot);
    selected.forEach((cubie) => pivot.attach(cubie.mesh));

    this.currentMove = {
      ...next,
      pivot,
      selected,
      elapsed: 0,
      duration: this.baseDuration * (next.move.turns === 2 ? 1.28 : 1),
      totalAngle: next.move.dir * next.move.turns * (Math.PI / 2),
    };
    this.onMoveStarted?.(next.move.token, next.source);
    this.onQueueChanged?.(this.queue.length);
  }

  private finishActiveMove(): void {
    if (!this.currentMove) {
      return;
    }

    const active = this.currentMove;
    active.pivot.rotation[active.move.axis] = active.totalAngle;
    active.pivot.updateMatrixWorld(true);
    active.selected.forEach((cubie) => this.scene.attach(cubie.mesh));
    this.scene.remove(active.pivot);
    this.updateCubieCoordinates(active.selected, active.move);
    this.currentMove = null;
    this.onMoveCompleted?.(active.move.token, active.source);
    this.onQueueChanged?.(this.queue.length);
  }

  private applyMoveInstant(move: MoveSpec): void {
    const selected = this.cubies.filter((cubie) => cubie.coord[move.axis] === move.layer);
    const pivot = new THREE.Object3D();
    this.scene.add(pivot);
    selected.forEach((cubie) => pivot.attach(cubie.mesh));
    pivot.rotation[move.axis] = move.dir * move.turns * (Math.PI / 2);
    pivot.updateMatrixWorld(true);
    selected.forEach((cubie) => this.scene.attach(cubie.mesh));
    this.scene.remove(pivot);
    this.updateCubieCoordinates(selected, move);
  }

  private updateCubieCoordinates(selected: Cubie[], move: MoveSpec): void {
    selected.forEach((cubie) => {
      let coord = { ...cubie.coord };

      for (let turn = 0; turn < move.turns; turn += 1) {
        coord = rotateCoord(coord, move.axis, move.dir);
      }

      cubie.coord = coord;
      cubie.mesh.position.set(coord.x * this.spacing, coord.y * this.spacing, coord.z * this.spacing);
      cubie.mesh.updateMatrixWorld(true);
    });
  }

  private getPieceState(cubie: Cubie): PieceState {
    const original = parseCoord(cubie.id);
    const zeroCount = countZeros(original);
    const positionSolved =
      cubie.coord.x === original.x &&
      cubie.coord.y === original.y &&
      cubie.coord.z === original.z;
    const orientationSolved = Math.abs(cubie.mesh.quaternion.dot(IDENTITY_QUATERNION)) > 0.999;

    return {
      cubie,
      original,
      isEdge: zeroCount === 1,
      isCorner: zeroCount === 0,
      solved: positionSolved && orientationSolved,
    };
  }

  private isStickerOnFace(cubie: Cubie, face: Face): boolean {
    const sticker = cubie.mesh.children.find((child) => child.name === face);

    if (!sticker) {
      return false;
    }

    const target = FACE_CONFIG[face];
    const cubieWorld = new THREE.Vector3();
    const stickerWorld = new THREE.Vector3();
    cubie.mesh.getWorldPosition(cubieWorld);
    sticker.getWorldPosition(stickerWorld);
    const direction = stickerWorld.sub(cubieWorld).normalize();
    const axisValue = direction[target.axis];

    return Math.sign(axisValue) === target.normalSign && Math.abs(axisValue) > 0.78;
  }

  private updateProgressHighlights(pieces: PieceState[]): void {
    pieces.forEach((piece) => {
      const core = piece.cubie.mesh.children.find((child) => child.name === "core") as
        | THREE.Mesh
        | undefined;

      if (!core) {
        return;
      }

      core.material = piece.solved ? this.solvedCoreMaterial : this.plasticMaterial;
    });
  }
}

const IDENTITY_QUATERNION = new THREE.Quaternion();

function rotateCoord(coord: Coord, axis: Axis, dir: -1 | 1): Coord {
  if (axis === "x") {
    return dir === 1
      ? { x: coord.x, y: -coord.z, z: coord.y }
      : { x: coord.x, y: coord.z, z: -coord.y };
  }

  if (axis === "y") {
    return dir === 1
      ? { x: coord.z, y: coord.y, z: -coord.x }
      : { x: -coord.z, y: coord.y, z: coord.x };
  }

  return dir === 1
    ? { x: -coord.y, y: coord.x, z: coord.z }
    : { x: coord.y, y: -coord.x, z: coord.z };
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function parseCoord(id: string): Coord {
  const [x, y, z] = id.split(":").map(Number);
  return { x, y, z };
}

function countZeros(coord: Coord): number {
  return Number(coord.x === 0) + Number(coord.y === 0) + Number(coord.z === 0);
}

function faceletIndex(face: Face, coord: Coord): number {
  let row = 0;
  let col = 0;

  switch (face) {
    case "F":
      row = 1 - coord.y;
      col = coord.x + 1;
      break;
    case "B":
      row = 1 - coord.y;
      col = 1 - coord.x;
      break;
    case "U":
      row = coord.z + 1;
      col = coord.x + 1;
      break;
    case "D":
      row = 1 - coord.z;
      col = coord.x + 1;
      break;
    case "R":
      row = 1 - coord.y;
      col = 1 - coord.z;
      break;
    case "L":
      row = 1 - coord.y;
      col = coord.z + 1;
      break;
  }

  return row * 3 + col;
}

function makeStage(
  id: BeginnerStageProgress["id"],
  title: string,
  pieces: PieceState[],
  isComplete: (piece: PieceState) => boolean,
  hint: string,
): BeginnerStageProgress {
  const solved = pieces.filter(isComplete).length;

  return {
    id,
    title,
    done: solved === pieces.length,
    solved,
    total: pieces.length,
    hint,
  };
}
