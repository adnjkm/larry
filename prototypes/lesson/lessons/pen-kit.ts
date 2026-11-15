// A hand-made click pen for the pen lesson, after the photo in fixtures/photos/pen.jpg: a silver barrel with rows of
// dimples where the fingers go, a red panel under a pressed-steel clip, and a plain round button. It is drawn retracted
// and standing on its nose cone, in a real pen's proportions (about twelve times as long as it is wide). It is too tall
// to read whole on a phone, so each screen frames the end it is about. The lesson's ids (barrel, nose, refill, ball,
// spring, cam, plunger) are the roots of its assemblies; every detail part is fixed to one of them, so it moves, shows
// and lights up with it. All sizes in mm, y up from the table, round parts on the y axis.
//
// PEN_KIT is the lesson's pen, its barrel and nose see-through so the works inside can be watched. PEN_SHELL is the
// same pen as it looks in the hand, for the result screen.
import { type Kit, type Part, parseKit, type Shape } from "../../../shared/kit.ts";
import { coil, lathe, type Look, part, type Pt, v3 } from "../primitives/parts.ts";

const COAT = { color: "#c6c8cc", finish: "clear" } as const;
const STEEL = { color: "#a9adb3", finish: "metal" } as const;
const NOSE = { color: "#aeb1b6", finish: "clear" } as const;
const CHROME = { color: "#d6d8dc", finish: "metal" } as const;
const PANEL = { color: "#b0212b", finish: "glossy" } as const;
const DIMPLE = { color: "#8b8e94", finish: "matte" } as const;
const BRASS = { color: "#c9a24b", finish: "metal" } as const;
const BALL = { color: "#e2e4e8", finish: "metal" } as const;
const TUBE = { color: "#d4d6da", finish: "matte" } as const;
const CAMLOOK = { color: "#2a2c31", finish: "matte" } as const;

/** Every height the lesson needs, so it never repeats a dimension. */
const BALL_R = 4.4;
const BALL_BOTTOM = 2;
const BALL_Y = BALL_BOTTOM + BALL_R;
const BARREL_TOP = 400;
export const PEN = {
  /** How far the tip comes out of the nose, and how far the button goes down. */
  TRAVEL: 12,
  ballR: BALL_R,
  ballY: BALL_Y,
  /** The lowest point of the ball and of the bare tip, retracted. */
  ballBottom: BALL_BOTTOM,
  tipBottom: 5.2,
  noseCone: 48,
  noseTop: 56,
  barrelBottom: 48,
  barrelTop: BARREL_TOP,
  barrelR: 17,
  barrelIn: 15,
  ledge: 21,
  /** The spring at full length, from the nose's ledge to the refill's collar; the pose shortens it as the tip comes out. */
  springBottom: 21,
  springTop: 56,
  springR: 8.8,
  springTube: 1.3,
  springTurns: 5,
  collarBottom: 56,
  collarTop: 59,
  refillR: 6,
  refillBottom: 42,
  refillTop: BARREL_TOP - 12,
  camBottom: BARREL_TOP - 12,
  camTop: BARREL_TOP - 2,
  camR: 9.2,
  stemBottom: BARREL_TOP - 2,
  buttonBottom: BARREL_TOP + 0.6,
  top: BARREL_TOP + 22,
  buttonR: 8,
  /** The clip's lower end, where its bump touches the barrel. */
  clipBottom: BARREL_TOP - 118,
  clipTop: BARREL_TOP - 3,
  clipR: 20,
  /** Where the clip faces, in degrees round the axis from +x toward the camera. */
  clipAngle: 50,
  /** The works' own sizes, named so a pen of other dimensions can be fitted with the same works. */
  tipR: 3.9,
  /** The brass tip's taper between its bottom and the refill. */
  tipMid: [
    { r: 4.4, y: 16 },
    { r: 5.1, y: 26 },
    { r: 5.9, y: 35 },
  ],
  collarR: 11.2,
  camIn: 3,
  lug: 3,
  lugR: 8.4,
  stemR: 5,
} as const;

/** The same dimensions for any pen: the hand-made one is PEN, a scanned one is measured (prototypes/lesson/gen). */
export type PenDims = { readonly [K in keyof typeof PEN]: (typeof PEN)[K] extends number ? number : readonly { r: number; y: number }[] };

