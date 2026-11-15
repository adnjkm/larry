// A hand-made insulated bottle for the bottle's mechanism lesson, after the photo in fixtures/photos/bottle.jpg: a
// tall black powder-coated wall, a band of bare steel at the neck, and a black screw cap with broad grip panels, a
// small spout cap on top and a carry loop hanging beside it. It is drawn in the real bottle's proportions (about three
// and a half times as tall as it is wide), so a lesson screen frames the cap end. The lesson's ids (body, thread, seal,
// cap) are the roots of its assemblies; every detail part is fixed to one of them, so it moves, shows and lights up
// with it. All sizes in mm, y up from the table, round parts on the y axis.
//
// FLASK_KIT is the lesson's bottle, its cap see-through so the thread and the seal under it can be watched. FLASK_SHELL
// is the same bottle as it looks in the hand, for the result screen, the preview and the end.
import { type Kit, parseKit, type Shape } from "../../../shared/kit.ts";
import { bar, coil, lathe, type Look, part, type Pt, ring, v3 } from "../primitives/parts.ts";

const COAT = { color: "#1d1e21", finish: "matte" } as const;
const STEEL = { color: "#b4b7bc", finish: "metal" } as const;
const SILICONE = { color: "#e4e5e8", finish: "rubber" } as const;
const PLASTIC = { color: "#232427", finish: "matte" } as const;
const WINDOW = { color: "#c6c8cc", finish: "clear" } as const;

const BODY_R = 36.5;
const NECK_R = 31.6;
const BORE_R = 26.4;
/** Where the coat ends and the bare steel neck begins. */
const NECK_FROM = 208;
/** The rolled lip at the mouth: a half round over the neck's wall. */
const LIP_R = (NECK_R - BORE_R) / 2;
const LIP_Y = 232;
const RIM = LIP_Y + LIP_R;
/** The seal is a soft round cord; this is how thick. */
const SEAL_T = 3.6;
/** The cap's skirt hangs this far down the neck, leaving a band of steel showing under it. */
const SKIRT = 214;
/** The cord beds a little way onto the lip, and the cap comes down on top of it. */
const SEAL_Y = RIM - 0.3 + SEAL_T / 2;
const UNDERSIDE = SEAL_Y + SEAL_T / 2 - 0.2;
const CAP_TOP = 249;
const TOP = 265.5;
const THREAD = { r: NECK_R + 1.2, tube: 1.5, from: 215.5, to: 228.5, turns: 2.25 };

/** Every height and radius the lesson needs, so it never repeats a dimension. */
export const FLASK = {
  bodyR: BODY_R,
  neckR: NECK_R,
  neckFrom: NECK_FROM,
  rim: RIM,
  skirt: SKIRT,
  /** The cap's inner and outer wall. */
  capIn: NECK_R + 3,
  capR: 35.3,
  capTop: CAP_TOP,
  top: TOP,
  threadR: THREAD.r,
  threadY: (THREAD.from + THREAD.to) / 2,
  /** How far the ridge climbs in one turn. */
  threadPitch: (THREAD.to - THREAD.from - 2 * THREAD.tube) / THREAD.turns,
  sealR: (BORE_R + NECK_R) / 2,
  sealY: SEAL_Y,
  /** How far the cap drops when there is no seal for it to land on: down to the bare lip. */
  seatDrop: UNDERSIDE - RIM,
  /** How far the carry loop reaches from the axis. */
  loopReach: 68,
} as const;

const at = (y: number) => v3(0, y);
const on = (parentId: string, joint: "molded" | "weld" | "glue") => ({ parentId, joint });
type Attach = Parameters<typeof part>[6];
/** A turned part placed so its profile keeps its own heights. */
const turned = (id: string, name: string, role: string, points: Pt[], look: Look, attach: Attach = null) => {
  const l = lathe(points);
  return part(id, name, role, l.shape, at(l.midY), look, attach);
};
/** Points round an arc of radius `r` centred at (`r0`, `y0`) in a profile, from angle `from` to `to` in degrees. */
const arc = (r0: number, y0: number, r: number, from: number, to: number, steps = 5): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [r0 + r * Math.cos(a), y0 + r * Math.sin(a)];
  });

/**
 * A ring of flat-topped grip panels round a cap, as one outline with a hairline slit so it can have a hole. `share` is
 * how much of each panel's pitch its flat top takes.
 */
