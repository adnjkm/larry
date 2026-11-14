// The rules of the game as pure functions: tuning values in, what each test does out.
import { PITCH_WINDOW, SQUEEZE_WINDOW, type TestId } from "./model.ts";
import type { Values } from "../../src/primitives/library.ts";

export const SHAKES = 5;
/** Millimetres of thread the cap rides on. Game number. */
export const ENGAGE = 12;
const LIFT_PER_PITCH_OVER = 4;
export const MAX_DROPS = 12;
const HAND_TORQUE = 2.5;

type Verdict = { pass: boolean; says: string; nudge?: string };

export type Outcome =
  | (Verdict & { test: "flip"; drops: number })
  | (Verdict & { test: "shake"; pitch: number; liftPerShake: number; falls: boolean })
  | (Verdict & { test: "open"; turns: number; torque: number; refuses: boolean });

const pct = (squeeze: number) => Math.round(squeeze * 100);

export function simulate(test: TestId, tuning: Values): Outcome {
  const pitch = tuning.pitch ?? 4;
  const squeeze = tuning.squeeze ?? 0.2;
  switch (test) {
    case "flip": {
      const gap = pct(SQUEEZE_WINDOW[0]) - pct(squeeze);
      const drops = gap > 0 ? Math.max(1, Math.ceil((MAX_DROPS * gap) / pct(SQUEEZE_WINDOW[0]))) : 0;
      return drops === 0
        ? { test, pass: true, drops, says: "Dry. Nothing got past the joint." }
        : { test, pass: false, drops, says: `${drops} drops got past the joint between the cap and the neck.` };
    }
    case "shake": {
      const liftPerShake = Math.max(0, pitch - PITCH_WINDOW[1]) * LIFT_PER_PITCH_OVER;
      if (liftPerShake === 0) return { test, pass: true, pitch, liftPerShake, falls: false, says: "The cap stayed seated through every shake." };
      const falls = liftPerShake * SHAKES >= ENGAGE;
      const says = falls
        ? `The cap walked off the neck on shake ${Math.ceil(ENGAGE / liftPerShake)}.`
        : `The cap crept up ${liftPerShake * SHAKES} mm and would be off in a few more shakes.`;
      return { test, pass: false, pitch, liftPerShake, falls, says };
    }
    case "open": {
      const turns = ENGAGE / pitch;
      const torque = 0.4 + 7 * squeeze;
      const refuses = pct(squeeze) > pct(SQUEEZE_WINDOW[1]);
      return refuses
        ? { test, pass: false, turns, torque, refuses, says: `It refused. It needs ${torque.toFixed(1)} N·m and a hand gives about ${HAND_TORQUE}.`, nudge: "The rubber is gripping the cap far too hard." }
        : { test, pass: true, turns, torque, refuses, says: `Opened by hand in ${turns.toFixed(1)} turns.` };
    }
  }
}
