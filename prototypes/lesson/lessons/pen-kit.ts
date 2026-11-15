// A hand-made click pen for the pen lesson, drawn retracted and standing on its nose cone, chunky enough that
// each part reads on a phone. The lesson's ids (barrel, nose, refill, ball, spring, cam, plunger) are the roots of
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
const PLASTIC = { color: "#34363a", finish: "matte" } as const;
const CAMLOOK = { color: "#5c5f66", finish: "matte" } as const;
const RUBBER = { color: "#1c1c1e", finish: "rubber" } as const;

/** Every height the lesson needs, so it never repeats a dimension. */
const BALL_R = 4.6;
const BALL_BOTTOM = 3;
const BALL_Y = BALL_BOTTOM + BALL_R;
export const PEN = {
  /** How far the tip comes out of the nose, and how far the button goes down. */
  TRAVEL: 4,
  ballR: BALL_R,
  ballY: BALL_Y,
  /** The lowest point of the ball and of the bare tip, retracted. */
  ballBottom: BALL_Y - BALL_R,
  tipBottom: 6.4,
  noseCone: 22,
  noseTop: 23.5,
  barrelBottom: 22,
  barrelTop: 130,
  barrelR: 18,
  barrelIn: 15.8,
  ledge: 11,
  springBottom: 11,
  springTop: 21,
  springR: 9,
  collarBottom: 21,
  collarTop: 24,
  refillR: 7,
  refillBottom: 23,
  refillTop: 131,
  camBottom: 131,
  camTop: 136,
  camR: 10.4,
  stemBottom: 136,
  buttonBottom: 141,
  top: 165,
  /** The clip's lower end, where its bump touches the barrel. */
  clipBottom: 86.4,
  clipTop: 130,
  clipR: 20.5,
  /** Where the clip faces, in degrees round the axis from +x toward the camera. */
  clipAngle: 50,
} as const;

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
  const [bottom, top, ridges] = [28, 64, 5];
  const pitch = (top - bottom) / ridges;
  const crest: Pt[] = Array.from({ length: ridges }, (_, k): Pt[] => {
    const y = bottom + k * pitch;
    return [
      [19, y + 0.4],
      [19.9, y + 1.1],
      [19.9, y + pitch - 1.5],
      [19, y + pitch - 0.8],
    ];
  }).flat();
  return [[17.9, bottom], [19, bottom], ...crest, [19, top], [17.9, top], [17.9, bottom]];
}

/** A sphere as a lathe, `steps` rings from pole to pole. */
function sphere(r: number, y: number, steps = 8): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    return [Math.max(0, r * Math.cos(a)), y + r * Math.sin(a)] as Pt;
  });
}

/** The clip seen from the side: a strap down the barrel with a bump at its end that touches it. */
function clipShape(): { shape: Shape; centre: Pt } {
  const outline: Pt[] = [
    [18.4, PEN.clipTop],
    [22.6, PEN.clipTop],
    [22.6, PEN.clipBottom + 1],
    [21.6, PEN.clipBottom - 1],
    [19.2, PEN.clipBottom],
    [20.4, PEN.clipBottom + 2.2],
    [20.4, PEN.clipTop - 12],
    [18.4, PEN.clipTop - 12],
  ];
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth: 6 },
    centre: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2],
  };
}

const clip = clipShape();
const clipRad = (PEN.clipAngle * Math.PI) / 180;

const LUG = 2.6;
const lugAt = (k: number) => {
  const a = (Math.PI / 4) * (1 + 2 * k);
  return v3(11.2 * Math.cos(a), (PEN.camBottom + PEN.camTop) / 2, -11.2 * Math.sin(a));
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
    STEEL,
    on("barrel", "weld"),
    v3(0, -PEN.clipAngle, 0),
  ),
  turnedPart(
    "barrel-band",
    "top band",
    "A steel ring that finishes the barrel's top.",
    band(17.9, 19.2, PEN.barrelTop - 5, PEN.barrelTop),
    STEEL,
    on("barrel", "weld"),
  ),

  // Nose: a hollow cone that screws onto the barrel. A narrow bore guides the tip, then a wider pocket holds the spring.
  turnedPart(
    "nose",
    "nose cone",
    "Guides the tip out of the pen and holds the spring in its pocket.",
    [
      [5.1, 0],
      [7.6, 0],
      [8.6, 2.5],
      [11, 6],
      [14, 10],
      [16.4, 15],
      [17.6, 19],
      [PEN.barrelR, PEN.noseCone],
      [15.6, PEN.noseCone],
      [15.6, PEN.noseTop],
      [12.4, PEN.noseTop],
      [12.4, PEN.ledge],
      [7.6, PEN.ledge],
      [6.9, 8],
      [6, 5],
      [5.1, 0],
    ],
    NOSE,
    { parentId: "barrel", joint: "thread" },
  ),
  part("nose-thread", "nose thread", "The spiral ridge that screws the nose into the barrel.", coil(15.2, 0.5, 1.2, 2), at(22.75), NOSE, on("nose", "molded")),

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
      [4.5, 9],
      [5.3, 13],
      [6.3, 18],
      [7, 22],
      [7, PEN.refillBottom],
      [0, PEN.refillBottom],
    ],
    BRASS,
    on("refill", "weld"),
  ),
  turnedPart(
    "refill-collar",
    "refill collar",
    "A ring the spring pushes up against.",
    band(PEN.refillR - 0.5, 11, PEN.collarBottom, PEN.collarTop),
    STEEL,
    on("refill", "weld"),
  ),
  turnedPart("ball", "ball", "A tiny ball in the tip's socket that rolls ink onto the page.", sphere(BALL_R, BALL_Y), BALL, {
    parentId: "tip",
    joint: "press-fit",
  }),

  // Spring: a coil round the refill's lower end, between the nose pocket's ledge and the collar.
  part(
    "spring",
    "spring",
    "Pushes the refill back up so the tip tucks inside.",
    coil(PEN.springR, 1, PEN.springTop - PEN.springBottom, 3.5),
    at((PEN.springBottom + PEN.springTop) / 2),
    STEEL,
    {
      parentId: "refill",
      joint: "spring",
    },
  ),

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

  // Plunger: the button, with a stem inside the barrel top and a domed cap above it.
  turnedPart(
    "plunger",
    "button",
    "The button you press with your thumb.",
    [
      [0, PEN.stemBottom],
      [6, PEN.stemBottom],
      [6, PEN.buttonBottom],
      [11.8, PEN.buttonBottom],
      [12, PEN.buttonBottom + 1.6],
      [12, 157],
      [10.8, 161.5],
      [7.4, 164.3],
      [0, PEN.top],
    ],
    PLASTIC,
    { parentId: "barrel", joint: "slide" },
  ),
];

export const PEN_KIT: Kit = parseKit({
  name: "Click Pen",
  summary: "A ball at the tip rolls ink onto the page; a spring tucks the tip away and a cam holds it out each click.",
  parts,
});
