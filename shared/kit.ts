import { z } from "zod";

const Vec2 = z.object({ x: z.number(), y: z.number() });
const Vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

const Lathe = z
  .object({
    kind: z.literal("lathe"),
    profile: z
      .array(z.object({ r: z.number(), y: z.number() }))
      .describe(
        "The right half of the part's silhouette, listed bottom to top and spun around the part's vertical axis. r is the distance from the axis, y the height. Begin and end at r = 0 for a closed solid. End with r > 0 to leave that end open, like the rim of a cup.",
      ),
  })
  .describe("A part that is round when seen from above: bottles, caps, cups, pen barrels, knobs, lenses.");

const Box = z
  .object({
    kind: z.literal("box"),
    width: z.number().describe("Along x."),
    height: z.number().describe("Along y."),
    depth: z.number().describe("Along z."),
    cornerRadius: z.number().describe("Rounding of the edges. 0 for sharp."),
  })
  .describe("A block: phone bodies, laptop halves, keys, buttons, bases.");

const Torus = z
  .object({
    kind: z.literal("torus"),
    radius: z.number().describe("From the ring's centre to the middle of the tube."),
    tube: z.number().describe("Radius of the tube itself."),
    arcDegrees: z
      .number()
      .describe("360 for a closed ring. Less for an open arc, which starts on +x and sweeps toward +z when unrotated."),
  })
  .describe("A ring lying flat in the x-z plane before rotation: seals, O-rings, loops, handles (rotate a handle to stand it up).");

const Extrusion = z
  .object({
    kind: z.literal("extrusion"),
    outline: z
      .array(Vec2)
      .describe("A closed outline drawn as seen from the front, x right and y up. At least 3 points, no self-crossing."),
    depth: z.number().describe("How far the outline is pushed back along z."),
  })
  .describe("A flat cut-out with thickness: stapler arms, clips, blades, brackets, anything with an irregular side view.");

export const Shape = z.discriminatedUnion("kind", [Lathe, Box, Torus, Extrusion]);
export type Shape = z.infer<typeof Shape>;
export type ShapeKind = Shape["kind"];

export const JOINTS = ["thread", "press-fit", "snap-fit", "hinge", "spring", "slide", "screw", "rivet", "glue", "weld", "molded"] as const;
export const Joint = z.enum(JOINTS);
export type Joint = z.infer<typeof Joint>;

export const FINISHES = ["matte", "glossy", "metal", "rubber", "clear"] as const;
export const Finish = z.enum(FINISHES);
export type Finish = z.infer<typeof Finish>;

export const Part = z.object({
  id: z.string().describe("Short kebab-case id, unique in the kit."),
  name: z.string().describe("Its everyday name, 1 to 3 words."),
  role: z.string().describe("One plain sentence on what the part does for the object."),
  parentId: z
    .string()
    .nullable()
    .describe("The part this one attaches to. null only for the single main part everything else hangs off."),
  joint: Joint.nullable().describe("How this part is held to its parent. null only when parentId is null."),
  shape: Shape,
  position: Vec3.describe("Centre of the part's bounding box in the object frame, in mm."),
  rotation: Vec3.describe("Degrees about x, then y, then z, around the part's centre. All 0 keeps the shape as described."),
  color: z.string().describe("The part's main colour in the photos, as #rrggbb."),
  finish: Finish,
});
export type Part = z.infer<typeof Part>;

export const Kit = z.object({
  name: z.string().describe("What the object is, 1 to 4 words."),
  summary: z.string().describe("One plain sentence on how it works."),
  parts: z.array(Part),
});
export type Kit = z.infer<typeof Kit>;

export const KitEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), name: z.string(), summary: z.string() }),
  z.object({ type: z.literal("part"), part: Part }),
  z.object({ type: z.literal("done"), kit: Kit }),
  z.object({ type: z.literal("failed"), message: z.string() }),
]);
export type KitEvent = z.infer<typeof KitEvent>;

const { $schema: _dialect, ...kitSchemaBody } = z.toJSONSchema(Kit);
export const kitJsonSchema: Record<string, unknown> = kitSchemaBody;

export class KitError extends Error {}

export function parseKit(raw: unknown): Kit {
  const kit = Kit.parse(raw);
  const problems = kitProblems(kit);
  if (problems.length > 0) throw new KitError(problems.join("\n"));
  return kit;
}

export function kitProblems(kit: Kit): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const part of kit.parts) {
    if (ids.has(part.id)) problems.push(`duplicate id ${part.id}`);
    ids.add(part.id);
  }
  const roots = kit.parts.filter((p) => p.parentId === null);
  if (roots.length !== 1) problems.push(`expected exactly one root part, found ${roots.length}`);
  for (const part of kit.parts) {
    if (part.parentId !== null && !ids.has(part.parentId)) problems.push(`${part.id} has unknown parent ${part.parentId}`);
    if ((part.parentId === null) !== (part.joint === null)) problems.push(`${part.id} must have a joint exactly when it has a parent`);
    if (!/^#[0-9a-f]{6}$/i.test(part.color)) problems.push(`${part.id} color ${part.color} is not #rrggbb`);
    problems.push(...shapeProblems(part.id, part.shape));
  }
  return problems;
}

function shapeProblems(id: string, shape: Shape): string[] {
  const positive = (label: string, n: number) => (n > 0 ? [] : [`${id} ${label} must be > 0`]);
  switch (shape.kind) {
    case "lathe":
      return shape.profile.length >= 2 ? shape.profile.flatMap((p) => (p.r >= 0 ? [] : [`${id} profile r must be >= 0`])) : [`${id} lathe profile needs 2+ points`];
    case "box":
      return [...positive("width", shape.width), ...positive("height", shape.height), ...positive("depth", shape.depth)];
    case "torus":
      return [...positive("radius", shape.radius), ...positive("tube", shape.tube), ...positive("arcDegrees", shape.arcDegrees)];
    case "extrusion":
      return shape.outline.length >= 3 ? positive("depth", shape.depth) : [`${id} outline needs 3+ points`];
  }
}
