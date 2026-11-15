// Prompts and schemas for the staged course generation (server/genCourseStaged.ts): an Opus shell and a Haiku text
// pass start together, then each detail the shell lists is drawn by code or by its own Sonnet call.
import { z } from "zod";
import { Part } from "../shared/kit.ts";
import type { GenStep } from "../shared/course/gen.ts";
import { EXAMPLE_STEPS, STEP_TEMPLATES } from "../shared/course/templates.ts";
import { fill } from "../shared/mechanisms/instantiate.ts";
import { MECHANISMS } from "../shared/mechanisms/library.ts";
import type { KnownMechanism } from "../shared/mechanisms/types.ts";

const Pt = z.object({ r: z.number(), y: z.number() });
const SolidFinish = z.enum(["matte", "glossy", "metal", "rubber"]);

const RolePart = z.object({
  name: z.string().describe("Everyday name, 1 to 3 words."),
  profile: z.array(Pt).describe("Bottom to top up the outside, then back down the inside. Heights in mm in the object frame (y = 0 is the table)."),
  color: z.string().describe("#rrggbb as lit in the photo."),
  finish: SolidFinish,
});

export const DETAIL_KINDS = ["clip", "panel", "dimples", "rings", "cap", "other"] as const;

export const Brief = z.object({
  kind: z.enum(DETAIL_KINDS),
  name: z.string().describe("Everyday name, 1 to 3 words."),
  on: z.enum(["case", "nose", "button"]).describe("The role part it is fixed to."),
  bottom: z.number().describe("Lowest y in mm."),
  top: z.number().describe("Highest y in mm."),
  angle: z.number().describe("Where it faces round the axis, degrees from +x toward the camera (+z). 0 for things that go all round."),
  width: z.number().describe("mm: a clip's or panel's width, a dimple's diameter, a ring's height."),
  count: z.number().int().describe("Dimples per row, or rings. 1 otherwise."),
  rows: z.number().int().describe("Rows of dimples. 1 otherwise."),
  color: z.string().describe("#rrggbb as lit in the photo."),
  finish: SolidFinish,
});
export type Brief = z.infer<typeof Brief>;

export const Shell = z.object({
  object: z.string().describe('Short name: "Click Pen".'),
  summary: z.string().describe("One plain sentence on how it works."),
  case: RolePart,
  nose: RolePart,
  button: RolePart,
  details: z.array(Brief).max(7),
});
export type Shell = z.infer<typeof Shell>;

