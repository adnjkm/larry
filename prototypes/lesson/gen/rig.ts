// The pen rig: takes the outside of a scanned click pen (a GenCourse kit and its roles), brings it to the hand-made
// pen's working size, measures the hollow, and installs the hand-made pen's works sized to fit. What comes out is a
// lesson kit under the ids the pen story animates (barrel, nose, plunger, refill, ball, spring, cam), its outside for
// the result screen, and the dimensions the story reads.
import { Euler, Quaternion } from "three";
import type { GenCourse } from "../../../shared/course/gen.ts";
import { type Kit, type Part, parseKit } from "../../../shared/kit.ts";
import { PEN, type PenDims, penWorks } from "../lessons/pen-kit.ts";
import { scalePart } from "./scale.ts";

/** What is wrong with a scanned kit, one line per fault. */
export class RigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`This kit cannot be fitted with a click pen's works:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

/** The ids the pen story uses for the three outside roles. */
const ROLE_ID = { case: "barrel", nose: "nose", button: "plunger" } as const;
type RoleName = keyof typeof ROLE_ID;
/** Ids the rig keeps for itself: a scanned detail with one of these names is renamed. */
const RESERVED = new Set<string>([...Object.values(ROLE_ID), "refill", "tip", "refill-collar", "ball", "spring", "cam", "cam-lug-1", "cam-lug-2", "cam-lug-3", "cam-lug-4", "plunger-stem"]);
const FIXED = new Set(["molded", "weld", "glue"]);
/** The hand-made pen's height, which a scanned pen is scaled to. */
const HEIGHT = PEN.top;
/** See-through is the scanned colour a little darker, as the hand-made barrel is against its solid look. */
const CLEAR_SHADE = 0.9;

type Pt = { r: number; y: number };

/** A lathe's profile at the heights it is drawn at: the part's position is the middle of its height. */
function profileOf(part: Part): Pt[] {
  if (part.shape.kind !== "lathe") return [];
  const ys = part.shape.profile.map((p) => p.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  return part.shape.profile.map((p) => ({ r: p.r, y: part.position.y + p.y - mid }));
}
const span = (profile: readonly Pt[]) => ({ bottom: Math.min(...profile.map((p) => p.y)), top: Math.max(...profile.map((p) => p.y)) });

/** Where a level line at height `y` crosses the profile, nearest the axis first. The profile is closed back to its start. */
function crossings(profile: readonly Pt[], y: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    if (a.y === b.y || y < Math.min(a.y, b.y) || y >= Math.max(a.y, b.y)) continue;
    out.push(a.r + ((y - a.y) / (b.y - a.y)) * (b.r - a.r));
  }
  return out.sort((p, q) => p - q);
}
/** The radius of the hollow at height `y`: 0 where the part is solid through, and no limit outside its height. */
function innerAt(profile: readonly Pt[], y: number): number {
  const at = crossings(profile, y);
  if (at.length === 0) return Infinity;
  return at.length < 2 || at[0]! < 0.05 ? 0 : at[0]!;
}
const outerAt = (profile: readonly Pt[], y: number) => crossings(profile, y).at(-1) ?? 0;

const shade = (hex: string, k: number) =>
  `#${[1, 3, 5]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** The kit turned by `degrees` about z, about the origin: a pen drawn lying down is stood up. */
function turned(parts: readonly Part[], degrees: number): Part[] {
  const a = (degrees * Math.PI) / 180;
  const turn = new Quaternion().setFromEuler(new Euler(0, 0, a, "XYZ"));
  const rad = Math.PI / 180;
  return parts.map((p) => {
    const q = turn.clone().multiply(new Quaternion().setFromEuler(new Euler(p.rotation.x * rad, p.rotation.y * rad, p.rotation.z * rad, "XYZ")));
    const e = new Euler().setFromQuaternion(q, "XYZ");
    const tidy = (n: number) => Math.round((n / rad) * 1000) / 1000 || 0;
    return {
      ...p,
      position: { x: p.position.x * Math.cos(a) - p.position.y * Math.sin(a), y: p.position.x * Math.sin(a) + p.position.y * Math.cos(a), z: p.position.z },
      rotation: { x: tidy(e.x), y: tidy(e.y), z: tidy(e.z) },
    };
  });
}

