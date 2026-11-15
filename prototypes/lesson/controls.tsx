// The lesson's two hand controls, both drawn with Aiden's dithered UI pieces so they match the camera screen:
// - Wheel: a notched thumbwheel (src/camera/thumbwheel.ts behaviour, src/surface drum), for anything you turn.
// - DitherRange: the camera's pink dithered bar (src/camera/DitherBar.tsx) with a baked cap for its thumb, for the rest.
// Both work on a track position from 0 to TRACK, so a control with stiff zones can map it to its own value.
import { createParts } from "@ui-sdk/react/primitive";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { DitherBar } from "../../src/camera/DitherBar.tsx";
import { thumbwheel } from "../../src/camera/thumbwheel.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import { circle, drum, type Relief, rrect } from "../../src/surface/relief.ts";

/** Steps along a control's track. Fine enough to move smoothly; nothing shows the number. */
export const TRACK = 1000;

/** CSS px per dither cell, as on the camera screen. */
const GRAIN = 1.5;
/** The camera's slow drifting grain on idle parts. */
const DRIFT = 0.6;

/** The width a control has to fill, measured, since a baked surface needs its size in px. */
function useWidth() {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(Math.floor(el.clientWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [box, width] as const;
}

const { Root: Thumbwheel } = createParts(thumbwheel, { root: "div" });

const WHEEL_HEIGHT = 44;
/** Frames baked per groove: more turns more smoothly, at a bake each. */
const WHEEL_FRAMES = 12;
/** Pixels of drag that take the wheel from one end of its track to the other. */
const WHEEL_TRAVEL_PX = 360;

type ControlProps = {
  label: string;
  /** Track position, 0 to TRACK. */
  position: number;
  /** What a screen reader hears for where it is now: the zone's word, or the label. */
  valueText: string;
  disabled?: boolean;
  onPosition: (position: number) => void;
};

/**
 * A notched wheel you spin sideways, like the camera's zoom wheel: the drum turns with the finger, coasts when let go,
 * and its grooves smear when it spins fast. Arrow keys, Home and End work too.
 */
export function Wheel({ label, position, valueText, disabled, onPosition }: ControlProps) {
  const [box, width] = useWidth();
  // Keep a groove about as wide as on the camera's 112 px wheel with 19 ridges.
  const ridges = Math.max(8, Math.round(width / 6));
  const pitch = (2 * Math.PI) / ridges;
  const relief = useMemo(() => (t: number): Relief => [drum({ ridges, rim: 3, turn: t * pitch })], [ridges, pitch]);
  const perPixel = TRACK / WHEEL_TRAVEL_PX;
  return (
    <div className="wheel-box" ref={box} data-disabled={disabled ? "" : undefined}>
      {width > 0 ? (
        <Thumbwheel
          className="wheel grip"
          aria-label={label}
          aria-disabled={disabled || undefined}
          value={position}
          min={0}
          max={TRACK}
          perPixel={perPixel}
          step={TRACK / 100}
          valueText={valueText}
          onValueChange={(v: number) => onPosition(Math.round(v))}
          style={{ width, height: WHEEL_HEIGHT }}
        >
          {(state: { value: number; velocity: number }) => {
            const radians = state.value / perPixel / (width / 2);
            const turned = (Math.abs(state.velocity) / perPixel / (width / 2)) * 16;
            const smear = Math.min(WHEEL_FRAMES * 0.6, turned / (pitch / WHEEL_FRAMES));
            return (
              <Surface shape={rrect(width, WHEEL_HEIGHT, 10)} relief={relief} bakeKey={`lesson-wheel-${ridges}`} frames={WHEEL_FRAMES} at={radians / pitch} smear={smear} grain={GRAIN} drift={DRIFT} />
            );
          }}
        </Thumbwheel>
      ) : null}
    </div>
  );
}

const BAR_HEIGHT = 14;
const NO_DIVIDERS: number[] = [];
const THUMB = 26;

/**
 * A pink dithered bar filled up to the thumb, after the camera's photo bar, with a baked cap to drag. A native range
 * sits over it, invisible, so it works like any slider: drag, tap, arrow keys, screen readers.
 */
export function DitherRange({ label, position, valueText, disabled, onPosition }: ControlProps) {
  const [box, width] = useWidth();
  const fill = position / TRACK;
  const travel = Math.max(0, width - THUMB);

  return (
    <div className="dither-range" ref={box} data-disabled={disabled ? "" : undefined}>
      {width > 0 ? (
        <div className="dither-bar" style={{ width, height: BAR_HEIGHT }}>
          {/* The fill runs to the thumb's middle, so the thumb always sits on the end of the pink. */}
          <DitherBar fill={(THUMB / 2 + fill * travel) / width} reveal="follow" width={width} height={BAR_HEIGHT} radius={BAR_HEIGHT / 2} cell={GRAIN} dividers={NO_DIVIDERS} glow={0} idle={DRIFT} />
        </div>
      ) : null}
      {width > 0 ? (
        <span className="dither-thumb" style={{ transform: `translateX(${fill * travel}px)` }}>
          <Surface shape={circle(THUMB)} relief="cap" grain={GRAIN} pad={4} />
        </span>
      ) : null}
      <input
        type="range"
        className="grip"
        min={0}
        max={TRACK}
        step={1}
        value={position}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onPosition(Number(e.target.value))}
      />
    </div>
  );
}
