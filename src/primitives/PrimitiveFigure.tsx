import * as stylex from "@stylexjs/stylex";
import { type ComponentProps, useEffect, useEffectEvent, useMemo, useRef } from "react";
import type { Part } from "../../shared/kit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { chips, layout, notes, type } from "../styles.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { PRIMITIVE_BY_ID } from "./catalog.ts";
import { framePrimitive } from "./framing.ts";
import { type Primitive, type Values, formatSlider } from "./library.ts";
import { COLOR, SYNTHWAVE } from "./parts.ts";

const FIGURE_HEIGHT = 270;

const thumb = { boxSizing: "border-box", width: 24, height: 24, borderRadius: 999, borderWidth: 0, backgroundColor: colors.paper, boxShadow: `0 0 0 1px ${colors.shadow}, 0 2px 6px ${colors.shadow}` } as const;
const track = { height: 4, borderRadius: 2, backgroundColor: colors.rule } as const;

const styles = stylex.create({
  figure: { display: "flex", flexDirection: "column", gap: 12 },
  intro: { display: "flex", flexDirection: "column", gap: 6 },
  introName: { margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em" },
  sliders: { display: "flex", flexDirection: "column", gap: 2 },
  // Label and value above a full-width track, so the thumb has the whole screen width to travel.
  sliderRow: { display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", columnGap: 10, rowGap: 2, padding: "10px 12px 4px", borderRadius: 12 },
  sliderTrack: { gridColumn: "1 / -1" },
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

/** A lesson draws in the app's palette, orange for the piece the step is about and blue for annotations. Synthwave is the library page's. */
const LESSON_COLOR = new Map<string, string>([
  [COLOR.focus, colors.accent],
  [COLOR.accent, colors.blue],
]);
const inLessonColors = (parts: Part[]): Part[] => parts.map((part) => ({ ...part, color: LESSON_COLOR.get(part.color) ?? part.color }));

/** The primitives this one is built from, each once. */
export const madeOfPrimitives = (primitive: Primitive): Primitive[] => [...new Set(primitive.madeOf)].flatMap((id) => PRIMITIVE_BY_ID.get(id) ?? []);

/** A range input that also reports `change`, which fires when a drag is released or a key press settles, where React's onChange fires on every step. */
function Range({ onCommit, ...props }: ComponentProps<"input"> & { onCommit?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useEffectEvent(() => onCommit?.());
  useEffect(() => {
    const input = ref.current;
    input?.addEventListener("change", commit);
    return () => input?.removeEventListener("change", commit);
  }, []);
  return <input ref={ref} type="range" {...props} />;
}

type FigureProps = {
  primitive: Primitive;
  values: Values;
  /** Without this the figure is a still picture with no sliders or readouts. */
  onSlider?: (id: string, value: number) => void;
  /** A slider was let go of, or a keyboard change settled. */
  onCommit?: (id: string) => void;
  /** The slider the problem is about. */
  focus?: string;
  /** Show the name, job and parts of a primitive the lesson has not shown before. */
  introduce?: boolean;
  height?: number;
  /**
   * The primitives library page: Synthwave colours, every slider and the live readouts. A lesson figure shows only
   * the slider its step asks about, because the readouts simulate a generic rig whose numbers are not the object's.
   */
  library?: boolean;
};

export function PrimitiveFigure({ primitive, values, onSlider, focus, onCommit, introduce = false, height = FIGURE_HEIGHT, library = false }: FigureProps) {
  const parts = useMemo(() => (library ? primitive.build(values) : inLessonColors(primitive.build(values))), [primitive, values, library]);
  const sliders = library ? primitive.sliders : primitive.sliders.filter((s) => s.id === focus);
  const frame = useMemo(() => framePrimitive(primitive), [primitive]);
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

      <KitViewer parts={parts} frame={frame} elevation={primitive.view.elevation} azimuth={primitive.view.azimuth} height={height} pixelScale={1} shadowStops={library ? SYNTHWAVE : undefined} />

      {onSlider && sliders.length > 0 && (
        <div {...stylex.props(styles.sliders)}>
          {sliders.map((s) => (
            <label key={s.id} data-slider={s.id} {...stylex.props(styles.sliderRow, focus === s.id && styles.sliderRowFocus)}>
              <span {...stylex.props(type.label, focus === s.id && type.labelAccent)}>{s.label}</span>
              <span {...stylex.props(styles.value)}>{formatSlider(s, values[s.id] ?? s.initial)}</span>
              <Range
                onCommit={() => onCommit?.(s.id)}
                aria-label={s.label}
                min={s.min}
                max={s.max}
                step={s.step}
                value={values[s.id] ?? s.initial}
                onChange={(e) => onSlider(s.id, Number(e.currentTarget.value))}
                {...stylex.props(styles.range, styles.sliderTrack, library ? styles.rangePink : styles.rangeNeutral)}
              />
            </label>
          ))}
        </div>
      )}

      {onSlider && library && (
        <div data-readouts {...stylex.props(styles.readouts)}>
          {primitive.readouts(values).map((r) => (
            <div key={r.label} {...stylex.props(styles.readout)}>
              <span {...stylex.props(type.label)}>{r.label}</span>
              <span {...stylex.props(styles.readoutValue)}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
