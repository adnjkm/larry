import * as stylex from "@stylexjs/stylex";
import { colors, fonts } from "../tokens.stylex.ts";
import { ui } from "./lessonTokens.stylex.ts";

export const type = stylex.create({
  label: { margin: 0, fontFamily: fonts.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.graphite },
  labelAccent: { color: ui.accent },
  display: { margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.025em", textWrap: "balance" },
  title: { margin: 0, fontSize: 26, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.02em", textWrap: "balance" },
  lead: { margin: 0, fontSize: 17, lineHeight: 1.5, color: colors.ink },
  body: { margin: 0, fontSize: 16, lineHeight: 1.55, color: colors.ink },
  muted: { margin: 0, fontSize: 15, lineHeight: 1.5, color: colors.graphite },
});

export const layout = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 14 },
  tight: { display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 },
});

export const buttons = stylex.create({
  base: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: 54,
    padding: "0 20px",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.ink,
    borderRadius: 14,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 17,
    fontWeight: 600,
    cursor: "pointer",
    touchAction: "manipulation",
  },
  primary: { borderColor: ui.accent, backgroundColor: ui.accent, color: "#FFFFFF" },
  quiet: { borderColor: ui.line },
  disabled: { borderColor: ui.line, backgroundColor: ui.surface, color: colors.graphite, cursor: "not-allowed" },
});

export const notes = stylex.create({
  base: { boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", borderRadius: 14, backgroundColor: ui.surface },
  observation: { borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: colors.ink, borderRadius: 4 },
  fail: { backgroundColor: ui.failSoft, borderLeftColor: ui.fail },
  ok: { backgroundColor: ui.okSoft, borderLeftColor: ui.ok },
  accent: { backgroundColor: ui.accentSoft, borderLeftColor: ui.accent },
  failText: { color: ui.fail },
  okText: { color: ui.ok },
});
