// The assemble-step templates a scan may pick from, per mechanism library entry, and the rules a pick must keep.
// A lesson is always: preview, the mechanism's primitives, Connect (drag each primitive to the sub-function it does),
// then one to three assemble steps. Preview, primitives and Connect follow from the library entry. The assemble steps
// are chosen: each is one of the templates below, filled in. The hand-made click pen (EXAMPLE) is how one object
// used them. The rig (prototypes/lesson/gen) plays exactly these and nothing else, so a pick outside them is refused.
import type { GenStep } from "./gen.ts";

/** A test a placed piece can be answered by: what the player sees, and the sub-functions it can stand for. */
export type PlaceTest = { id: string; shows: string; covers: readonly string[] };

/** What can be done with one of a mechanism's pieces. */
export type PieceTemplates = {
  piece: string;
  /** What the piece is and where it lives, in a line. */
  what: string;
  /** "Something is missing: where does this go?" The piece is dragged to one of three spots on or in the object. */
  place?: { tests: readonly PlaceTest[] };
  /** A multiple choice on the piece's primitive figure, for a part whose job is in how it moves, not where it sits. */
  choice?: { shows: string; covers: readonly string[]; options: readonly { label: string; turns: number; works: boolean }[] };
};

export const STEP_TEMPLATES: Readonly<Record<string, readonly PieceTemplates[]>> = {
  "click-latch": [
    {
      piece: "spring",
      what: "The coil round the tip end of the refill, squeezed between a ledge in the nose and a collar on the refill.",
      place: {
        tests: [
          { id: "push", shows: "The tip is pushed down in its case and let go. With no spring behind it, it stays down. With the spring home, it comes back up.", covers: ["bring-back"] },
          { id: "lift", shows: "The pen is picked up tip down. With no spring the tip hangs out. With the spring home, it stays tucked in.", covers: ["bring-back"] },
        ],
      },
    },
    {
      piece: "cam",
      what: "The stepped ring on top of the refill, under the button. Each click turns it a step, and its steps are not alike.",
      choice: {
        shows: "The cam primitive's own figure, a rod riding its rim standing for the pen's tip. The player picks how far one click turns the cam, then watches two clicks: only the right step leaves the rod up after one click and down after the next.",
        covers: ["hold", "take-turns"],
        options: [
          { label: "¼ Turn", turns: 0.25, works: true },
          { label: "½ Turn", turns: 0.5, works: false },
          { label: "Full Turn", turns: 1, works: false },
        ],
      },
    },
  ],
  "ball-tip": [
    {
      piece: "ball",
      what: "The ball held in the socket at the very tip, with the ink behind it.",
      place: {
        tests: [
          { id: "write", shows: "The pen is drawn across the paper. With no ball at the tip the ink blots and smears. With the ball home, it rolls out a thin even line.", covers: ["close", "roll"] },
        ],
      },
    },
  ],
};

/** How the hand-made click pen used the templates: the worked example, and what a rig plays when a scan picks nothing. */
export const EXAMPLE_STEPS: Readonly<Record<string, readonly GenStep[]>> = {
  "click-latch": [
    { template: "place", piece: "spring", test: "push", covers: ["bring-back"], say: "Drag the spring where it belongs." },
    {
      template: "choice",
      piece: "cam",
      covers: ["hold", "take-turns"],
      say: "The rod is the pen's tip. Drag on how far each click turns the cam.",
      options: [
        { label: "½ Turn", turns: 0.5 },
        { label: "¼ Turn", turns: 0.25 },
        { label: "Full Turn", turns: 1 },
      ],
    },
  ],
  "ball-tip": [{ template: "place", piece: "ball", test: "write", covers: ["close", "roll"], say: "Drag the ball where it belongs." }],
};

const SAY_MAX = 80;

/**
 * What is wrong with a mechanism's picked steps, in plain lines. `subfunctions` are the entry's sub-function ids.
 * The rules: one to three steps; every sub-function is tested exactly once; a piece is placed at most once and has at
 * most one choice; a piece's place comes before its choice; each step keeps to what its template allows.
 */
export function stepProblems(entry: string, steps: readonly GenStep[], subfunctions: readonly string[]): string[] {
  const pieces = STEP_TEMPLATES[entry];
  if (!pieces) return [`${entry} has no assemble templates`];
  const problems: string[] = [];
  if (steps.length < 1 || steps.length > 3) problems.push(`${entry} needs one to three assemble steps, not ${steps.length}`);
  const seen = new Set<string>();
  const covered = new Map<string, number>();
  steps.forEach((step, i) => {
    const at = `${entry} step ${i + 1}`;
    const piece = pieces.find((p) => p.piece === step.piece);
    if (!piece) return void problems.push(`${at}: no piece "${step.piece}" (pieces: ${pieces.map((p) => p.piece).join(", ")})`);
    const key = `${step.template} ${step.piece}`;
    if (seen.has(key)) problems.push(`${at}: the ${step.piece} already has a ${step.template} step`);
    if (step.template === "place" && seen.has(`choice ${step.piece}`)) problems.push(`${at}: place the ${step.piece} before its choice`);
    seen.add(key);
    const say = step.say.trim();
    if (say.length === 0 || say.length > SAY_MAX) problems.push(`${at}: the instruction is one line of at most ${SAY_MAX} characters`);
    let allowed: readonly string[] = [];
    if (step.template === "place") {
      const test = piece.place?.tests.find((t) => t.id === step.test);
      if (!piece.place) problems.push(`${at}: the ${step.piece} cannot be placed`);
      else if (!test) problems.push(`${at}: the ${step.piece} has no test "${step.test}" (tests: ${piece.place.tests.map((t) => t.id).join(", ")})`);
      allowed = test?.covers ?? [];
    } else {
      if (!piece.choice) return void problems.push(`${at}: the ${step.piece} has no choice template`);
      allowed = piece.choice.covers;
      const known = step.options.map((o) => piece.choice!.options.find((k) => k.turns === o.turns));
      if (known.some((k) => !k)) problems.push(`${at}: options come from ${piece.choice.options.map((k) => k.label).join(", ")}`);
      if (new Set(step.options.map((o) => o.turns)).size < step.options.length) problems.push(`${at}: an option is given twice`);
      if (known.filter((k) => k?.works).length !== 1) problems.push(`${at}: exactly one option may work`);
    }
    for (const sub of step.covers) {
      if (!allowed.includes(sub)) problems.push(`${at}: it cannot cover "${sub}" (it can cover: ${allowed.join(", ") || "nothing"})`);
      covered.set(sub, (covered.get(sub) ?? 0) + 1);
    }
  });
  for (const sub of subfunctions) {
    const n = covered.get(sub) ?? 0;
    if (n === 0) problems.push(`${entry}: no step covers "${sub}"`);
    if (n > 1) problems.push(`${entry}: "${sub}" is tested ${n} times; test each thing once`);
  }
  return problems;
}
