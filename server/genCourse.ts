// A photo of a click pen to a GenCourse (shared/course/gen.ts): the outside as a kit on Opus, the lesson's few lines
// on Haiku at the same time, one deterministic check, one repair.
import { z } from "zod";
import { TIP_PIECES, courseProblems, textProblems } from "../shared/course/check.ts";
import type { GenCourse, GenMechanism } from "../shared/course/gen.ts";
import { Part } from "../shared/kit.ts";
import { lessonOf, subfunctionsOf, wordsFor } from "../shared/mechanisms/instantiate.ts";
import { KNOWN } from "../shared/mechanisms/library.ts";
import { type Brain, streamStructured } from "./claude.ts";
import { KIT_REPAIR, KIT_SYSTEM_PROMPT, TEXT_SYSTEM_PROMPT } from "./genCoursePrompt.ts";
import { RigError, installPen } from "../prototypes/lesson/gen/rig.ts";
import type { Photo } from "./streamKit.ts";

const Vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

/** A part as the model writes it: a kit part with the placing left to code where code does it better. */
export const DraftPart = Part.omit({ position: true }).extend({
  position: Vec3.nullable().describe(
    "null for a lathe or an extrusion written in real object coordinates (profile y is the real height; outline x is the distance from the axis, y the real height). Otherwise the part's centre, drawn on the +x side at z = 0.",
  ),
  turn: z.number().nullable().describe("Degrees to turn the part round the y axis, from the right-hand side (+x) toward the camera (+z). null for 0."),
  repeat: z
    .object({
      around: z.number().describe("Copies spaced evenly round the y axis."),
      rows: z.array(z.number()).describe("The height (y) of each row of copies."),
      stagger: z.boolean().describe("Shift every other row half a step round."),
    })
    .nullable()
    .describe("A pattern of identical copies of this part. null for a single part."),
});
export type DraftPart = z.infer<typeof DraftPart>;

export const KitDraft = z.object({
  object: z.string().describe('The object\'s name, two words: "Click Pen".'),
  plan: z.string().describe("The measurements and the y extent of every part, worked out before any part is written. Under 120 words."),
  summary: z.string().describe("One plain sentence on how it works."),
  parts: z.array(DraftPart),
  roles: z.object({ case: z.string(), nose: z.string(), button: z.string() }).describe("Part ids."),
});
export type KitDraft = z.infer<typeof KitDraft>;

/** A JSON Schema the Agent SDK takes: no `$schema` dialect line. */
export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema);
  return body;
};
export const kitDraftJsonSchema = jsonSchemaOf(KitDraft);

const DEG = Math.PI / 180;
const round3 = (n: number) => Number(n.toFixed(3));
const middle = (values: number[]) => (Math.min(...values) + Math.max(...values)) / 2;

/** Where a shape written in object coordinates has its centre. */
function ownCentre(part: DraftPart): { x: number; y: number; z: number } {
  if (part.position) return part.position;
  if (part.shape.kind === "lathe") return { x: 0, y: middle(part.shape.profile.map((p) => p.y)), z: 0 };
  if (part.shape.kind === "extrusion") return { x: middle(part.shape.outline.map((p) => p.x)), y: middle(part.shape.outline.map((p) => p.y)), z: 0 };
  throw new Error(`${part.id} is a ${part.shape.kind} and needs a position`);
}

/** One draft part as plain kit parts: placed, turned round the y axis, and copied out when it states a pattern. */
export function expandPart(draft: DraftPart): Part[] {
  const { turn, repeat, position: _position, ...rest } = draft;
  const centre = ownCentre(draft);
  if ((turn || repeat) && draft.rotation.x !== 0) throw new Error(`${draft.id} is turned or repeated, so its rotation x must be 0`);
  /** The part carried `degrees` round the y axis, from +x toward +z, still facing outward. */
  const placed = (id: string, degrees: number, y: number): Part => {
    const [c, s] = [Math.cos(degrees * DEG), Math.sin(degrees * DEG)];
    return {
      ...rest,
      id,
      position: { x: round3(centre.x * c - centre.z * s), y: round3(y), z: round3(centre.x * s + centre.z * c) },
      rotation: { ...draft.rotation, y: round3(draft.rotation.y - degrees) },
    };
  };
  if (!repeat) return [placed(draft.id, turn ?? 0, centre.y)];
  const around = Math.max(1, Math.min(24, Math.round(repeat.around)));
  return repeat.rows.slice(0, 12).flatMap((y, row) =>
    Array.from({ length: around }, (_, k) => {
      const step = k + (repeat.stagger && row % 2 === 1 ? 0.5 : 0);
      return placed(`${draft.id}-${row + 1}-${k + 1}`, (turn ?? 0) + (360 / around) * step, centre.y + y);
    }),
  );
}

