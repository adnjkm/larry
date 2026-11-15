import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GenCourse, type GenStep } from "../../../shared/course/gen.ts";
import { EXAMPLE_STEPS, STEP_TEMPLATES, stepProblems } from "../../../shared/course/templates.ts";
import { KNOWN } from "../../../shared/mechanisms/library.ts";
import { rise } from "../../../shared/primitives/models/cam.ts";
import penCourse, { penCourseOf } from "../lessons/pen-course.ts";
import pen, { PEN_RIG } from "../lessons/pen.ts";
import { PEN_SHELL } from "../lessons/pen-kit.ts";
import { courseFromGen, RigError } from "./index.ts";

const gold = GenCourse.parse(JSON.parse(readFileSync(new URL("../../../fixtures/courses/pen.gold.json", import.meta.url), "utf8")));
const subs = (entry: string) => KNOWN.get(entry)!.subfunctions.map((s) => s.id);
const CENTRE = { x: 0, y: 0, z: 0 };
const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
const [spring, cam] = EXAMPLE_STEPS["click-latch"] as [GenStep, GenStep];
const withSteps = (steps: readonly GenStep[]) => ({ ...gold, mechanisms: [{ ...gold.mechanisms[0]!, steps: [...steps] }, gold.mechanisms[1]!] });

test("the worked example keeps to the templates and builds the hand-made course", () => {
  for (const [entry, steps] of Object.entries(EXAMPLE_STEPS)) assert.deepEqual(stepProblems(entry, steps, subs(entry)), [], entry);
  assert.deepEqual(plain(penCourseOf(pen, PEN_RIG, PEN_SHELL, undefined, undefined, EXAMPLE_STEPS).mechanisms), plain(penCourse.mechanisms));
  assert.deepEqual(plain(courseFromGen({ ...gold, mechanisms: gold.mechanisms.map((m) => ({ ...m, steps: [...EXAMPLE_STEPS[m.entry]!] })) }).mechanisms), plain(penCourse.mechanisms));
});

test("a pick other than the example's builds its own screens", () => {
  const picked: GenStep[] = [
    { template: "place", piece: "spring", test: "lift", covers: ["bring-back"], say: "Where does the spring go?" },
    { template: "choice", piece: "cam", covers: ["hold", "take-turns"], say: "How far should a click turn the cam?", options: [{ label: "Full Turn", turns: 1 }, { label: "¼ Turn", turns: 0.25 }] },
  ];
  const course = courseFromGen(withSteps(picked));
  const [click, tip] = course.mechanisms;
  assert.deepEqual(click!.screens.map((s) => s.kind), ["demo", "primitive", "primitive", "primitive", "match", "place", "place"]);
  const [placed, turned] = click!.screens.slice(-2);
  assert.ok(placed?.kind === "place" && turned?.kind === "place");
  assert.equal(placed.module, 1);
  assert.equal(placed.say, "Where does the spring go?");
  assert.equal(placed.does, "Bring the tip back when nothing holds it");
  assert.equal(placed.also, undefined);
  assert.equal(placed.trial?.test.id, "lift");
  assert.deepEqual(placed.absent, ["ball"]);
  assert.deepEqual(placed.tip, gold.mechanisms[0]!.tips.spring);
  // The same test fails without the spring and passes with it.
  const kit = course.story.kit!;
  const present = kit.parts.map((p) => p.id);
  assert.equal(placed.trial.test.run({ ...placed.trial.fail }, { kit, present: present.filter((id) => id !== "spring"), centre: CENTRE }).verdict.pass, false);
  assert.equal(placed.trial.test.run({ ...placed.trial.pass }, { kit, present, centre: CENTRE }).verdict.pass, true);
  assert.equal(turned.module, 2);
  assert.equal(turned.trial, undefined);
  assert.deepEqual(turned.turn, [{ id: "whole", label: "Full Turn", turns: 1 }, { id: "quarter", label: "¼ Turn", turns: 0.25 }]);
  assert.deepEqual([turned.does, turned.also], ["Hold the tip where the press left it", ["Free the tip on the next press"]]);
  assert.equal(turned.last, undefined);
  const ball = tip!.screens.at(-1);
  assert.equal(ball?.kind === "place" && ball.last, true);
});

