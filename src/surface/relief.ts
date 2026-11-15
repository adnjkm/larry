import { inset, tabInset } from "./dither.ts";
import type { MaterialName } from "./look.ts";

/**
 * Shapes and reliefs: what a part is, before it is lit. A part is a rounded rectangle with a relief, a height in
 * CSS px at every point on it. Reliefs are made of features that add.
 */

/** What a relief is told about a point on its part. */
export type At = {
  /** CSS px in from the part's edge. */
  d: number;
  /** 0 at the part's centre to 1 at its edge, squared (an ellipse's measure, so it suits circles and pills alike). */
  q: number;
  /** Half the part's shorter side. */
  half: number;
  /** The point, in CSS px from the part's top left, and the part's size. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The part's tab, if it is a speech bubble. Its body starts `tab.h` px down. */
  tab?: Tab;
};

/** Height in CSS px at a point on a part. */
export type Feature = (at: At) => number;
export type Relief = readonly Feature[];

/** A speech bubble's tab: a triangle pointing straight up from the top edge, centred `x` px in, `w` wide, `h` tall. */
export type Tab = { x: number; w: number; h: number };
/** A rounded rectangle, `w` x `h` with `r` corners; with a tab, the body is the part below it and `h` counts the tab. */
export type Shape = { w: number; h: number; r: number; tab?: Tab };
export const circle = (d: number): Shape => ({ w: d, h: d, r: d / 2 });
export const pill = (w: number, h: number): Shape => ({ w, h, r: Math.min(w, h) / 2 });
export const rrect = (w: number, h: number, r: number): Shape => ({ w, h, r });
/** A rounded rectangle with a tab pointing up out of its top, the whole `h` tall including the tab. */
export const bubble = (w: number, h: number, r: number, tab: Tab): Shape => ({ w, h, r, tab });

/** A quarter round: 0 at the edge, 1 once `b` px in. */
const round = (e: number, b: number) => Math.sqrt(1 - (1 - Math.min(1, Math.max(0, e / b))) ** 2);

export const feature = {
  /** Stands `lift` px proud, its edge rounding over `bevel` px. */
  raise:
    (lift: number, bevel: number): Feature =>
    ({ d }) =>
      lift * round(d, bevel),
  /** Cut `depth` px down, with a `bevel` px wall. */
  sink:
    (depth: number, bevel: number): Feature =>
    ({ d }) =>
      -depth * round(d, bevel),
  /** Bulges `rise` px toward the middle. */
  crown:
    (rise: number): Feature =>
    ({ q }) =>
      rise * Math.max(0, 1 - q),
  /**
   * A sculpted keycap, as on a phone's 3D keyboard: a top face, a rounded rectangle with radius `face`, standing
   * `lift` px, and round it a straight skirt sloping down to the part's edge. The skirt is `side` px wide at the sides,
   * thinner at the top and thicker at the bottom, as a key seen from a little in front. The face dips `dip` px toward
   * its middle row, with a crisp edge where it meets the skirt.
   */
  keycap:
    (lift: number, side: number, face: number, dip = 0): Feature =>
    ({ d, x, y: py, w, h: ph, tab }) => {
      const top = side * 0.6;
      const bottom = side * 1.5;
      // A bubble's face runs on up into its tab, so the tab is the same raised key, not a ramp off it.
      const lip = tab?.h ?? 0;
      const y = py - lip;
      const h = ph - lip;
      let f = inset(x - side, y - top, w - 2 * side, h - top - bottom, face);
      if (tab) f = Math.max(f, tabInset(x, py, tab, lip + top + face) - top);
      // The skirt rounds a little: steep at its foot and easing toward the face, so its shade graduates instead of
      // sitting at one flat tone, but it still meets the face at an angle, for a crisp edge.
      if (f < 0) {
        const t = Math.max(0, Math.min(1, d / Math.max(1e-6, d - f)));
        return lift * t * (1.6 - 0.6 * t);
      }
      const k = Math.min(1, f / 1.5);
      const v = Math.min(1, Math.abs(y - (top + (h - top - bottom) / 2)) / Math.max(1, (h - top - bottom) / 2));
      return lift - dip * k * (1 - v * v);
    },
  /** A bowl starting `rim` px in from the edge and `depth` px deep at the middle. Steepest at its lip. */
  bowl:
    (rim: number, depth: number): Feature =>
    ({ q, half }) =>
      -depth * Math.max(0, 1 - (q / (1 - rim / half) ** 2) ** 2),
};

