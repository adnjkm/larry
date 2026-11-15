// Materials shared by every figure: one dither material per colour and finish, one shadow per palette. There is one
// renderer, so a shared material is one compiled program and one set of uniforms, never disposed (the palette is small).
import type { Finish } from "../../../shared/kit.ts";
import type { Material } from "three";
import { STAGE_LOOK } from "../../kit3d/ditherLook.ts";
import { createDitherMaterial, createLookUniforms, createShadowMaterial } from "../../kit3d/ditherMaterial.ts";
import { colors } from "../../tokens.stylex.ts";
import { COLOR, SYNTHWAVE } from "../../../shared/primitives/parts.ts";
import type { Looks } from "./scene.ts";

/** "library": the primitives page, Synthwave shadow and pink. "lesson": the app's palette, orange for the piece the step is about and blue for annotations. */
export type Palette = "library" | "lesson";

export const LESSON_COLOR: ReadonlyMap<string, string> = new Map<string, string>([
  [COLOR.focus, colors.accent],
  [COLOR.accent, colors.blue],
]);

/** The drag handle's ring colour. */
export const RING_COLOR: Record<Palette, string> = { library: colors.pink, lesson: colors.accent };

const look = createLookUniforms(STAGE_LOOK);
const parts = new Map<string, Material>();
const shadows = new Map<Palette, Material>();

const partLook = (color: string, finish: Finish): Material => {
  const key = `${color} ${finish}`;
  let m = parts.get(key);
  if (!m) {
    m = createDitherMaterial(color, finish, look);
    parts.set(key, m);
  }
  return m;
};

export function looksFor(palette: Palette): Looks {
  return {
    part: partLook,
    shadow: () => {
      let m = shadows.get(palette);
      if (!m) {
        m = createShadowMaterial(look, palette === "library" ? SYNTHWAVE : undefined);
        shadows.set(palette, m);
      }
      return m;
    },
  };
}
