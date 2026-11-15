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

/**
 * A speech bubble that says what kind of thing it names: the name in Open Runde with its kind after it in Paper Mono
 * capitals, centred ("Ball Tip (MECHANISM)"). Given a line of text, it grows to explain the thing too: that line sits
 * under the name, and both are set at 16.
 */
export function BubbleTerm({ name, kind, children }: { name: string; kind: string; children?: string }) {
  return (
    <span {...stylex.props(s.term)}>
      <span {...stylex.props(s.head)}>
        <span {...stylex.props(s.name, children !== undefined && s.nameLarge)}>{titleCase(name)}</span>
        <span {...stylex.props(s.kind)}>({kind})</span>
      </span>
      {children === undefined ? null : <span {...stylex.props(s.does)}>{children}</span>}
    </span>
  );
}

const s = stylex.create({
  term: { position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: colors.ink, fontFamily: fonts.sans, textAlign: "center" },
  head: { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8 },
  name: { fontSize: 15, lineHeight: "20px", fontWeight: 600, letterSpacing: "-0.01em" },
  nameLarge: { fontSize: 16, lineHeight: "22px", fontWeight: 700 },
  kind: { fontFamily: fonts.mono, fontSize: 12, lineHeight: "16px", letterSpacing: "0.04em", textTransform: "uppercase", color: colors.graphite },
  does: { fontSize: 16, lineHeight: "22px", fontWeight: 500 },
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
