import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { chips, layout, notes, type } from "../styles.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { PRIMITIVE_BY_ID } from "./catalog.ts";
import { type Primitive, type Values, formatSlider, framingParts } from "./library.ts";
import { SYNTHWAVE } from "./parts.ts";

const FIGURE_HEIGHT = 270;

const thumb = { boxSizing: "border-box", width: 24, height: 24, borderRadius: 999, borderWidth: 0, backgroundColor: colors.paper, boxShadow: `0 0 0 1px ${colors.shadow}, 0 2px 6px ${colors.shadow}` } as const;
const track = { height: 4, borderRadius: 2, backgroundColor: colors.rule } as const;

const styles = stylex.create({
  figure: { display: "flex", flexDirection: "column", gap: 12 },
  intro: { display: "flex", flexDirection: "column", gap: 6 },
  introName: { margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" },
  sliders: { display: "flex", flexDirection: "column", gap: 2 },
  sliderRow: { display: "grid", gridTemplateColumns: "84px 1fr 64px", alignItems: "center", gap: 10, minHeight: 44, padding: "0 8px", borderRadius: 10 },
  sliderRowFocus: { backgroundColor: colors.accentSoft },
  range: { width: "100%", margin: 0, height: 32, cursor: "pointer" },
  rangeNeutral: {
    appearance: "none",
    backgroundColor: "transparent",
    "::-webkit-slider-runnable-track": track,
    "::-moz-range-track": track,
    "::-webkit-slider-thumb": { ...thumb, appearance: "none", marginTop: -10 },
    "::-moz-range-thumb": thumb,
  },
  rangePink: { accentColor: colors.pink },
  value: { fontFamily: fonts.mono, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  readouts: { display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, backgroundColor: colors.soft },
  readout: { display: "flex", justifyContent: "space-between", gap: 12, fontFamily: fonts.mono, fontSize: 13 },
  readoutValue: { textAlign: "right", color: colors.ink },
});

/** The primitives this one is built from, each once. */
export const madeOfPrimitives = (primitive: Primitive): Primitive[] => [...new Set(primitive.madeOf)].flatMap((id) => PRIMITIVE_BY_ID.get(id) ?? []);

type FigureProps = {
  primitive: Primitive;
  values: Values;
  /** Without this the figure is a still picture with no sliders or readouts. */
  onSlider?: (id: string, value: number) => void;
  /** The slider the problem is about. */
  focus?: string;
  /** Show the name, job and parts of a primitive the lesson has not shown before. */
  introduce?: boolean;
  height?: number;
  /** Sliders are neutral inside a lesson. The primitives library page draws them pink. */
  pink?: boolean;
};

export function PrimitiveFigure({ primitive, values, onSlider, focus, introduce = false, height = FIGURE_HEIGHT, pink = false }: FigureProps) {
  const parts = useMemo(() => primitive.build(values), [primitive, values]);
  const frame = useMemo(() => framingParts(primitive), [primitive]);
  const madeOf = madeOfPrimitives(primitive);

  return (
    <div data-figure={primitive.id} {...stylex.props(styles.figure)}>
      {introduce && (
        <div {...stylex.props(notes.base, notes.accent)}>
          <p {...stylex.props(type.label, type.labelAccent)}>New piece</p>
          <h3 {...stylex.props(styles.introName)}>{primitive.name}</h3>
          <p {...stylex.props(type.body)}>{primitive.job}</p>
          {madeOf.length > 0 && (
            <div {...stylex.props(layout.row)}>
              <span {...stylex.props(type.label)}>Made of</span>
              {madeOf.map((p) => (
                <span key={p.id} {...stylex.props(chips.base, chips.outline)}>
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <KitViewer parts={parts} frame={frame} elevation={primitive.view.elevation} azimuth={primitive.view.azimuth} height={height} pixelScale={1} shadowStops={SYNTHWAVE} />

      {onSlider && (
        <>
          <div {...stylex.props(styles.sliders)}>
            {primitive.sliders.map((s) => (
              <label key={s.id} data-slider={s.id} {...stylex.props(styles.sliderRow, focus === s.id && styles.sliderRowFocus)}>
                <span {...stylex.props(type.label, focus === s.id && type.labelAccent)}>{s.label}</span>
                <input
                  type="range"
                  aria-label={s.label}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={values[s.id] ?? s.initial}
                  onChange={(e) => onSlider(s.id, Number(e.currentTarget.value))}
                  {...stylex.props(styles.range, pink ? styles.rangePink : styles.rangeNeutral)}
                />
                <span {...stylex.props(styles.value)}>{formatSlider(s, values[s.id] ?? s.initial)}</span>
              </label>
            ))}
          </div>
          <div data-readouts {...stylex.props(styles.readouts)}>
            {primitive.readouts(values).map((r) => (
              <div key={r.label} {...stylex.props(styles.readout)}>
                <span {...stylex.props(type.label)}>{r.label}</span>
                <span {...stylex.props(styles.readoutValue)}>{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
