/**
 * FigureStage: a primitive drawn by the one shared WebGL renderer into the figure's own 2D canvas, posed imperatively
 * through its StageController (controller.ts), which `controllerRef` receives.
 *
 * mode     "still" (default): drag sideways to turn the model, a flick keeps it turning. No handle.
 *          "game": fixed camera fitted to the rig, game.scene drawn at rest and during runs, and the drag handle (a ring
 *          over primitive.handle.at(values)) unless handle is false.
 *          "play": free play. The same fixed camera and handle, no game scene; the figure starts at primitive.play.rest,
 *          the handle moves within play.reach, and letting go plays play.release.
 * palette  "library" (default): part colours as built, Synthwave shadow, pink ring. "lesson": the app palette (pink
 *          parts orange, purple annotations blue), plain shadow, orange ring.
 * values   Merged over the start values on mount and passed to controller.set whenever its identity changes. Leave it
 *          unset to drive the figure only through the controller.
 * height   CSS px, default 270. The width is the container's.
 *
 * DOM: the root matches VIEWER_SELECTOR and gets data-ready once first drawn (src/viewport.ts), data-grain (device px per dither pixel). The handle is
 * [data-handle] with role="slider"; arrow keys, Page Up/Down, Home and End move it when focused.
 */
import * as stylex from "@stylexjs/stylex";
import { type Ref, useEffect, useLayoutEffect, useRef } from "react";
import { colors, fonts } from "../../tokens.stylex.ts";
import { type Cue, type Primitive, type Values, motionSlider, playHandle, playMotion } from "../../../shared/primitives/types.ts";
import type { StageController } from "./controller.ts";
import { type Palette, RING_COLOR } from "./looks.ts";
import { StageView } from "./view.ts";
import type { FigureMode } from "../../../shared/primitives/framing.ts";
import { VIEWPORT_HEIGHT, viewerProps } from "../../viewport.ts";

export type { StageController } from "./controller.ts";

type FigureStageProps = {
  primitive: Primitive;
  mode?: FigureMode;
  /** Game and play modes: false leaves the drag handle off, so the figure moves only through the controller. */
  handle?: boolean;
  palette?: Palette;
  values?: Values;
  height?: number;
  controllerRef?: Ref<StageController | null>;
  onLive?: (text: string) => void;
  onCue?: (cue: Cue) => void;
  /** Free play: the hand let go of the machine, which stood at `values` as it did, moving it `way` along its slider. */
  onLetGo?: (values: Values, way: 1 | -1) => void;
  /** Play mode: which of primitive.play.tasks is on, so its scene is drawn. */
  task?: number;
};

const styles = stylex.create({
  box: (height: number) => ({
    position: "relative",
    width: "100%",
    height,
    backgroundColor: colors.paper,
    overflow: "hidden",
  }),
  // The backing store is the box's exact device size, so nothing should scale it; pixelated in case a browser does.
  canvas: { display: "block", width: "100%", height: "100%", imageRendering: "pixelated" },
  // Vertical swipes and pinch zoom stay with the page; horizontal drags turn the model.
  spin: { touchAction: "pan-y pinch-zoom", cursor: "grab" },
  ring: (color: string) => ({
    position: "absolute",
    top: 0,
    left: 0,
    boxSizing: "border-box",
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: color,
    backgroundColor: `${color}24`,
    // Only the handle claims the touch; everywhere else the page scrolls.
    touchAction: "none",
    cursor: "grab",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    willChange: "transform",
    transitionProperty: "opacity",
    transitionDuration: "150ms",
    outline: { default: "none", ":focus-visible": `2px solid ${color}` },
    outlineOffset: 3,
  }),
  pill: (color: string) => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: color,
    color: colors.paper,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  }),
});

function hand<T>(ref: Ref<T | null> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export function FigureStage({
  primitive,
  mode = "still",
  handle = true,
  palette = "library",
  values,
  height = VIEWPORT_HEIGHT,
  controllerRef,
  onLive,
  onCue,
  onLetGo,
  task,
}: FigureStageProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const view = useRef<StageView>(null);
  // Read through a ref so a new callback each render never rebuilds the scene.
  const callbacks = useRef({ onLive, onCue, onLetGo });
  callbacks.current.onLive = onLive;
  callbacks.current.onCue = onCue;
  callbacks.current.onLetGo = onLetGo;
  const latestValues = useRef(values);
  latestValues.current = values;
  const latestRef = useRef(controllerRef);
  latestRef.current = controllerRef;

  useLayoutEffect(() => {
    const v = new StageView({ root: root.current!, canvas: canvas.current!, ring: ring.current }, primitive, mode, palette, latestValues.current ?? {}, {
      onLive: (t) => callbacks.current.onLive?.(t),
      onCue: (c) => callbacks.current.onCue?.(c),
      onLetGo: (v, way) => callbacks.current.onLetGo?.(v, way),
    });
    view.current = v;
    const ref = latestRef.current;
    hand(ref, v.controller);
    return () => {
      v.dispose();
      view.current = null;
      hand(ref, null);
    };
  }, [primitive, mode, palette]);

  useEffect(() => {
    if (values) view.current?.controller.set(values);
  }, [values]);

  useEffect(() => {
    view.current?.setTask(task);
  }, [task, primitive, mode, palette]);

  const grip = mode === "play" ? playHandle(primitive) : primitive.handle;
  const verb = (mode === "play" && primitive.play?.label) || grip.label;
  const slider = mode === "play" ? playMotion(primitive) : motionSlider(primitive);
  const color = RING_COLOR[palette];

  return (
    <div ref={root} {...viewerProps} {...stylex.props(styles.box(height))}>
      <canvas ref={canvas} {...stylex.props(styles.canvas, mode === "still" && styles.spin)} />
      {mode !== "still" && handle && (
        <div
          ref={ring}
          data-handle
          role="slider"
          tabIndex={0}
          aria-label={`${verb}: ${slider.label}`}
          aria-valuemin={slider.min}
          aria-valuemax={slider.max}
          aria-orientation="horizontal"
          {...stylex.props(styles.ring(color))}
        >
          <span aria-hidden data-handle-label {...stylex.props(styles.pill(color))}>
            {verb}
          </span>
        </div>
      )}
    </div>
  );
}
