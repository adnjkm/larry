import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { LIMITS, type Mechanism, type Plan, lessonProblems } from "../curriculum.ts";
import { PRIMITIVES } from "../primitives/library.ts";
import { fill, lessonOf, subfunctionsOf, wordsFor } from "./instantiate.ts";
import { MECHANISMS } from "./library.ts";
import { completePlan, libraryLessons, withoutKnownLessons } from "./plan.ts";
import type { KnownMechanism } from "./types.ts";

// Every file in entries/ is checked, whether or not library.ts lists it yet, so an entry can be tested while it is written.
const files = readdirSync(new URL("./entries/", import.meta.url)).filter((f) => f.endsWith(".ts"));
const entries: KnownMechanism[] = [];
for (const file of files) {
  const exported = Object.values((await import(new URL(`./entries/${file}`, import.meta.url).href)) as Record<string, KnownMechanism>);
  assert.equal(exported.length, 1, `${file} exports exactly one mechanism`);
  assert.equal(`${exported[0]!.id}.ts`, file, `${file} is named after its id`);
  entries.push(exported[0]!);
}
const primitives = new Set(PRIMITIVES.map((p) => p.id));
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The problems with one entry in one object's words: the same rules a generated lesson has to keep. */
function problems(entry: KnownMechanism, words: Record<string, string>): string[] {
  const found: string[] = [];
  const subfunctions = subfunctionsOf(entry, "m", words);
  const mechanism: Mechanism = {
    id: "m",
    name: entry.name,
    does: entry.does,
    parts: [],
    needs: [],
    known: entry.id,
    words: [],
    subfunctions,
    lesson: true,
    gap: null,
  };
  found.push(...lessonProblems(lessonOf(entry, "m", words), mechanism));
  for (const s of subfunctions) {
    if (!primitives.has(s.primitive)) found.push(`${s.id} uses ${s.primitive}, which is not a primitive`);
    if (wordCount(s.does) > LIMITS.words.subfunction.max) found.push(`${s.id} does is ${wordCount(s.does)} words`);
    if (/\d/.test(s.does)) found.push(`${s.id} does contains a number`);
  }
  return found;
}

for (const entry of entries) {
  test(`${entry.id}: holds together in its defaults and in every object it fits`, () => {
    assert.match(entry.id, /^[a-z][a-z-]*$/);
    assert.ok(entry.subfunctions.length >= 1 && entry.subfunctions.length <= LIMITS.subfunctions, "1 to 3 sub-functions");
    assert.ok(wordCount(entry.does) <= 20, "the recognition line is at most 20 words");
    assert.ok(entry.fits.length >= 2, "at least two real objects it fits");
    for (const slot of entry.slots) assert.match(slot.default, /^the [a-z]/, `slot ${slot.id}'s default starts with "the"`);
    const defaults = wordsFor(entry, []);
    assert.deepEqual(problems(entry, defaults), [], "with default words");
    for (const fit of entry.fits) {
      const given = Object.entries(fit.words).map(([slot, phrase]) => ({ slot, phrase }));
      const words = wordsFor(entry, given);
      assert.deepEqual(words, fit.words, `${fit.object}: every word is a usable phrase for a slot the entry has`);
      assert.deepEqual(problems(entry, words), [], `as a ${fit.object}`);
    }
    // The planner may give any phrase of up to three words, so the longest must still fit every word budget.
    const longest = Object.fromEntries(entry.slots.map((s) => [s.id, "the metal part"]));
    assert.deepEqual(
      wordsFor(
        entry,
        Object.entries(longest).map(([slot, phrase]) => ({ slot, phrase })),
      ),
      longest,
    );
    assert.deepEqual(problems(entry, longest), [], "with the longest words a planner may give");
    // Every slot is used somewhere, and no template names a slot that does not exist (fill throws on one).
    const all = [entry.path, entry.subfunctions.flatMap((s) => [s.does, ...Object.values(s.row).filter((t) => t !== null)])].flat().join(" ");
    for (const slot of entry.slots) assert.ok(all.includes(`{${slot.id}}`) || all.includes(`{=${slot.id}}`), `slot ${slot.id} is used`);
  });
}

