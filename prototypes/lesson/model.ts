// The lesson as data. A Lesson is either a hand-written Workshop (modules that each teach a
// primitive, earn kit parts, and break one tunable value for the sandbox), a Story (the same
// building, told in words with no numbers: each part's failure first, then a direct control), or an
// Inspect lesson derived from any kit. Lessons never hold a kit: they are bound to one at run time, and a
// Workshop only binds to a kit that has every part it names.
import type { Joint, Kit, Part, Shape } from "../../shared/kit.ts";
import { PRIMITIVES, type Primitive, type Readout, type Slider } from "./primitives/library.ts";
import { PRIMITIVE_BY_ID } from "../../shared/primitives/catalog.ts";

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
/** How one part sits away from its kit pose: turned in list order, then shifted by `offset`. A `shape` is drawn in place of the part's own, for one that changes form (a spring squashed); `offset` then places the new shape. */
export type PartMove = { offset?: Vec; turns?: readonly Turn[]; shape?: Shape };
/** One assembly leaving the object: part `id` and every part fixed to it (see familyOf) ride one spring, and `at` is where they sit a `share` of the way out, 0 home and 1 apart. */
export type Leave = {
  id: string;
  at: (share: number) => PartMove;
  /** Stays partly inside the assemblies round it when apart, like a refill in its barrel. */
  sleeved?: true;
};
/** How an object comes apart: its assemblies in the order they leave, outside first. Parts in none of them stay put. */
export type ExplodePlan = { order: readonly Leave[] };
/** How far out each assembly of an ExplodePlan is right now, by its id. */
export type Shares = Readonly<Record<string, number>>;

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
  /**
   * One plain sentence per taught primitive, keyed by its id: what that primitive does in this
   * object (the thread is the spiral on the neck), never what it is made of. Learn shows it beside
   * the object with this module's parts in pink.
   */
  uses: Readonly<Record<string, string>>;
  /** What to do once the fault is found, in at most TASK_WORDS words. */
  task: string;
  /** Shown when the module is earned. */
  why: string;
  /** What in the rules is a game number rather than a measured fact. */
  gameNote: string;
  /** Values for the fault primitive's other sliders, so its library readouts describe this object. */
  readoutWith?: (value: number) => Values;
  /**
   * The fault primitive's library readouts are shown beside the fix "as in Learn". Hide them when
   * numbers fixed in the primitive (the lever's 100 N load and 150 mm bar) would sit beside different
   * numbers of this object's, so the fix card never shows two answers to one question.
   */
  hideLearnReadouts?: true;
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
  build?: BuildStyle;
};

/** How a Build step is played: tap the piece then its ring, or drag the real piece onto its ghost. Tap when unset. */
export type BuildStyle = "tap" | "drag";

export type Inspect = {
  kind: "inspect";
  objectName: string;
  /** Library primitives the kit's joints map to, with the parts held by each. Empty for a plain structure. */
  teach: readonly { primitive: Primitive; joints: readonly string[]; parts: readonly Part[] }[];
  /** Quiz order: each prompt is a part, asked by its kit role text. */
  prompts: readonly Part[];
  view: View;
};

/** What Assemble reads from any module that builds a part, whatever game the module plays. */
export type Built = Pick<Module, "id" | "title" | "teach" | "main" | "assemble" | "produces" | "target" | "enter">;
/** What Assemble reads from any lesson that builds its object module by module. */
export type Builds = Pick<Workshop, "objectName" | "rest" | "apart" | "view" | "build"> & { modules: readonly Built[]; explode?: ExplodePlan };

/** A stretch of a control's travel that feels and reads one way. `until` is where it ends; `gain` is how far the control moves per pixel dragged, so a stiff zone takes more dragging. */
export type Zone = { id: string; word: string; until: number; gain: number };

/**
 * Something the player does to the object by dragging (twist the cap on), shown only in words. Its
 * value runs from 0 through `zones` in order and stops at the last zone's `until`. `pose` is the
 * object at a value, on top of the lesson's rest; the tests start from the same pose.
 */