/**
 * The scanned outside at the hand-made pen's size: stood up if it lies down, scaled so nose bottom to button top is
 * the hand-made pen's height, standing on y = 0 with the case on the axis, and its role parts under the story's ids.
 * Every other part is fixed to the role part it hangs off, so it moves, hides and lights with it.
 */
export function normalise(gen: Pick<GenCourse, "kit" | "roles">): Part[] {
  const problems: string[] = [];
  const byId = new Map(gen.kit.parts.map((p) => [p.id, p]));
  const role = {} as Record<RoleName, Part>;
  for (const name of Object.keys(ROLE_ID) as RoleName[]) {
    const id = gen.roles[name];
    const part = id === undefined ? undefined : byId.get(id);
    if (!part) problems.push(id === undefined ? `no part is given the "${name}" role` : `the "${name}" role names part "${id}", which is not in the kit`);
    else if (part.shape.kind !== "lathe") problems.push(`the ${name} ("${part.id}") is a ${part.shape.kind}; it has to be a lathe on the y axis`);
    else role[name] = part;
  }
  if (problems.length > 0) throw new RigError(problems);
  if (new Set(Object.values(role).map((p) => p.id)).size < 3) throw new RigError(["the case, nose and button have to be three different parts"]);

  // Lying down: the nose and the button are further apart along x than along y.
  const along = { x: role.button.position.x - role.nose.position.x, y: role.button.position.y - role.nose.position.y };
  let parts: Part[] = [...gen.kit.parts];
  if (Math.abs(along.x) > Math.abs(along.y)) parts = turned(parts, along.x > 0 ? 90 : -90);
  else if (along.y < 0) problems.push("the object is upside down: the nose has to be below the button");
  const stood = new Map(parts.map((p) => [p.id, p]));
  const [caseP, noseP, buttonP] = [stood.get(role.case.id)!, stood.get(role.nose.id)!, stood.get(role.button.id)!];
  for (const [name, p] of [["case", caseP], ["nose", noseP], ["button", buttonP]] as const) {
    if (Math.abs(p.rotation.x) > 0.5 || Math.abs(p.rotation.z) > 0.5) problems.push(`the ${name} ("${p.id}") is tilted; its axis has to be the object's long axis`);
    if (Math.hypot(p.position.x - caseP.position.x, p.position.z - caseP.position.z) > 0.5) problems.push(`the ${name} ("${p.id}") is off the case's axis`);
  }
  if (problems.length > 0) throw new RigError(problems);

  const bottom = span(profileOf(noseP)).bottom;
  const top = span(profileOf(buttonP)).top;
  if (!(top - bottom > 1)) throw new RigError(["the button's top has to be above the nose's bottom"]);
  const s = HEIGHT / (top - bottom);
  const shift = { x: -caseP.position.x * s, y: -bottom * s, z: -caseP.position.z * s };

  const roleOf = new Map<string, string>([
    [caseP.id, ROLE_ID.case],
    [noseP.id, ROLE_ID.nose],
    [buttonP.id, ROLE_ID.button],
  ]);
  const idOf = (id: string) => roleOf.get(id) ?? (RESERVED.has(id) ? `outer-${id}` : id);
  /** The role part a detail hangs off, through however many parts. */
  const ownerOf = (p: Part): string | null => {
    const seen = new Set<string>();
    for (let at: Part | undefined = p; at && !seen.has(at.id); at = at.parentId === null ? undefined : stood.get(at.parentId)) {
      seen.add(at.id);
      if (roleOf.has(at.id)) return at.id;
    }
    return null;
  };
  return parts.map((p): Part => {
    const sized = scalePart(p, s, shift);
    const as = roleOf.get(p.id);
    if (as === ROLE_ID.case) return { ...sized, id: as, parentId: null, joint: null, rotation: { x: 0, y: p.rotation.y, z: 0 } };
    if (as === ROLE_ID.nose) return { ...sized, id: as, parentId: ROLE_ID.case, joint: "thread", rotation: { x: 0, y: p.rotation.y, z: 0 } };
    if (as === ROLE_ID.button) return { ...sized, id: as, parentId: ROLE_ID.case, joint: "slide", rotation: { x: 0, y: p.rotation.y, z: 0 } };
    // A detail keeps its parent while that leads to a role part; one that leads nowhere is fixed to the case.
    const owned = ownerOf(p) !== null && p.parentId !== null;
    return { ...sized, id: idOf(p.id), parentId: owned ? idOf(p.parentId!) : ROLE_ID.case, joint: owned && p.joint !== null && FIXED.has(p.joint) ? p.joint : "glue" };
  });
}

