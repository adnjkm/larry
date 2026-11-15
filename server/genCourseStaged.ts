// The fast course generation: several models at once instead of one big call.
//   t = 0: Opus draws the shell (case, nose, button, detail briefs) from the photo; Haiku writes the lesson text.
//   then: each detail brief becomes parts, built by code or by one Sonnet call per brief, in parallel.
// The result is checked, and only the stage that failed is asked again, once.
import { z } from "zod";
import { type Part, type Shape, kitProblems } from "../shared/kit.ts";
import { type GenCourse, GenMechanism, type Role } from "../shared/course/gen.ts";
import { KNOWN } from "../shared/mechanisms/library.ts";
import { wordsFor } from "../shared/mechanisms/instantiate.ts";
import { installPen, RigError } from "../prototypes/lesson/gen/rig.ts";
import { type Brain, type Model, streamStructured } from "./claude.ts";
import type { Photo } from "./streamKit.ts";
import {
  type Brief,
  DETAIL_SYSTEM,
  Detail,
  type DetailPart,
  SHELL_SYSTEM,
  Shell,
  TEXT_SYSTEM,
  Text,
} from "./genCourseStagedPrompts.ts";

export type DetailMode = "code" | "sonnet";
export type StageStat = { stage: string; model: string; startMs: number; ms: number; costUsd: number };
export type StagedStats = { totalMs: number; costUsd: number; stages: StageStat[]; problems: string[]; firstProblems: string[]; repaired: string[]; textFallbacks: string[] };
export type StagedOptions = { details?: DetailMode; shellModel?: Model; textModel?: Model; race?: number; signal?: AbortSignal; onStats?: (stats: StagedStats) => void };

export const SHELL_BRAIN: Brain = { model: "claude-opus-5-5", effort: "low" };
// The wrapper's Model type predates Haiku 5.5; the SDK takes any model id.
export const TEXT_BRAIN: Brain = { model: "claude-haiku-5-5" as Model, effort: "low" };
export const DETAIL_BRAIN: Brain = { model: "claude-sonnet-5-5", effort: "low" };

const ROLE_IDS: Record<Role, string> = { case: "barrel", nose: "nose", button: "button" };

const schemaOf = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema);
  return body;
};
const SHELL_SCHEMA = schemaOf(Shell);
const TEXT_SCHEMA = schemaOf(Text);
const DETAIL_SCHEMA = schemaOf(Detail);

type Content = Parameters<typeof streamStructured>[0]["content"];
const imageOf = (photo: Photo) => ({ type: "image" as const, source: { type: "base64" as const, media_type: photo.mediaType, data: photo.base64 } });

/** One structured call, timed against the run's start. */
async function ask<T>(
  stage: string,
  brain: Brain,
  system: string,
  schema: Record<string, unknown>,
  parse: z.ZodType<T>,
  content: Content,
  run: Run,
): Promise<T> {
  const startMs = Date.now() - run.t0;
  for await (const event of streamStructured({ system, schema, brain, content, streamKey: "__none__", signal: run.signal })) {
    if (event.type !== "result") continue;
    run.stats.push({ stage, model: brain.model, startMs, ms: Date.now() - run.t0 - startMs, costUsd: event.costUsd });
    return parse.parse(event.output);
  }
  throw new Error(`${stage} ended without a result`);
}

// Geometry helpers.

type Pt = { r: number; y: number };
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const round2 = (n: number) => Math.round(n * 1000) / 1000;
const lathe = (profile: Pt[]): Shape => ({ kind: "lathe", profile: profile.map((p) => ({ r: round2(p.r), y: round2(p.y) })) });
const midY = (profile: Pt[]) => (Math.min(...profile.map((p) => p.y)) + Math.max(...profile.map((p) => p.y))) / 2;

