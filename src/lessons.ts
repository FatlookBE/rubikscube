export type LessonAlgorithm = {
  name: string;
  moves: string;
  purpose: string;
};

export type Lesson = {
  id: string;
  title: string;
  badge: string;
  goal: string;
  principle: string;
  focus: string[];
  checkpoints: string[];
  algorithms: LessonAlgorithm[];
};

export const LESSONS: Lesson[] = [
  {
    id: "notation",
    title: "Notation et réflexes",
    badge: "Base",
    goal: "Lire chaque lettre comme une face à tourner, puis prédire la face touchée avant d'appuyer.",
    principle:
      "Un quart de tour sans apostrophe va dans le sens horaire quand tu regardes la face. L'apostrophe inverse le sens. Le 2 fait un demi-tour.",
    focus: ["R = droite", "U = haut", "F = avant", "' = inverse", "2 = demi-tour"],
    checkpoints: [
      "Tu sais pointer les six faces sans hésiter.",
      "Tu sais refaire R U R' U' sans regarder tes mains.",
      "Tu sais annuler un mouvement avec son inverse.",
    ],
    algorithms: [
      {
        name: "Déclencheur droit",
        moves: "R U R' U'",
        purpose: "Le geste le plus important: il sert aux coins blancs et à la dernière face.",
      },
      {
        name: "Lecture des faces",
        moves: "R U F U' R' F'",
        purpose: "Un petit circuit pour associer lettre, face et direction.",
      },
    ],
  },
  {
    id: "white-cross",
    title: "Croix blanche",
    badge: "Étape 1",
    goal: "Placer les quatre arêtes blanches autour du centre blanc en alignant aussi les couleurs latérales.",
    principle:
      "Commence par chercher les arêtes blanches, place-les au-dessus de leur centre latéral, puis descends-les en face blanche.",
    focus: ["Arêtes blanches", "Centres latéraux", "Alignement couleur", "Tourner sans casser"],
    checkpoints: [
      "Chaque arête blanche touche le centre blanc.",
      "La couleur latérale de chaque arête touche son centre.",
      "La croix reste intacte quand tu cherches la prochaine arête.",
    ],
    algorithms: [
      {
        name: "Descente simple",
        moves: "F2",
        purpose: "Quand une arête blanche est en haut et alignée avec son centre, elle descend en un demi-tour.",
      },
      {
        name: "Sortir une arête coincée",
        moves: "R U R'",
        purpose: "Libère une arête mal placée sans détruire toute la croix.",
      },
    ],
  },
  {
    id: "white-corners",
    title: "Coins blancs",
    badge: "Étape 2",
    goal: "Insérer les quatre coins blancs sous la croix pour finir la première couche.",
    principle:
      "Place le coin au-dessus de sa destination, puis répète le déclencheur droit jusqu'à ce que le blanc descende.",
    focus: ["Coin au-dessus", "Trois couleurs du coin", "Déclencheur droit", "Première couche complète"],
    checkpoints: [
      "Le coin choisi est au-dessus des deux bons centres latéraux.",
      "R U R' U' descend le blanc sans abîmer les coins déjà faits.",
      "Toute la face blanche et la première couronne sont cohérentes.",
    ],
    algorithms: [
      {
        name: "Insérer un coin",
        moves: "R U R' U'",
        purpose: "Répète-le jusqu'à ce que le coin blanc soit orienté correctement.",
      },
      {
        name: "Coin à gauche",
        moves: "L' U' L U",
        purpose: "Même idée de l'autre côté, utile quand le coin se présente à gauche.",
      },
    ],
  },
  {
    id: "second-layer",
    title: "Deuxième couronne",
    badge: "Étape 3",
    goal: "Insérer les quatre arêtes sans jaune dans la couche du milieu.",
    principle:
      "Cherche une arête sans jaune en haut, aligne-la avec son centre, puis envoie-la à droite ou à gauche.",
    focus: ["Arête sans jaune", "Alignement en haut", "Insertion droite", "Insertion gauche"],
    checkpoints: [
      "L'arête du haut n'a pas de jaune.",
      "La face avant de l'arête est alignée avec son centre.",
      "La deuxième couronne est complète sans trou ni inversion.",
    ],
    algorithms: [
      {
        name: "Insertion droite",
        moves: "U R U' R' U' F' U F",
        purpose: "Envoie l'arête du haut vers l'emplacement de droite.",
      },
      {
        name: "Insertion gauche",
        moves: "U' L' U L U F U' F'",
        purpose: "Envoie l'arête du haut vers l'emplacement de gauche.",
      },
    ],
  },
  {
    id: "yellow-cross",
    title: "Croix jaune",
    badge: "Étape 4",
    goal: "Former une croix jaune sur la dernière face, sans se soucier encore des coins.",
    principle:
      "Regarde seulement les arêtes jaunes du haut: point, L, ligne, puis croix. Oriente le cube et applique le même algorithme.",
    focus: ["Point", "Forme en L", "Ligne", "Croix"],
    checkpoints: [
      "Tu ignores les coins jaunes pendant cette étape.",
      "La forme en L est placée en haut-gauche avant l'algorithme.",
      "La ligne est horizontale avant l'algorithme.",
    ],
    algorithms: [
      {
        name: "Former la croix",
        moves: "F R U R' U' F'",
        purpose: "Transforme point -> L -> ligne -> croix selon l'orientation de départ.",
      },
    ],
  },
  {
    id: "yellow-face",
    title: "Face jaune",
    badge: "Étape 5",
    goal: "Orienter les coins jaunes pour obtenir une face jaune complète.",
    principle:
      "Garde un coin jaune bien orienté devant à droite quand c'est possible, puis applique l'algorithme jusqu'à la face pleine.",
    focus: ["Coins jaunes", "Orientation", "Une face complète", "Ne pas paniquer si le reste bouge"],
    checkpoints: [
      "La croix jaune reste visible.",
      "Les coins se retournent mais les pièces ne sont pas encore forcément à leur place.",
      "Toute la face jaune finit complète.",
    ],
    algorithms: [
      {
        name: "Orienter les coins",
        moves: "R U R' U R U2 R'",
        purpose: "Oriente les coins jaunes tout en gardant le cube contrôlable.",
      },
    ],
  },
  {
    id: "yellow-corners",
    title: "Placer les coins jaunes",
    badge: "Étape 6",
    goal: "Mettre les coins jaunes au bon emplacement, même s'ils étaient déjà orientés.",
    principle:
      "Cherche deux coins déjà cohérents sur une même face. Place-les à l'arrière, puis permute les autres.",
    focus: ["Coins à leur place", "Paire arrière", "Permutation", "Derniers ajustements U"],
    checkpoints: [
      "Chaque coin a les trois bonnes couleurs autour de lui.",
      "Deux coins corrects restent à l'arrière avant de lancer l'algorithme.",
      "Les coins sont tous placés avant de s'occuper des arêtes finales.",
    ],
    algorithms: [
      {
        name: "Permutation des coins",
        moves: "U R U' L' U R' U' L",
        purpose: "Échange les coins jusqu'à ce que chacun soit au bon emplacement.",
      },
    ],
  },
  {
    id: "last-edges",
    title: "Dernières arêtes",
    badge: "Final",
    goal: "Permuter les dernières arêtes pour résoudre le cube entier.",
    principle:
      "Repère si trois arêtes doivent tourner dans le sens horaire ou antihoraire. Ajuste U, lance l'algorithme, puis réaligne.",
    focus: ["Cycle d'arêtes", "Sens du cycle", "Ajustement U", "Cube résolu"],
    checkpoints: [
      "Les coins jaunes sont déjà à leur place.",
      "Une seule face latérale peut être déjà complète.",
      "Après le cycle, un simple U peut finir l'alignement.",
    ],
    algorithms: [
      {
        name: "Cycle horaire",
        moves: "R U' R U R U R U' R' U' R2",
        purpose: "Fait tourner trois arêtes de la dernière couche dans un sens.",
      },
      {
        name: "Cycle inverse",
        moves: "R2 U R U R' U' R' U' R' U R'",
        purpose: "Même permutation dans l'autre sens.",
      },
    ],
  },
];