test("fill puts words in slots and capitalises sentence starts", () => {
  assert.equal(
    fill("{closure} lifts off {opening}. {closure} is gone.", { closure: "the cap", opening: "the neck" }),
    "The cap lifts off the neck. The cap is gone.",
  );
  assert.equal(fill("{=closure}", { closure: "the screw ring" }), "Screw ring");
  assert.equal(fill("Turn {=closure} once", { closure: "the screw ring" }), "Turn screw ring once");
  assert.throws(() => fill("{lid}", {}));
});

test("words fall back to the default when the planner's phrase is unusable", () => {
  const entry = entries.find((e) => e.id === "screw-closure")!;
  assert.deepEqual(
    wordsFor(entry, [
      { slot: "closure", phrase: "The Lid." },
      { slot: "opening", phrase: "a very long phrase that is not a name" },
    ]),
    { closure: "the lid", opening: "the neck" },
  );
});

test("the library lists every entry once", () => {
  assert.deepEqual(MECHANISMS.map((m) => m.id).sort(), entries.map((e) => e.id).sort());
});

const mechanism = (over: Partial<Mechanism> & { id: string }): Mechanism => ({
  name: over.id,
  does: "Does a job",
  parts: [],
  needs: [],
  known: null,
  words: [],
  subfunctions: [],
  lesson: false,
  gap: null,
  ...over,
});
const written: Plan = {
  object: "Bottle",
  job: "Carries water",
  uses: ["Fill it.", "Close it."],
  mechanisms: [
    mechanism({ id: "body" }),
    mechanism({ id: "cap", known: "screw-closure", words: [{ slot: "closure", phrase: "the cap" }], lesson: true }),
    mechanism({
      id: "strap",
      known: "no-such-entry",
      words: [{ slot: "x", phrase: "the strap" }],
      lesson: true,
      gap: { try: "Carry it.", fails: "It drops." },
    }),
    mechanism({ id: "clip", known: "snap-catch", words: [] }),
    mechanism({ id: "spout", lesson: true, subfunctions: [{ id: "spout-pour", does: "Pour in a thin stream", primitive: "valve" }] }),
  ],
};

test("a written plan is completed from the library", () => {
  const plan = completePlan(written);
  const [body, cap, strap, clip, spout] = plan.mechanisms;
  assert.deepEqual(body, written.mechanisms[0]);
  assert.deepEqual(
    cap!.words,
    [
      { slot: "closure", phrase: "the cap" },
      { slot: "opening", phrase: "the neck" },
    ],
    "a missing word takes the slot's default",
  );
  assert.deepEqual(
    cap!.subfunctions.map((s) => [s.id, s.primitive]),
    [["cap-hold-on", "thread"]],
  );
  assert.match(cap!.subfunctions[0]!.does, /the cap/);
  assert.deepEqual([strap!.known, strap!.words, strap!.lesson, strap!.gap], [null, [], false, null], "an unknown entry with no steps becomes a given");
  assert.deepEqual([clip!.known, clip!.lesson, clip!.subfunctions], ["snap-catch", false, []], "a known given stays a given");
  assert.deepEqual(spout, written.mechanisms[4]);
});

test("known lessons come from the library and are hidden from the writer", () => {
  const plan = completePlan(written);
  const lessons = libraryLessons(plan);
  assert.deepEqual(
    lessons.map((l) => l.id),
    ["cap"],
  );
  assert.deepEqual(lessonProblems(lessons[0]!, plan.mechanisms[1]!), []);
  const rest = withoutKnownLessons(plan);
  assert.deepEqual(
    rest.mechanisms.filter((m) => m.lesson).map((m) => m.id),
    ["spout"],
  );
});