/** Every radius where a profile crosses height y. */
function radiiAt(points: Pt[], y: number): number[] {
  const radii: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i]!, points[i + 1]!];
    if (a.y === b.y) continue;
    const t = (y - a.y) / (b.y - a.y);
    if (t >= 0 && t <= 1) radii.push(a.r + t * (b.r - a.r));
  }
  return radii;
}
const outerAt = (points: Pt[], y: number) => {
  const ys = points.map((p) => p.y);
  const clamped = Math.min(Math.max(y, Math.min(...ys) + 0.01), Math.max(...ys) - 0.01);
  return Math.max(0, ...radiiAt(points, clamped));
};
const innerAt = (points: Pt[], y: number) => {
  const radii = radiiAt(points, y);
  return radii.length > 1 ? Math.min(...radii) : 0;
};
const way = (degrees: number) => ({ x: Math.cos((degrees * Math.PI) / 180), z: Math.sin((degrees * Math.PI) / 180), turn: -degrees });
const band = (inner: number, outer: number, bottom: number, top: number): Pt[] => [
  { r: inner, y: bottom },
  { r: outer, y: bottom },
  { r: outer, y: top },
  { r: inner, y: top },
  { r: inner, y: bottom },
];

/** The thinnest a case may be: its outer radius as a share of the object's height (the gold pen is 4%). */
const MIN_RADIUS_SHARE = 0.038;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
const lightness = (c: string) => {
  const rgb = hex(c);
  return (Math.max(...rgb) + Math.min(...rgb)) / 2;
};
/** A colour moved toward white (t > 0) or black (t < 0). */
const shade = (c: string, t: number) => toHex(hex(c).map((v) => (t > 0 ? v + (1 - v) * t : v * (1 + t))));
const validHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** The tip hole as a share of the case's outer radius (the gold pen's is 29%), and never under this many mm. */
const HOLE = { share: 0.27, min: 1.2, wall: 0.5 } as const;

/**
 * The nose's inside, rebuilt in code: a straight cone from a tip hole wide enough for the works up to the open top,
 * with the outside pushed out where it would leave less than half a millimetre of wall. Models draw the hole far too
 * small (0.4 mm), and the rig rejects that, so this costs nothing and saves a repair call.
 */
function boredNose(profile: Pt[], casePts: Pt[]): Pt[] {
  const ys = profile.map((p) => p.y);
  const [bottom, top] = [Math.min(...ys), Math.max(...ys)];
  const R = Math.max(...casePts.map((p) => p.r));
  const hole = Math.max(HOLE.min, HOLE.share * R);
  // The outside runs up to the first point at the top; what follows it is the inside, which is replaced.
  const topAt = profile.findIndex((p) => p.y >= top - 1e-6);
  const outside = profile.slice(0, topAt + 1);
  const caseBottom = Math.min(...casePts.map((p) => p.y));
  const caseInner = innerAt(casePts, caseBottom + 2) || R * 0.88;
  const spigot = Math.max(...profile.filter((p) => p.y >= top - 1e-6).map((p) => p.r));
  const mouth = Math.max(Math.min(spigot - HOLE.wall, caseInner - HOLE.wall), hole + 0.5);
  const inner = (y: number) => hole + ((mouth - hole) * (y - bottom)) / Math.max(top - bottom, 1e-6);
  const out = outside.map((p, i) => ({ r: i === 0 ? hole + HOLE.wall : Math.max(p.r, inner(p.y) + HOLE.wall), y: i === 0 ? bottom : p.y }));
  return [...out, { r: mouth, y: top }, { r: hole, y: bottom }];
}

/** Degrees round the axis for the clip and the panel beside it, and the panel's least width as a share of the case's radius. */
/** The lightness of the hand-made pen's silver body. */
const PALE = 0.87;
const FACING = { clip: 50, panel: 128, panelShare: 0.65 } as const;

/**
 * Code's last word on the shell: a case too thin for its height is widened, with the nose, button and details
 * scaled out with it; role parts read as metal or lacquer; the nose matches the case; the clip is brighter.
 */
