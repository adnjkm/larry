import type { Rgb } from "./dither.ts";

/**
 * The raised look's tokens: the only place a look number lives. Every key, knob, cap and wheel is shaded from these,
 * so changing one here changes every part together. Only the bake reads them (see bake.ts), except `grain`, which the
 * paint step uses too.
 */
export const LOOK = {
  /**
   * Raised parts dither a little finer than the bars' grain: they are small and their shading is their whole shape.
   * A part's cell is `grain * fine` CSS px, rounded to whole device px.
   */
  fine: 0.67,
  /** Samples per cell side. Shading is worked out finer than the cells, then averaged, so edges don't alias. */
  samples: 3,
  light: {
    /** Degrees round the screen: 0 is from straight above, negative leans from the left. */
    angle: 0,
    /** Degrees above the screen plane. */
    height: 59,
    /** How hard a slope's facing changes its tone. */
    gain: 1.5,
    /** Share of the light that comes from the viewer instead. It shades every slope alike whichever way it faces, so an edge is drawn all the way round a part and not only on its far side. */
    fill: 0.35,
  },
  shadow: {
    /** Cast shadows are stretched this many times past what the light's height gives, so a 3 px lift throws a readable shadow. */
    reach: 2.2,
    /** How dark a fully shadowed cell goes, 0 to 1. */
    strength: 0.6,
    /** Width of the shadow's dithered edge, as a share of how far the ray has travelled. */
    soft: 0.35,
  },
  /** How much the neighbours hide the sky: creases and the floors of wells go a little darker. Radius in CSS px. */
  occlusion: { radius: 5, strength: 0.55 },
  /** Edge definition that doesn't depend on the light: convex edges lift, creases darken, the same all the way round. Radius in CSS px. */
  edge: { radius: 1.5, ridge: 0.5, crease: 0.7 },
  materials: {
    /** The wheel's greys plus white. The knob, the shutter, the wheel. */
    bone: {
      tones: [
        [26, 26, 26],
        [84, 84, 84],
        [168, 168, 168],
        [240, 240, 240],
        [255, 255, 255],
      ],
      flat: 0.82,
      floor: 0.2,
    },
    /** A dark moulded panel: tracks, slots, wells in the camera body. */
    slate: {
      tones: [
        [10, 10, 12],
        [26, 27, 32],
        [44, 46, 54],
        [78, 80, 90],
      ],
      flat: 0.42,
      floor: 0,
    },
    /** The accent, shaded toward ink and paper. */
    pink: {
      tones: [
        [60, 0, 40],
        [150, 0, 84],
        [255, 0, 135],
        [255, 120, 190],
        [255, 225, 240],
      ],
      flat: 0.55,
      floor: 0.1,
    },
  },
  /** The colour of a cast shadow falling on empty ground. */
  ink: [10, 10, 12],
} satisfies Look;

export type Material = {
  /** Dark to light. A cell's tone runs 0 to 1 along these. */
  tones: readonly Rgb[];
  /** Where a flat face sits along the tones. */
  flat: number;
  /** The darkest a face may go, as a share of `flat`. */
  floor: number;
};

export type Look = {
  fine: number;
  samples: number;
  light: { angle: number; height: number; gain: number; fill: number };
  shadow: { reach: number; strength: number; soft: number };
  occlusion: { radius: number; strength: number };
  edge: { radius: number; ridge: number; crease: number };
  materials: Record<string, Material>;
  ink: Rgb;
};

export type MaterialName = keyof typeof LOOK.materials;
/** Materials by index, the order `Field.owner` uses. */
export const MATERIAL_NAMES = Object.keys(LOOK.materials) as MaterialName[];
