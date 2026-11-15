import { colors } from "../tokens.stylex.ts";

/** The camera's settled design, in CSS px and ms. */
export const CAMERA = {
  /** The frame's inset from the screen's sides. */
  sideInset: 16,
  /** The band above the frame and the band below it are this tall, so the frame sits centred. */
  barHeight: 120,
  shutter: 88,
  wheel: { width: 112, height: 64, ridges: 19, rim: 3 },
  zoom: { min: 1, max: 5, perPixel: 0.02 },
  top: {
    /** The photo bar and the flash switch share one height; their widths are proportions of it. */
    height: 48,
    barAspect: 3.65,
    barRadius: 12,
    switchAspect: 1.75,
  },
  /** Dither cell size in CSS px for the bars, the raised parts and the grey photo. */
  grain: 1.5,
  /** Strength of the idle grain drifting on the bars and raised parts, 0 to 1. */
  idleDither: 0.6,
  /** How tall the raised parts stand; 1 keeps their presets. */
  relief: 1,
  maxPhotos: 3,
} as const;

/** The parts of the look still being tuned (see src/mock's dials). */
export type Tuning = {
  /** The capture sweep: a dithered synthwave band, after glimm's "Generate data" demo. */
  sweep: { ms: number; curve: number; grain: number };
  develop: DevelopLook;
};

export type DevelopLook = {
  /** How far the grey photo sways under the swell, in CSS px. */
  wave: number;
  /** How strongly the synthwave light shows on it, 0 to 1. */
  light: number;
  /** 1 is the resting pace. */
  speed: number;
  /** The frame's glow while Larry works: opacity 0 to 1, and its blur in CSS px. */
  glow: number;
  reach: number;
};

export const TUNING: Tuning = {
  sweep: { ms: 1200, curve: 0.12, grain: 1.5 },
  develop: { wave: 4, light: 0.35, speed: 1, glow: 0.8, reach: 18 },
};

/** The pink the primitives use for the part that matters. */
export const ACCENT = colors.pink;

export const even = (n: number) => Math.round(n / 2) * 2;