/** A draft's parts as a kit's. Parents named by a repeated part's id stay valid only when nothing hangs off a pattern, which the check enforces. */
export const expandParts = (parts: DraftPart[]): Part[] => parts.flatMap(expandPart);

// The lesson's text.

/** The entries this class of object is taught with, in build order: the pen clicks first, then it turns out it cannot write. */
export const PEN_ENTRIES = ["click-latch", "ball-tip"] as const;

/** What the learner does with each assemble piece and what the rig puts on screen, so a tip can point at it. */
export const PIECE_TASKS: Record<string, { subs: string[]; task: string }> = {
  spring: {
    subs: ["bring-back"],
    task: "The learner drags the spring to where it belongs in the open pen. Inside the nose there is a ledge; the refill has a collar that moves down toward that ledge when the tip goes out.",
  },
  cam: {
    subs: ["hold", "take-turns"],
    task: "The learner sees the cam alone, with a rod resting on its rim that stands for the pen's tip, and chooses how far each click turns the cam. The cam's rim has two bumps, opposite each other. The rod is pushed up (tip out) only while a bump is under it.",
  },
  ball: {
    subs: ["close", "roll"],
    task: "The learner drags the ball to where it belongs on the pen. The ink comes down the refill from behind the tip; the paper is below the tip.",
  },
};

const TextDraft = z.object({
  mechanisms: z.array(
    z.object({
      entry: z.string(),
      name: z.string(),
      does: z.string(),
      words: z.array(z.object({ slot: z.string(), phrase: z.string() })),
      tips: z.array(z.object({ piece: z.string(), lines: z.array(z.string()) })),
    }),
  ),
});
export const textDraftJsonSchema = jsonSchemaOf(TextDraft);

/** The library facts the text model writes from, for one object. */
export function textBrief(object: string, entries: readonly string[]): string {
  const blocks = entries.map((id) => {
    const entry = KNOWN.get(id);
    if (!entry) throw new Error(`No mechanism ${id} in the library`);
    const words = wordsFor(entry, []);
    const subs = subfunctionsOf(entry, id, words);
    const { rows } = lessonOf(entry, id, words);
    const fact = (sub: string) => {
      const i = entry.subfunctions.findIndex((s) => s.id === sub);
      return `    - ${subs[i]!.does}. ${rows[i]!.why} Without it: ${rows[i]!.missing}`;
    };
    const pieces = (TIP_PIECES[id] ?? []).map((piece) => `  piece "${piece}"\n    on screen: ${PIECE_TASKS[piece]!.task}\n    facts:\n${PIECE_TASKS[piece]!.subs.map(fact).join("\n")}`);
    return [
      `entry "${id}" (library name: ${entry.name})`,
      `  does, in any object: ${entry.does}.`,
      `  slots: ${entry.slots.map((s) => `${s.id} = ${s.is} (often "${s.default}")`).join("; ")}`,
      ...pieces,
    ].join("\n");
  });
  return `The object: ${object}.\n\n${blocks.join("\n\n")}\n\nWrite one mechanism for each entry, in this order.`;
}

type Text = GenMechanism[];

function textOf(raw: unknown, entries: readonly string[]): Text {
  const draft = TextDraft.parse(raw);
  return entries.map((id) => {
    const entry = KNOWN.get(id)!;
    const m = draft.mechanisms.find((d) => d.entry === id);
    if (!m) throw new Error(`The text has no mechanism ${id}`);
    return {
      entry: id,
      name: m.name.trim(),
      does: m.does.trim(),
      // An unusable phrase falls back to the slot's default.
      words: wordsFor(entry, m.words),
      tips: Object.fromEntries(m.tips.filter((t) => (TIP_PIECES[id] ?? []).includes(t.piece)).map((t) => [t.piece, t.lines.map((l) => l.trim()).slice(0, 4)])),
    };
  });
}

