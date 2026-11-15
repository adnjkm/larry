import * as stylex from "@stylexjs/stylex";
import { camera } from "./camera.stylex.ts";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Surface } from "../surface/Surface.tsx";
import { circle } from "../surface/relief.ts";
import { colors, radii } from "../tokens.stylex.ts";
import { DitherBar } from "./DitherBar.tsx";
import { ACCENT, CAMERA, even } from "./look.ts";

const NO_DIVIDERS: number[] = [];
const KNOB_INSET = 3;

/**
 * Flash as a switch: a pill track with a raised knob carrying the flash icon. When on, the knob slides right and the
 * track's pink dither cross-fades in.
 */
export function FlashToggle({ on, onChange, width, height }: { on: boolean; onChange: (on: boolean) => void; width: number; height: number }) {
  const knob = height - 2 * KNOB_INSET;
  return (
    <Switch checked={on} onCheckedChange={onChange} aria-label="Flash" {...stylex.props(s.toggle(width, height))}>
      <DitherBar fill={on ? 1 : 0} reveal="fade" glow={0} width={width} height={height} radius={height / 2} cell={CAMERA.grain} dividers={NO_DIVIDERS} idle={CAMERA.idleDither} />
      <SwitchThumb {...stylex.props(s.knob(knob), on && s.knobOn(width - height))}>
        <Surface shape={circle(knob)} relief="cap" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
        <span {...stylex.props(s.overSurface)}>
          <FlashIcon size={even(knob * 0.54)} filled={on} color={on ? ACCENT : colors.graphite} />
        </span>
      </SwitchThumb>
    </Switch>
  );
}

const FlashIcon = ({ size, filled, color }: { size: number; filled: boolean; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill={filled ? color : "none"} stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const s = stylex.create({
  toggle: (width: number, height: number) => ({
    position: "relative",
    width,
    height,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radii.pill,
    // The bar's glow spills past the switch.
    overflow: "visible",
    backgroundColor: "transparent",
    cursor: "pointer",
  }),
  knob: (size: number) => ({
    position: "absolute",
    top: KNOB_INSET,
    left: KNOB_INSET,
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: `transform 240ms ${camera.easeOut}`,
  }),
  knobOn: (travel: number) => ({ transform: `translateX(${travel}px)` }),
  // Above the Surface's canvas, which is positioned.
  overSurface: { position: "relative", display: "flex" },
});