export type Control = {
  key: string;
  verb: string;
  start: number;
  zones: (ctx: Ctx) => readonly Zone[];
  pose: (value: number, ctx: Ctx) => Scene;
};

/** The zone a control's value sits in. The grip's word and every test read it here, so the word never disagrees with the result. */
export const zoneAt = (zones: readonly Zone[], value: number): Zone => zones.find((z) => value < z.until - 1e-9) ?? zones[zones.length - 1]!;

/** Word-only controls for one taught primitive in Learn: the sliders to show, by id, with their labels, and why it matters in this object. */
export type Rig = {
  controls: Readonly<Record<string, string>>;
  why: readonly string[];
  /**
   * Set when the primitive can be tuned to meet the module's requirement in a way that reads at a glance: the slider
   * starts at `start`, each zone says in a word how it does ("Leaks", "Sealed", "Crushed"), and `meets` is the zone
   * that meets the requirement. Left off where tuning would not be intuitive (the thread: the next page's grip does it).
   */
  goal?: { slider: string; start: number; zones: readonly Zone[]; meets: string };
};

/**
 * A module told as a story with no numbers: the object fails without this part, the primitive is
 * played with in words, the part is built, and the player makes it work with a direct control.
 */
/** A place on the object the piece can be put in the "Find the spot" game, in the kit's own mm. */
export type Spot = {
  id: string;
  /** Where the piece's middle goes, on the object's upright axis. */
  at: Vec;
  /** How far round the axis the piece reaches there: a ring is scaled to wrap the object at this spot. */
  radius: number;
  /** The one spot where the piece belongs. */
  right?: true;
  /** What happens there, in a few words: why it fails, or why it works. */
  line: string;
};

/**
 * "Find the spot": after Learn, the player drags the primitive's piece onto the object, choosing between a few
 * outlined spots. A wrong spot runs the module's own failure (its `without` test) with the piece where it was put, so
 * it visibly goes wrong; the right one seats it. The standard play step for a primitive (the project owner's call,
 * 2026-11-14): every module should have one.
 */
export type Place = {
  say: string;
  /** The kit parts that make the piece, at their own home in the object. The first is the one its size is read from. */
  piece: readonly string[];
  /** The part a misplaced piece rides when a test moves the object. */
  ride: string;
  spots: readonly Spot[];
  /** True when the piece is what the module builds, so placing it right is the Build step and that step is skipped. */
  builds?: boolean;
  /** Parts left off while the player looks for the spot because they would cover it (the cap over the seal). */
  hide?: readonly string[];
};

export type StoryModule = Built & {
  /** The requirement this module meets, as a plain rule shown above the header: "Water must not leak." */
  need?: string;
  /** The "Find the spot" game after Learn. */
  place?: Place;
  /** One sentence per taught primitive, keyed by its id: what it does in this object. */
  uses: Readonly<Record<string, string>>;
  /**
   * Shown first: the object without this module's parts failing the job they do. `adds` are parts
   * shown that the module has not built yet (a cap that only rests on the neck); `values` set the
   * controls for that run.
   */
  without: { say: string; line: string; test: Test; adds: readonly string[]; values: Values };
  learn: { say: string; rigs: Readonly<Record<string, Rig>> };
  play: { say: string; control: Control; tests: readonly Test[] };
  /** Pointers revealed one per failed run: what to look at or do. */
  hints: readonly string[];
  /** Why this part exists and what breaks without it. */
  why: readonly string[];
  /** The part's job in one line, said when it is earned. */
  job: string;
  /** Two or three words that pop up when the fix works, e.g. "Locked on!". */
  cheer: string;
};

export type Story = {
  kind: "story";
  id: string;
  objectName: string;
  match: RegExp;
  modules: readonly StoryModule[];
  /** `payoff` names each part's job once the whole object works. */
  final: {
    title: string;
    say: string;
    success: string;
    cheer: string;
    control: Control;
    tests: readonly Test[];
    why: readonly string[];
    payoff: readonly { part: string; job: string }[];
  };
  rest: (ctx: Ctx) => Scene;
  apart?: Readonly<Record<string, Vec>>;
  /** Assemblies that come apart on their own springs, in place of `apart`. */
  explode?: ExplodePlan;
  /**
   * A hand-made model drawn in place of the scanned kit (see bindStory). Its part ids include every
   * id the lesson names, as the roots of its assemblies; detail parts hang off them by fixed joints.
   */
  kit?: Kit;
  view?: View;
  build?: BuildStyle;
};