type Call = { output: unknown; costUsd: number; ms: number };

async function ask(request: Omit<Parameters<typeof streamStructured>[0], "streamKey"> & { streamKey?: string }): Promise<Call> {
  const started = Date.now();
  for await (const event of streamStructured({ streamKey: "parts", ...request })) {
    if (event.type === "result") return { output: event.output, costUsd: event.costUsd, ms: Date.now() - started };
  }
  throw new Error("Generation ended without a result");
}

export const COURSE_KIT_BRAIN: Brain = { model: "claude-opus-5-5", effort: "low" };
export const COURSE_TEXT_BRAIN: Brain = { model: "claude-haiku-5-5", effort: "low" };

export type CourseStats = {
  ms: number;
  kitMs: number;
  textMs: number;
  costUsd: number;
  repaired: boolean;
  /** What the check found in the first draft. Empty when it passed as written. */
  problems: string[];
};

export class CourseError extends Error {
  problems: string[];
  course: GenCourse | undefined;
  constructor(message: string, problems: string[], course?: GenCourse) {
    super(`${message}\n${problems.join("\n")}`);
    this.problems = problems;
    this.course = course;
  }
}

/** The lesson's lines for an object: names, one line each, slot words and tips. Needs no photo, so it runs beside the kit. */
export async function generateText(object: string, entries: readonly string[], { brain = COURSE_TEXT_BRAIN, signal }: { brain?: Brain; signal?: AbortSignal } = {}) {
  const brief = textBrief(object, entries);
  const first = await ask({ system: TEXT_SYSTEM_PROMPT, schema: textDraftJsonSchema, brain, content: brief, streamKey: "mechanisms", signal });
  let mechanisms = textOf(first.output, entries);
  let costUsd = first.costUsd;
  const problems = textProblems(mechanisms);
  if (problems.length > 0) {
    const content = `${brief}\n\nYou wrote this before:\n${JSON.stringify(first.output)}\n\nProblems:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nWrite it all again with them fixed.`;
    const second = await ask({ system: TEXT_SYSTEM_PROMPT, schema: textDraftJsonSchema, brain, content, streamKey: "mechanisms", signal });
    mechanisms = textOf(second.output, entries);
    costUsd += second.costUsd;
  }
  return { mechanisms, costUsd };
}

/**
 * Every detail fixed straight to a role part, so it moves and shows with it. A clip drawn on the cap ring is still the
 * case's: it is moved to the role part its chain of parents leads to.
 */
export function fixToRoles(parts: DraftPart[], roles: Record<string, string>): DraftPart[] {
  const roleIds = new Set(Object.values(roles));
  const byId = new Map(parts.map((p) => [p.id, p]));
  return parts.map((part) => {
    if (roleIds.has(part.id) || part.parentId === null || roleIds.has(part.parentId)) return part;
    let parent = byId.get(part.parentId);
    for (let hops = 0; parent && !roleIds.has(parent.id) && hops < parts.length; hops++) parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
    return parent ? { ...part, parentId: parent.id } : part;
  });
}

/** The least a light grey may average on the case and the nose, of 255. The dithered drawing darkens a mid grey to near black. */
const SILVER_FLOOR: Record<string, number> = { case: 214, nose: 192 };