/**
 * Presets, in px, on a short scale of lifts (1, 2, 3, 5), so parts of a kind stand the same height whatever their
 * size. Add one here before reaching for a one-off relief.
 */
export const RELIEF = {
  /** A key cap or knob: a face whose edge rounds over. The flash switch's knob. */
  cap: [feature.raise(3, 5), feature.crown(0.6)],
  capPressed: [feature.raise(1.2, 5), feature.crown(0.2)],
  /** A flat key with a tight edge. */
  key: [feature.raise(2, 3)],
  /** A sculpted keyboard key: a crisp, gently dished top face on a sloping skirt, the skirt deepest at the bottom. */
  keycap: [feature.keycap(2.4, 5, 6, 0.6)],
  /** The keycap held down: it stands lower. A button's press, not a state that stays. */
  keycapDown: [feature.keycap(1, 5, 6, 0.4)],
  /** A dish, like a 3DS circle pad: a rim round a bowl. The shutter. */
  dish: [feature.raise(3, 4), feature.bowl(9, 6)],
  dishPressed: [feature.raise(1.5, 4), feature.bowl(9, 3.5)],
  /** A slot sunk into the body, for a part to sit in. */
  slot: [feature.sink(2.5, 2.5)],
  flat: [],
} satisfies Record<string, Relief>;

export type ReliefName = keyof typeof RELIEF;

/** A dome rounded from edge to middle, sized to its part. */
export const dome = (half: number): Relief => [feature.raise(half * 0.45, half)];

/**
 * A thumbwheel's drum: a cylinder with its axis up the screen, V grooves round it, and a flat rim along the top and
 * bottom. `turn` is the drum's angle in radians; the pattern repeats every `2π / ridges`.
 */
export const drum =
  ({
    ridges,
    groove = 0.34,
    cut = 5,
    rim = 3,
    bulge = 0.5,
    turn = 0,
  }: {
    ridges: number;
    groove?: number;
    cut?: number;
    rim?: number;
    bulge?: number;
    turn?: number;
  }): Feature =>
  ({ x, y, w, h }) => {
    const R = w / 2;
    const s = Math.max(-0.999, Math.min(0.999, (x - R) / R));
    const body = bulge * R * Math.sqrt(1 - s * s);
    if (y < rim || y > h - rim) return body - cut * 0.6;
    const t = (((((Math.asin(s) + turn) * ridges) / (Math.PI * 2)) % 1) + 1) % 1;
    const v = t < groove ? 1 - Math.abs(t / groove - 0.5) * 2 : 0;
    return body - cut * v * Math.sqrt(1 - s * s);
  };

/** One part placed in a scene, in CSS px from the scene's top left. */
export type ScenePart = Shape & { x: number; y: number; relief: Relief; material?: MaterialName };

/** What gets baked together: parts painted back to front, their heights adding where they overlap (a key in a slot stands on the slot's floor). */
export type Scene = { width: number; height: number; parts: readonly ScenePart[] };

/**
 * A baked scene: per-cell data, before dithering. Baking is the expensive part and happens once per size; painting a
 * Field to pixels is cheap and can run every frame (see paint.ts).
 */
export type Field = {
  cols: number;
  rows: number;
  /** The cell's size in CSS px. */
  cell: number;
  /** 0 to 1 along the owning material's tones, before dithering. */
  tone: Float32Array;
  /** Index into MATERIAL_NAMES of the material covering most of the cell, or -1 where no part does. */
  owner: Int8Array;
  /** Share of the cell the parts cover, 0 to 1, for the dithered outline. */
  cover: Float32Array;
  /** Shadow cast onto empty ground in the cell, 0 to 1. */
  cast: Float32Array;
};
