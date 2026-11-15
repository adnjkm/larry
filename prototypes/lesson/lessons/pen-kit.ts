// A hand-made click pen for the pen lesson, drawn retracted and standing on its nose cone, in a real pen's proportions
// (about twelve times as long as it is wide). It is too tall to read whole on a phone, so each screen frames the end it
// is about. The lesson's ids (barrel, nose, refill, ball, spring, cam, plunger) are the roots of
// its assemblies; every detail part is fixed to one of them, so it moves, shows and lights up with it.
// All sizes in mm, y up from the table, round parts on the y axis.
import { type Kit, parseKit, type Shape } from "../../../shared/kit.ts";
import { coil, lathe, type Look, part, type Pt, v3 } from "../primitives/parts.ts";

const COAT = { color: "#4a4d53", finish: "clear" } as const;
const STEEL = { color: "#a9adb3", finish: "metal" } as const;
const NOSE = { color: "#8d9097", finish: "clear" } as const;
const BRASS = { color: "#c9a24b", finish: "metal" } as const;
const BALL = { color: "#e2e4e8", finish: "metal" } as const;
const TUBE = { color: "#d4d6da", finish: "matte" } as const;
const CAMLOOK = { color: "#2a2c31", finish: "matte" } as const;
const CLIP = { color: "#26282c", finish: "metal" } as const;
const RUBBER = { color: "#1c1c1e", finish: "rubber" } as const;

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
} as const;

/** The spring when the refill is `out` mm below its retracted place: the same coil, shorter by that much. */
export const springAt = (out: number): Shape => coil(PEN.springR, PEN.springTube, PEN.springTop - PEN.springBottom - out, PEN.springTurns);

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

/** The rubber sleeve: a few plain ridges round the lower barrel. */
function gripProfile(): Pt[] {
  const [bottom, top, ridges] = [88, 176, 8];
  const [inner, base, crest] = [PEN.barrelR - 0.1, PEN.barrelR + 1, PEN.barrelR + 1.9];
  const pitch = (top - bottom) / ridges;
  const ridge: Pt[] = Array.from({ length: ridges }, (_, k): Pt[] => {
    const y = bottom + k * pitch;
    return [
      [base, y + 0.4],
      [crest, y + 1.1],
      [crest, y + pitch - 1.5],
      [base, y + pitch - 0.8],
    ];
  }).flat();
  return [[inner, bottom], [base, bottom], ...ridge, [base, top], [inner, top], [inner, bottom]];
}

/** A sphere as a lathe, `steps` rings from pole to pole. */
function sphere(r: number, y: number, steps = 8): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    return [Math.max(0, r * Math.cos(a)), y + r * Math.sin(a)] as Pt;
  });
}

/** The clip seen from the side: a bar standing off the barrel, joined to it at the top, its lower end curled in to a bump that touches the barrel. */
function clipShape(): { shape: Shape; centre: Pt } {
  const [top, bottom] = [PEN.clipTop, PEN.clipBottom];
  const R = PEN.barrelR;
  const outline: Pt[] = [
    [R - 0.8, top],
    [R + 4.6, top],
    [R + 4.6, bottom + 6],
    [R + 3.4, bottom + 1.5],
    [R + 1.4, bottom - 0.8],
    [R + 0.1, bottom + 0.8],
    [R + 1.6, bottom + 3.2],
    [R + 1.8, top - 7],
    [R - 0.8, top - 7],
  ];
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth: 8 },
    centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2],
  };
}

const clip = clipShape();
const clipRad = (PEN.clipAngle * Math.PI) / 180;

const LUG = 3;
const lugAt = (k: number) => {
  const a = (Math.PI / 4) * (1 + 2 * k);
  return v3(8.4 * Math.cos(a), (PEN.camBottom + PEN.camTop) / 2, -8.4 * Math.sin(a));
};

