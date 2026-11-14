import * as stylex from "@stylexjs/stylex";
import { useMemo } from "react";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { PRIMITIVE_BY_ID } from "../primitives/catalog.ts";
import { type Primitive, type Values, formatSlider, framingParts } from "../primitives/library.ts";
import { SYNTHWAVE } from "../primitives/parts.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { ui } from "./lessonTokens.stylex.ts";
import { layout, type } from "./styles.ts";

const FIGURE_HEIGHT = 270;

const styles = stylex.create({
  figure: { display: "flex", flexDirection: "column", gap: 12 },
  intro: { display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", borderRadius: 14, backgroundColor: ui.accentSoft },
  introName: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" },
  sliders: { display: "flex", flexDirection: "column", gap: 2 },
  sliderRow: { display: "grid", gridTemplateColumns: "84px 1fr 64px", alignItems: "center", gap: 10, minHeight: 44, padding: "0 8px", borderRadius: 10 },
  sliderRowFocus: { backgroundColor: ui.accentSoft },
  range: { width: "100%", margin: 0, accentColor: ui.accent, height: 32, cursor: "pointer" },
  value: { fontFamily: fonts.mono, fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" },
  readouts: { display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, backgroundColor: ui.surface },
  readout: { display: "flex", justifyContent: "space-between", gap: 12, fontFamily: fonts.mono, fontSize: 13 },
  readoutValue: { textAlign: "right", color: colors.ink },
  chip: { fontSize: 13, fontWeight: 500, padding: "4px 10px", borderRadius: 999, backgroundColor: ui.surface },
});

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
};

export function PrimitiveFigure({ primitive, values, onSlider, focus, introduce = false, height = FIGURE_HEIGHT }: FigureProps) {
  const parts = useMemo(() => primitive.build(values), [primitive, values]);
  const frame = useMemo(() => framingParts(primitive), [primitive]);
  const kit = useMemo(() => ({ name: primitive.name, summary: primitive.job, parts }), [primitive, parts]);
  const madeOf = [...new Set(primitive.madeOf)].flatMap((id) => PRIMITIVE_BY_ID.get(id) ?? []);

  return (
    <div data-figure={primitive.id} {...stylex.props(styles.figure)}>
      {introduce && (
        <div {...stylex.props(styles.intro)}>
          <p {...stylex.props(type.label, type.labelAccent)}>New piece</p>
          <h3 {...stylex.props(styles.introName)}>{primitive.name}</h3>
          <p {...stylex.props(type.body)}>{primitive.job}</p>
          {madeOf.length > 0 && (
            <div {...stylex.props(layout.row)}>
              <span {...stylex.props(type.label)}>Made of</span>
              {madeOf.map((p) => (
                <span key={p.id} {...stylex.props(styles.chip)}>
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <KitViewer kit={kit} frame={frame} elevation={primitive.view.elevation} azimuth={primitive.view.azimuth} height={height} pixelScale={1} shadowStops={SYNTHWAVE} />

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
                  {...stylex.props(styles.range)}
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
