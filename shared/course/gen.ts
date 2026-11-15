// What a fresh scan has to produce for the lesson player, as data. The hand-made click pen
// (prototypes/lesson/lessons/pen-course.ts, pen.ts, pen-kit.ts) is the standard a generated course is judged against.
//
// The split that keeps this small and reliable:
//   - The scan draws the OUTSIDE of the object from the photo: its case, the parts seen moving, and its details.
//   - It names which of those parts play which role ("case", "nose", "button").
//   - A rig (prototypes/lesson/gen) measures those parts and installs the hidden works itself (spring, cam, refill,
//     ball), sized to fit the hollow it measured. So the inside always fits, and the rig knows every part it animates.
//   - The lesson's shape is fixed (preview, primitives, Connect, one to three assemble steps, end screen) and its
//     sentences come from the mechanism library, so the scan writes only names, one line each, and the tips.
import { z } from "zod";
import { Kit } from "../kit.ts";

/** The roles a rig can ask for. Each is one kit part; parts fixed to it (clip, panel, dimples) move and show with it. */
export const ROLES = {
  case: "The long hollow body the works live in. A lathe on the y axis, open at both ends, with a wall: its profile runs up the outside and back down the inside.",
  nose: "The hollow tapering end the tip comes out of, below the case and meeting it. A lathe on the y axis, open at the top where it meets the case, with a small hole at the very bottom for the tip.",
  button: "The part that is pressed, at the top. It slides down into the case's open end, so its lower stem is narrower than the case's inside.",
} as const;
export type Role = keyof typeof ROLES;

/** Which roles each library entry's rig needs before it can be built on a scanned object. Entries not listed have no rig yet. */
export const RIG_ROLES: Record<string, readonly Role[]> = {
  "click-latch": ["case", "nose", "button"],
  "ball-tip": ["case", "nose"],
};

/**
 * One assemble step, as a filled-in template. The templates a rig can play, and what each may be filled with, are in
 * shared/course/templates.ts; the scan picks among them and the hand-made pen is the worked example.
 */
export const GenStep = z.discriminatedUnion("template", [
  z.object({
    /** Something is missing: the piece is dragged to where it belongs, and the test answers each drop. */
    template: z.literal("place"),
    piece: z.string(),
    /** Which of the piece's tests plays: failing while the piece is missing or misplaced, passing once it is home. */
    test: z.string(),
    /** The sub-functions (ids as in the library entry) this step is about, shown in the pink card, first one on top. */
    covers: z.array(z.string()).min(1).max(3),
    say: z.string().describe('The instruction, one line: "Drag the spring where it belongs."'),
  }),
  z.object({
    /** A multiple choice played on the piece's own primitive figure, for a part whose job is in how it moves. */
    template: z.literal("choice"),
    piece: z.string(),
    covers: z.array(z.string()).min(1).max(3),
    say: z.string(),
    /** Two or three answers from the template's list, in the order shown. Exactly one works. */
    options: z.array(z.object({ label: z.string(), turns: z.number() })).min(2).max(3),
  }),
]);
export type GenStep = z.infer<typeof GenStep>;

export const GenMechanism = z.object({
  /** The mechanism library entry (shared/mechanisms/entries): sub-functions, primitives and sentences come from it. */
  entry: z.string(),
  name: z.string().describe('What it is called on screen, one or two words: "Retraction".'),
  does: z.string().max(56).describe('What it does, one line under the name: "Each click sends the tip out or tucks it away."'),
  /** The entry's slot words for this object ("the tip", "the button"). */
  words: z.record(z.string(), z.string()),
  /** The Tip card for each assemble step, keyed by the piece it is about ("spring", "cam", "ball"): two to four short hint lines, never the answer outright. */
  tips: z.record(z.string(), z.array(z.string()).min(1).max(4)),
  /** After Connect: one to three assemble steps, fewer when in doubt. Left out, the rig plays the worked example's. */
  steps: z.array(GenStep).min(1).max(3).optional(),
});
export type GenMechanism = z.infer<typeof GenMechanism>;

export const GenCourse = z.object({
  object: z.string().describe('The object\'s name: "Click Pen".'),
  /**
   * The outside of the object as the photo shows it, standing upright on the y axis with the working end down
   * (a pen stands on its nose, retracted, button on top). Sizes in mm. No hidden inner parts: the rig adds those.
   * Every part is solid-looking (no "clear" finish): the player makes the case see-through where a lesson needs it.
   */
  kit: Kit,
  /** Role to kit part id. Every role the mechanisms' rigs need (RIG_ROLES) must be here. */
  roles: z.record(z.string(), z.string()),
  /** In the order they are built. Each has to make sense with only the earlier ones in place. */
  mechanisms: z.array(GenMechanism).min(1).max(3),
});
export type GenCourse = z.infer<typeof GenCourse>;