const parts = [
  // Barrel: a hollow dark tube open at both ends, with a rubber grip, a clip and a steel band at the top.
  turnedPart(
    "barrel",
    "barrel",
    "The tube you hold; everything else is built into or onto it.",
    band(PEN.barrelIn, PEN.barrelR, PEN.barrelBottom, PEN.barrelTop),
    COAT,
  ),
  turnedPart("grip", "rubber grip", "A soft sleeve your fingers hold without slipping.", gripProfile(), RUBBER, on("barrel", "glue")),
  part(
    "clip",
    "pocket clip",
    "Holds the pen to a pocket.",
    clip.shape,
    v3(clip.centre[0] * Math.cos(clipRad), clip.centre[1], clip.centre[0] * Math.sin(clipRad)),
    CLIP,
    on("barrel", "weld"),
    v3(0, -PEN.clipAngle, 0),
  ),
  // The top band narrows the barrel's opening so only the button's dome stands above it.
  turnedPart(
    "barrel-band",
    "top band",
    "A steel ring that finishes the barrel's top and holds the button in.",
    band(PEN.buttonR + 0.8, PEN.barrelR + 0.5, PEN.barrelTop - 6, PEN.barrelTop),
    STEEL,
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
      [PEN.barrelR, PEN.noseCone],
      [PEN.barrelIn - 0.2, PEN.noseCone],
      [PEN.barrelIn - 0.2, PEN.noseTop],
      [11.6, PEN.noseTop],
      [11.6, PEN.ledge],
      [7, PEN.ledge],
      [5.6, 10],
      [5, 0],
    ],
    NOSE,
    { parentId: "barrel", joint: "thread" },
  ),
  part("nose-thread", "nose thread", "The spiral ridge that screws the nose into the barrel.", coil(14.2, 0.55, 4, 2), at(52), NOSE, on("nose", "molded")),

  // Refill: the ink tube, with a brass tip that ends in a socket, and a collar the spring pushes up against.
  turnedPart(
    "refill",
    "ink refill",
    "The tube of ink that slides up and down inside the barrel.",
    [
      [0, PEN.refillBottom],
      [PEN.refillR, PEN.refillBottom],
      [PEN.refillR, PEN.refillTop],
      [0, PEN.refillTop],
    ],
    TUBE,
    { parentId: "barrel", joint: "slide" },
  ),
  turnedPart(
    "tip",
    "brass tip",
    "Narrows the refill to a socket that holds the ball.",
    [
      [0, PEN.tipBottom],
      [3.9, PEN.tipBottom],
      [4.4, 16],
      [5.1, 26],
      [5.9, 35],
      [PEN.refillR, PEN.refillBottom],
      [0, PEN.refillBottom],
    ],
    BRASS,
    on("refill", "weld"),
  ),
  turnedPart(
    "refill-collar",
    "refill collar",
    "A ring the spring pushes up against.",
    band(PEN.refillR - 0.5, 11.2, PEN.collarBottom, PEN.collarTop),
    STEEL,
    on("refill", "weld"),
  ),
  turnedPart("ball", "ball", "A tiny ball in the tip's socket that rolls ink onto the page.", sphere(BALL_R, BALL_Y), BALL, {
    parentId: "tip",
    joint: "press-fit",
  }),

  // Spring: a coil round the refill's lower end, between the nose pocket's ledge and the collar.
  part("spring", "spring", "Pushes the refill back up so the tip tucks inside.", springAt(0), at((PEN.springBottom + PEN.springTop) / 2), STEEL, {
    parentId: "refill",
    joint: "spring",
  }),

  // Cam: a ring on top of the refill with four lugs on its rim.
  turnedPart("cam", "cam ring", "Turns a notch with each click to hold the tip out or let it back.", band(3, PEN.camR, PEN.camBottom, PEN.camTop), CAMLOOK, {
    parentId: "refill",
    joint: "hinge",
  }),
  ...[0, 1, 2, 3].map((k) =>
    part(
      `cam-lug-${k + 1}`,
      "cam lug",
      "A small tooth on the cam's rim.",
      { kind: "box", width: LUG, height: LUG, depth: LUG, cornerRadius: 0.4 },
      lugAt(k),
      CAMLOOK,
      on("cam", "molded"),
    ),
  ),

  // Plunger: the button. Its stem hides in the barrel and only the dome shows above the band, so pressing sinks it into the opening.
  turnedPart(
    "plunger",
    "button",
    "The button you press with your thumb.",
    [
      [0, PEN.stemBottom],
      [5, PEN.stemBottom],
      [5, PEN.buttonBottom],
      [PEN.buttonR, PEN.buttonBottom],
      [PEN.buttonR, PEN.top - 5],
      [PEN.buttonR - 0.6, PEN.top - 2.4],
      [PEN.buttonR - 2.4, PEN.top - 0.8],
      [0, PEN.top],
    ],
    STEEL,
    { parentId: "barrel", joint: "slide" },
  ),
];

export const PEN_KIT: Kit = parseKit({
  name: "Click Pen",
  summary: "A ball at the tip rolls ink onto the page; a spring tucks the tip away and a cam holds it out each click.",
  parts,
});