test("every place test on the menu fails without its piece and passes with it", () => {
  const kit = courseFromGen(gold).story.kit!;
  const present = kit.parts.map((p) => p.id);
  for (const [entry, pieces] of Object.entries(STEP_TEMPLATES))
    for (const piece of pieces)
      for (const t of piece.place?.tests ?? []) {
        const steps: GenStep[] = [{ template: "place", piece: piece.piece, test: t.id, covers: [...t.covers], say: "Drag it where it belongs." }];
        const made = penCourseOf(pen, PEN_RIG, PEN_SHELL, undefined, undefined, { ...EXAMPLE_STEPS, [entry]: steps }).mechanisms.find((m) => m.id === entry)!;
        const screen = made.screens.at(-1);
        assert.ok(screen?.kind === "place" && screen.trial, `${piece.piece} ${t.id}`);
        // The ball goes on a pen with no spring or cam yet, as the story builds it.
        const there = piece.piece === "ball" ? present.filter((id) => id !== "spring" && !id.startsWith("cam")) : present;
        const ctx = (ids: string[]) => ({ kit, present: ids, centre: CENTRE });
        assert.equal(screen.trial.test.run({ ...screen.trial.fail }, ctx(there.filter((id) => id !== piece.piece))).verdict.pass, false, `${piece.piece} ${t.id} fails`);
        assert.equal(screen.trial.test.run({ ...screen.trial.pass }, ctx(there)).verdict.pass, true, `${piece.piece} ${t.id} passes`);
      }
});

test("picked steps that break the rules are refused", () => {
  const click = (steps: GenStep[]) => stepProblems("click-latch", steps, subs("click-latch"));
  const choice = cam as Extract<GenStep, { template: "choice" }>;
  const place = spring as Extract<GenStep, { template: "place" }>;
  assert.match(click([spring, { ...choice, covers: ["hold"] }]).join("\n"), /no step covers "take-turns"/);
  assert.match(click([spring, { ...place, test: "lift" }, cam]).join("\n"), /already has a place step/);
  assert.match(click([{ template: "place", piece: "spring", test: "push", covers: ["bring-back", "hold"], say: "Drag it." }, cam]).join("\n"), /cannot cover "hold"/);
  assert.match(click([spring, { template: "place", piece: "spring", test: "lift", covers: ["bring-back"], say: "Again." }, cam]).join("\n"), /"bring-back" is tested 2 times/);
  assert.match(click([{ ...place, test: "shake" }, cam]).join("\n"), /no test "shake"/);
  assert.match(click([spring, { ...choice, options: [{ label: "½ Turn", turns: 0.5 }, { label: "Full Turn", turns: 1 }] }]).join("\n"), /exactly one option may work/);
  assert.match(click([spring, { ...choice, options: [{ label: "¼ Turn", turns: 0.25 }, { label: "¼ Turn", turns: 0.25 }] }]).join("\n"), /exactly one option may work/);
  assert.match(click([spring, { ...choice, options: [{ label: "⅓ Turn", turns: 1 / 3 }, { label: "¼ Turn", turns: 0.25 }] }]).join("\n"), /options come from/);
  // Tests the rig cannot show clearly are off the menu: the cam is not placed, and the ball has no leak test.
  assert.match(click([spring, { template: "place", piece: "cam", test: "letgo", covers: ["hold"], say: "Drag it." }, { ...choice, covers: ["take-turns"] }]).join("\n"), /the cam cannot be placed/);
  assert.match(stepProblems("ball-tip", [{ template: "place", piece: "ball", test: "wait", covers: ["close"], say: "Drag it." }], subs("ball-tip")).join("\n"), /no test "wait"/);
  assert.throws(() => courseFromGen(withSteps([spring])), (e: unknown) => e instanceof RigError && /no step covers "hold"/.test(e.message));
});

test("the cam's options work as Turn.tsx decides them", () => {
  // The rule in Turn.tsx: the rod starts down a quarter turn past the top of a bump; an option works when one click
  // leaves it up and the next lets it down.
  const LIFT = 8;
  let top = 0;
  for (let i = 0; i < 200; i++) if (rise({ lift: LIFT }, i / 200) > rise({ lift: LIFT }, top)) top = i / 200;
  const start = (top + 0.25) % 1;
  const up = (turn: number) => rise({ lift: LIFT }, ((turn % 1) + 1) % 1) > LIFT * 0.6;
  for (const o of STEP_TEMPLATES["click-latch"]!.find((p) => p.piece === "cam")!.choice!.options) assert.equal(up(start + o.turns) && !up(start + 2 * o.turns), o.works, o.label);
});