export type StoryModuleSpec = Omit<StoryModule, "teach" | "main" | "enter"> & { primitive: string; teach?: readonly string[]; enter?: Vec };
export type StorySpec = Omit<Story, "kind" | "modules" | "rest"> & { modules: StoryModuleSpec[]; rest?: Story["rest"] };

export type Lesson = Workshop | Inspect | Story;

export type ModuleSpec = Omit<Module, "teach" | "main" | "fault" | "enter"> & {
  primitive: string;
  /** Primitive ids taught, in order, when the object uses more than the main primitive here (it must include `primitive`). Never the primitive's own components: Learn teaches what this object uses. */
  teach?: readonly string[];
  /**
   * `key` defaults to the slider id; set it when two modules tune sliders with the same id (a press-fit's and a seal's squeeze).
   * `range` fits the primitive's slider to this object (a mug's mass, not the pendulum's 1 to 5 kg); Learn uses it too.
   */
  fault: { primitive: string; slider: string; start: number; key?: string; range?: Partial<Pick<Slider, "label" | "min" | "max" | "step" | "initial">> };
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

/**
 * A story teaches from the shared library in src/primitives, the figures every photo's lesson draws on. Workshops keep
 * the frozen copy in ./primitives, since their fault values were tuned on its slider ranges.
 */
export function libraryPrimitive(id: string): Primitive {
  const p = PRIMITIVE_BY_ID.get(id);
  if (!p) throw new Error(`no primitive ${id} in the library`);
  return p;
}

/** On-screen instructions stay this short; the explanation lives behind Why. */
export const TASK_WORDS = 8;
const words = (s: string) => s.trim().split(/\s+/).length;

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
    const teach = [...new Set(m.teach ?? [main.id])].map(primitiveById);
    if (!teach.includes(main)) problems.push(`${m.id}: the main primitive ${main.id} is not taught in this module`);
    const uses = Object.keys(m.uses);
    for (const p of teach) if (!m.uses[p.id]) problems.push(`${m.id}: no line saying what the ${p.id} does in this object`);
    for (const id of uses) if (!teach.some((p) => p.id === id)) problems.push(`${m.id}: a use line for ${id}, which this module does not teach`);
    if (words(m.task) > TASK_WORDS) problems.push(`${m.id}: task "${m.task}" is over ${TASK_WORDS} words`);
    const primitive = primitiveById(m.fault.primitive);
    const own = primitive.sliders.find((s) => s.id === m.fault.slider);
    if (!teach.includes(primitive)) problems.push(`${m.id}: fault primitive ${primitive.id} is not taught in this module`);
    if (!own) throw new Error(`${spec.id}/${m.id}: ${primitive.id} has no slider ${m.fault.slider}`);
    const slider: Slider = { ...own, ...m.fault.range };
    if (slider.initial < slider.min || slider.initial > slider.max) problems.push(`${m.id}: slider ${slider.id} starts outside ${slider.min}..${slider.max}`);
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

const learnLists = new WeakMap<Module | StoryModule, Primitive[]>();

/** A story lesson says everything in words, so any digit in its copy is a mistake caught when it loads. */
const DIGIT = /\d/;

/** Resolves a story lesson's primitives and checks its copy: short instructions, no numbers, a rig and a use line for every taught primitive. */
export function defineStory(spec: StorySpec): Story {
  const problems: string[] = [];
  const copy: [string, string][] = [
    ["object name", spec.objectName],
    ["final title", spec.final.title],
    ["final say", spec.final.say],
    ["final success", spec.final.success],
    ["final cheer", spec.final.cheer],
    ...spec.final.why.map((s): [string, string] => ["final why", s]),
    ...spec.final.payoff.flatMap((p): [string, string][] => [
      ["final payoff", p.part],
      ["final payoff", p.job],
    ]),
  ];
  const short = (where: string, s: string) => {
    if (words(s) > TASK_WORDS) problems.push(`${where} "${s}" is over ${TASK_WORDS} words`);
  };
  short("final say", spec.final.say);
  const modules = spec.modules.map((m): StoryModule => {
    const main = libraryPrimitive(m.primitive);
    const teach = [...new Set(m.teach ?? [main.id])].map(libraryPrimitive);
    if (!teach.includes(main)) problems.push(`${m.id}: the main primitive ${main.id} is not taught in this module`);
    for (const p of teach) {
      if (!m.uses[p.id]) problems.push(`${m.id}: no line saying what the ${p.id} does in this object`);
      const rig = m.learn.rigs[p.id];
      if (!rig) problems.push(`${m.id}: no word-only rig for the ${p.id}`);
      for (const id of Object.keys(rig?.controls ?? {})) if (!p.sliders.some((s) => s.id === id)) problems.push(`${m.id}: the ${p.id} has no slider ${id}`);
      if (rig && Object.keys(rig.controls).length === 0) problems.push(`${m.id}: the ${p.id} rig shows no control`);
      if (rig?.goal && !rig.controls[rig.goal.slider]) problems.push(`${m.id}: the ${p.id} goal tunes ${rig.goal.slider}, which the rig does not show`);
      if (rig?.goal && !rig.goal.zones.some((z) => z.id === rig.goal!.meets)) problems.push(`${m.id}: the ${p.id} goal has no zone ${rig.goal.meets}`);
    }
    if (m.play.tests.length === 0) problems.push(`${m.id}: no tests`);
    for (const [where, s] of [
      ["without say", m.without.say],
      ["learn say", m.learn.say],
      ["play say", m.play.say],
      ["job", m.job],
      ["cheer", m.cheer],
    ] as const)
      short(`${m.id}: ${where}`, s);
    if (m.need !== undefined) short(`${m.id}: need`, m.need);
    if (m.place) {
      short(`${m.id}: place say`, m.place.say);
      if (m.place.spots.filter((p) => p.right).length !== 1) problems.push(`${m.id}: the place game needs exactly one right spot`);
      copy.push([`${m.id} place`, m.place.say], ...m.place.spots.map((p): [string, string] => [`${m.id} spot ${p.id}`, p.line]));
    }
    copy.push(
      [`${m.id} title`, m.title],
      [`${m.id} without`, m.without.say],
      [`${m.id} without`, m.without.line],
      [`${m.id} learn`, m.learn.say],
      [`${m.id} play`, m.play.say],
      [`${m.id} verb`, m.play.control.verb],
      [`${m.id} job`, m.job],
      ...Object.values(m.assemble).map((s): [string, string] => [`${m.id} assemble`, s]),
      ...Object.values(m.uses).map((s): [string, string] => [`${m.id} uses`, s]),
      ...[...m.hints, ...m.why].map((s): [string, string] => [`${m.id} sheet`, s]),
      ...Object.values(m.learn.rigs)
        .flatMap((r) => [...Object.values(r.controls), ...r.why, ...(r.goal?.zones.map((z) => z.word) ?? [])])
        .map((s): [string, string] => [`${m.id} rig`, s]),
      ...(m.need === undefined ? [] : [[`${m.id} need`, m.need] as [string, string]]),
    );
    return { ...m, teach, main, enter: m.enter ?? vec(0, 50, 0) };
  });
  for (const [where, s] of copy) if (DIGIT.test(s)) problems.push(`${where} has a number: "${s}"`);
  if (problems.length > 0) throw new Error(`lesson ${spec.id}:\n${problems.join("\n")}`);
  return { ...spec, kind: "story", modules, rest: spec.rest ?? (() => EMPTY_SCENE) };
}

/** The primitives a story module's Learn shows, each with only the sliders its rig names, relabelled in words. */
export function rigList(m: StoryModule): Primitive[] {
  const known = learnLists.get(m);
  if (known) return known;
  const list = m.teach.map((p) => {
    const controls = m.learn.rigs[p.id]?.controls ?? {};
    return { ...p, sliders: p.sliders.flatMap((s) => (controls[s.id] ? [{ ...s, label: controls[s.id]! }] : [])) };
  });
  learnLists.set(m, list);
  return list;
}

/** The primitives a module's Learn stage shows: its fault primitive with the slider fitted to this object. The same array every call, so Learn's figures are not rebuilt on every render. */
export function learnList(m: Module): Primitive[] {
  const known = learnLists.get(m);
  if (known) return known;
  const list = m.teach.map((p) => (p === m.fault.primitive ? { ...p, sliders: p.sliders.map((s) => (s.id === m.fault.slider.id ? m.fault.slider : s)) } : p));
  learnLists.set(m, list);
  return list;
}

/** Kit part ids the lesson names that the kit lacks. A lesson binds to a kit only when this is empty. */
export function missingParts(lesson: Workshop | Story, kit: Kit): string[] {
  const named =
    lesson.kind === "workshop"
      ? lesson.modules.flatMap((m) => [...m.produces, m.suspect, ...Object.keys(m.misses)])
      : lesson.modules.flatMap((m) => [...m.produces, ...m.without.adds]);
  const ids = new Set((lesson.kind === "story" && lesson.kit ? lesson.kit : kit).parts.map((p) => p.id));
  return [...new Set(named)].filter((id) => !ids.has(id));
}

/** Joints that make two parts one piece: they never come apart, so the pieces move, show and light up together. */
const FIXED: readonly Joint[] = ["molded", "weld", "glue"];
const fixed = (p: Part) => p.joint !== null && FIXED.includes(p.joint);

const families = new WeakMap<Kit, Map<string, string[]>>();
/** Part `id` and every part fixed to it, directly or through another. Asked every frame, so it is worked out once per kit. */
export function familyOf(kit: Kit, id: string): string[] {
  const known = families.get(kit) ?? new Map<string, string[]>();
  families.set(kit, known);
  const seen = known.get(id);
  if (seen) return seen;
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const p of kit.parts) if (p.parentId === out[i] && fixed(p)) out.push(p.id);
  known.set(id, out);
  return out;
}

