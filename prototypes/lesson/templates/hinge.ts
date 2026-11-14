// A hinged child is a lever (one bar on a pivot): the arm ratio trades the force your hand gives at
// the far end for travel at the short end near the hinge.
import { clamp01, easeOut, smooth } from "../ease.ts";
import { type Axis, AXIS, type Mark, type Values, type Vec, vec, type Window } from "../model.ts";
import { arrowMark, carry, overlay, type Pair, scale, targetOf, type Template, tenth } from "./pair.ts";

/** Arm ratios that pass. Game numbers. */
const WINDOW: Window = [2.5, 4];
const HAND_N = 20;
const HAND_MM = 24;
const JOB_N = 50;
const JOB_MM = 6;
const OPEN_DEG = 15;
const DEG = Math.PI / 180;

const ratioOf = (v: Values) => tenth(v.ratio ?? 3);
/** Compared in tenths so 20 × 2.5 lands exactly on 50. */
const strongEnough = (r: number) => HAND_N * Math.round(r * 10) >= JOB_N * 10;
const farEnough = (r: number) => HAND_MM * 10 >= JOB_MM * Math.round(r * 10);

/** Where the hinge is taken to be: the long axis, the axis it turns about, and its two ends. */
function hingeOf(pair: Pair) {
  const axes: Axis[] = ["x", "y", "z"];
  const long = axes.reduce((a, b) => (pair.half[b] > pair.half[a] ? b : a));
  // The thinnest way across is how the far end swings; a tie goes to up and down, like a lid.
  const thin = (["y", "z", "x"] as Axis[]).filter((a) => a !== long).reduce((a, b) => (pair.half[b] < pair.half[a] - 0.5 ? b : a));
  const turn = axes.find((a) => a !== long && a !== thin)!;
  const { parentCentre } = pair;
  // The hinge goes at the end of the child that reaches away from its parent.
  const back = Math.sign(pair.centre[long] - parentCentre[long]) || -1;
  const end = (s: number): Vec => ({ ...pair.centre, [long]: pair.centre[long] + s * pair.half[long] });
  const pivot = end(back);
  const free = end(-back);
  const away = Math.sign(pair.centre[thin] - parentCentre[thin]) || 1;
  const turned = rotate(free, pivot, turn, 5);
  const open = Math.sign((turned[thin] - free[thin]) * away) || 1;
  return { pivot, free, turn, open, thin, away, length: 2 * pair.half[long] };
}