export function settle(shell: Shell): Shell {
  const top = Math.max(...[shell.case, shell.nose, shell.button].flatMap((p) => p.profile.map((q) => q.y)));
  const R = Math.max(...shell.case.profile.map((p) => p.r));
  const k = R > 0 && R < MIN_RADIUS_SHARE * top ? (MIN_RADIUS_SHARE * top) / R : 1;
  const widen = (p: Shell["case"]): Shell["case"] => ({
    ...p,
    profile: p.profile.map((q) => ({ r: q.r * k, y: q.y })),
    // Glossy, not metal: the dither draws a metal's shaded side near black, and the hand-made pen's body is glossy.
    finish: "glossy",
  });
  const out: Shell = { ...shell, case: widen(shell.case), nose: widen(shell.nose), button: widen(shell.button) };
  out.nose = { ...out.nose, profile: boredNose(out.nose.profile, out.case.profile) };
  // A pale body is lifted to the hand-made pen's lightness, since the dither darkens what it draws.
  const read = validHex(out.case.color) ? out.case.color : "#dcdee1";
  const L = lightness(read);
  const caseColor = L > 0.7 && L < PALE ? shade(read, (PALE - L) / (1 - L)) : read;
  if (validHex(out.button.color) && Math.abs(lightness(out.button.color) - L) < 0.04) out.button.color = caseColor;
  out.case.color = caseColor;
  if (!validHex(out.nose.color) || Math.abs(lightness(out.nose.color) - lightness(caseColor)) > 0.04) out.nose.color = shade(caseColor, -0.03);
  out.details = shell.details.map((b) => {
    const brief = { ...b, width: b.kind === "rings" || b.kind === "cap" ? b.width : b.width * k };
    // Which way a detail faces cannot be read from one photo, so the clip and the panel beside it take the angles
    // the lesson's camera shows best (the hand-made pen's), and the panel is wide enough to read at dither size.
    if (b.kind === "clip") {
      const bright = validHex(b.color) && lightness(b.color) > lightness(caseColor) + 0.02;
      return { ...brief, angle: FACING.clip, color: bright ? b.color : shade(caseColor, 0.3), finish: "metal" as const };
    }
    if (b.kind === "panel") return { ...brief, angle: FACING.panel, width: Math.max(brief.width, FACING.panelShare * R * k), finish: "glossy" as const };
    return brief;
  });
  return out;
}

type Hosts = Record<Role, Pt[]>;
type Look = { color: string; finish: Part["finish"] };
const fixed = (on: Role) => ({ parentId: ROLE_IDS[on], joint: (on === "case" ? "molded" : "glue") as Part["joint"] });

function rolePart(role: Role, shell: Shell): Part {
  const p = shell[role];
  const roleLine = { case: "The tube you hold; the works live inside it.", nose: "Guides the tip out of the pen.", button: "Pressed to click the tip out or back." };
  return {
    id: ROLE_IDS[role],
    name: p.name,
    role: roleLine[role],
    parentId: role === "case" ? null : ROLE_IDS.case,
    joint: role === "case" ? null : role === "nose" ? "thread" : "slide",
    shape: lathe(p.profile),
    position: v3(0, midY(p.profile)),
    rotation: v3(),
    color: p.color,
    finish: p.finish,
  };
}

