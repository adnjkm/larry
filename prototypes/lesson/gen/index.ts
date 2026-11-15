// A scanned object as a course: the rig installs the works in the scanned outside, and the hand-made pen's story and
// course are played on the result. The scan gives the names, the one-line "does" and the tips; the rest is the gold's.
import type { GenCourse } from "../../../shared/course/gen.ts";
import type { Course } from "../course.ts";
import { penStory } from "../lessons/pen.ts";
import { penCourseOf, type PenMechanismId, type PenWords } from "../lessons/pen-course.ts";
import { installPen, RigError } from "./rig.ts";

export { RigError } from "./rig.ts";

const SUPPORTED: readonly string[] = ["click-latch", "ball-tip"] satisfies readonly PenMechanismId[];

/** The course for a scanned object. Throws a RigError listing what is wrong when the kit cannot take the works. */
export function courseFromGen(gen: GenCourse): Course {
  const problems = gen.mechanisms.filter((m) => !SUPPORTED.includes(m.entry)).map((m) => `no rig for mechanism entry "${m.entry}" (supported: ${SUPPORTED.join(", ")})`);
  const order = gen.mechanisms.map((m) => m.entry as PenMechanismId);
  if (new Set(order).size < order.length) problems.push("a mechanism entry is used twice");
  if (!order.includes("click-latch")) problems.push('the pen rig needs the "click-latch" mechanism');
  const of = (entry: PenMechanismId) => gen.mechanisms.find((m) => m.entry === entry);
  const [click, tip] = [of("click-latch"), of("ball-tip")];
  for (const piece of ["spring", "cam"]) if (click && !click.tips[piece]) problems.push(`click-latch has no tips for "${piece}"`);
  if (tip && !tip.tips.ball) problems.push('ball-tip has no tips for "ball"');
  if (problems.length > 0 || !click) throw new RigError(problems);

  const { dims, kit, reveal } = installPen(gen);
  const { story, rig } = penStory(dims, kit, { objectName: gen.object });
  const words: PenWords = {
    click: { name: click.name, does: click.does, spring: click.tips.spring!, cam: click.tips.cam! },
    tip: { name: tip?.name ?? "", does: tip?.does ?? "", ball: tip?.tips.ball ?? [] },
  };
  return penCourseOf(story, rig, reveal, words, order);
}
