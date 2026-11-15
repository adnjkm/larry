import { type Tuning, TUNING } from "../camera/look.ts";

export type Pace = "demo" | "real";
/** The mockup's screens, in the order the flow goes through them. The lesson is only there when a demo gives one. */
export type Screen = "camera" | "model" | "lesson";

/** The model screen, still being tuned. Sizes in CSS px, the tilt in degrees. */
export type ModelLook = {
  /** The model's height at most; it never pushes the pill off the screen. */
  height: number;
  /** How far the model leans, as a product shot is taken at a slight angle. */
  tilt: number;
  /** Steps in the lesson's progress bar, one per mechanism. A stand-in: kits don't list their mechanisms yet. */
  steps: number;
  /** The progress keys' height. */
  keyHeight: number;
};

export const MODEL: ModelLook = { height: 464, tilt: -9, steps: 4, keyHeight: 34 };

/** What the mockup's dials set. */
export type MockSettings = { object: string; pace: Pace; screen: Screen; tab: boolean; showUsable: boolean; tuning: Tuning; model: ModelLook };

export const defaultSettings = (object: string): MockSettings => ({
  object,
  pace: "demo",
  screen: "camera",
  tab: false,
  showUsable: false,
  tuning: TUNING,
  model: MODEL,
});
