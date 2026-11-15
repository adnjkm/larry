// The small live pieces of the game page. Each subscribes to the store on its own and picks the one thing it shows,
// so while a run plays only these re-render and the page around them does not.
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, memo } from "react";
import { type } from "../../ui/styles.ts";
import { colors, fonts } from "../../tokens.stylex.ts";
import type { Primitive, Slider } from "../../../shared/primitives/library.ts";
import type { Game, Meter, Verdict } from "../../../shared/primitives/types.ts";
import { headlineText, meterFraction, meterMet, togglesLabel } from "./logic.ts";
import { type GameStore, useSelect } from "./store.ts";

// From the Paper design: the meter's red, and the unlit toggle / dot grey.
const RED = "#E0432B";
const TRACK = "#EFEFEF";

const styles = stylex.create({
  // One grid per group of rows, so the label, bar and value columns line up from row to row.
  grid: { display: "grid", gridTemplateColumns: "96px minmax(48px, 1fr)", columnGap: 12, rowGap: 10, alignItems: "center" },
  gridRow: { display: "grid", gridTemplateColumns: "subgrid", gridColumn: "1 / -1", alignItems: "center", minHeight: 20 },
  label: { margin: 0, fontFamily: fonts.mono, fontSize: 11, lineHeight: "14px", letterSpacing: "0.08em", textTransform: "uppercase", color: colors.graphite, overflowWrap: "break-word" },
  labelInk: { color: colors.ink },
  bar: { position: "relative", height: 20 },
  barTrack: { position: "absolute", left: 0, right: 0, top: 7, height: 6, borderRadius: 3, backgroundColor: TRACK },
  barFill: (width: string) => ({ position: "absolute", left: 0, top: 7, height: 6, width, borderRadius: 3, backgroundColor: colors.ink }),
  barFillBad: { backgroundColor: RED },
  tick: (left: string) => ({ position: "absolute", top: 1, left, width: 2, height: 18, marginLeft: -1, borderRadius: 1, backgroundColor: colors.ink }),
  divider: { gridColumn: "1 / -1", height: 1, marginTop: 2, backgroundColor: colors.rule },
  sliderRow: { minHeight: 44, borderTopWidth: 0 },
  range: { display: "block", width: "100%", height: 44, margin: 0, cursor: "pointer", accentColor: colors.pink, touchAction: "pan-y" },
  toggles: { gridColumn: "2 / -1", display: "flex", gap: 4, minWidth: 0 },
  toggle: {
    flex: "1 1 0",
    minWidth: 0,
    height: 44,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    touchAction: "manipulation",
    outline: { default: "none", ":focus-visible": `2px solid ${colors.pink}` },
    outlineOffset: -2,
    borderRadius: 6,
  },
  toggleBox: { width: "100%", maxWidth: 30, aspectRatio: "1 / 1", borderRadius: 4, backgroundColor: colors.rule, transitionProperty: "background-color", transitionDuration: "120ms" },
  toggleOn: { backgroundColor: colors.pink },
  verdict: { margin: 0, minHeight: 40, fontSize: 14, lineHeight: "20px", color: colors.ink, textAlign: "center", textWrap: "balance" },
  readouts: { display: "flex", flexDirection: "column", gap: 6, padding: 14, borderRadius: 14, backgroundColor: colors.soft },
  readout: { display: "flex", justifyContent: "space-between", gap: 12, fontFamily: fonts.mono, fontSize: 13 },
  readoutValue: { textAlign: "right", color: colors.ink },
});

function MeterRow({ meter }: { meter: Meter }) {
  const met = meterMet(meter);
  return (
    <div data-meter={meter.label} data-state={met ? "met" : "unmet"} {...stylex.props(styles.gridRow)}>
      <span {...stylex.props(styles.label)}>{meter.label}</span>
      <div aria-hidden {...stylex.props(styles.bar)}>
        <div {...stylex.props(styles.barTrack)} />
        <div {...stylex.props(styles.barFill(`${meterFraction(meter.value, meter.max) * 100}%`), !met && styles.barFillBad)} />
        <div {...stylex.props(styles.tick(`${meterFraction(meter.target, meter.max) * 100}%`))} />
      </div>
    </div>
  );
}

/** The game's two meters, live for whatever the figure shows. Rows for a parent that is a `Sliders` grid. */
export function Meters({ store, game }: { store: GameStore; game: Game }) {
  const values = useSelect(store, (v) => v);
  return (
    <>
      {game.meters(values).map((m) => (
        <MeterRow key={m.label} meter={m} />
      ))}
    </>
  );
}

/** One slider row: label, pink track, value. Drives the stage controller; shows what the controller says, so a drag of the figure moves it too. */
export const SliderRow = memo(function SliderRow({ store, slider, ink = false }: { store: GameStore; slider: Slider; ink?: boolean }) {
  const value = useSelect(store, (v) => v[slider.id] ?? slider.initial);
  return (
    <label data-slider={slider.id} {...stylex.props(styles.gridRow, styles.sliderRow)}>
      <span {...stylex.props(styles.label, ink && styles.labelInk)}>{slider.label}</span>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        aria-label={slider.label}
                onChange={(e) => store.controller?.set({ [slider.id]: Number(e.currentTarget.value) })}
        {...stylex.props(styles.range)}
      />
    </label>
  );
});

/** A run of consecutive toggles as one row of tappable squares. */
export const ToggleRow = memo(function ToggleRow({ store, sliders }: { store: GameStore; sliders: Slider[] }) {
  const bits = useSelect(store, (v) => sliders.map((s) => ((v[s.id] ?? s.initial) >= 0.5 ? "1" : "0")).join(""));
  const label = togglesLabel(sliders);
  return (
    <div data-toggles role="group" aria-label={label} {...stylex.props(styles.gridRow, styles.sliderRow)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <div {...stylex.props(styles.toggles)}>
        {sliders.map((s, i) => {
          const on = bits[i] === "1";
          return (
            <button
              key={s.id}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={s.label}
              data-toggle={s.id}
              data-on={on ? "1" : "0"}
              onClick={() => store.controller?.set({ [s.id]: on ? 0 : 1 })}
              {...stylex.props(styles.toggle)}
            >
              <span {...stylex.props(styles.toggleBox, on && styles.toggleOn)} />
            </button>
          );
        })}
      </div>
    </div>
  );
});

/** The grid that slider, toggle and meter rows share, so their label, bar and value columns line up. */
export function Rows({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.grid)}>{children}</div>;
}

export function Divider() {
  return <div aria-hidden {...stylex.props(styles.divider)} />;
}

/** `<b>headline</b> detail`: what would happen at the figure's values now, or `fixed` (what a run decided). */
export function VerdictLine({ store, game, fixed, source }: { store: GameStore; game: Game; fixed?: Verdict; source: "judge" | "run" }) {
  const values = useSelect(store, (v) => v);
  const verdict = fixed ?? game.judge(values);
  return (
    <p data-verdict={verdict.outcome} data-pass={verdict.pass ? "true" : "false"} data-source={source} {...stylex.props(styles.verdict)}>
      <b>{headlineText(verdict)}</b> {verdict.detail}
    </p>
  );
}

/** The primitive's readouts, live. */
export function Readouts({ store, primitive }: { store: GameStore; primitive: Primitive }) {
  const values = useSelect(store, (v) => v);
  return (
    <div data-readouts {...stylex.props(styles.readouts)}>
      {primitive.readouts(values).map((r) => (
        <div key={r.label} {...stylex.props(styles.readout)}>
          <span {...stylex.props(type.label)}>{r.label}</span>
          <span {...stylex.props(styles.readoutValue)}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
