// A hand-made insulated steel bottle for the bottle lesson, true to a real one but kept to the parts
// that read at a glance: a powder-coated wall with a shoulder on a rubber foot ring, a steel neck with
// a helical thread and a rolled lip; a steel cap with a ribbed grip and a carry loop; a silicone seal
// ring with a pull tab. The lesson's ids (body, cap,
// seal-ring, ring-tab) are the roots of its assemblies, and every detail part is fixed to one of them,
// so it moves, shows and lights up with it. All sizes in mm, y up from the table, round parts on the y axis.
import { type Kit, parseKit, type Shape } from "../../../shared/kit.ts";
import { coil, lathe, part, type Pt, ring, v3 } from "../../../src/primitives/parts.ts";

const COAT = { color: "#4a4d53", finish: "matte" } as const;
const STEEL = { color: "#a9adb3", finish: "metal" } as const;
const PLASTIC = { color: "#34363a", finish: "matte" } as const;
const RUBBER = { color: "#1c1c1e", finish: "rubber" } as const;

/** Where the coat's shoulder turns into the flat ledge the seal sits on, and the neck rises from it. */
const LEDGE = 170;
const NECK_R = 23.6;
/** The cap's bottom rim, seated on the seal's bead. */
const SKIRT = 177.5;
const CAP_TOP = 202.6;
const TOP_DISC = 203.9;
/** The ribbed grip: plain ridges in a ring, with a hairline slit so it can be one outline with a hole. */
const KNURL = { ridges: 24, inner: 28.6, root: 29.6, crest: 30.8, from: 180.5, to: 195.5 };
const LOOP = { radius: 12, tube: 2.3 };

const at = (y: number) => v3(0, y);
/** A lathe placed so its profile keeps its own heights. */
const turned = (points: Pt[]) => {
  const l = lathe(points);
  return { shape: l.shape, position: at(l.midY) };
};
const on = (parentId: string, joint: "molded" | "weld" | "glue") => ({ parentId, joint });

/** The coat's shoulder, a quarter ellipse from the straight wall into the ledge with no crease. */
const shoulder: Pt[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 5) * (Math.PI / 2);
  return [NECK_R + 5.2 + 7.2 * Math.cos(a), 148 + 22 * Math.sin(a)];
});

function knurl(): Shape {
  const { ridges, inner, root, crest } = KNURL;
  const slit = 0.05;
  const point = (r: number, deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) });
  const pitch = 360 / ridges;
  // Flat-topped ridges with V grooves between them; the inside is never seen, so it is a coarse circle.
  const outer = Array.from({ length: ridges }, (_, k) => {
    const a = k * pitch;
    return [point(root, k === 0 ? slit : a), point(crest, a + 0.25 * pitch), point(crest, a + 0.6 * pitch)];
  }).flat();
  const steps = 12;
  const back = Array.from({ length: steps + 1 }, (_, k) => point(inner, 360 - slit - (k * (360 - 2 * slit)) / steps));
  return { kind: "extrusion", outline: [...outer, point(root, 360 - slit), ...back], depth: KNURL.to - KNURL.from };
}

/** The pull tab seen from above: a tongue out from the seal with a round end. */
function tongue(): Shape {
  const end = 33;
  const half = 4;
  const arc = Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    return { x: end + half * Math.cos(a), y: half * Math.sin(a) };
  });
  return { kind: "extrusion", outline: [{ x: 27.9, y: -half }, ...arc, { x: 27.9, y: half }], depth: 2.6 };
}

/** Points round a bead or roll of radius `r` centred at (`r0`, `y0`) in a profile, from angle `from` to `to` in degrees. */
const bead = (r0: number, y0: number, r: number, from: number, to: number, steps = 4): Pt[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [r0 + r * Math.cos(a), y0 + r * Math.sin(a)];
  });