/** The common details built straight from a brief, with no second model call. */
export function codeDetail(brief: Brief, hosts: Hosts, index: number): Part[] {
  const host = hosts[brief.on];
  const look: Look = { color: brief.color, finish: brief.finish };
  const id = `${brief.kind}-${index + 1}`;
  const base = { name: brief.name, ...fixed(brief.on), ...look };
  const [bottom, top] = [Math.min(brief.bottom, brief.top), Math.max(brief.bottom, brief.top)];
  const height = Math.max(top - bottom, 0.2);
  const w = way(brief.angle);
  switch (brief.kind) {
    case "clip": {
      // The gold clip's side view, as shares of the barrel's radius and the clip's length.
      const R = outerAt(host, top - 0.5);
      const half = Math.max(0.2, 0.04 * R);
      const line: [number, number][] = [
        [R + 0.21 * R, top - 0.3],
        [R + 0.28 * R, top - 0.35 * height],
        [R + 0.24 * R, bottom + 0.3 * height],
        [R + 0.16 * R, bottom + 0.1 * height],
        [R + half + 0.03, bottom + 0.03 * height],
        [R + 0.11 * R, bottom],
      ];
      const lip = Math.min(1.7, height * 0.05);
      const outline = [
        { x: R - 0.05 * R, y: top },
        { x: line[0]![0] + half, y: top },
        ...line.slice(1).map(([x, y]) => ({ x: x + half, y })),
        ...line
          .slice(1)
          .reverse()
          .map(([x, y]) => ({ x: x - half, y })),
        { x: line[0]![0] - half, y: top - lip },
        { x: R - 0.05 * R, y: top - lip },
      ].map((p) => ({ x: round2(p.x), y: round2(p.y) }));
      const xs = outline.map((p) => p.x);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      return [
        {
          id,
          ...base,
          role: "Holds the pen to a pocket.",
          joint: "weld",
          shape: { kind: "extrusion", outline, depth: Math.max(brief.width, 1) },
          position: v3(round2(cx * w.x), (bottom + top) / 2, round2(cx * w.z)),
          rotation: v3(0, w.turn, 0),
        },
      ];
    }
    case "panel": {
      const r = outerAt(host, (bottom + top) / 2) - 0.07;
      return [
        {
          id,
          ...base,
          role: "A coloured strip set into the barrel.",
          shape: { kind: "box", width: 0.4, height, depth: Math.max(brief.width, 0.5), cornerRadius: 0.15 },
          position: v3(round2(r * w.x), (bottom + top) / 2, round2(r * w.z)),
          rotation: v3(0, w.turn, 0),
        },
      ];
    }
    case "dimples": {
      const r = Math.min(Math.max(brief.width / 2, 0.3), 1.5);
      const proud = r * 0.2;
      const disc = lathe([
        { r: 0, y: 0 },
        { r, y: 0 },
        { r: r * 0.78, y: proud * 0.8 },
        { r: 0, y: proud },
      ]);
      const rows = Math.max(1, Math.min(brief.rows, 8));
      const around = Math.max(1, Math.min(brief.count, 12));
      return Array.from({ length: rows }, (_, row) => {
        const y = rows === 1 ? (bottom + top) / 2 : bottom + (row * (top - bottom)) / (rows - 1);
        const R = outerAt(host, y) + proud / 2 - 0.03;
        return Array.from({ length: around }, (_, k): Part => {
          const a = way(brief.angle + (360 / around) * (k + (row % 2) / 2));
          return {
            id: `${id}-${row + 1}-${k + 1}`,
            ...base,
            role: "A shallow dimple that gives the fingers something to hold.",
            shape: disc,
            position: v3(round2(R * a.x), round2(y), round2(R * a.z)),
            rotation: v3(0, round2(a.turn), -90),
          };
        });
      }).flat();
    }
    case "rings": {
      const count = Math.max(1, Math.min(brief.count, 6));
      const tall = Math.min(Math.max(brief.width, 0.2), 1.5);
      return Array.from({ length: count }, (_, i): Part => {
        const y = count === 1 ? bottom : bottom + (i * (top - bottom - tall)) / (count - 1);
        const R = outerAt(host, y + tall / 2);
        const profile = band(R - 0.07, R + 0.12, y, y + tall);
        return { id: `${id}-${i + 1}`, ...base, role: "A fine trim ring.", shape: lathe(profile), position: v3(0, midY(profile)), rotation: v3() };
      });
    }
    case "cap": {
      const R = outerAt(host, top - 0.1);
      const inner = Math.max(innerAt(host, (bottom + top) / 2), R * 0.5);
      const bevel = Math.min(0.6, height * 0.3);
      const profile = [
        { r: inner, y: bottom },
        { r: R + 0.06, y: bottom },
        { r: R + 0.06, y: top - bevel },
        { r: R + 0.06 - bevel, y: top },
        { r: inner, y: top },
        { r: inner, y: bottom },
      ];
      return [{ id, ...base, role: "Finishes the barrel's top.", shape: lathe(profile), position: v3(0, midY(profile)), rotation: v3() }];
    }
    case "other":
      return [];
  }
}

/** Sonnet's parts for one brief, turned to the brief's angle and repeated round the axis. */
function expandDetail(parts: DetailPart[], brief: Brief, index: number): Part[] {
  const out: Part[] = [];
  parts.forEach((p, j) => {
    const { repeat, ...rest } = p;
    const around = Math.max(1, Math.min(repeat?.around ?? 1, 16));
    const rows = repeat && repeat.rows.length > 0 ? repeat.rows.slice(0, 8) : [p.position.y];
    const onAxis = Math.hypot(p.position.x, p.position.z) < 0.01;
    rows.forEach((y, row) => {
      for (let k = 0; k < (onAxis ? 1 : around); k++) {
        const deg = (onAxis ? 0 : brief.angle) + (360 / around) * (k + (repeat?.stagger && row % 2 ? 0.5 : 0));
        const a = (deg * Math.PI) / 180;
        // Turning about y: x' = x cos a - z sin a toward the camera, matching way().
        const x = p.position.x * Math.cos(a) - p.position.z * Math.sin(a);
        const z = p.position.x * Math.sin(a) + p.position.z * Math.cos(a);
        const suffix = rows.length * around > 1 ? `-${row + 1}-${k + 1}` : "";
        out.push({
          ...rest,
          id: `${brief.kind}-${index + 1}-${p.id}-${j}${suffix}`,
          ...fixed(brief.on),
          joint: brief.kind === "clip" ? "weld" : fixed(brief.on).joint,
          position: v3(round2(x), round2(y), round2(z)),
          rotation: v3(0, round2(p.rotation.y - deg), p.rotation.z),
        });
      }
    });
  });
  return out;
}

