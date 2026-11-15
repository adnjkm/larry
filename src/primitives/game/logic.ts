// The pure rules of the game page: how a game's data becomes rows on screen. No React, so node --test covers it.
import type { Meter, Slider, Verdict } from "../types.ts";

/** A control with min 0, max 1, step 1 is a toggle. */
export const isToggle = (s: Slider): boolean => s.min === 0 && s.max === 1 && s.step === 1;

export type ControlRow = { kind: "slider"; slider: Slider } | { kind: "toggles"; sliders: Slider[] };

/** Game controls other than the number, in order: consecutive toggles become one row, anything else its own slider row. */
export function controlRows(controls: readonly Slider[], numberId: string): ControlRow[] {
  const rows: ControlRow[] = [];
  for (const s of controls) {
    if (s.id === numberId) continue;
    const last = rows.at(-1);
    if (!isToggle(s)) rows.push({ kind: "slider", slider: s });
    else if (last?.kind === "toggles") last.sliders.push(s);
    else rows.push({ kind: "toggles", sliders: [s] });
  }
  return rows;
}

/** The row label for a run of toggles: the first one's label without its trailing number ("Beat 1" gives "Beat"). */
export function togglesLabel(sliders: readonly Slider[]): string {
  const first = sliders[0]?.label ?? "";
  return first.replace(/[\s\-_#]*\d+$/, "").trim() || first || "Toggles";
}

export const meterMet = (m: Meter): boolean => (m.need === "atLeast" ? m.value >= m.target : m.value <= m.target);

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** Where along the bar (0 to 1) a quantity sits. */
export const meterFraction = (value: number, max: number): number => (max > 0 ? clamp01(value / max) : 0);

/** "<value> of <target> <unit>", the same decimal places for both. */
export const meterText = (m: Meter, value = m.value): string => {
  const d = m.digits ?? 0;
  return `${value.toFixed(d)} of ${m.target.toFixed(d)} ${m.unit}`.trim();
};

/** The longest the meter's text can be (value at the bar's right-hand end), in characters, so its column never changes width mid-run. */
export const meterTextWidth = (m: Meter): number => Math.max(meterText(m).length, meterText(m, m.max).length);

/** The headline as shown: bold, ending in a full stop so the detail after it reads as the next sentence. */
export const headlineText = (v: Verdict): string => (/[.!?…]$/.test(v.headline) ? v.headline : `${v.headline}.`);
/** Everything the verdict line says, as plain text. */
export const verdictText = (v: Verdict): string => `${headlineText(v)} ${v.detail}`;