export const SHELL_SYSTEM = `You measure a click pen (or a close cousin: a retractable marker, a click highlighter) from a photo and write its outside as three turned parts plus a short list of surface details. Code builds the 3D model and the hidden works from your numbers, so numbers matter more than words.

The frame: mm, real size. The pen stands upright on the y axis, retracted, nose down with its tip at y = 0 and the button on top. x points right, z toward the camera. Measure every proportion against the photo, not against a typical pen: length, barrel width, where the nose ends, how tall the button stands. Measure the barrel's width against the pen's length in the photo (a slim click pen is about 11 or 12 mm across at 140 mm long, a ratio near 1 to 12); the photo is at an angle, so measure across the barrel square to its axis.

Three parts, each a lathe profile of {r, y} points in object heights (not relative to the part):
- case: the barrel. A hollow tube open at both ends. Run the profile up the outside from bottom to top, then back down the inside to the start, so it closes as a ring. Wall about 10% of the outer radius (outer 5.6, inner 5.0). It never narrows at either end; a top cap or band is a detail, not part of the case.
- nose: the cone below the case. Hollow, open at the top where it meets the case, with a tip hole at y = 0 whose radius is 25 to 30% of the case's outer radius (never under 1.2 mm). Its inner wall is a straight cone from that hole up to the open top, and its wall is about 0.5 mm thick, so the outside at y = 0 is the hole's radius plus 0.5. Start at the tip hole's outside, go up the outside of the cone to the case's bottom, step in, run up 2 or 3 mm inside the case as a spigot (its outside just under the case's inner radius), then come back down the inside in a straight line to the hole. The nose top overlaps the case bottom by those 2 or 3 mm.
- button: the plunger above the case. A closed solid (start and end at r = 0): a narrow stem from 3 to 5 mm inside the case's top up to the case's top (stem radius about 60% of the case's inner radius), then the wider visible button up to the very top, often with a rounded or bevelled top edge.

Details: each surface feature you can see, briefly, so code can draw it on its part. Kinds:
- clip: the pocket clip. bottom and top are its ends; it starts just below the case's top. angle is the side it is on; width its width.
- panel: a coloured strip or window let into the barrel. angle is the side it faces.
- dimples: rows of grip dimples or holes. count per row (round the whole pen), rows, width is one dimple's diameter; bottom and top span the rows.
- rings: thin seam or trim rings round a part; count of them, width is each ring's height, bottom and top span them.
- cap: a band or cap at the case's top with a bevelled edge; bottom and top are its extent.
- other: anything else that changes the look. Leave out text, logos and things under 0.3 mm.
Angles are seen from above: 0 faces +x (the right of the photo), 90 faces the camera, 180 the left, 270 away. A clip seen on the left edge of the photo is near 180; a panel facing you is near 90.

Colours: the colour on the lit side in the photo, as #rrggbb. Correct for the light: photos of metal often carry a warm or yellow cast, so judge whether a surface is really silver, steel or chrome and give it a neutral grey (satin aluminium about #d4d6da, pressed steel about #a9adb3, chrome about #d6d8dc). Keep real colours as they are: a red panel stays red. Pick the finish that matches: metal for steel or chrome, glossy for lacquer or plastic shine, matte otherwise. Nothing is clear.`;

/** The facts about the rig a tip may lean on: it installs these works whatever the photo shows. */
const RIG_FACTS = `What the rig puts inside, so every tip stays true:
- A coil spring sits on a ledge inside the nose. A collar on the refill comes down on it when the tip goes out, so the spring is squeezed between the ledge and the collar.
- The cam is a ring under the button with two bumps, opposite each other. The top of the refill rides on it as a rod: a click that lands on a bump leaves the tip out, the next click lands between bumps and lets it back.
- The ball sits in a brass socket at the bottom of the refill, where the ink reaches it from behind; it can only roll when it touches the paper.`;

export const TEXT_SYSTEM = `You write the few lines of a lesson about a click pen (or a close cousin) for curious adults. Every other sentence comes from a fixed library; you write only names, a one-line summary for each mechanism, the words for each slot, and tip cards.

${RIG_FACTS}

Rules:
- Plain adult English. No flavour, no jokes, no exclamation marks, no numbers you were not given.
- name: one or two words, the mechanism as this object has it ("Retraction", "Ball tip").
- does: one line, 12 to 48 characters, ending in a full stop ("Each click sends the tip out or tucks it away.").
- slot words: "the" and one or two lowercase words, naming the thing in this object ("the tip", "the button", "the ink", "the paper").
- tips: two to four lines per piece, each 12 to 110 characters. A tip points at what to look for, never gives the answer outright.

Example tips, for their tone and length (write your own for this object):
spring: "A spring only pushes back while it is squeezed between two things." / "Look for a ledge it can sit on, and a collar that comes down on it when the tip goes out."
cam: "The cam pushes the rod up only while a bump is under it." / "This cam has two bumps, opposite each other." / "A click that lands on a bump leaves the tip out. The next click has to land between bumps."
ball: "The ball can only roll if it touches the paper." / "It also has to sit where the ink reaches it from behind."`;

