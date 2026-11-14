// The lesson as data. A Lesson is either a hand-written Workshop (modules that each teach a
// primitive, earn kit parts, and break one tunable value for the sandbox) or an Inspect lesson
// derived from any kit. Lessons never hold a kit: they are bound to one at run time, and a
// Workshop only binds to a kit that has every part it names.
import type { Kit, Part, Shape } from "../../shared/kit.ts";
import { PRIMITIVES, type Primitive, type Readout, type Slider } from "../../src/primitives/library.ts";

export type Vec = { x: number; y: number; z: number };
export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
export type Axis = "x" | "y" | "z";
export const AXIS: Record<Axis, Vec> = { x: vec(1, 0, 0), y: vec(0, 1, 0), z: vec(0, 0, 1) };

export type Window = readonly [number, number];
/** Camera angles in degrees: azimuth 0 looks from +z, 90 from +x. */
export type View = { elevation: number; azimuth: number };
export const DEFAULT_VIEW: View = { elevation: 20, azimuth: 30 };
/** Tuned values keyed by each module's fault key (its slider's id unless the module names another). Keys are unique in a lesson. */
export type Values = Readonly<Record<string, number>>;

/** A turn about `axis` through `pivot`, both in the kit's frame before any offset is applied. */
export type Turn = { axis: Vec; pivot: Vec; deg: number };
/** How one part sits away from its kit pose: turned in list order, then shifted by `offset`. */
export type PartMove = { offset?: Vec; turns?: readonly Turn[] };
/** A purple annotation (water drop, turn mark, target). It moves with part `ride`, or stays in the world frame when `ride` is null. */
export type Mark = { id: string; shape: Shape; at: Vec; rotation?: Vec; ride: string | null };
export type Scene = { moves: Readonly<Record<string, PartMove>>; marks: readonly Mark[] };
/** The whole object shifted in mm and tipped by `angle` degrees about z through its resting centre. */
export type Rigid = { dx: number; dy: number; angle: number };
/** What a test does to the object at one moment, on top of the lesson's resting scene. */
export type Overlay = Scene & { rigid: Rigid; live: string };

export const STILL: Rigid = { dx: 0, dy: 0, angle: 0 };
export const EMPTY_SCENE: Scene = { moves: {}, marks: [] };

export type Ctx = { kit: Kit; present: readonly string[] };
export type TestCtx = Ctx & { centre: Vec };
export type Verdict = { pass: boolean; line: string; nudge?: string };
export type Run = { verdict: Verdict; durationMs: number; at: (ms: number) => Overlay };
export type Test = { id: string; label: string; run: (values: Values, ctx: TestCtx) => Run };

export type Target = { label: string; at: Vec; ring: { radius: number; axis: Axis } };

/**
 * Guidance revealed one per failed test run: what to watch, the principle in terms of the primitive
 * just learned, then which way to move the slider and what goes wrong on each side of the band.
 */
export type Hints = {
  observe: string;
  principle: string;
  direction: string;
  /** What fails below the fix window. */
  low: string;
  /** What fails above the fix window. */
  high: string;
};

export type Module = {
  id: string;
  title: string;
  /** The requirement, in the user's terms. */
  need: string;
  /** Taught in order: the elements the main primitive is made of, then the main primitive. */
  teach: readonly Primitive[];
  /** The primitive that becomes the part in the assemble stage. */
  main: Primitive;
  /**
   * Assemble copy. `piece` names what floats in (the focus pieces of the taught primitives), `title`
   * says what it becomes in this object, and `built` says what it is once placed.
   */
  assemble: { piece: string; title: string; built: string };
  /** Kit part ids this module earns. */
  produces: readonly string[];
  target: Target;
  /** Where the produced parts fly in from, relative to where they sit. */
  enter: Vec;
  /** `key` is where the tuned value lives in Values. */
  fault: { primitive: Primitive; slider: Slider; start: number; key: string };
  /** Slider values that pass every test, with the other modules at the middle of their windows. Values on both sides of it fail. */
  fix: { window: Window };
  tests: readonly Test[];
  hints: Hints;
  /** The kit part the user must tap to diagnose before the fix control unlocks. */
  suspect: string;
  /** What to say when another part is tapped instead, by part id. */
  misses: Readonly<Record<string, string>>;
  missDefault: string;
  /** Shown when the module is earned. */
  why: string;
  /** What in the rules is a game number rather than a measured fact. */
  gameNote: string;
  /** Values for the fault primitive's other sliders, so its library readouts describe this object. */
  readoutWith?: (value: number) => Values;
  /** The object's own numbers at the current tuning, shown beside the fix control. */
  numbers: (values: Values) => readonly Readout[];
};

