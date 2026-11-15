import { Kit, type KitEvent, Part, parseKit } from "../shared/kit.ts";
import { RULES } from "../shared/rules.ts";
import { type Brain, streamStructured } from "./claude.ts";
import { kitJsonSchema } from "./schemas.ts";

export type Photo = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

const SYSTEM_PROMPT = `You are Larry. You look at photos of an everyday object and rebuild it as a kit of simple 3D parts, the way it was really made and put together, so a curious person can see how it works and rebuild it from first principles.

The kit is drawn as low-resolution dithered pixel art, about 150 pixels tall. Overall proportions, silhouette, colour and how the parts sit together decide whether it looks right. Small details like text, logos and tiny ridges never show, so leave them out.

Work in this order.

1. Name the object and estimate its real size in millimetres. Use what you know about this kind of object and any scale clues in the photo, like hands, tables or text.

2. Choose the parts: the separate physical pieces it would come apart into, ${RULES.parts.min} to ${RULES.parts.max} of them. Pick the pieces that give the object its look and the ones that explain how it works, like a cap, a seal, a handle, a spring or a button. Parts made as one moulded piece are one part. Prints, stickers, labels and logos are not parts.

3. Give each part a shape and real dimensions. Match the silhouette in the photo: measure each part's proportions against the whole object, not from memory of a typical one. When a part's side view is not a rectangle, like a tapered stapler arm, trace that side view as an extrusion.

4. Place each part by arithmetic, not by eye. Write down every part's extent along y before you choose positions, then stack them: a part sitting on another has centre y = top of the lower part + half its own height. A part must touch or overlap its parent by a millimetre or two where they join, or the kit falls apart on screen. Everywhere else, keep the open space the photo shows, like the gap under a stapler's arm or the hole inside a handle.

5. Colour each part with the colour you actually see on its lit side in the photo, as #rrggbb. A white mug in warm light is cream, not #ffffff. Pick the finish that matches the surface.

The object frame:
- Units are millimetres. y points up. The object rests on the ground plane y = 0 in the pose shown in the main photo, so a bottle stands and a pen lies down.
- The object is centred on x = 0 and z = 0.
- x points to the right as seen in the main photo, and z points toward the camera.

Shape tips:
- For a round part lying down, describe a lathe standing and rotate it: rotation z = -90 points the top of its profile toward +x, and z = 90 toward -x.
- Rotation x = 90 stands a torus up facing the camera, which is how a mug handle on the right is built: put the ring's centre at the body's right edge.

Joints: every part except the main one names its parent, the part it attaches to, and how it is held there. The main part's parentId and joint are null.

If the photos show several objects, build the one most centred and in focus. All photos show the same object; the first is the main view.`;

type KitStats = { ms: number; firstPartMs: number | undefined; costUsd: number };

const Header = Kit.pick({ name: true, summary: true });

export const KIT_BRAIN: Brain = { model: "claude-opus-5-5", effort: "low" };

/** Yields the header and each part as Claude writes them, then the checked kit. `onStats` fires just before `done`. */
export async function* streamKit(
  photos: Photo[],
  { brain = KIT_BRAIN, onStats, signal }: { brain?: Brain; onStats?: (stats: KitStats) => void; signal?: AbortSignal } = {},
): AsyncGenerator<KitEvent> {
  const started = Date.now();
  let firstPartMs: number | undefined;

  const content = [
    ...photos.map((photo) => ({ type: "image" as const, source: { type: "base64" as const, media_type: photo.mediaType, data: photo.base64 } })),
    { type: "text" as const, text: photos.length === 1 ? "Build the kit for this object." : `Build the kit for this object. These ${photos.length} photos show it from different sides.` },
  ];

  for await (const event of streamStructured({ system: SYSTEM_PROMPT, schema: kitJsonSchema, brain, content, streamKey: "parts", signal })) {
    if (event.type === "header") {
      const header = Header.safeParse(event.value);
      if (header.success) yield { type: "started", ...header.data };
    } else if (event.type === "item") {
      const part = Part.safeParse(event.value);
      if (!part.success) continue;
      firstPartMs ??= Date.now() - started;
      yield { type: "part", part: part.data };
    } else {
      const kit = parseKit(event.output);
      onStats?.({ ms: Date.now() - started, firstPartMs, costUsd: event.costUsd });
      yield { type: "done", kit };
      return;
    }
  }
  throw new Error("Kit generation ended without a result");
}
