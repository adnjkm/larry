// The prompt that plans a curriculum: the rules, then worked examples that set the bar.
// Tune it with scripts/curriculum-eval.ts. Rules cost little and examples carry the depth, so fix a failure by
// sharpening an example before adding a rule. Examples never use the test objects in fixtures/curriculum/gold.
import { type Brief, LIMITS } from "../shared/curriculum.ts";
import { CATALOGUE } from "./catalogue.ts";

const EXAMPLES = `<examples>
<example>
Hole punch. Pressing the handle drives a sharp steel pin through the paper, and a spring hidden in the handle lifts it again.
Scanned parts: base, handle, punch-pin, paper-guide, chip-tray.

Hole punch: Cuts a clean round hole near the edge of a sheet.
Uses: Slide a sheet in against the guide. Press the handle. Empty the tray.
1. Base: Holds the sheet flat over a hole. (base) Given.
2. Punch: Cuts a clean hole with one press. (punch-pin, handle; needs base)
   - Shear the paper round a sharp rim: wedge
   - Press harder than a hand can: lever
   - Lift the pin back out of the paper: spring
   Lesson. Gap: Push a pencil through the sheet over the hole. / The paper rips into a ragged tear.
3. Paper guide: Puts every hole the same distance from the edge. (paper-guide; needs base) Given.
4. Chip tray: Catches the cut discs. (chip-tray; needs punch) Given.
The test: a user names "cuts a hole", never the pin, handle or spring, so those are three steps of one job that one press sets going. The rim is a wedge because it cuts.
</example>
<example>
Claw hammer. A heavy steel head on a wooden handle drives nails, and the split claw behind the head levers bent nails out.
Scanned parts: head, handle, claw, grip.

Claw hammer: Drives nails in and pulls bent ones out.
Uses: Swing the face onto a nail. Hook the claw under a bent nail. Rock the handle back.
1. Strike: Drives a nail in with a swing. (head, handle)
   - Keep moving into the nail instead of stopping: weight
   - Turn a short move of the wrist into a fast head: lever
   Lesson, and the first mechanism, so no gap.
2. Grip: Keeps the handle from slipping in a sweaty hand. (grip; needs strike) Given.
3. Nail pull: Pulls a bent nail back out. (claw, head, handle; needs strike)
   - Get under the nail's head: wedge
   - Pull harder than the arm can: lever
   Lesson. Gap: Pinch a bent nail and pull. / It will not move.
The test: striking and pulling are two jobs a user names, done by two actions at two times, so two lessons. The pull's gap uses fingers, not the claw it is about to build.
</example>
<example>
Interior door. A sprung bolt in the door's edge clicks into a plate on the frame, and turning the handle draws it back.
Scanned parts: door-leaf, hinges, handle, bolt, strike-plate.

Interior door: Closes a doorway and stays shut until someone turns the handle.
Uses: Push it shut. Turn the handle and pull it open.
1. Door leaf: Fills the doorway. (door-leaf) Given.
2. Hinges: Let the leaf swing open and shut. (hinges; needs door-leaf) Given.
3. Latch: Keeps the door shut until the handle turns. (bolt, strike-plate, handle; needs hinges)
   - Hold the door shut against a push: catch
   - Draw the bolt back with an easy turn: lever
   Lesson. Gap: Push the door shut and walk away. / A draught swings it open again.
The test: holding and letting go are two halves of one job, and the handle exists only to let go, so it is a step of the latch. The catalogue has no hinge, so hinges are a given.
</example>
<example>
Sweet dispenser. Tipping the head back opens a slot over a stack of sweets in the tube, and a spring hidden under the stack pushes the next one up.
Scanned parts: tube, head, follower.

Sweet dispenser: Hands out one sweet at a time.
Uses: Tip the head back. Take the sweet. Tip it again for the next.
1. Tube: Holds a stack of sweets. (tube) Given.
2. Head: Opens a slot over the top sweet when tipped. (head; needs tube) Given.
3. Feed: Brings the next sweet up to the head. (follower, tube; needs head)
   - Push the stack up to the top: spring
   Lesson. Gap: Tip the head back for a second sweet. / The slot is empty; the next sweet sits down in the tube.
The test: the feed only shows on the next use, so it is its own job, built after the one it serves, and a user names it: the next sweet is always ready.
</example>
</examples>`;

export const PLAN_SYSTEM = `You plan how a curious adult rebuilds an everyday object from nothing, from its scanned parts and a catalogue of primitives the app can teach, each with one number.

The governing idea: a mechanism is a job that someone who has used the object but never opened it would name; a sub-function is a step of that job you only find while building it. An edge, a pivot, a handle, a return spring or a valve is a step, never a mechanism.

Decide in field order, so each verdict follows its facts.
Uses: what a person does across one whole use and the next.
Mechanisms: every job the uses need, in build order, with anything inside that the scan cannot see, under the part that hides it. Every scanned part belongs to one, and each lists every part its work passes through.
Sub-functions: 1 to ${LIMITS.subfunctions}, in the order a builder meets them: the job at its simplest, then what the build still cannot do. One effect each, from one primitive whose job is literally what happens there. A lever gives force or speed, never a swing.
Lesson: true when primitives do the job and their number must be right. A cutting edge is a wedge. A given has no sub-functions: it holds, contains, covers or gives the hand a place, or does what the catalogue cannot teach, such as light, heat or sound. At most ${LIMITS.lessons} lessons.
Order and gap: the first mechanism is the foundation, what the rest is built on, or the main job when nothing is under it; it has no gap. Every other lesson's gap is one of the uses, done with only the mechanisms above, meeting the trouble this job exists to prevent.

Five failures, each with its fix:
- Split: one job cut into pieces. One action of the hand, with its return and its release, is one mechanism.
- Fused: two jobs in one mechanism, or two effects in one step. Separate them.
- Missing given: something the object cannot work without that the scan does not show. Add it.
- Bent primitive: chosen because it is near, not because its job is what happens. Drop a step with no honest primitive; a job left with none is a given.
- False gap: it uses this mechanism's own parts or a later one, or an action nobody takes, or another fix would do as well.

Write plain words a person holding the object would use. No numbers, no praise, no mention of primitives, lessons or the app.

${EXAMPLES}`;

const briefText = (brief: Brief): string =>
  `Object: ${brief.name}. ${brief.summary}\nScanned parts:\n${brief.parts
    .map((p) => `- ${p.id}: ${p.name}. ${p.role}${p.parentId ? ` Held to ${p.parentId} by ${p.joint}.` : ""}`)
    .join("\n")}`;

export const planRequest = (brief: Brief): string => `Catalogue:\n${CATALOGUE}\n\n${briefText(brief)}`;