const Lines = z.array(z.string()).min(2).max(4);
export const Text = z.object({
  object: z.string().describe('Short name for the object: "Click Pen".'),
  click: z.object({ name: z.string(), does: z.string(), part: z.string(), button: z.string(), spring: Lines, cam: Lines }),
  tip: z.object({ name: z.string(), does: z.string(), fluid: z.string(), surface: z.string(), ball: Lines }),
});
export type Text = z.infer<typeof Text>;

/** A detail part Sonnet writes facing +x; code turns it to the brief's angle and repeats it round the axis. */
export const DetailPart = Part.omit({ parentId: true, joint: true }).extend({
  repeat: z
    .object({
      around: z.number().int().describe("Copies spaced evenly round the axis, 1 for none."),
      rows: z.array(z.number()).describe("The y of each row; the part's own position.y is ignored when given."),
      stagger: z.boolean().describe("Each row turned half a step from the last."),
    })
    .nullable(),
});
export type DetailPart = z.infer<typeof DetailPart>;
export const Detail = z.object({ parts: z.array(DetailPart).min(1).max(4) });

export const DETAIL_SYSTEM = `You draw one surface detail of a pen as 1 to 4 simple 3D parts, from a brief and the pen's measured numbers. Code fixes your parts to the part named in the brief, turns them to face where the brief says, and repeats them round the axis when you ask.

The frame: mm, y up along the pen's axis. Draw the detail FACING +x: its centre on the +x side at the surface radius you are given (x = that radius, z = 0), as if the brief's angle were 0. Keep rotation.x = 0.

Shapes:
- extrusion: an outline in x (out from the axis) and y (up), pushed back along z by depth, centred on its position. Use it for a clip seen from the side: a thin strip that leaves the barrel at its top, bows out 1 to 1.5 mm, comes back to touch the barrel near its lower end, then flares out a little.
- box: width along x (its thickness out from the surface), height along y, depth along z (its width across the surface). Use it for panels and strips; sit it 0.05 mm under the surface so it reads as let in.
- lathe on its side for a round dimple or stud: a flat disc profile (r from 0 to the dimple radius, y from 0 to about 0.15 mm), with rotation z = -90 so its face points out along +x. Position x = surface radius.
- lathe on the axis (position x = z = 0, rotation 0) for rings and bands that go all round: a closed ring profile in object heights, a hair over the surface radius.
For patterns, draw one copy and set repeat: { around, rows, stagger }. Otherwise repeat is null.

Ids short and kebab-case. Colour and finish from the brief. Every part sits on or within 0.3 mm of the surface: nothing floats.`;

// The plan: which library mechanisms the object has, in build order, and each one's assemble steps picked from its
// templates. The menu and the worked example are written out of shared/course/templates.ts, so they never drift.

const PlanStep = z.object({
  template: z.enum(["place", "choice"]),
  piece: z.string().describe("A piece listed under the mechanism."),
  test: z.string().describe('For place: one of the piece\'s test ids. For choice: "".'),
  covers: z.array(z.string()).min(1).max(3).describe("Sub-function ids this step tests, first one on top."),
  say: z.string().describe("The instruction on screen, one plain line under 80 characters."),
  options: z.array(z.string()).max(3).describe("For choice: two or three option labels exactly as listed, in the order shown. For place: []."),
});
export type PlanStep = z.infer<typeof PlanStep>;
export const Plan = z.object({
  mechanisms: z
    .array(
      z.object({
        entry: z.enum(MECHANISMS.map((m) => m.id) as [string, ...string[]]).describe("A library entry the object really has."),
        reason: z.string().describe("One short line: what in the photo shows this mechanism, and why it sits here in the order."),
        steps: z.array(PlanStep).min(1).max(3),
      }),
    )
    .min(1)
    .max(3)
    .describe("In build order."),
});
export type Plan = z.infer<typeof Plan>;

export const playable = (entry: string) => entry in STEP_TEMPLATES;

const defaults = (m: KnownMechanism) => Object.fromEntries(m.slots.map((s) => [s.id, s.default]));

