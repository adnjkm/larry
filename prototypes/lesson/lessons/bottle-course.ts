// The water bottle as a mechanism lesson, in the click pen's format (pen-course.ts). It has one mechanism, the screw
// cap: a preview of it working, its two primitives, the connecting problem, then one assemble step for each
// sub-function, a piece dragged to where it belongs with its test as the answer. The cap does two things, each written
// up in the mechanism library as an entry of its own (screw-closure holds it on, squeezed-seal keeps it dry); this file
// puts their sub-functions side by side, in the bottle's words, and binds them to the bottle's model.
import { screwClosure } from "../../../shared/mechanisms/entries/screw-closure.ts";
import { squeezedSeal } from "../../../shared/mechanisms/entries/squeezed-seal.ts";
import { lessonOf, subfunctionsOf, wordsFor } from "../../../shared/mechanisms/instantiate.ts";
import type { KnownMechanism } from "../../../shared/mechanisms/types.ts";
import type { Course, Screen } from "../course.ts";
import flask, { FLASK_RIG } from "./flask.ts";
import { FLASK_SHELL } from "./flask-kit.ts";

const { tests, frames, demos } = FLASK_RIG;

/** The bottle story's modules, by what each one's piece is. */
const THREAD = 0;
const SEAL = 1;

type Facts = { does: string; primitive: string; why: string };

/** One sub-function of a library entry, in this bottle's words. */
function facts(entry: KnownMechanism, sub: string, words: Record<string, string>): Facts {
  const phrases = wordsFor(
    entry,
    Object.entries(words).map(([slot, phrase]) => ({ slot, phrase })),
  );
  const found = subfunctionsOf(entry, entry.id, phrases).find((s) => s.id === `${entry.id}-${sub}`);
  const row = lessonOf(entry, entry.id, phrases).rows.find((r) => r.id === found?.id);
  if (!found || !row) throw new Error(`${entry.id} has no sub-function ${sub}`);
  return { does: found.does, primitive: found.primitive, why: row.why };
}

const hold = facts(screwClosure, "hold-on", { closure: "the cap", opening: "the neck" });
const dry = facts(squeezedSeal, "close-gap", { ring: "the rubber ring", cover: "the cap", body: "the bottle" });
const rows = [hold, dry];

const screens: Screen[] = [
  // The cap comes right off in the preview, so the thread and the seal are left off the neck: seeing them there would
  // give away what the lesson is about to ask.
  {
    kind: "demo",
    after: SEAL,
    frame: frames.flip,
    hide: ["thread", "seal"],
    does: "A cap that twists on and keeps the water in.",
    needs: rows.map((r) => r.does),
    run: demos.closing,
    values: {},
  },
  ...rows.map((r): Screen => ({ kind: "primitive", id: r.primitive })),
  { kind: "match", rows },
  {
    kind: "place",
    module: THREAD,
    does: hold.does,
    say: "Drag the thread where it belongs.",
    trial: { test: tests.shake, fail: {}, pass: {} },
    tip: ["A thread is a ramp one part rides along as it turns.", "The cap can only ride it where the cap and the bottle overlap."],
  },
  {
    kind: "place",
    module: SEAL,
    does: dry.does,
    say: "Drag the seal where it belongs.",
    trial: { test: tests.flip, fail: {}, pass: {} },
    tip: ["A seal only closes a gap while it is squeezed.", "Look for where the cap comes down hard on the bottle as it twists on."],
    last: true,
  },
];

export default {
  story: flask,
  reveal: FLASK_SHELL,
  mechanisms: [{ id: "screw-cap", name: "Screw cap", screens }],
  jobs: {
    thread: "turns a twist into a hold that stays put",
    seal: "closes a gap so nothing leaks",
  },
} satisfies Course;
