import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";
import { chips, layout, type } from "../ui/styles.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { reducedMotion } from "../motion.ts";
import { PRIMITIVES } from "../../shared/primitives/library.ts";
import { startingId } from "./startingId.ts";
import { madeOfPrimitives } from "./PrimitiveFigure.tsx";
import { GameScreen } from "./game/GameScreen.tsx";
import type { Level, Primitive } from "../../shared/primitives/types.ts";

const styles = stylex.create({
  idea: { margin: 0, fontSize: 17, lineHeight: 1.4 },
  link: { cursor: "pointer" },
  // Where the back button scrolls to: just above the element and mechanism lists.
  listTop: { height: 0, marginTop: -20, scrollMarginTop: 20 },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
  },
  row: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "32px 1fr auto",
    alignItems: "baseline",
    gap: 10,
    padding: "14px 2px",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
    backgroundColor: "transparent",
    color: colors.ink,
    fontFamily: fonts.sans,
    textAlign: "left",
    cursor: "pointer",
  },
  rowActive: { color: colors.pinkText },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  rowIndex: { fontFamily: fonts.mono, fontSize: 12 },
  rowName: { fontSize: 16, fontWeight: 600 },
  rowKind: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.graphite },
});

export default function PrimitivesPage() {
  const [id, setId] = useState(() => startingId("primitives"));
  const primitive = PRIMITIVES.find((p) => p.id === id) ?? (PRIMITIVES[0] as Primitive);

  const select = (next: string) => {
    setId(next);
    const url = new URL(location.href);
    url.searchParams.set("primitives", next);
    history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "instant" : "smooth" });
  };

  const sameLevel = PRIMITIVES.filter((p) => p.level === primitive.level);
  const index = sameLevel.indexOf(primitive) + 1;
  const usedIn = PRIMITIVES.filter((p) => p.madeOf.includes(primitive.id));

  const kicker = `${primitive.level} ${String(index).padStart(2, "0")} of ${sameLevel.length}`;
  const list = useRef<HTMLDivElement>(null);
  const toList = () => list.current?.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });

  const details = (
    <>
      <p {...stylex.props(styles.idea)}>{primitive.job}</p>
      <p {...stylex.props(type.muted)}>{primitive.howItWorks}</p>

      {[
        { label: "Made of", items: madeOfPrimitives(primitive) },
        { label: "Used in", items: usedIn },
      ].map(
        ({ label, items }) =>
          items.length > 0 && (
            <div key={label} {...stylex.props(layout.row)}>
              <span {...stylex.props(type.label)}>{label}</span>
              {items.map((b) => (
                <button key={b.id} type="button" {...stylex.props(chips.base, chips.outline, styles.link)} onClick={() => select(b.id)}>
                  {b.name}
                </button>
              ))}
            </div>
          ),
      )}

      <div {...stylex.props(layout.row)}>
        <span {...stylex.props(type.label)}>Seen in</span>
        {primitive.seenIn.map((f) => (
          <span key={f} {...stylex.props(chips.base, chips.grey)}>
            {f}
          </span>
        ))}
      </div>

      <div ref={list} {...stylex.props(styles.listTop)} />
      {(["Element", "Mechanism"] as Level[]).map((level) => (
        <section key={level} {...stylex.props(styles.section)}>
          <p {...stylex.props(type.label)}>{level === "Element" ? "Elements · one piece, one job" : "Mechanisms · elements combined into a new job"}</p>
          <ul {...stylex.props(styles.list)}>
            {PRIMITIVES.filter((p) => p.level === level).map((p, i) => (
              <li key={p.id}>
                <button type="button" {...stylex.props(styles.row, p.id === primitive.id && styles.rowActive)} onClick={() => select(p.id)}>
                  <span {...stylex.props(styles.rowIndex)}>{String(i + 1).padStart(2, "0")}</span>
                  <span {...stylex.props(styles.rowName)}>{p.name}</span>
                  <span {...stylex.props(styles.rowKind)}>{p.madeOf.length > 0 ? p.madeOf.join(" + ") : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );

  return (
    <main {...stylex.props(layout.page)}>
      {/* Keyed so a new primitive starts a new game: its own controller, phase and verdict. */}
      <GameScreen key={primitive.id} primitive={primitive} kicker={kicker} onBack={toList}>
        {details}
      </GameScreen>
    </main>
  );
}
