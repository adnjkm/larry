import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { colors, fonts } from "../tokens.stylex.ts";
import { PRIMITIVES, type Primitive, type Values, formatSlider, framingParts, initialValues } from "./library.ts";
import { SYNTHWAVE } from "./parts.ts";
import type { Level } from "./types.ts";

const VIEWER_HEIGHT = 360;

const styles = stylex.create({
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
  label: { margin: 0, fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: colors.graphite },
  title: { margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" },
  idea: { margin: 0, fontSize: 17, lineHeight: 1.4 },
  body: { margin: 0, fontSize: 15, lineHeight: 1.5, color: colors.graphite },
  sliders: { display: "flex", flexDirection: "column", gap: 4 },
  sliderRow: { display: "grid", gridTemplateColumns: "84px 1fr 72px", alignItems: "center", gap: 12, minHeight: 40 },
  range: { width: "100%", margin: 0, accentColor: "#ff0087", height: 32, cursor: "pointer" },
  value: { fontFamily: fonts.mono, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  readouts: { display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, backgroundColor: "#F4F4F4" },
  readout: { display: "flex", justifyContent: "space-between", gap: 12, fontFamily: fonts.mono, fontSize: 13 },
  readoutValue: { textAlign: "right" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 13, fontWeight: 500, padding: "4px 10px", borderRadius: 999, backgroundColor: "#F4F4F4" },
  link: { fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 999, borderWidth: 1, borderStyle: "solid", borderColor: colors.ink, backgroundColor: colors.paper, color: colors.ink, cursor: "pointer" },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#E2E2E2" },
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
    borderBottomColor: "#E2E2E2",
    backgroundColor: "transparent",
    color: colors.ink,
    fontFamily: fonts.sans,
    textAlign: "left",
    cursor: "pointer",
  },
  rowActive: { color: "#ff0087" },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  rowIndex: { fontFamily: fonts.mono, fontSize: 12 },
  rowName: { fontSize: 16, fontWeight: 600 },
  rowKind: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.graphite },
});

function startingId(): string {
  const asked = new URLSearchParams(location.search).get("primitives");
  return PRIMITIVES.some((p) => p.id === asked) ? (asked as string) : (PRIMITIVES[0] as Primitive).id;
}

export default function PrimitivesPage() {
  const [id, setId] = useState(startingId);
  const primitive = PRIMITIVES.find((p) => p.id === id) ?? (PRIMITIVES[0] as Primitive);
  const [values, setValues] = useState<Record<string, Values>>({});
  const v = values[primitive.id] ?? initialValues(primitive);

  const parts = useMemo(() => primitive.build(v), [primitive, v]);
  const frame = useMemo(() => framingParts(primitive), [primitive]);
  const kit = useMemo(() => ({ name: primitive.name, summary: primitive.job, parts }), [primitive, parts]);

  const select = (next: string) => {
    setId(next);
    const url = new URL(location.href);
    url.searchParams.set("primitives", next);
    history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const sameLevel = PRIMITIVES.filter((p) => p.level === primitive.level);
  const index = sameLevel.indexOf(primitive) + 1;
  const madeOf = primitive.madeOf.flatMap((b) => PRIMITIVES.filter((p) => p.id === b));
  const usedIn = PRIMITIVES.filter((p) => p.madeOf.includes(primitive.id));

  return (
    <main {...stylex.props(styles.page)}>
      <div>
        <p {...stylex.props(styles.label)}>
          {primitive.level} {String(index).padStart(2, "0")} of {sameLevel.length}
        </p>
        <h1 {...stylex.props(styles.title)}>{primitive.name}</h1>
      </div>

      <KitViewer
        kit={kit}
        frame={frame}
        elevation={primitive.view.elevation}
        azimuth={primitive.view.azimuth}
        height={VIEWER_HEIGHT}
        pixelScale={1}
        shadowStops={SYNTHWAVE}
      />

      <div {...stylex.props(styles.sliders)}>
        {primitive.sliders.map((s) => (
          <label key={s.id} {...stylex.props(styles.sliderRow)}>
            <span {...stylex.props(styles.label)}>{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={v[s.id] ?? s.initial}
              onChange={(e) => {
                const n = Number(e.currentTarget.value);
                setValues((all) => ({ ...all, [primitive.id]: { ...v, [s.id]: n } }));
              }}
              {...stylex.props(styles.range)}
            />
            <span {...stylex.props(styles.value)}>{formatSlider(s, v[s.id] ?? s.initial)}</span>
          </label>
        ))}
      </div>

      <div {...stylex.props(styles.readouts)}>
        {primitive.readouts(v).map((r) => (
          <div key={r.label} {...stylex.props(styles.readout)}>
            <span {...stylex.props(styles.label)}>{r.label}</span>
            <span {...stylex.props(styles.readoutValue)}>{r.value}</span>
          </div>
        ))}
      </div>

      <p {...stylex.props(styles.idea)}>{primitive.job}</p>
      <p {...stylex.props(styles.body)}>{primitive.howItWorks}</p>

      {[
        { label: "Made of", items: madeOf },
        { label: "Used in", items: usedIn },
      ].map(
        ({ label, items }) =>
          items.length > 0 && (
            <div key={label} {...stylex.props(styles.chips)}>
              <span {...stylex.props(styles.label)}>{label}</span>
              {items.map((b) => (
                <button key={b.id} type="button" {...stylex.props(styles.link)} onClick={() => select(b.id)}>
                  {b.name}
                </button>
              ))}
            </div>
          ),
      )}

      <div {...stylex.props(styles.chips)}>
        <span {...stylex.props(styles.label)}>Seen in</span>
        {primitive.seenIn.map((f) => (
          <span key={f} {...stylex.props(styles.chip)}>
            {f}
          </span>
        ))}
      </div>

      {(["Element", "Mechanism"] as Level[]).map((level) => (
        <section key={level} {...stylex.props(styles.section)}>
          <p {...stylex.props(styles.label)}>{level === "Element" ? "Elements · one piece, one job" : "Mechanisms · elements combined into a new job"}</p>
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
    </main>
  );
}