export type Workshop = {
  kind: "workshop";
  /** The sample id this lesson was written for. */
  id: string;
  objectName: string;
  /** Matches a scanned object's name to this lesson. */
  match: RegExp;
  modules: readonly Module[];
  final: { need: string; success: string; detail: string; tests: readonly Test[] };
  /** The object at rest for a set of present parts: seating offsets and fixed marks. */
  rest: (ctx: Ctx) => Scene;
  /** Where each part sits when fully exploded, as an offset. Parts left out move away from the main part, further the later they come in the kit. */
  apart?: Readonly<Record<string, Vec>>;
  /** How the object is seen while it is built and tested; DEFAULT_VIEW when unset. */
  view?: View;
};

export type Inspect = {
  kind: "inspect";
  objectName: string;
  /** Library primitives the kit's joints map to, with the parts held by each. Empty for a plain structure. */
  teach: readonly { primitive: Primitive; joints: readonly string[]; parts: readonly Part[] }[];
  /** Quiz order: each prompt is a part, asked by its kit role text. */
  prompts: readonly Part[];
};

export type Lesson = Workshop | Inspect;

export type ModuleSpec = Omit<Module, "teach" | "main" | "fault" | "enter"> & {
  primitive: string;
  /** Primitive ids taught, in order, when the module teaches more than the main primitive's own parts (it must include `primitive`). */
  teach?: readonly string[];
  /** `key` defaults to the slider id; set it when two modules tune sliders with the same id (a press-fit's and a seal's squeeze). */
  fault: { primitive: string; slider: string; start: number; key?: string };
  enter?: Vec;
};
export type WorkshopSpec = Omit<Workshop, "kind" | "modules" | "rest"> & { modules: ModuleSpec[]; rest?: Workshop["rest"] };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A scanned kit as the lessons show it: part names start with a capital, whatever the scan wrote. */
export const tidyKit = (kit: Kit): Kit => ({ ...kit, parts: kit.parts.map((p) => ({ ...p, name: capital(p.name) })) });

/** "A", "A and B", "A, B and C". */
export const listOf = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function primitiveById(id: string): Primitive {
  const p = PRIMITIVES.find((q) => q.id === id);
  if (!p) throw new Error(`no primitive ${id}`);
  return p;
}

/** A fix that cannot fail on one side is a trivial slider, so every window keeps this many steps clear of each end. */
const ROOM_STEPS = 2;

