import * as stylex from "@stylexjs/stylex";

// defineConsts, not defineVars: the compiler inlines these as plain values, so the WebGL code
// (KitViewer's background, the shader palette) reads the same hex strings the stylesheet uses.
export const colors = stylex.defineConsts({
  paper: "#FFFFFF",
  ink: "#141414",
  graphite: "#6B6B6B",
  rule: "#E2E2E2",
  soft: "#F4F4F4",
  segmentTodo: "#D6D6D6",
  accent: "#FF5A1F",
  /** The accent darkened (same hue) to reach 4.5:1 on paper, for small text. */
  accentText: "#C8460F",
  accentSoft: "#FF5A1F0F",
  blue: "#2F6BFF",
  pink: "#FF0087",
  pinkText: "#D6006F",
  fail: "#C8281C",
  failSoft: "#FDECEA",
  ok: "#0B7A3E",
  okSoft: "#E6F4EC",
  edge: "#14141414",
  hairline: "#1414140F",
  faint: "#1414140D",
  shadow: "#14141426",
  /** The game meters' failing bar, its darker text, the empty track and the unlit page dot. */
  red: "#E0432B",
  redText: "#C2331D",
  track: "#EFEFEF",
  dotOff: "#DADADA",
  /** Paper at 85%, for a button over the figure. */
  paperGlass: "#FFFFFFD9",
});

/** Open Runde for text, Paper Mono for labels and numbers. Loaded in public/fonts/fonts.css. `pnpm lint` rejects font families written anywhere else. */
export const fonts = stylex.defineConsts({
  sans: "'Open Runde', system-ui, sans-serif",
  mono: "'Paper Mono', ui-monospace, monospace",
});

export const radii = stylex.defineConsts({
  pill: 999,
  card: 16,
  tile: 14,
  marker: 2,
});