function rotate(p: Vec, pivot: Vec, axis: Axis, deg: number): Vec {
  const [c, s] = [Math.cos(deg * DEG), Math.sin(deg * DEG)];
  const d = vec(p.x - pivot.x, p.y - pivot.y, p.z - pivot.z);
  const r = axis === "z" ? vec(d.x * c - d.y * s, d.x * s + d.y * c, d.z) : axis === "x" ? vec(d.x, d.y * c - d.z * s, d.y * s + d.z * c) : vec(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
  return vec(pivot.x + r.x, pivot.y + r.y, pivot.z + r.z);
}

const ARM = 600;
const PUSH = 700;
const HOLD = 700;
const BACK = 600;

export const hingeTemplate: Template = {
  joints: ["hinge"],
  primitive: "lever",
  module: (pair: Pair) => {
    const { childName: child, parentName: parent } = pair;
    const h = hingeOf(pair);
    const swung = (present: readonly string[], deg: number) => carry(pair, present, { turns: [{ axis: AXIS[h.turn], pivot: h.pivot, deg: h.open * deg }] });
    const closing = scale(AXIS[h.thin], -h.away);
    const hand = arrowMark("hand", vec(h.free.x - closing.x * pair.half[h.thin], h.free.y - closing.y * pair.half[h.thin], h.free.z - closing.z * pair.half[h.thin]), closing, pair.child.id);
    const work = (r: number): Mark => {
      const p = vec(h.pivot.x + (h.free.x - h.pivot.x) / r, h.pivot.y + (h.free.y - h.pivot.y) / r, h.pivot.z + (h.free.z - h.pivot.z) / r);
      return { id: "short-end", shape: { kind: "box", width: 5, height: 5, depth: 5, cornerRadius: 1 }, at: p, ride: pair.child.id };
    };
    return {
      id: "hinge",
      title: `Hinge the ${child}`,
      need: `The ${child} must turn on its hinge with enough force at its short end, and enough travel.`,
      primitive: "lever",
      produces: pair.produces,
      assemble: {
        piece: "Lever bar",
        title: `Hinge the lever on the ${parent}: it becomes the ${child}.`,
        built: `The bar is now the ${child}, turning on a hinge at one end. Your hand works the far end.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "lever", slider: "ratio", start: 1 },
      fix: { window: WINDOW },
      tests: [
        {
          id: "hinge-push",
          label: `Push · ${pair.noun}`,
          run: (values, ctx) => {
            const r = ratioOf(values);
            const force = tenth(HAND_N * r);
            const ok = strongEnough(r);
            const closed = ok ? 1 : Math.min(0.85, force / JOB_N);
            const start = ARM + 200;
            return {
              verdict: ok
                ? { pass: true, line: `Your ${HAND_N} N became ${HAND_N} × ${r} = ${force} N at the short end, enough for the ${JOB_N} N it has to push.` }
                : { pass: false, line: `Your ${HAND_N} N became ${HAND_N} × ${r} = ${force} N at the short end. It has to push ${JOB_N} N, so it stopped partway.` },
              durationMs: start + PUSH + HOLD + BACK,
              at: (ms) => {
                if (ms < start) return overlay("Lifting it open", swung(ctx.present, OPEN_DEG * smooth(clamp01(ms / ARM))), [work(r)]);
                const q = easeOut(clamp01((ms - start) / PUSH));
                const deg = OPEN_DEG * (1 - closed * q);
                if (ms < start + PUSH + HOLD) return overlay(`Short end: ${tenth(force * q)} of ${JOB_N} N`, swung(ctx.present, deg), [hand, work(r)]);
                const p = smooth(clamp01((ms - start - PUSH - HOLD) / BACK));
                return overlay(ok ? "Closed" : "Back to rest", swung(ctx.present, deg * (1 - p)), [work(r)]);
              },
            };
          },
        },
        {
          id: "hinge-swing",
          label: `Swing · ${pair.noun}`,
          run: (values, ctx) => {
            const r = ratioOf(values);
            const travel = tenth(HAND_MM / r);
            const ok = farEnough(r);
            const deg = Math.min(30, HAND_MM / h.length / DEG);
            return {
              verdict: ok
                ? { pass: true, line: `Your ${HAND_MM} mm became ${HAND_MM} ÷ ${r} = ${travel} mm at the short end, enough for the ${JOB_MM} mm it has to move.` }
                : { pass: false, line: `Your ${HAND_MM} mm became ${HAND_MM} ÷ ${r} = ${travel} mm at the short end. It has to move ${JOB_MM} mm, so it stopped short.` },
              durationMs: PUSH + HOLD + BACK,
              at: (ms) => {
                const q = smooth(clamp01(ms / PUSH));
                if (ms < PUSH + HOLD) return overlay(`Short end moved ${tenth(travel * q)} of ${JOB_MM} mm`, swung(ctx.present, deg * q), [work(r)]);
                const p = smooth(clamp01((ms - PUSH - HOLD) / BACK));
                return overlay("Back to rest", swung(ctx.present, deg * (1 - p)), [work(r)]);
              },
            };
          },
        },
      ],
      hints: {
        observe: `Run Push and watch the ${child}. Your push closes it only partway.`,
        principle: `The ${child} on its hinge is a lever. The force at the short end is your push times the arm ratio, your distance from the hinge divided by the short end's. Its travel is your travel divided by the same ratio.`,
        direction: `Raise the arm ratio until ${HAND_N} N becomes at least ${JOB_N} N at the short end, and stop before its travel drops under ${JOB_MM} mm. Check Push and Swing together.`,
        low: "Too little force reaches the short end, and it stops partway.",
        high: `The short end moves less than ${JOB_MM} mm, and it stops short.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that swings during Push.` },
      missDefault: "That part does not swing during Push. Watch which one turns.",
      why: "A hinged part is a lever. Pushing farther from the hinge than the load multiplies your force by the arm ratio and divides your travel by it. No work is gained, only a trade of force for distance.",
      gameNote: `Game numbers: your hand pushes ${HAND_N} N and moves ${HAND_MM} mm at the far end of the ${child}, and the short end has to push ${JOB_N} N and move ${JOB_MM} mm. Where the hinge sits is a guess from the part's shape, and the job at the short end is not read from the ${pair.objectName}. The lever law is real. The purple block marks the short end.`,
      numbers: (v) => {
        const r = ratioOf(v);
        return [
          { label: "At the short end", value: `${HAND_N} N × ${r} = ${tenth(HAND_N * r)} N (needs ${JOB_N} N)` },
          { label: "Short end travel", value: `${HAND_MM} mm ÷ ${r} = ${tenth(HAND_MM / r)} mm (needs ${JOB_MM} mm)` },
        ];
      },
    };
  },
};