/** The part that `id` is fixed to, followed up to one that is not fixed to anything. */
export function rootOf(kit: Kit, id: string): string {
  let part = kit.parts.find((p) => p.id === id);
  while (part && fixed(part)) part = kit.parts.find((p) => p.id === part!.parentId);
  return part?.id ?? id;
}

/**
 * The story and the kit it is drawn with. A story with its own model draws that model, and each module
 * earns the parts it names together with every part fixed to them.
 */
export function bindStory(story: Story, scanned: Kit): { story: Story; kit: Kit } {
  const kit = story.kit;
  if (!kit) return { story, kit: scanned };
  const grow = (ids: readonly string[]) => [...new Set(ids.flatMap((id) => familyOf(kit, id)))];
  const modules = story.modules.map((m) => ({ ...m, produces: grow(m.produces), without: { ...m.without, adds: grow(m.without.adds) } }));
  return { kit, story: { ...story, modules } };
}

/** Part ids present once modules up to and including `index` are earned. Parts no module produces are there from the start. */
export function presentAfter(lesson: { modules: readonly { produces: readonly string[] }[] }, kit: Kit, index: number): string[] {
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
export const assembledFrom = (m: Built): Primitive[] => [m.main, ...m.teach.filter((p) => p !== m.main && !m.main.madeOf.includes(p.id))];

/** The values every module starts the sandbox with: each at its fault. */
export const faultValues = (lesson: Workshop): Values => Object.fromEntries(lesson.modules.map((m) => [m.fault.key, m.fault.start]));
/** The values that pass every test: each slider in the middle of its fix window. */
export const fixedValues = (lesson: Workshop): Values => Object.fromEntries(lesson.modules.map((m) => [m.fault.key, midWindow(m.fault.slider, m.fix.window)]));