/** The spring when the refill is `out` mm below its retracted place: the same coil, shorter by that much. */
export const springOf =
  (P: PenDims) =>
  (out: number): Shape =>
    coil(P.springR, P.springTube, P.springTop - P.springBottom - out, P.springTurns);
export const springAt = springOf(PEN);

const at = (y: number) => v3(0, y);
/** A lathe placed so its profile keeps its own heights. */
const turned = (points: Pt[]) => {
  const l = lathe(points);
  return { shape: l.shape, position: at(l.midY) };
};
const on = (parentId: string, joint: "molded" | "weld" | "glue") => ({ parentId, joint });

type Attach = Parameters<typeof part>[6];
const turnedPart = (id: string, name: string, role: string, points: Pt[], look: Look, attach: Attach = null) => {
  const { shape, position } = turned(points);
  return part(id, name, role, shape, position, look, attach);
};

/** A closed ring profile, r from `inner` to `outer`, y from `bottom` to `top`. */
const band = (inner: number, outer: number, bottom: number, top: number): Pt[] => [
  [inner, bottom],
  [outer, bottom],
  [outer, top],
  [inner, top],
  [inner, bottom],
];

/** A direction round the pen's axis, in degrees from +x toward the camera, as a unit vector and as the turn that faces a part's +x that way. */
const round = (degrees: number) => {
  const a = (degrees * Math.PI) / 180;
  return { x: Math.cos(a), z: Math.sin(a), turn: -degrees };
};

/** Where the fingers go: rows of shallow round dimples pressed into the barrel, each row half a step round from the last. */
const DIMPLES = { rows: [112, 126, 140, 154], around: 8, r: 2.3, proud: 0.45 } as const;
const dimple = lathe([
  [0, 0],
  [DIMPLES.r, 0],
  [DIMPLES.r - 0.5, DIMPLES.proud * 0.8],
  [0, DIMPLES.proud],
]).shape;
const dimplesOf = (P: PenDims) =>
  DIMPLES.rows.flatMap((y, row) =>
  Array.from({ length: DIMPLES.around }, (_, k) => {
    const way = round((360 / DIMPLES.around) * (k + (row % 2) / 2));
    const r = P.barrelR + DIMPLES.proud / 2 - 0.1;
    // The disc's flat axis is y; z = -90 lays it along +x, and the turn about y then faces it out from the barrel.
    return part(
      `dimple-${row + 1}-${k + 1}`,
      "grip dimple",
      "A shallow dimple that gives the fingers something to hold.",
      dimple,
      v3(r * way.x, y, r * way.z),
      DIMPLE,
      on("barrel", "molded"),
      v3(0, way.turn, -90),
    );
  }),
);

/** A sphere as a lathe, `steps` rings from pole to pole. */
function sphere(r: number, y: number, steps = 8): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    return [Math.max(0, r * Math.cos(a)), y + r * Math.sin(a)] as Pt;
  });
}

/**
 * The clip seen from the side: a strip of pressed steel fixed to the top of the barrel. It bows away from the barrel,
 * comes back in to touch it near its lower end, and flares out again so a pocket's edge can slide under.
 */
function clipShape(P: PenDims): { shape: Shape; centre: Pt } {
  const [top, bottom] = [P.clipTop, P.clipBottom];
  const R = P.barrelR;
  const half = 0.65;
  // The strip's middle line, top to bottom.
  const line: Pt[] = [
    [R + 3.6, top - 1],
    [R + 4.7, top - 40],
    [R + 4.1, bottom + 34],
    [R + 2.7, bottom + 12],
    [R + half + 0.1, bottom + 2],
    [R + 1.9, bottom - 4],
  ];
  const outline: Pt[] = [
    [R - 0.8, top],
    [R + 3.6 + half, top],
    ...line.slice(1).map(([x, y]): Pt => [x + half, y]),
    ...line
      .slice(1)
      .reverse()
      .map(([x, y]): Pt => [x - half, y]),
    [R + 3.6 - half, top - 5],
    [R - 0.8, top - 5],
  ];
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth: 7 },
    centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2],
  };
}