function menuOf(m: KnownMechanism): string {
  if (!playable(m.id)) return `- ${m.id}: ${m.does}.`;
  const words = defaults(m);
  const subs = m.subfunctions.map((s) => `    ${s.id}: ${fill(s.does, words)} (its primitive: ${s.primitive})`).join("\n");
  const pieces = STEP_TEMPLATES[m.id]!.map((p) => {
    const lines = [`    ${p.piece}: ${p.what}`];
    for (const t of p.place?.tests ?? []) lines.push(`      place, test "${t.id}": ${t.shows} Can cover: ${t.covers.join(", ")}.`);
    if (p.choice) {
      const options = p.choice.options.map((o) => `"${o.label}"${o.works ? " (the one that works)" : ""}`).join(", ");
      lines.push(`      choice: ${p.choice.shows} Can cover: ${p.choice.covers.join(", ")}. Options: ${options}.`);
    }
    return lines.join("\n");
  });
  return `- ${m.id} [PLAYABLE]: ${m.does}.\n  Sub-functions (each tested exactly once):\n${subs}\n  Pieces and their templates:\n${pieces.join("\n")}`;
}

function stepLine(s: GenStep, i: number): string {
  const what = s.template === "place" ? `place the ${s.piece}, test "${s.test}"` : `choice on the ${s.piece}, options ${s.options.map((o) => `"${o.label}"`).join(", ")}`;
  return `    ${i + 1}. ${what}; covers ${s.covers.join(", ")}; say "${s.say}"`;
}

const EXAMPLE = `ONLY AN EXAMPLE. How the hand-made click pen used these templates, to show the form of an answer. It is not the answer for your photo and not a default: do not start from it. Decide each mechanism, the order, each piece's template, each test and the options and their order from what this object and this photo show, by the rules above; where you end up agreeing with the example, that should be because this object calls for it.
  Order: click-latch, then ball-tip. Built first, the pen clicks in and out, then turns out not to write, which is why the ball tip comes next.
${Object.entries(EXAMPLE_STEPS)
  .map(([entry, steps]) => `  ${entry}:\n${steps.map(stepLine).join("\n")}`)
  .join("\n")}`;

export const PLAN_SYSTEM = `You plan a short hands-on lesson about the object in the photo, for curious adults. The lesson teaches the object's mechanisms one at a time. For each mechanism the learner first meets its primitives and matches them to its sub-functions; then come one to three assemble steps, each a template filled in from the menu below. You choose which mechanisms, their order, and the assemble steps. Code builds everything else.

Choosing mechanisms:
- Only entries marked PLAYABLE can be taught today. Pick the one to three playable entries this object really has, as the photo shows it.
- Never pick a mechanism the object does not have, even as a placeholder. If no playable entry fits, list the one to three entries it does have, playable or not, and give each one step copied from the example; code sees that nothing is playable and handles it.
- Order them so each makes sense when only the earlier ones are built: the learner builds the first, sees what it still cannot do, and the next one answers that.
- Give each pick one short reason.

Choosing assemble steps, per mechanism:
- One to three steps. Fewer when in doubt.
- Every sub-function of the mechanism is tested by exactly one step. A step covers only what its template says it can cover.
- A piece is placed at most once and has at most one choice step; if it has both, the place comes first.
- place: the piece is missing and the learner drags it where it belongs; the test then plays. Give the test id. Pick the test whose failure shows most clearly what the piece is for.
- choice: a multiple choice on the piece's primitive figure. Give two or three option labels exactly as listed, exactly one of them the one that works, in the order to show them (the working one need not be first).
- A part whose job is in how it moves suits the choice template; a part whose job is in where it sits suits place.
- say: the one-line instruction on screen, plain, under 80 characters, no exclamation marks, no numbers that are not in an option label.

The menu: every library entry, with its one-line description.
${MECHANISMS.map(menuOf).join("\n")}

${EXAMPLE}`;
