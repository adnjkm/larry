// Types for the primitives library. Two levels:
// - Element: one piece, one job, one number, and it can't be made from the others.
// - Mechanism: two or three elements combined to do one new job none of them does alone.
import type { Part } from "../../shared/kit.ts";

export type Slider = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** Shown after the value. */
  unit?: string;
  /** Multiplies the value for display, e.g. 100 to show a fraction as a percentage. */
  displayScale?: number;
};

export type Values = Record<string, number>;
export type Readout = { label: string; value: string };

export type Level = "Element" | "Mechanism";

export type Primitive = {
  id: string;
  name: string;
  level: Level;
  /** The job, one line, from the library table. */
  job: string;
  /** A short paragraph for curious adults. Physics claims here are checked by hand; say what is left out (friction, mass). */
  howItWorks: string;
  /** Element ids this is made of. Empty for elements. */
  madeOf: string[];
  seenIn: string[];
  /** The first slider is the primitive's one number from the library table; a second, if any, drives the motion. */
  sliders: Slider[];
  view: { elevation: number; azimuth: number };
  build: (v: Values) => Part[];
  readouts: (v: Values) => Readout[];
};