function hostTable(points: Pt[], bottom: number, top: number): string {
  const ys = Array.from({ length: 5 }, (_, i) => bottom + (i * (top - bottom)) / 4);
  return ys.map((y) => `y ${y.toFixed(1)}: outer r ${outerAt(points, y).toFixed(2)}`).join("\n");
}

async function sonnetDetail(brief: Brief, hosts: Hosts, index: number, run: Run): Promise<Part[]> {
  const host = hosts[brief.on];
  const text = `Brief: ${JSON.stringify(brief)}\n\nThe ${brief.on}'s surface radius over the detail's height:\n${hostTable(host, brief.bottom, brief.top)}\n\nDraw it facing +x.`;
  const out = await ask(`detail:${brief.kind}-${index + 1}`, DETAIL_BRAIN, DETAIL_SYSTEM, DETAIL_SCHEMA, Detail, [{ type: "text", text }], run);
  return expandDetail(out.parts, brief, index);
}

type Run = { t0: number; stats: StageStat[]; signal?: AbortSignal; shellBrain: Brain; textBrain: Brain };

function shellContent(photos: Photo[], fix: string[]): Content {
  const ask = fix.length === 0 ? "Measure this pen." : `Measure this pen. Your last answer had these problems; fix them:\n- ${fix.join("\n- ")}`;
  return [...photos.map(imageOf), { type: "text", text: ask }];
}

async function shellStage(photos: Photo[], run: Run, fix: string[] = [], tag = "shell"): Promise<Shell> {
  return ask(tag, run.shellBrain, SHELL_SYSTEM, SHELL_SCHEMA, Shell, shellContent(photos, fix), run);
}

async function textStage(photos: Photo[], run: Run, fix: string[] = []): Promise<Text> {
  const note = fix.length === 0 ? "" : `\nYour last answer had these problems; fix them:\n- ${fix.join("\n- ")}`;
  // The text depends only on the library, so it goes without the photo: smaller, and faster to start.
  void photos;
  return ask("text", run.textBrain, TEXT_SYSTEM, TEXT_SCHEMA, Text, [{ type: "text", text: `Write the lines for a click pen.${note}` }], run);
}

/** The gold pen's lines: what a field falls back to when Haiku's version fails a check or comes late. */
const GOLD_TEXT: Text = {
  object: "Click Pen",
  click: {
    name: "Retraction",
    does: "Each click sends the tip out or tucks it away.",
    part: "the tip",
    button: "the button",
    spring: ["A spring only pushes back while it is squeezed between two things.", "Look for a ledge it can sit on, and a collar that comes down on it when the tip goes out."],
    cam: ["The cam pushes the rod up only while a bump is under it.", "This cam has two bumps, opposite each other.", "A click that lands on a bump leaves the tip out. The next click has to land between bumps."],
  },
  tip: {
    name: "Ball Tip",
    does: "A ball that rolls a thin, even line of ink.",
    fluid: "the ink",
    surface: "the paper",
    ball: ["The ball can only roll if it touches the paper.", "It also has to sit where the ink reaches it from behind."],
  },
};

/** A name of one or two words for the whole mechanism, not one of its sub-functions ("Ink Seal"). */
function goodName(name: string, entry: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length < 1 || words.length > 2 || name.length > 24) return false;
  const parts = KNOWN.get(entry)?.subfunctions.flatMap((s) => [s.primitive, ...s.id.split("-")]) ?? [];
  return !words.some((w) => parts.includes(w.toLowerCase()));
}
const goodDoes = (does: string) => does.length >= 12 && does.length <= 46 && /^[A-Z][^.!?]*[.]$/.test(does.trim()) && !/\d/.test(does);
const goodLine = (line: string) => line.trim().split(/\s+/).length >= 4 && line.length <= 110 && /^[A-Z].*[.?]$/.test(line.trim()) && !/[!\d]/.test(line);
/** Haiku's tips for a piece when at least two lines pass, otherwise the gold's. */
const tipsOr = (given: string[] | undefined, gold: string[]) => {
  const kept = (given ?? []).filter(goodLine).slice(0, 4);
  return kept.length >= 2 ? kept : gold;
};