const LUG_AT = [0, 1, 2, 3] as const;

/** The pen's case as the hand-made pen has it: barrel, nose and their details. */
function caseParts(P: PenDims): Part[] {
  const clip = clipShape(P);
  const clipWay = round(P.clipAngle);
  /** The red panel: a strip let into the barrel beside the clip, its middle standing just proud of the round. */
  const PANEL_BOX = { bottom: 245, top: 359, width: 11, thick: 1.2, angle: P.clipAngle + 78 } as const;
  const panelWay = round(PANEL_BOX.angle);
  const panelR = P.barrelR - 0.2;
  return [
  // Barrel: a hollow silver tube open at both ends, with dimples for the fingers, a red panel, a clip and a cap at the top.
  turnedPart(
    "barrel",
    "barrel",
    "The tube you hold; everything else is built into or onto it.",
    band(P.barrelIn, P.barrelR, P.barrelBottom, P.barrelTop),
    COAT,
  ),
  ...dimplesOf(P),
  part(
    "panel",
    "red panel",
    "A coloured strip set into the barrel.",
    { kind: "box", width: PANEL_BOX.thick, height: PANEL_BOX.top - PANEL_BOX.bottom, depth: PANEL_BOX.width, cornerRadius: 0.5 },
    v3(panelR * panelWay.x, (PANEL_BOX.bottom + PANEL_BOX.top) / 2, panelR * panelWay.z),
    PANEL,
    on("barrel", "glue"),
    v3(0, panelWay.turn, 0),
  ),
  // Two fine rings turned into the barrel just above the nose, where the two screw together.
  ...[50, 53.6].map((y, i) =>
    turnedPart(
      `seam-${i + 1}`,
      "seam ring",
      "A fine ring that marks where the nose screws on.",
      band(P.barrelR - 0.2, P.barrelR + 0.35, y, y + 1.2),
      CHROME,
      on("barrel", "molded"),
    ),
  ),
  part(
    "clip",
    "pocket clip",
    "Holds the pen to a pocket.",
    clip.shape,
    v3(clip.centre[0] * clipWay.x, clip.centre[1], clip.centre[0] * clipWay.z),
    CHROME,
    on("barrel", "weld"),
    v3(0, clipWay.turn, 0),
  ),
  // The cap narrows the barrel's opening so only the button stands above it. Its top edge is turned to a bevel.
  turnedPart(
    "barrel-band",
    "top cap",
    "A steel cap that finishes the barrel's top and holds the button in.",
    [
      [P.buttonR + 0.8, P.barrelTop - 8],
      [P.barrelR + 0.5, P.barrelTop - 8],
      [P.barrelR + 0.5, P.barrelTop - 2.2],
      [P.barrelR - 1.8, P.barrelTop],
      [P.buttonR + 0.8, P.barrelTop],
      [P.buttonR + 0.8, P.barrelTop - 8],
    ],
    CHROME,
    on("barrel", "weld"),
  ),

  // Nose: a hollow cone that screws onto the barrel. A narrow bore guides the tip, then a wider pocket holds the spring.
  turnedPart(
    "nose",
    "nose cone",
    "Guides the tip out of the pen and holds the spring in its pocket.",
    [
      [5, 0],
      [6.4, 0],
      [7.8, 5],
      [10.2, 14],
      [12.6, 24],
      [15, 36],
      [P.barrelR, P.noseCone],
      [P.barrelIn - 0.2, P.noseCone],
      [P.barrelIn - 0.2, P.noseTop],
      [11.6, P.noseTop],
      [11.6, P.ledge],
      [7, P.ledge],
      [5.6, 10],
      [5, 0],
    ],
    NOSE,
    { parentId: "barrel", joint: "thread" },
  ),
  part("nose-thread", "nose thread", "The spiral ridge that screws the nose into the barrel.", coil(14.2, 0.55, 4, 2), at(52), NOSE, on("nose", "molded")),
  ];
}

/**
 * The hidden works, sized by `P` and standing where `P` says: refill, tip, collar, ball, spring, cam and lugs. The
 * refill hangs off `caseId`.
 */
