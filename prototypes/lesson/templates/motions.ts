// Choreography shared by templates whose child comes straight off its parent: pulled until it holds
// or lets go, and pushed back on until it seats or sticks.
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import type { Run, TestCtx, Verdict } from "../model.ts";
import { add, arrowMark, carry, clearance, farFace, outBy, overlay, type Pair, scale, shudder } from "./pair.ts";

const PULL_MS = 700;
const STRAIN_MM = 1.5;
const HOLD = 700;
const BACK = 650;

/** A pull along the child's axis: it strains and stays, or slides clear and is put back. */
export function pullOff(pair: Pair, ctx: TestCtx, verdict: Verdict, holds: boolean, live: { pulling: string; held: string; off: string }): Run {
  const off = clearance(pair);
  const arrow = arrowMark("pull", add(farFace(pair), scale(pair.out, 18)), pair.out, pair.child.id);
  const d = (ms: number) => (holds ? STRAIN_MM * Math.sin(Math.PI * clamp01(ms / PULL_MS)) : off * smooth(clamp01(ms / PULL_MS)));
  const shifted = (mm: number) => carry(pair, ctx.present, outBy(pair, mm));
  return {
    verdict,
    durationMs: PULL_MS + HOLD + (holds ? 0 : BACK),
    at: (ms) => {
      if (ms < PULL_MS) return overlay(live.pulling, shifted(d(ms)), [arrow]);
      if (ms < PULL_MS + HOLD) return overlay(holds ? live.held : live.off, shifted(d(PULL_MS)), holds ? [arrow] : []);
      const p = smooth(clamp01((ms - PULL_MS - HOLD) / BACK));
      return overlay("Putting it back", shifted(off * (1 - p)));
    },
  };
}

const PUSH_MS = 900;
const STUCK_MS = 900;

/** Starts clear of the parent and is pushed on along its axis: it seats, or sticks partway and shudders. */
export function pushOn(pair: Pair, ctx: TestCtx, verdict: Verdict, goes: boolean, live: { pushing: string; seated: string; stuck: string }): Run {
  const off = clearance(pair);
  const stopAt = goes ? 0 : off * 0.55;
  const tip = arrowMark("push", farFace(pair), scale(pair.out, -1), pair.child.id);
  const shifted = (mm: number) => carry(pair, ctx.present, outBy(pair, mm));
  const lead = 250;
  return {
    verdict,
    durationMs: lead + PUSH_MS + STUCK_MS + (goes ? 0 : BACK),
    at: (ms) => {
      if (ms < lead) return overlay(live.pushing, shifted(off), [tip]);
      const q = easeOut(clamp01((ms - lead) / PUSH_MS));
      const at = off - (off - stopAt) * q;
      if (ms < lead + PUSH_MS) return overlay(live.pushing, shifted(at), [tip]);
      if (ms < lead + PUSH_MS + STUCK_MS) {
        const t = clamp01((ms - lead - PUSH_MS) / STUCK_MS);
        return goes ? overlay(live.seated, shifted(0)) : overlay(live.stuck, shifted(stopAt + 1.2 * shudder(t)), [tip]);
      }
      const p = smooth(clamp01((ms - lead - PUSH_MS - STUCK_MS) / BACK));
      return overlay("Back as it was", shifted(stopAt * (1 - p)));
    },
  };
}