/** Haiku's text checked field by field; each field that fails, or all of it when Haiku is late, comes from the gold. */
function checkedText(text: Text | undefined): { text: Text; fallbacks: string[] } {
  const g = GOLD_TEXT;
  const t = text ?? g;
  const fallbacks: string[] = text ? [] : ["all"];
  const pick = <T>(field: string, ok: boolean, given: T, gold: T): T => {
    if (!ok) fallbacks.push(field);
    return ok ? given : gold;
  };
  const tip = (field: string, given: string[], gold: string[]) => {
    const out = tipsOr(given, gold);
    if (out === gold && text) fallbacks.push(field);
    return out;
  };
  return {
    text: {
      object: t.object,
      click: {
        ...t.click,
        name: pick("click.name", goodName(t.click.name, "click-latch"), t.click.name, g.click.name),
        does: pick("click.does", goodDoes(t.click.does), t.click.does, g.click.does),
        spring: tip("click.spring", t.click.spring, g.click.spring),
        cam: tip("click.cam", t.click.cam, g.click.cam),
      },
      tip: {
        ...t.tip,
        name: pick("tip.name", goodName(t.tip.name, "ball-tip"), t.tip.name, g.tip.name),
        does: pick("tip.does", goodDoes(t.tip.does), t.tip.does, g.tip.does),
        ball: tip("tip.ball", t.tip.ball, g.tip.ball),
      },
    },
    fallbacks,
  };
}

/** How long the text may still take once the shell is ready. */
const TEXT_GRACE_MS = 2000;

function mechanismsOf(text: Text): GenMechanism[] {
  const click = KNOWN.get("click-latch")!;
  const tip = KNOWN.get("ball-tip")!;
  return [
    GenMechanism.parse({
      entry: "click-latch",
      name: text.click.name,
      does: text.click.does,
      words: wordsFor(click, [
        { slot: "part", phrase: text.click.part },
        { slot: "button", phrase: text.click.button },
      ]),
      tips: { spring: text.click.spring, cam: text.click.cam },
    }),
    GenMechanism.parse({
      entry: "ball-tip",
      name: text.tip.name,
      does: text.tip.does,
      words: wordsFor(tip, [
        { slot: "fluid", phrase: text.tip.fluid },
        { slot: "surface", phrase: text.tip.surface },
      ]),
      tips: { ball: text.tip.ball },
    }),
  ];
}

async function detailsOf(shell: Shell, mode: DetailMode, run: Run): Promise<Part[]> {
  const hosts: Hosts = { case: shell.case.profile, nose: shell.nose.profile, button: shell.button.profile };
  const startMs = Date.now() - run.t0;
  const lists = await Promise.all(
    shell.details.map(async (brief, i) => {
      if (mode === "code" && brief.kind !== "other") return codeDetail(brief, hosts, i);
      try {
        return await sonnetDetail(brief, hosts, i, run);
      } catch (error) {
        // A detail that fails is left out rather than failing the course.
        console.warn(`detail ${brief.kind}-${i + 1} failed: ${(error as Error).message}`);
        return mode === "sonnet" ? codeDetail(brief, hosts, i) : [];
      }
    }),
  );
  if (mode === "code") run.stats.push({ stage: "details:code", model: "code", startMs, ms: Date.now() - run.t0 - startMs, costUsd: 0 });
  return lists.flat();
}

function assemble(shell: Shell, details: Part[], text: Text): GenCourse {
  const parts = [rolePart("case", shell), rolePart("nose", shell), rolePart("button", shell), ...details];
  return {
    object: (shell.object || text.object).slice(0, 24),
    kit: { name: shell.object, summary: shell.summary, parts },
    roles: { case: ROLE_IDS.case, nose: ROLE_IDS.nose, button: ROLE_IDS.button },
    mechanisms: mechanismsOf(text),
  };
}