/** Resolves primitive ids and checks the rules a lesson must keep, so a broken lesson fails when it loads rather than mid-game. */
export function defineLesson(spec: WorkshopSpec): Workshop {
  const problems: string[] = [];
  const keys = new Set<string>();
  const testIds = new Map<string, Test>();
  const track = (t: Test) => {
    const seen = testIds.get(t.id);
    if (seen && seen !== t) problems.push(`two different tests share the id ${t.id}`);
    testIds.set(t.id, t);
  };
  const modules = spec.modules.map((m): Module => {
    const main = primitiveById(m.primitive);
    const teach = [...new Set(m.teach ?? [...main.madeOf, main.id])].map(primitiveById);
    if (!teach.includes(main)) problems.push(`${m.id}: the main primitive ${main.id} is not taught in this module`);
    const primitive = primitiveById(m.fault.primitive);
    const slider = primitive.sliders.find((s) => s.id === m.fault.slider);
    if (!teach.includes(primitive)) problems.push(`${m.id}: fault primitive ${primitive.id} is not taught in this module`);
    if (!slider) throw new Error(`${spec.id}/${m.id}: ${primitive.id} has no slider ${m.fault.slider}`);
    const key = m.fault.key ?? slider.id;
    if (keys.has(key)) problems.push(`${m.id}: tuning key ${key} is used by two modules`);
    keys.add(key);
    const [lo, hi] = m.fix.window;
    const room = ROOM_STEPS * slider.step - 1e-9;
    if (!(lo < hi && lo - slider.min >= room && slider.max - hi >= room))
      problems.push(`${m.id}: fix window ${lo}..${hi} needs at least ${ROOM_STEPS} slider steps of room on both sides inside ${slider.min}..${slider.max}`);
    if (m.fault.start >= lo && m.fault.start <= hi) problems.push(`${m.id}: the fault starts inside the fix window`);
    if (m.tests.length === 0) problems.push(`${m.id}: no tests`);
    m.tests.forEach(track);
    return { ...m, teach, main, fault: { primitive, slider, start: m.fault.start, key }, enter: m.enter ?? vec(0, 50, 0) };
  });
  spec.final.tests.forEach(track);
  if (problems.length > 0) throw new Error(`lesson ${spec.id}:\n${problems.join("\n")}`);
  return { ...spec, kind: "workshop", modules, rest: spec.rest ?? (() => EMPTY_SCENE) };
}

/** Kit part ids the lesson names that the kit lacks. A lesson binds to a kit only when this is empty. */
export function missingParts(lesson: Workshop, kit: Kit): string[] {
  const named = lesson.modules.flatMap((m) => [...m.produces, m.suspect, ...Object.keys(m.misses)]);
  const ids = new Set(kit.parts.map((p) => p.id));
  return [...new Set(named)].filter((id) => !ids.has(id));
}

/** Part ids present once modules up to and including `index` are earned. Parts no module produces are there from the start. */
export function presentAfter(lesson: Workshop, kit: Kit, index: number): string[] {
  const later = new Set(lesson.modules.slice(index + 1).flatMap((m) => m.produces));
  return kit.parts.filter((p) => !later.has(p.id)).map((p) => p.id);
}

export const midWindow = (s: Slider, [lo, hi]: Window) => Number((Math.round((lo + hi) / 2 / s.step) * s.step).toFixed(6));

/** Every value the slider can take, snapped to its step. */
export const sliderSteps = (s: Slider): number[] =>
  Array.from({ length: Math.round((s.max - s.min) / s.step) + 1 }, (_, i) => Number((s.min + i * s.step).toFixed(6)));

/** Whether every one of the module's tests passes with its slider at `value` and the rest of the tuning as given. */
export const passesAt = (module: Module, values: Values, value: number, ctx: TestCtx) =>
  module.tests.every((t) => t.run({ ...values, [module.fault.key]: value }, ctx).verdict.pass);

/** The lowest and highest slider values that pass every test at this tuning, or null when none does. */
export function passBand(module: Module, values: Values, ctx: TestCtx): Window | null {
  const passing = sliderSteps(module.fault.slider).filter((v) => passesAt(module, values, v, ctx));
  return passing.length > 0 ? [passing[0]!, passing[passing.length - 1]!] : null;
}

/**
 * The primitives whose focus pieces float in at assemble: the main one, plus any taught primitive that
 * is not one of its components (the ball's seal beside the wheel, but not the catch's own wedge).
 */
export const assembledFrom = (m: Module): Primitive[] => [m.main, ...m.teach.filter((p) => p !== m.main && !m.main.madeOf.includes(p.id))];

/** The values every module starts the sandbox with: each at its fault. */
export const faultValues = (lesson: Workshop): Values => Object.fromEntries(lesson.modules.map((m) => [m.fault.key, m.fault.start]));
/** The values that pass every test: each slider in the middle of its fix window. */
export const fixedValues = (lesson: Workshop): Values => Object.fromEntries(lesson.modules.map((m) => [m.fault.key, midWindow(m.fault.slider, m.fix.window)]));
