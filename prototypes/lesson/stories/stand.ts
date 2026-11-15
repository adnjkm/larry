// An object that stands (templates/stand.ts reads that off the kit): too light, a knock tips it over;
// too heavy, it won't lift. The motion is the Workshop's stand test, told in words: the grip sets the
// weight, from the step below the lightest mass that stands to the step above the heaviest that lifts.
import { type Control, type Mark, type Run, type StoryModuleSpec, type Test, type TestCtx, type Values, vec } from "../model.ts";
import { type Stand, standModule } from "../templates/stand.ts";
import { capital, threeZones, wordsOf } from "./piece.ts";

const ZONES = threeZones(["Light", "Just right", "Heavy"], [0.4, 0.75]);
const STEP = 0.1;

/** Live lines of the Workshop's stand tests that carry numbers, said in words. */
const said = (live: string) =>
  !/\d/.test(live)
    ? live
    : live.startsWith("Tipped")
      ? "Tipping…"
      : live.includes("lifted")
        ? "Lifted"
        : live.includes("twists down")
          ? "Twists down"
          : live.includes("too heavy")
            ? "Too heavy"
            : "Lifting…";

export function storyStand(s: Stand, produces: readonly string[], adds: readonly string[]): StoryModuleSpec & { payoff: { part: string; job: string } } {
  const key = "weight";
  const [lo, hi] = s.window;
  const light = Math.max(s.start, Number((lo - STEP).toFixed(6)));
  const heavy = Math.min(s.slider.max, Number((hi + STEP).toFixed(6)));
  const [toOk, toHigh] = [ZONES[0]!.until, ZONES[1]!.until];
  /** Kilograms at a grip value: each zone spans only masses that behave the way its word says. */
  const kgAt = (v: number) =>
    v < toOk
      ? s.start + ((light - s.start) * v) / toOk
      : v < toHigh
        ? lo + ((hi - lo) * (v - toOk)) / (toHigh - toOk)
        : heavy + ((s.slider.max - heavy) * (v - toHigh)) / (1 - toHigh);
  const workshop = standModule(s, produces);
  const object = wordsOf(s.kit.name);
  const root = wordsOf(s.root.name);
  const handle = s.handle ? wordsOf(s.handle.part.name) : null;
  // A purple block low in the base: the weight, bigger the heavier.
  const block = (v: number): Mark => {
    const size = s.halfBase * (0.3 + 0.5 * v);
    return {
      id: "weight",
      shape: { kind: "box", width: size, height: size, depth: size, cornerRadius: 0.1 * size },
      at: vec(s.footing.centre.x, s.footing.centre.y + size / 2 + 1, s.footing.centre.z),
      ride: s.root.id,
    };
  };
  const words = (test: Test, line: (pass: boolean) => string): Test => ({
    ...test,
    run: (values: Values, ctx: TestCtx): Run => {
      const v = values[key] ?? 0;
      const run = test.run({ mass: kgAt(v) }, ctx);
      return {
        ...run,
        verdict: { pass: run.verdict.pass, line: line(run.verdict.pass) },
        at: (ms) => {
          const o = run.at(ms);
          return { ...o, live: said(o.live), marks: [...o.marks, block(v)] };
        },
      };
    },
  });
  const [bump, lift] = workshop.tests;
  const knock = words({ ...bump!, label: "Knock" }, (pass) => (pass ? "It rocked back and stayed up." : `Too light. The ${object} tipped over.`));
  const raise = words({ ...lift!, label: "Lift" }, (pass) =>
    pass ? "It lifts easily." : handle ? `Too heavy. It twists down by the ${handle}.` : "Too heavy to lift with one hand.",
  );
  const control: Control = {
    key,
    verb: "Weight",
    start: 0,
    zones: () => ZONES,
    pose: (v, ctx) => ({ moves: {}, marks: ctx.present.includes(s.root.id) ? [block(v)] : [] }),
  };
  return {
    id: "stand",
    title: "Keep it standing",
    primitive: "weight",
    produces,
    without: { say: "Knock it. Watch it tip.", line: "Too light, a knock tips it over.", test: knock, adds, values: { [key]: 0 } },
    learn: {
      say: "Add weight. It gets harder to tip.",
      rigs: {
        weight: {
          controls: { mass: "Weight" },
          why: [
            "Weight pulls straight down.",
            "To tip over, that weight has to rise over the edge of the base.",
            "The heavier it is, the harder a knock has to be.",
          ],
        },
      },
    },
    uses: { weight: `The ${root}'s weight, low on its base, keeps it standing.` },
    assemble: { piece: capital(root), title: `The ${root} carries the weight down onto its base.`, built: `The ${root} now stands on its base.` },
    target: { ...workshop.target, label: "outline" },
    enter: vec(0, 50, 0),
    play: { say: "Set the weight. Then knock it.", control, tests: [knock, raise] },
    hints: ["Watch it tip over the edge of its base.", "Too light, a knock tips it. Add weight.", "Too heavy and it won't lift. Stop at Just right."],
    why: [
      "It stays up while its weight sits over its base.",
      "A knock has to lift that weight over the edge.",
      `Without enough weight, a knock tips the ${object} over.`,
    ],
    job: "Its weight keeps it standing.",
    cheer: "Rock steady!",
    payoff: { part: "Weight", job: "keeps it standing." },
  };
}
