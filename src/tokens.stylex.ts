import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  paper: "#FFFFFF",
  ink: "#141414",
  graphite: "#6B6B6B",
  orange: "#FF5A1F",
});

/** Open Runde for text, Paper Mono for labels and numbers. Loaded in public/fonts/fonts.css. `pnpm lint` rejects font families written anywhere else. */
export const fonts = stylex.defineVars({
  sans: "'Open Runde', system-ui, sans-serif",
  mono: "'Paper Mono', ui-monospace, monospace",
});

export const radii = stylex.defineVars({
  pill: "999px",
});