type Attach = Parameters<typeof part>[6];
/** A turned part placed so its profile keeps its own heights. Beads, rolls and seams are drawn into the profile, so one part carries them. */
const turnedPart = (id: string, name: string, role: string, points: Pt[], look: { color: string; finish: "matte" | "metal" | "rubber" }, attach: Attach = null) => {
  const { shape, position } = turned(points);
  return part(id, name, role, shape, position, look, attach);
};

/** The seal's top face; its bead stands on the outer edge, right under the cap's rim. */
const SEAL_TOP = 176.9;
const parts = [
  // Body: the coated wall with its shoulder, closed at the bottom, on a rubber foot ring; the steel neck with its thread and rolled lip.
  turnedPart("body", "bottle body", "Holds the drink inside its insulated double steel walls.", [[0, 2.2], [30.5, 2.2], [33.6, 2.8], [35.2, 4.2], [35.8, 6.5], [36, 9.2], [36, 148], ...shoulder.slice(1), [NECK_R, LEDGE]], COAT),
  turnedPart("foot-pad", "rubber foot", "Stops the bottle sliding and rattling on a table.", [[24, 0], [32.4, 0], [32.4, 2.2], [24, 2.2], [24, 0]], RUBBER, on("body", "glue")),
  turnedPart("neck", "steel neck", "The bare steel the cap screws onto, rolled over at the mouth into the inner wall; the vacuum between the walls keeps the drink hot or cold.", [[0, 150], [17, 150], [21, 156], [21, 188], ...bead(22.4, 189, 1.6, 200, -20), [NECK_R, 188], [NECK_R, LEDGE]], STEEL, on("body", "weld")),
  part("neck-thread", "neck thread", "The spiral ridge the cap's thread rides on.", coil(24.3, 0.9, 10, 1.6), at(182), STEEL, on("neck", "molded")),

  // Seal: a silicone ring on the ledge with a bead the cap presses, and a tab to pull it off.
  turnedPart("seal-ring", "seal ring", "A soft ring at the neck that the cap squeezes so nothing leaks; its bead is what the cap presses flat.", [[25.4, LEDGE], [28.6, LEDGE], [28.6, 171.5], ...bead(28, SEAL_TOP, 0.6, 0, 180, 3), [25.4, SEAL_TOP], [25.4, LEDGE]], RUBBER, { parentId: "body", joint: "press-fit" }),
  part("ring-tab", "ring tab", "A little tab you grab to pull the seal off for cleaning.", tongue(), v3((27.9 + 37) / 2, 173.3, 0), RUBBER, on("seal-ring", "molded"), v3(90, 0, 0)),

  // Cap: a steel shell with a rolled rim and a stepped top, a ribbed grip to twist, and a carry loop.
  turnedPart("cap", "steel cap", "Screws onto the neck to close the bottle; its rolled rim stiffens the bottom edge.", [[0, 199], [27, 199], [27, SKIRT], [29.2, SKIRT], ...bead(29.3, 178.4, 0.7, -60, 90, 3), [29.4, 179.1], [29.4, 199.5], [28.9, 201.4], [27.8, CAP_TOP], [24.2, CAP_TOP], [24.2, 203.3], [23.6, TOP_DISC], [0, TOP_DISC]], STEEL, { parentId: "body", joint: "thread" }),
  part("cap-grip", "ribbed grip", "Ridges your fingers catch on to twist the cap.", knurl(), at((KNURL.from + KNURL.to) / 2), PLASTIC, on("cap", "molded"), v3(90, 0, 0)),
  part("cap-loop", "carry loop", "A handle to carry the bottle by its cap; its ends stand on the lid.", ring(LOOP.radius, LOOP.tube, 180), at(TOP_DISC), PLASTIC, on("cap", "molded"), v3(90, 90, 0)),
];

export const BOTTLE_KIT: Kit = parseKit({
  name: "Insulated Water Bottle",
  summary: "A double-walled steel bottle keeps your drink hot or cold, and the cap screws on tight over a soft ring so nothing leaks.",
  parts,
});