/** A light neutral grey lifted to `floor`. Colours and dark greys are left alone: a black or a blue pen stays as it is. */
export function liftSilver(color: string, floor: number): string {
  const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  const mean = (rgb[0]! + rgb[1]! + rgb[2]!) / 3;
  const neutral = Math.max(...rgb) - Math.min(...rgb) <= 28;
  if (!/^#[0-9a-f]{6}$/i.test(color) || !neutral || mean < 128 || mean >= floor) return color;
  // Lifted and pulled to neutral, since a warm cast on silver is the light's, not the pen's.
  return `#${rgb.map(() => Math.round(floor).toString(16).padStart(2, "0")).join("")}`;
}

function silvered(parts: Part[], roles: Record<string, string>): Part[] {
  return parts.map((part) => {
    const role = Object.keys(SILVER_FLOOR).find((r) => roles[r] === part.id);
    if (!role) return part;
    const color = liftSilver(part.color, SILVER_FLOOR[role]!);
    return color === part.color ? part : { ...part, color, finish: "glossy" };
  });
}

function courseOf(draft: KitDraft, mechanisms: Text): GenCourse {
  return {
    object: draft.object,
    kit: { name: draft.object, summary: draft.summary, parts: silvered(expandParts(fixToRoles(draft.parts, draft.roles)), draft.roles) },
    roles: draft.roles,
    mechanisms,
  };
}

/** The last gate: the rig that fits the works inside has to accept the kit. */
export function rigProblems(course: Pick<GenCourse, "kit" | "roles">): string[] {
  try {
    installPen(course);
    return [];
  } catch (error) {
    if (error instanceof RigError) return [...error.problems];
    throw error;
  }
}

/** A draft as a course, with what is wrong with it. A draft the code cannot expand is a problem too, not a crash. */
function judge(raw: unknown, mechanisms: Text): { draft: KitDraft | undefined; course: GenCourse | undefined; problems: string[] } {
  const parsed = KitDraft.safeParse(raw);
  if (!parsed.success) return { draft: undefined, course: undefined, problems: parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`) };
  try {
    const course = courseOf(parsed.data, mechanisms);
    const patterns = new Set(parsed.data.parts.filter((p) => p.repeat).map((p) => p.id));
    const hung = parsed.data.parts.filter((p) => p.parentId !== null && patterns.has(p.parentId)).map((p) => `${p.id} hangs off the repeated part ${p.parentId}`);
    return { draft: parsed.data, course, problems: [...hung, ...courseProblems(course), ...rigProblems(course)] };
  } catch (error) {
    return { draft: parsed.data, course: undefined, problems: [error instanceof Error ? error.message : String(error)] };
  }
}

export type CourseOptions = {
  brain?: Brain;
  textBrain?: Brain;
  signal?: AbortSignal;
  onStats?: (stats: CourseStats) => void;
};

/**
 * Photos of a click pen to a checked GenCourse. The text call starts with the kit call and is awaited only at the end.
 * A draft that fails the check goes back to the model once with the findings; a second failure throws a CourseError.
 */
export async function generateCourse(photos: Photo[], { brain = COURSE_KIT_BRAIN, textBrain = COURSE_TEXT_BRAIN, signal, onStats }: CourseOptions = {}): Promise<GenCourse> {
  const started = Date.now();
  const images = photos.map((photo) => ({ type: "image" as const, source: { type: "base64" as const, media_type: photo.mediaType, data: photo.base64 } }));
  const kitCall = (text: string) => ask({ system: KIT_SYSTEM_PROMPT, schema: kitDraftJsonSchema, brain, content: [...images, { type: "text" as const, text }], signal });

  const textStarted = Date.now();
  const textRun = generateText("a retractable click pen", PEN_ENTRIES, { brain: textBrain, signal }).then((text) => ({ ...text, ms: Date.now() - textStarted }));
  // Nothing awaits the text until the kit is in, so a failure there must not go unhandled meanwhile.
  textRun.catch(() => {});

  const first = await kitCall("Build the kit for this pen.");
  const text = await textRun;
  let costUsd = first.costUsd + text.costUsd;
  let verdict = judge(first.output, text.mechanisms);
  const problems = verdict.problems;
  const repaired = problems.length > 0;
  if (repaired) {
    const second = await kitCall(KIT_REPAIR(JSON.stringify(first.output), problems));
    costUsd += second.costUsd;
    verdict = judge(second.output, text.mechanisms);
  }
  onStats?.({ ms: Date.now() - started, kitMs: first.ms, textMs: text.ms, costUsd, repaired, problems });
  if (verdict.problems.length > 0 || !verdict.course) throw new CourseError("The course still fails its check after one repair:", verdict.problems, verdict.course);
  return verdict.course;
}