/** Clearance between a moving inner part and the wall round it. */
const GAP = 0.4;
/** The spring's free length, as the hand-made pen's. */
const SPRING_LENGTH = PEN.springTop - PEN.springBottom;

/**
 * The dimensions of a normalised outside, and the works that fit its hollow. Radii keep the hand-made pen's
 * proportions to the case's bore, each clamped to clear the wall; heights hang off the ledge the spring sits on at
 * the bottom and off the button's stem at the top.
 */
export function measure(parts: readonly Part[]): { dims: PenDims; stem: Part | null } {
  const get = (id: string) => parts.find((p) => p.id === id)!;
  const [barrel, nose, button] = [profileOf(get(ROLE_ID.case)), profileOf(get(ROLE_ID.nose)), profileOf(get(ROLE_ID.button))];
  const problems: string[] = [];
  const mm = (n: number) => `${((n * 140) / HEIGHT).toFixed(1)} mm`;

  const { bottom: barrelBottom, top: barrelTop } = span(barrel);
  const { top: noseTop } = span(nose);
  const { bottom: buttonBottom, top } = span(button);
  const barrelR = Math.max(...barrel.map((p) => p.r));
  const buttonR = Math.max(...button.map((p) => p.r));
  const noseR = Math.max(...nose.map((p) => p.r));
  if (noseTop < barrelBottom - 1) problems.push(`the nose stops ${mm(barrelBottom - noseTop)} short of the case; the two have to meet`);
  if (barrelTop - barrelBottom < HEIGHT * 0.4) problems.push("the case is under 40% of the object's length; it has to be the long body");

  // The bore the works run in: the narrowest the case gets between the nose and its top end.
  const steps = (from: number, to: number, step: number) => Array.from({ length: Math.max(1, Math.floor((to - from) / step) + 1) }, (_, i) => from + i * step);
  const barrelIn = Math.min(...steps(Math.max(barrelBottom, noseTop) + 1, barrelTop - 14, 4).map((y) => innerAt(barrel, y)));
  if (!(barrelIn >= 4.5)) problems.push(`the case is not hollow enough: its inside radius is ${mm(Math.max(0, barrelIn))}, and the works need 1.5 mm`);
  const opening = innerAt(barrel, barrelTop - 0.5);
  if (!(opening >= 3)) problems.push("the case is closed at the top; it has to be open for the button");
  const hole = innerAt(nose, 0.5);
  if (!(hole >= 1.7 && Number.isFinite(hole))) problems.push("the nose has no hole at its bottom for the tip (at least 0.6 mm radius)");
  if (innerAt(nose, noseTop - 0.5) < 3) problems.push("the nose is closed at the top; it has to be open where it meets the case");
  if (problems.length > 0) throw new RigError(problems);

  /** The hollow at height `y`, through the nose and the case together. */
  const bore = (y: number) => Math.min(y < noseTop ? innerAt(nose, y) : Infinity, y > barrelBottom && y < barrelTop ? innerAt(barrel, y) : Infinity);
  const boreOver = (from: number, to: number) => Math.min(...steps(from, to, 1).map(bore));
  const k = barrelIn / PEN.barrelIn;

  // The spring: on the lowest ledge with room for its whole length above.
  const springTube = PEN.springTube * k;
  const springR = PEN.springR * k;
  const ledge = steps(2, barrelBottom + (barrelTop - barrelBottom) / 3, 0.5).find((y) => boreOver(y + 0.25, y + SPRING_LENGTH + 3) >= springR + springTube + GAP);
  if (ledge === undefined) throw new RigError(["there is no pocket for the spring: the nose and the lower case never open wide enough for long enough"]);
  const springBottom = Math.round(ledge * 100) / 100;
  const springTop = springBottom + SPRING_LENGTH;

  // The button: its stem reaches into the case, or the rig adds one.
  const stemless = buttonBottom > barrelTop - 1;
  const stemBottom = stemless ? barrelTop - 2 : buttonBottom;
  const stemR = stemless ? Math.min(PEN.stemR * k, opening - 2 * GAP) : outerAt(button, buttonBottom + 0.3);
  if (!stemless && stemR > opening - 0.1) problems.push(`the button's stem (${mm(stemR)} radius) does not fit the case's opening (${mm(opening)})`);
  if (stemBottom < barrelTop - (barrelTop - barrelBottom) / 3) problems.push("the button's stem reaches more than a third of the way down the case");
  // It can go down until its head meets the rim.
  const rim = steps(barrelTop, barrelTop + PEN.TRAVEL, 0.5).find((y) => outerAt(button, y) >= opening - 0.1);
  const TRAVEL = Math.min(PEN.TRAVEL, rim === undefined ? Infinity : rim - barrelTop);
  if (TRAVEL < 6) problems.push(`the button can only go down ${mm(TRAVEL)} before its head meets the case; it needs 2 mm, so its head has to be narrower than the opening or stand higher`);

  // The refill and its collar, which comes down the pocket on the spring.
  const refillR = Math.min(PEN.refillR * k, springR - springTube - GAP);
  const collarR = Math.min(PEN.collarR * k, boreOver(springTop - TRAVEL, springTop + 3) - GAP);
  if (collarR < springR - springTube) problems.push("the spring's pocket is too tight for the collar that presses on it");
  const refillBottom = springTop - (PEN.springTop - PEN.refillBottom);

  // The tip and its ball: through the nose's hole, retracted and out.
  const ball = Math.min(PEN.ballR * k, hole - GAP);
  const taper = (ballR: number) => {
    const tipR = (ballR * PEN.tipR) / PEN.ballR;
    const tipBottom = PEN.ballBottom + ballR - ((PEN.ballY - PEN.tipBottom) * ballR) / PEN.ballR;
    const tipMid = PEN.tipMid.map((p) => ({
      r: tipR + ((p.r - PEN.tipR) / (PEN.refillR - PEN.tipR)) * (refillR - tipR),
      y: tipBottom + ((p.y - PEN.tipBottom) / (PEN.refillBottom - PEN.tipBottom)) * (refillBottom - tipBottom),
    }));
    return { tipR, tipBottom, tipMid, line: [{ r: tipR, y: tipBottom }, ...tipMid, { r: refillR, y: refillBottom }] };
  };
  /** How much of the bore the tip takes at its tightest, anywhere along its way out. */
  const tightest = (line: readonly Pt[]) => Math.max(...line.flatMap((p) => [0, TRAVEL].map((out) => (p.r + GAP) / Math.max(0.01, bore(Math.max(0.5, p.y - out))))));
  const squeeze = Math.max(1, tightest(taper(ball).line));
  const ballR = ball / squeeze;
  if (ballR < 1.5) problems.push("the nose's bore is too narrow for a tip to pass through");
  const tip = taper(ballR);
  if (tightest(tip.line) > 1.02) problems.push("the nose's bore is too narrow for the refill to slide through it");

  // The cam under the stem, the refill up to it.
  const lug = PEN.lug * k;
  const lugR = Math.min(PEN.lugR * k, barrelIn - GAP - lug * 0.75);
  const camR = Math.min(PEN.camR * k, barrelIn - GAP - lug / 2);
  const camTop = stemBottom;
  const camBottom = camTop - (PEN.camTop - PEN.camBottom);
  if (camBottom - springTop < 40) problems.push("the case is too short between the spring's pocket and the button for the refill");
  if (problems.length > 0) throw new RigError(problems);

  const dims: PenDims = {
    ...PEN,
    TRAVEL,
    ballR,
    ballY: PEN.ballBottom + ballR,
    tipBottom: tip.tipBottom,
    noseCone: Math.min(noseTop, ...nose.filter((p) => p.r >= noseR * 0.98).map((p) => p.y)),
    noseTop,
    barrelBottom,
    barrelTop,
    barrelR,
    barrelIn,
    ledge: springBottom,
    springBottom,
    springTop,
    springR,
    springTube,
    collarBottom: springTop,
    collarTop: springTop + (PEN.collarTop - PEN.collarBottom),
    refillR,
    refillBottom,
    refillTop: camBottom,
    camBottom,
    camTop,
    camR,
    stemBottom,
    // Where the button's head starts, above its stem.
    buttonBottom: Math.min(...button.filter((p) => p.r >= buttonR * 0.98).map((p) => p.y)),
    top,
    buttonR,
    clipBottom: barrelTop - (PEN.barrelTop - PEN.clipBottom),
    clipTop: barrelTop - (PEN.barrelTop - PEN.clipTop),
    clipR: barrelR + (PEN.clipR - PEN.barrelR),
    tipR: tip.tipR,
    tipMid: tip.tipMid,
    collarR,
    camIn: Math.min(PEN.camIn * k, camR / 2),
    lug,
    lugR,
    stemR,
  };

  const head = get(ROLE_ID.button);
  const stem: Part | null = stemless
    ? {
        id: "plunger-stem",
        name: "button stem",
        role: "Carries the button's push down to the cam.",
        parentId: ROLE_ID.button,
        joint: "molded",
        shape: {
          kind: "lathe",
          profile: [
            { r: 0, y: stemBottom },
            { r: stemR, y: stemBottom },
            { r: stemR, y: buttonBottom },
            { r: 0, y: buttonBottom },
          ],
        },
        position: { x: 0, y: (stemBottom + buttonBottom) / 2, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        color: head.color,
        finish: head.finish,
      }
    : null;
  return { dims, stem };
}

/** A detail that sits wholly inside the case's bore (a thread on the nose's sleeve), so it is only seen through the case. */
function inside(p: Part, dims: PenDims): boolean {
  if (Math.hypot(p.position.x, p.position.z) > 0.5 || p.position.y < dims.barrelBottom) return false;
  if (p.shape.kind === "helix") return p.shape.radius + p.shape.tube <= dims.barrelIn;
  return p.shape.kind === "lathe" && Math.max(...p.shape.profile.map((q) => q.r)) <= dims.barrelIn;
}

export type PenRig = {
  dims: PenDims;
  /** The lesson's pen: the case and the nose see-through, the works inside. */
  kit: Kit;
  /** The same pen as it looks in the hand: nothing see-through. */
  reveal: Kit;
};

/** The scanned outside with the works installed. Throws a RigError that lists everything wrong with the kit. */
export function installPen(gen: Pick<GenCourse, "kit" | "roles">): PenRig {
  const outside = normalise(gen);
  const { dims, stem } = measure(outside);
  const ownerOf = (p: Part): string => {
    let at: Part | undefined = p;
    for (let i = 0; at && at.parentId !== null && !(Object.values(ROLE_ID) as string[]).includes(at.id) && i < outside.length; i++) at = outside.find((q) => q.id === at!.parentId);
    return at?.id ?? ROLE_ID.case;
  };
  const group = (owner: string) => outside.filter((p) => ownerOf(p) === owner);
  // The hand-made pen's order: the case and its details, the nose, the works, then the button.
  const solid: Part[] = [...group(ROLE_ID.case), ...group(ROLE_ID.nose), ...penWorks(dims, ROLE_ID.case), ...group(ROLE_ID.button), ...(stem ? [stem] : [])].map((p) =>
    p.finish === "clear" && (outside.includes(p) || p === stem) ? { ...p, finish: "glossy" as const } : p,
  );
  const clear = new Set<string>([ROLE_ID.case, ROLE_ID.nose, ...outside.filter((p) => ownerOf(p) === ROLE_ID.nose && inside(p, dims)).map((p) => p.id)]);
  const about = { name: gen.kit.name, summary: gen.kit.summary };
  // The works keep their own looks in both; only the outside's case and nose change between the two.
  const works = new Set(penWorks(dims).map((p) => p.id));
  try {
    return {
      dims,
      kit: parseKit({ ...about, parts: solid.map((p) => (clear.has(p.id) ? { ...p, color: shade(p.color, CLEAR_SHADE), finish: "clear" as const } : p)) }),
      reveal: parseKit({ ...about, parts: solid.map((p) => (works.has(p.id) && p.finish === "clear" ? { ...p, finish: "glossy" as const } : p)) }),
    };
  } catch (error) {
    throw new RigError(String(error instanceof Error ? error.message : error).split("\n"));
  }
}
