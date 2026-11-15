import * as stylex from "@stylexjs/stylex";
import { Children, type ReactNode } from "react";
import { colors, fonts } from "../tokens.stylex.ts";
import { titleCase } from "./titleCase.ts";

/**
 * The words in a speech bubble under the lesson's header: Open Runde at 15, ink, centred, in title case, as on a pill
 * ({@link PillLabel}). Text made of strings is joined before it's cased. `pnpm lint` (larry/title-case) rejects
 * literal text that isn't already in title case.
 */
export function BubbleLabel({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children);
  const text = parts.every((p) => typeof p === "string" || typeof p === "number") ? titleCase(parts.join("")) : children;
  return <span {...stylex.props(s.label)}>{text}</span>;
}

const s = stylex.create({
  label: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: "20px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    textAlign: "center",
  },
});
