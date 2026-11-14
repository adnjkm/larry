// The lesson for any object without hand-written rules: teach the library primitives its joints
// really are, then take it apart and name each part's job using only the kit's own role text.
import type { Joint, Kit, Part } from "../../../shared/kit.ts";
import type { Primitive } from "../../../src/primitives/library.ts";
import { type Inspect, primitiveById } from "../model.ts";

/**
 * Which library primitive a joint is an instance of, or null when it is fixed and does no job a
 * primitive teaches. A hinge is a pivot with a bar on it, which is the lever; a linkage needs
 * several bars pinned together, which one hinge is not. A slide is a guided rod, not a seal
 * pushing on a trapped fluid, so the piston would be a false lesson. Press-fits hold by friction.
 */
export const JOINT_PRIMITIVE: Readonly<Record<Joint, string | null>> = {
  thread: "thread",
  screw: "thread",
  spring: "spring",
  "snap-fit": "catch",
  hinge: "lever",
  "press-fit": "grip",
  slide: null,
  rivet: null,
  glue: null,
  weld: null,
  molded: null,
};

export function inspectLesson(kit: Kit): Inspect {
  const groups = new Map<Primitive, { joints: Set<string>; parts: Part[] }>();
  for (const part of kit.parts) {
    const id = part.joint ? JOINT_PRIMITIVE[part.joint] : null;
    if (!id || !part.joint) continue;
    const primitive = primitiveById(id);
    const group = groups.get(primitive) ?? { joints: new Set<string>(), parts: [] };
    group.joints.add(part.joint);
    group.parts.push(part);
    groups.set(primitive, group);
  }
  return {
    kind: "inspect",
    objectName: kit.name,
    teach: [...groups].map(([primitive, g]) => ({ primitive, joints: [...g.joints], parts: g.parts })),
    // Start with an attached part rather than the main body, which is the easy one.
    prompts: [...kit.parts.slice(1), ...kit.parts.slice(0, 1)],
  };
}