function panels(count: number, inner: number, root: number, crest: number, share: number, depth: number): Shape {
  const slit = 0.05;
  const point = (r: number, deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const pitch = 360 / count;
  const ramp = 0.06 * pitch;
  const outer = Array.from({ length: count }, (_, k) => {
    const a = k * pitch;
    return [point(root, k === 0 ? slit : a), point(crest, a + ramp), point(crest, a + ramp + share * pitch), point(root, a + 2 * ramp + share * pitch)];
  }).flat();
  const steps = 14;
  const back = Array.from({ length: steps + 1 }, (_, k) => point(inner, 360 - slit - (k * (360 - 2 * slit)) / steps));
  return { kind: "extrusion", outline: [...outer, point(root, 360 - slit), ...back], depth };
}

/** The carry loop as seen from the front: a rounded rectangle with a rounded hole, slit at the top where the strap hides it. */
function loopOutline(w: number, h: number, bar: number, round: number): Pt[] {
  const slit = 0.06;
  const corner = (cx: number, cy: number, r: number, from: number): Pt[] => arc(cx, cy, r, from, from + 90, 4);
  const rect = (hw: number, hh: number, r: number): Pt[] => [
    // Counter-clockwise from the middle of the top edge.
    [-slit, hh],
    ...corner(-hw + r, hh - r, r, 90),
    ...corner(-hw + r, -hh + r, r, 180),
    ...corner(hw - r, -hh + r, r, 270),
    ...corner(hw - r, hh - r, r, 0),
    [slit, hh],
  ];
  const outer = rect(w / 2, h / 2, round);
  const inner = rect(w / 2 - bar, h / 2 - bar, Math.max(1, round - bar)).reverse();
  return [...outer, ...inner];
}

const LOOP = { w: 30, h: 42, bar: 5.4, round: 11, x: -(BODY_R + 2 + 15), y: 226, depth: 5 };
const strap = bar([-16.5, CAP_TOP + 0.6], [LOOP.x + 4, LOOP.y + LOOP.h / 2 - 1.5], 3.4, 9);

const about = {
  name: "Insulated Water Bottle",
  summary: "A double-walled steel bottle keeps a drink cold, and its cap screws down onto a soft ring so nothing leaks.",
};

const parts = [
  // Body: the coated wall, closed at the bottom, rounding in at the shoulder to the steel neck.
  turned(
    "body",
    "bottle body",
    "Holds the drink inside its insulated double steel walls.",
    [[0, 0], [33.2, 0], [35.4, 1], [BODY_R, 3.4], [BODY_R, 196], ...arc(BODY_R - 4.4, 196, 4.4, 0, 60, 4).slice(1), [NECK_R + 1.2, 206.4], [NECK_R, NECK_FROM]],
    COAT,
  ),
  turned(
    "neck",
    "steel neck",
    "The bare steel the cap screws onto, rolled over at the mouth into the inner wall.",
    [[0, 188], [21, 188], [BORE_R, 196], [BORE_R, LIP_Y], ...arc(BORE_R + LIP_R, LIP_Y, LIP_R, 180, 0, 6).slice(1), [NECK_R, NECK_FROM - 2]],
    STEEL,
    on("body", "weld"),
  ),

  // Thread: the spiral ridge round the neck, a piece of its own so the lesson can hand it over.
  part(
    "thread",
    "neck thread",
    "The spiral ridge the cap rides down as it turns.",
    coil(THREAD.r, THREAD.tube, THREAD.to - THREAD.from, THREAD.turns),
    at(FLASK.threadY),
    STEEL,
    {
      parentId: "body",
      joint: "thread",
    },
  ),

  // Seal: a soft ring on the mouth's rolled lip, which the cap comes down on.
  part("seal", "seal ring", "A soft ring the cap squeezes against the mouth so nothing leaks.", ring(FLASK.sealR, SEAL_T / 2), at(SEAL_Y), SILICONE, {
    parentId: "body",
    joint: "press-fit",
  }),

  // Cap: a hollow shell whose skirt goes round the neck, domed in at the top to a short spout under its own small cap.
  turned(
    "cap",
    "screw cap",
    "Twists onto the neck to close the bottle.",
    [
      [0, UNDERSIDE],
      [FLASK.capIn, UNDERSIDE],
      [FLASK.capIn, SKIRT],
      ...arc(FLASK.capR - 0.9, SKIRT + 0.9, 0.9, -90, 0, 3),
      [FLASK.capR, 237.5],
      [34.2, 241],
      [30.5, 244.2],
      [23, 246.8],
      [17.4, 247.8],
      [17.4, CAP_TOP],
      [0, CAP_TOP],
    ],
    WINDOW,
    { parentId: "body", joint: "thread" },
  ),
  part(
    "cap-grip",
    "grip panels",
    "Broad panels your fingers catch on to twist the cap.",
    panels(10, FLASK.capR - 0.5, FLASK.capR + 0.1, FLASK.capR + 1.1, 0.62, 18),
    at(227),
    WINDOW,
    on("cap", "molded"),
    v3(90, 0, 0),
  ),
  turned(
    "spout-cap",
    "spout cap",
    "A small cap over the spout you drink from.",
    [
      [0, CAP_TOP],
      [16, CAP_TOP],
      [16.6, CAP_TOP + 1],
      [16.6, 262],
      [15.6, 264.4],
      [12.5, TOP],
      [0, TOP],
    ],
    PLASTIC,
    on("cap", "molded"),
  ),
  part(
    "spout-grip",
    "spout grip",
    "Ridges to twist the small cap by.",
    panels(14, 16.2, 16.7, 17.5, 0.5, 9),
    at(256.5),
    PLASTIC,
    on("spout-cap", "molded"),
    v3(90, 0, 0),
  ),
  part("loop-collar", "loop collar", "The ring that holds the carry loop to the cap.", ring(18.2, 1.7), at(CAP_TOP + 0.6), PLASTIC, on("cap", "molded")),
  part("loop-strap", "loop strap", "Joins the carry loop to its collar.", strap.shape, strap.position, PLASTIC, on("cap", "molded"), strap.rotation),
  part(
    "carry-loop",
    "carry loop",
    "A loop to carry the bottle by, hanging beside the cap.",
    { kind: "extrusion", outline: loopOutline(LOOP.w, LOOP.h, LOOP.bar, LOOP.round).map(([x, y]) => ({ x, y })), depth: LOOP.depth },
    v3(LOOP.x, LOOP.y, 0),
    PLASTIC,
    on("cap", "molded"),
  ),
];

/** How the see-through parts look from outside. */
const SOLID: Readonly<Record<string, Look>> = { cap: PLASTIC, "cap-grip": PLASTIC };

export const FLASK_KIT: Kit = parseKit({ ...about, parts });
export const FLASK_SHELL: Kit = parseKit({ ...about, parts: parts.map((p) => ({ ...p, ...SOLID[p.id] })) });
