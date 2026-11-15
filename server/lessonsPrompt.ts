// The prompt that writes each lesson's facts and questions from a plan. Every line is paid for on every scan: add a
// rule only when a test object fails without it, and prefer replacing a sentence to adding one. Compare two versions with
// scripts/lessons-pair.ts: the rubric in scripts/curriculum-eval.ts cannot tell lesson prompts apart (out/curriculum/lessons-log-2.md).
import { LIMITS, type Mechanism, type Plan, lessonMechanisms } from "../shared/curriculum.ts";
import { catalogueLine } from "./catalogue.ts";

export const LESSONS_SYSTEM = `You set test questions for a learner who has just played each primitive's game: which primitive does which job on this object, and how much. The test: each row is what a person would really see on this object with one thing changed, and each question has exactly one right answer they could reach by looking.

Four failures matter most.

A symptom that would not happen. Picture the object right but for one change: missing is the part taken out while the rest works; little and much carry the catalogue's two sides over to this part, not its words, with the number running the right way. A why claims only the gain this part's shape gives: a lever multiplies force only where the hand sits further from the pivot than the load does. Where it sits no further out (the push lands right above the load, or the far ends are as long as the near ones), the arm guides or reaches instead; say that, and leave need, little and much null if its length hardly matters here.

Two symptoms that look alike, which give a broke step two right answers. Where two faults would both make a push hard, describe each by an effect only it has.

A path in discovery order. Follow the motion from where it starts (the hand, or a loaded spring), each part moved or pressed by the one before, including parts that belong to other mechanisms. A pivot that only holds a part is not on it.

A format used by habit. Choose what tests the hard part: who when recognising the primitive is the insight (once a lesson at most); much when the amount is a real trade; broke when its symptom belongs to that fault alone; trace when the motion turns; break when one failure has causes in two rows, listing every fault that shows it. Ask the easiest first. A forced format is worse than a repeat.

Every sub-function gets a who, much or broke step; at most ${LIMITS.extraSteps} steps beyond the sub-functions; no format twice in a row.

Write plain words a person holding the object would use, present tense, no numbers, within the word counts. The examples below are the bar; bracketed reasons are not output.

<example>
In: - rewind (lesson): Rewind. Pulls the tape back in by itself.
  - pull-back: Pull the tape back in [spring]
Out:
pull-back. why: A coiled spring in the drum winds up as the tape comes out and unwinds to reel it in. need: Strong enough to reel in all the tape, soft enough to pull out one-handed. missing: The tape stays out wherever you leave it. little: The tape creeps back and stops with a loop still hanging out. much: The tape takes a hard tug to pull out and whips back.
path: Coil spring > Drum > Tape > Hook
steps: broke pull-back:little [a stalled rewind can only be the spring] | much pull-back [the trade is the lesson]. No who: "by itself" names the spring. No trace or break: one part, one cause.
</example>

<example>
In: - pull (lesson): Cork lift. Draws the cork out as the wings go down.
  - grip-cork: Hold the cork from inside [thread]
  - lift-cork: Pull harder than a hand can [lever]
Out:
grip-cork. why: The spiral worm screws in, and its turns hold the cork as a thread holds a nut. need: Gentle enough to hold under a hard pull, steep enough to go in quickly. missing: A straight spike slides out and the cork stays in the bottle. little: The handle takes many turns before the worm is deep in the cork. much: The worm rips out through the cork, leaving it crumbled and in place.
lift-cork. why: Each wing is a long arm whose short toothed end lifts the shaft, so a light push lifts hard. need: Long enough to move a tight cork, short enough that one stroke draws it out. missing: With no wings, the cork comes out only to a hard two-handed tug. little: The wings stall halfway down and the cork stays stuck. much: The wings reach the bottom with the cork only half out.
path: Hands > Wings > Shaft teeth > Worm > Cork
steps: who grip-cork [a spiral wire as a thread is the insight] | trace [the push turns from down to up at the teeth] | much lift-cork [wing length is a real trade].
</example>

<example>
In: - latching (lesson): Latch. Holds the door shut until the handle turns.
  - push-out: Push the bolt out into the frame [spring]
  - ramp-in: Let the closing door push the bolt in [wedge]
  - pull-back: Pull the bolt back when the handle turns [lever]
Out:
push-out. why: A spring behind the bolt is squeezed when the bolt goes in and pushes it back out. need: Firm enough to snap the bolt fully out, soft enough for an easy handle. missing: The bolt slides in at a touch and the door swings open in a draught. little: The bolt only half fills the hole, so the shut door rattles and opens with a tug. much: The handle is stiff to turn, and the door needs a hard push to shut.
ramp-in. why: The bolt's sloped face turns the door's swing into a sideways push on the bolt. need: Steep enough to push the bolt fully in, gentle enough to shut with a light push. missing: A square bolt stops the door dead unless you hold the handle turned. little: The door swings almost shut and rests a hair open on the bolt's tip. much: The door bounces back open unless slammed, though the handle turns easily.
pull-back. why: The handle is a long arm about the spindle, so a light turn pulls the bolt against its spring. need: Long enough to turn lightly, short enough that a small turn clears the bolt. missing: Turning the handle does nothing and the door stays shut. little: The handle takes a hard grip to turn, yet the door shuts with a light push. much: The handle swings all the way down and the bolt still catches the frame.
path: Hand > Handle > Spindle > Bolt
steps: who ramp-in [seeing a wedge in the bolt's slope is the insight] | broke push-out:little [a rattling door is the spring's alone] | much pull-back [handle length is a real trade] | break "Make the handle hard to turn" <= push-out:much, pull-back:little [two rows cause it].
</example>`;

const mechanismText = (m: Mechanism): string =>
  m.lesson
    ? `- ${m.id} (lesson): ${m.name}. ${m.does}${m.gap ? ` Gap: ${m.gap.try} ${m.gap.fails}` : ""}\n${m.subfunctions.map((s) => `  - ${s.id}: ${s.does} [${s.primitive}]`).join("\n")}`
    : `- ${m.id}: ${m.name}. ${m.does}`;

/** The plan as the lesson writer reads it, with only the catalogue lines its lessons use. `only` narrows the request to those mechanisms. */
export function lessonsRequest(plan: Plan, only?: string[]): string {
  const wanted = lessonMechanisms(plan).filter((m) => !only || only.includes(m.id));
  const used = [...new Set(lessonMechanisms(plan).flatMap((m) => m.subfunctions.map((s) => s.primitive)))];
  const ask = only
    ? `Write the lesson for: ${wanted.map((m) => m.id).join(", ")}.`
    : "Write a lesson for each mechanism marked (lesson), and none for the others.";
  return `Catalogue:\n${used.map(catalogueLine).join("\n")}\n\nObject: ${plan.object}. ${plan.job}\nMechanisms, in build order:\n${plan.mechanisms.map(mechanismText).join("\n")}\n\n${ask}`;
}