/** The course's problems: the shared check, then the rig itself, which has the last word on whether the works fit. */
async function problemsOf(course: GenCourse): Promise<string[]> {
  let problems = kitProblems(course.kit);
  try {
    const check = (await import("../shared/course/check.ts")) as { courseProblems?: (raw: unknown) => string[] };
    if (check.courseProblems) problems = check.courseProblems(course);
  } catch {
    // The check is someone else's file; without it, the kit's own check is all there is.
  }
  return [...problems, ...rigProblems(course)];
}

function rigProblems(course: GenCourse): string[] {
  try {
    installPen({ kit: course.kit, roles: course.roles });
    return [];
  } catch (error) {
    if (!(error instanceof RigError)) return [`rig: ${(error as Error).message}`];
    return error.message
      .split("\n")
      .map((line) => line.replace(/^- /, "").trim())
      .filter((line) => line.length > 0 && !line.endsWith(":"))
      .map((line) => `rig: ${line}`);
  }
}

/** Problems about the lesson text name a mechanism or a slot; everything else is the shell's. */
const isTextProblem = (p: string) => /^(click-latch|ball-tip|object name|mechanism )/.test(p);
const isDetailProblem = (p: string, details: Part[]) => details.some((d) => p.startsWith(`${d.id} `));

/** Races `count` shells and keeps the first whose role parts pass the checks; the first to land if none does. */
async function racedShell(photos: Photo[], count: number, run: Run): Promise<Shell> {
  if (count <= 1) return shellStage(photos, run);
  return new Promise<Shell>((resolve, reject) => {
    let left = count;
    let fallback: Shell | undefined;
    for (let i = 0; i < count; i++) {
      shellStage(photos, run, [], `shell#${i + 1}`)
        .then(async (shell) => {
          fallback ??= shell;
          if ((await problemsOf(assemble(settle(shell), [], GOLD_TEXT))).length === 0) resolve(shell);
        })
        .catch(() => undefined)
        .finally(() => {
          if (--left === 0) {
            if (fallback) resolve(fallback);
            else reject(new Error("every shell failed"));
          }
        });
    }
  });
}

/** The course for a photographed click pen, from parallel stages. */
export async function generateCourseStaged(photos: Photo[], opts: StagedOptions = {}): Promise<GenCourse> {
  const mode = opts.details ?? "code";
  const run: Run = {
    t0: Date.now(),
    stats: [],
    signal: opts.signal,
    shellBrain: { ...SHELL_BRAIN, model: opts.shellModel ?? SHELL_BRAIN.model },
    textBrain: { ...TEXT_BRAIN, model: opts.textModel ?? TEXT_BRAIN.model },
  };
  const repaired: string[] = [];

  // Text that fails or never comes falls back to the gold's lines, so it never holds the course up.
  const textP = textStage(photos, run).catch(() => undefined);
  let shell = settle(await racedShell(photos, opts.race ?? 1, run));
  const late = new Promise<undefined>((resolve) => setTimeout(resolve, TEXT_GRACE_MS, undefined));
  const [given, details0] = await Promise.all([Promise.race([textP, late]), detailsOf(shell, mode, run)]);
  let details = details0;
  const { text, fallbacks: textFallbacks } = checkedText(given);
  let course = assemble(shell, details, text);
  let problems = await problemsOf(course);
  const firstProblems = problems;

  if (problems.length > 0) {
    const detailFix = problems.filter((p) => !isTextProblem(p) && isDetailProblem(p, details));
    const shellFix = problems.filter((p) => !isTextProblem(p) && !isDetailProblem(p, details));
    const jobs: Promise<void>[] = [];
    if (shellFix.length > 0) {
      repaired.push("shell");
      jobs.push(
        shellStage(photos, run, shellFix, "shell:repair").then(async (s) => {
          shell = settle(s);
          details = await detailsOf(s, mode, run);
        }),
      );
    } else if (detailFix.length > 0) {
      // A detail that breaks the checks is dropped, not asked again: the shell and the text still stand.
      repaired.push("details:dropped");
      details = details.filter((d) => !detailFix.some((p) => p.startsWith(`${d.id} `)));
    }
    await Promise.all(jobs);
    course = assemble(shell, details, text);
    problems = await problemsOf(course);
  }

  opts.onStats?.({
    totalMs: Date.now() - run.t0,
    costUsd: run.stats.reduce((sum, s) => sum + s.costUsd, 0),
    stages: run.stats,
    problems,
    firstProblems,
    repaired,
    textFallbacks,
  });
  return course;
}
