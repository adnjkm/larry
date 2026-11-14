import * as stylex from "@stylexjs/stylex";
import { colors, fonts, radii } from "./tokens.stylex.ts";

export const type = stylex.create({
  label: { margin: 0, fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.graphite },
  labelAccent: { color: colors.accent },
  title: { margin: 0, fontSize: 24, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.02em", textWrap: "balance" },
  task: { margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em", textWrap: "balance" },
  story: { margin: 0, fontSize: 16, lineHeight: "22px", color: colors.ink },
  body: { margin: 0, fontSize: 14, lineHeight: "19px", color: colors.ink },
  muted: { margin: 0, fontSize: 14, lineHeight: "19px", color: colors.graphite },
  numeral: { margin: 0, fontSize: 84, lineHeight: "80px", fontWeight: 200, letterSpacing: "-0.05em" },
  numeralUnit: { margin: 0, fontSize: 17, lineHeight: "22px" },
});

export const layout = stylex.create({
  page: {
    boxSizing: "border-box",
    maxWidth: 480,
    minHeight: "100dvh",
    margin: "0 auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 20,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  stack: { display: "flex", flexDirection: "column", gap: 14 },
  tight: { display: "flex", flexDirection: "column", gap: 6 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 },
  /** Text blocks sit 8px inside the 20px gutter that cards and actions use. */
  inset: { paddingInline: 8 },
});

export const buttons = stylex.create({
  base: {
    boxSizing: "border-box",
    width: "100%",
    borderWidth: 0,
    fontFamily: fonts.sans,
    cursor: "pointer",
    touchAction: "manipulation",
    opacity: { default: 1, ":active": 0.8 },
  },
  primary: { minHeight: 48, padding: "0 20px", borderRadius: radii.pill, backgroundColor: colors.ink, color: colors.paper, fontSize: 16, lineHeight: "20px", fontWeight: 600 },
  secondary: { minHeight: 36, padding: "0 12px", backgroundColor: "transparent", color: colors.graphite, fontSize: 14, lineHeight: "18px", fontWeight: 500 },
  disabled: { backgroundColor: colors.soft, color: colors.graphite, cursor: "not-allowed" },
});

export const notes = stylex.create({
  base: { boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: radii.card, backgroundColor: colors.paper, boxShadow: `0 0 0 1px ${colors.hairline}` },
  fail: { backgroundColor: colors.failSoft },
  ok: { backgroundColor: colors.okSoft },
  accent: { backgroundColor: colors.accentSoft },
  failText: { color: colors.fail },
  okText: { color: colors.ok },
});

export const chips = stylex.create({
  base: { borderWidth: 0, padding: "4px 10px", borderRadius: radii.pill, fontFamily: fonts.sans, fontSize: 13, lineHeight: "18px", color: colors.ink },
  grey: { fontWeight: 500, backgroundColor: colors.soft },
  outline: { fontWeight: 600, backgroundColor: colors.paper, boxShadow: `inset 0 0 0 1.5px ${colors.ink}` },
});