export function penWorks(P: PenDims, caseId = "barrel"): Part[] {
  const lugAt = (k: number) => {
    const a = (Math.PI / 4) * (1 + 2 * k);
    return v3(P.lugR * Math.cos(a), (P.camBottom + P.camTop) / 2, -P.lugR * Math.sin(a));
  };
  return [
  // Refill: the ink tube, with a brass tip that ends in a socket, and a collar the spring pushes up against.
  turnedPart(
    "refill",
    "ink refill",
    "The tube of ink that slides up and down inside the barrel.",
    [
      [0, P.refillBottom],
      [P.refillR, P.refillBottom],
      [P.refillR, P.refillTop],
      [0, P.refillTop],
    ],
    TUBE,
    { parentId: caseId, joint: "slide" },
  ),
  turnedPart(
    "tip",
    "brass tip",
    "Narrows the refill to a socket that holds the ball.",
    [
      [0, P.tipBottom],
      [P.tipR, P.tipBottom],
      ...P.tipMid.map(({ r, y }): Pt => [r, y]),
      [P.refillR, P.refillBottom],
      [0, P.refillBottom],
    ],
    BRASS,
    on("refill", "weld"),
  ),
  turnedPart(
    "refill-collar",
    "refill collar",
    "A ring the spring pushes up against.",
    band(P.refillR - 0.5, P.collarR, P.collarBottom, P.collarTop),
    STEEL,
    on("refill", "weld"),
  ),
  turnedPart("ball", "ball", "A tiny ball in the tip's socket that rolls ink onto the page.", sphere(P.ballR, P.ballY), BALL, {
    parentId: "tip",
    joint: "press-fit",
  }),

  // Spring: a coil round the refill's lower end, between the nose pocket's ledge and the collar.
  part("spring", "spring", "Pushes the refill back up so the tip tucks inside.", springOf(P)(0), at((P.springBottom + P.springTop) / 2), STEEL, {
    parentId: "refill",
    joint: "spring",
  }),

  // Cam: a ring on top of the refill with four lugs on its rim.
  turnedPart("cam", "cam ring", "Turns a notch with each click to hold the tip out or let it back.", band(P.camIn, P.camR, P.camBottom, P.camTop), CAMLOOK, {
    parentId: "refill",
    joint: "hinge",
  }),
  ...LUG_AT.map((k) =>
    part(
      `cam-lug-${k + 1}`,
      "cam lug",
      "A small tooth on the cam's rim.",
      { kind: "box", width: P.lug, height: P.lug, depth: P.lug, cornerRadius: 0.4 },
      lugAt(k),
      CAMLOOK,
      on("cam", "molded"),
    ),
  ),

  ];
}

/** The hand-made pen's button. */
function buttonPart(P: PenDims): Part {
  // Plunger: the button, a plain round post with a bevelled top. Its stem hides in the barrel, so pressing sinks it into the cap.
  return turnedPart(
    "plunger",
    "button",
    "The button you press with your thumb.",
    [
      [0, P.stemBottom],
      [P.stemR, P.stemBottom],
      [P.stemR, P.buttonBottom],
      [P.buttonR, P.buttonBottom],
      [P.buttonR, P.top - 1.8],
      [P.buttonR - 1.6, P.top],
      [0, P.top],
    ],
    CHROME,
    { parentId: "barrel", joint: "slide" },
  );
}

/** Every part of the hand-made pen at dimensions `P`, in the order the lesson draws them. */
export const penParts = (P: PenDims): Part[] => [...caseParts(P), ...penWorks(P), buttonPart(P)];
const parts = penParts(PEN);

const about = { name: "Click Pen", summary: "A ball at the tip rolls ink onto the page; a spring tucks the tip away and a cam holds it out each click." };

/** The lesson's pen: the barrel and the nose are see-through, so what moves inside can be watched. */
export const PEN_KIT: Kit = parseKit({ ...about, parts });

/** The same pen as it looks in the hand, for the result screen: nothing see-through. */
const SOLID: Readonly<Record<string, Look>> = { barrel: { color: "#dcdee1", finish: "glossy" }, nose: { color: "#c2c5c9", finish: "glossy" } };
export const PEN_SHELL: Kit = parseKit({ ...about, parts: parts.map((p) => ({ ...p, ...SOLID[p.id] })) });
