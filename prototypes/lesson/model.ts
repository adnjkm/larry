// The lesson as data. A Lesson is an object (its scanned kit) plus ordered modules; each module
// teaches library primitives, earns kit parts, and breaks one tunable value for the sandbox.
import type { Kit } from "../../shared/kit.ts";

export type Stage = "learn" | "assemble" | "sandbox" | "earned";
export type TestId = "flip" | "shake" | "open";
export type Window = readonly [number, number];

export type Module = {
  id: string;
  title: string;
  /** The requirement, in the user's terms. */
  need: string;
  /** Library primitive ids taught here. The last is the one that becomes the part; the rest are what it is made of. */
  primitives: string[];
  /** Kit part ids this module earns. */
  produces: string[];
  /** Where the part goes in the assemble stage, as a height on the bottle in mm. */
  target: { label: string; y: number };
  /** The sandbox starts with this slider of this primitive at this value. */
  fault: { primitive: string; slider: string; start: number };
  /** Slider values that pass every test. */
  fix: { window: Window };
  tests: TestId[];
  /** Guidance revealed one per failed test run. */
  hints: string[];
  /** The kit part the user must tap to diagnose before the fix control unlocks. */
  suspect: string;
  /** What to say when another part is tapped instead, by part id. */
  misses: Record<string, string>;
  missDefault: string;
  /** Shown when the module is earned. */
  why: string;
  /** What in the rules is a game number rather than a measured fact. */
  gameNote: string;
};

export type Lesson = {
  objectName: string;
  kit: Kit;
  modules: Module[];
  final: { need: string; success: string };
};

/** Pitch at or below this keeps the cap on. Game number: real bottle threads are far shallower. */
export const PITCH_WINDOW: Window = [2, 4];
/** Squeeze that fills the gaps without crushing the rubber. The 15 to 30 percent band is the typical range for static seals. */
export const SQUEEZE_WINDOW: Window = [0.15, 0.3];

const twist: Module = {
  id: "twist",
  title: "Close with a twist",
  need: "It must close with a twist and stay shut when shaken.",
  primitives: ["thread"],
  produces: ["cap"],
  target: { label: "Neck", y: 190 },
  fault: { primitive: "thread", slider: "pitch", start: 6 },
  fix: { window: PITCH_WINDOW },
  tests: ["shake", "open"],
  hints: [
    "Run Shake again and watch the cap. It climbs a little every time. Something that should hold it down is too weak.",
    "A thread is a ramp wound around the neck. On a steep ramp, a jolt is enough to push the cap up it.",
    "Make the ramp shallower. Pitch is how far the cap climbs per turn. The band on the slider now marks the range worth trying.",
  ],
  suspect: "cap",
  misses: {
    body: "The body is what everything else rides on. Look for the part that moves relative to it.",
  },
  missDefault: "That part stays where it is during Shake. Watch which one moves.",
  why: "A thread is a wedge wrapped round a rod. A shallow one makes the cap climb slowly, and real threads mostly stay put by friction, which grows as the thread gets shallower. Finer pitch costs more turns to close.",
  gameNote: "Game numbers: the cap walks off above 4 mm of pitch, 12 mm of thread is engaged, and each shake lifts it by 4 mm for every mm over 4. Real bottle threads are shallower than this, so the failure is exaggerated to make it visible.",
};

const dry: Module = {
  id: "dry",
  title: "Stay dry upside down",
  need: "It must stay dry upside down and still open by hand.",
  primitives: ["seal"],
  produces: ["seal-ring", "ring-tab"],
  target: { label: "Neck joint", y: 180 },
  fault: { primitive: "seal", slider: "squeeze", start: 0.03 },
  fix: { window: SQUEEZE_WINDOW },
  tests: ["flip", "open"],
  hints: [
    "Run Flip and watch where the drops start. They come out at the joint between the cap and the neck.",
    "Two hard surfaces never fit perfectly. Rubber stops a leak by being squeezed into the gaps between them. Squeeze it too little and the gaps stay open.",
    "Squeeze more, but not too far. Crushed rubber grips the cap so hard that a hand cannot turn it. Check Flip and Open together. The band on the slider marks the range worth trying.",
  ],
  suspect: "seal-ring",
  misses: {
    body: "That holds the water, but it isn't where it leaks. Run Flip and watch where the drops start.",
    cap: "The cap stays on tight. The drops start lower, in the gap between the cap and the neck.",
    "ring-tab": "The tab is only a handle for your fingers. It never touches the water.",
  },
  missDefault: "That isn't where the water gets out. Run Flip and watch where the drops start.",
  why: "A rubber ring squeezed about 15 to 30 percent is pressed into the tiny gaps in the joint and closes them. Less leaks. More is crushed, and the cap becomes too hard to twist. Static seals are typically squeezed in that range.",
  gameNote: "Game numbers: a hand gives about 2.5 N·m, and the torque to open is taken as 0.4 + 7 × squeeze in N·m. The 15 to 30 percent band is the typical range for static seals, not a measured limit for this bottle.",
};

export const BOTTLE_MODULES: Module[] = [twist, dry];

export const BOTTLE_FINAL: Lesson["final"] = {
  need: "It must stay shut when shaken, stay dry upside down, and open by hand.",
  success: "You built a water bottle.",
};

export const FINAL_TESTS: TestId[] = ["flip", "shake", "open"];

export const TEST_LABEL: Record<TestId, string> = { flip: "Flip", shake: "Shake", open: "Open" };

/** Part ids present once the modules up to and including `index` are earned. */
export function presentAfter(lesson: Lesson, index: number): string[] {
  const root = lesson.kit.parts.find((p) => p.parentId === null)?.id ?? "body";
  return [root, ...lesson.modules.slice(0, index + 1).flatMap((m) => m.produces)];
}
