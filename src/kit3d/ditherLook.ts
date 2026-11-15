import { colors } from "../tokens.stylex.ts";

/** Every adjustable number behind the dithered render. Colours are #rrggbb. */
export type DitherLook = {
  pixels: {
    /** CSS pixels per drawn pixel. A whole number keeps every drawn pixel the same size on screen. */
    size: number;
    /** Width of the Bayer threshold matrix. */
    matrix: 2 | 4 | 8;
    /** 0 gives hard bands between tones, 1 the full ordered dither. */
    dither: number;
  };
  tones: {
    count: number;
    /** How far the darkest tone goes toward ink. */
    dark: number;
    /** How far the lightest tone goes toward paper. */
    light: number;
    /** Below 1 pushes the in-between tones away from the part's own colour. */
    curve: number;
  };
  light: {
    /** Degrees around the viewer, negative is from the left. */
    angle: number;
    /** Degrees above the horizon. */
    height: number;
    ambient: number;
    /** Lightens edge-on surfaces when positive, inks them when negative. */
    rim: number;
    contrast: number;
    brightness: number;
    /** How much darker a dark-coloured part is shaded, so black stays black. */
    darkColors: number;
    /**
     * What counts as dark. "luminance" (the default) pushes a saturated pink down like a dark grey, so its lit faces dither
     * toward maroon; "value", the brightest channel, leaves saturated colours alone. For a grey they are the same number.
     */
    darkBy?: "luminance" | "value";
    specular: number;
  };
  shadow: {
    show: boolean;
    softness: number;
    /** Shadow strength above which it is drawn in ink instead of the accent colour. */
    core: number;
  };
  colors: { ink: string; paper: string; accent: string };
};

export const DEFAULT_LOOK: DitherLook = {
  pixels: { size: 2, matrix: 4, dither: 1 },
  tones: { count: 5, dark: 0.85, light: 0.88, curve: 0.77 },
  light: { angle: -47, height: 41, ambient: 0.08, rim: 0.15, contrast: 1, brightness: -0.06, darkColors: 0.3, specular: 1 },
  shadow: { show: true, softness: 1.4, core: 0.62 },
  colors: { ink: colors.ink, paper: colors.paper, accent: colors.accent },
};

/** The figure stage's look: the default, with dark parts judged by their brightest channel. */
export const STAGE_LOOK: DitherLook = { ...DEFAULT_LOOK, light: { ...DEFAULT_LOOK.light, darkBy: "value" } };
