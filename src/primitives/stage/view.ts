// The DOM side of one figure: its 2D canvas and size, its scene, its controller, the still mode's drag-to-spin and the
// game mode's drag handle. React only mounts the elements (FigureStage.tsx); everything per frame happens here.
import type { Part } from "../../../shared/kit.ts";
import { reducedMotion, rubberBand, spring, velocityTracker } from "../../motion.ts";
import { framePrimitive } from "../../../shared/primitives/framing.ts";
import { clamp } from "../../../shared/primitives/motion/ease.ts";
import { type Cue, type Primitive, type Values, allSliders, motionSlider, snap, startValues } from "../../../shared/primitives/types.ts";
import { Motion } from "./controller.ts";
import { LESSON_COLOR, type Palette, looksFor } from "./looks.ts";
import { type Drawable, hasWebGL, register, renderTo, schedule, stageStats } from "./renderer.ts";
import { StageScene } from "./scene.ts";
import { markViewerReady } from "../../viewport.ts";

/** CSS px per dither pixel, before rounding to whole device pixels. */
const GRAIN_CSS_PX = 1.5;
/** Half the touch target's 52 px. */
const RING_HALF = 26;
/** How far (CSS px) the ring can be pulled past where the model stopped, at most. */
const BAND_PX = 56;
const DRAG_RADIANS_PER_PIXEL = 0.012;
/** Seconds for a flick's extra spin to fade to a third, as in KitViewer. */
const FLING_SECONDS = 0.5;

export type Mode = "still" | "game";

type StageCallbacks = {
  onLive?: (text: string) => void;
  onCue?: (cue: Cue) => void;
};

type StageElements = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  /** The drag handle's touch target, in game mode when the primitive has a handle. */
  ring: HTMLElement | null;
};

export class StageView implements Drawable {
  readonly element: HTMLElement;
  readonly controller: Motion;
  visible = false;
  drawn = false;
  needsDraw = true;
  private readonly scene: StageScene;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly ring: HTMLElement | null;
  private readonly pill: HTMLElement | null;
  private readonly ro: ResizeObserver;
  private readonly unregister: () => void;
  private readonly cleanups: (() => void)[] = [];
  private posed = false;
  private marks: readonly Part[] | undefined;
  /** Box size in CSS px and device px, the scale n (device px per dither pixel) and the render size. */
  private box = { cssW: 0, cssH: 0, devW: 0, devH: 0, n: 1, w: 0, h: 0 };
  private deviceBox: { w: number; h: number } | undefined;
  private yaw = 0;
  private fling = 0;
  private lastNow: number | undefined;
  private spinning = false;
  /** Where the ring is drawn (CSS px from the box's corner, before the band) and how far it is pulled past the model. */
  private readonly ringAt = { x: 0, y: 0 };
  private band = { x: 0, y: 0 };
  private stopBand: (() => void) | undefined;
  private ariaValue: string | undefined;

  readonly primitive: Primitive;
  readonly mode: Mode;
  private readonly callbacks: StageCallbacks;

  constructor(els: StageElements, primitive: Primitive, mode: Mode, palette: Palette, values: Values, callbacks: StageCallbacks) {
    this.primitive = primitive;
    this.mode = mode;
    this.callbacks = callbacks;
    this.element = els.root;
    this.canvas = els.canvas;
    this.ring = mode === "game" ? els.ring : null;
    this.pill = this.ring?.querySelector<HTMLElement>("[data-handle-label]") ?? null;
    const ctx = els.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2D canvas");
    this.ctx = ctx;
    // Game mode frames the game's scene and runs too, and fits its fixed camera to them rather than to a spin.
    this.scene = new StageScene(framePrimitive(primitive, mode), primitive.view, looksFor(palette), palette === "lesson" ? LESSON_COLOR : undefined, mode === "game" ? "fixed" : "spin");
    this.controller = new Motion(
      {
        apply: (values, marks) => {
          this.updateAria(values);
          this.marks = marks;
          this.posed = false;
          this.needsDraw = true;
          schedule();
        },
        wake: schedule,
        reducedMotion: () => reducedMotion.matches,
        onLive: (text) => this.callbacks.onLive?.(text),
        onCue: (cue) => this.callbacks.onCue?.(cue),
      },
      primitive,
      { ...startValues(primitive, mode === "game"), ...values },
    );

    this.ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1]!;
      const d = e.devicePixelContentBoxSize?.[0];
      this.deviceBox = d ? { w: d.inlineSize, h: d.blockSize } : undefined;
      this.measure();
    });
    try {
      this.ro.observe(els.root, { box: "device-pixel-content-box" });
    } catch {
      this.ro.observe(els.root);
    }
    if (mode === "still") this.listenSpin();
    if (this.ring) this.listenHandle(this.ring);
    this.unregister = register(this);
    this.updateAria(this.controller.get());
    this.measure();
  }

  measure(): void {
    const rect = this.element.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const cssW = this.element.clientWidth || rect.width;
    const cssH = this.element.clientHeight || rect.height;
    // The exact device size when the browser reports one (it knows how the box snaps to device pixels). Chromium's
    // DPR emulation reports CSS px there, so a size that disagrees with the ratio by more than a pixel is not trusted.
    const exact = this.deviceBox && Math.abs(this.deviceBox.w - cssW * dpr) <= 1.5 && Math.abs(this.deviceBox.h - cssH * dpr) <= 1.5;
    const devW = exact ? this.deviceBox!.w : Math.round(cssW * dpr);
    const devH = exact ? this.deviceBox!.h : Math.round(cssH * dpr);
    // A dither pixel is always a whole number of device pixels: about 1.5 CSS px, rounded on the device's own grid.
    const n = Math.max(1, Math.round(GRAIN_CSS_PX * dpr));
    const w = Math.ceil(devW / n);
    const h = Math.ceil(devH / n);
    const b = this.box;
    if (b.cssW === cssW && b.cssH === cssH && b.devW === devW && b.devH === devH && b.n === n) return;
    this.box = { cssW, cssH, devW, devH, n, w, h };
    if (devW === 0 || devH === 0) return;
    if (this.canvas.width !== devW || this.canvas.height !== devH) {
      this.canvas.width = devW;
      this.canvas.height = devH;
    }
    // Resizing resets the context's state.
    this.ctx.imageSmoothingEnabled = false;
    // The drawn area overhangs the box by under one dither pixel; device px convert to CSS px at the box's own ratio.
    this.scene.resize(cssW, cssH, (w * n * cssW) / devW, (h * n * cssH) / devH);
    this.element.dataset.grain = `${n}`;
    this.needsDraw = true;
    schedule();
  }

  tick(now: number): boolean {
    const dt = this.lastNow === undefined ? 0 : Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const moving = this.controller.tick(now);
    if (this.fling !== 0 && !this.spinning) {
      this.yaw += this.fling * dt;
      this.fling = Math.abs(this.fling) < 0.05 ? 0 : this.fling * Math.exp(-dt / FLING_SECONDS);
      this.scene.setYaw(this.yaw);
      this.needsDraw = true;
    }
    const again = moving || this.fling !== 0;
    if (!again) this.lastNow = undefined;
    return again;
  }

  draw(): void {
    const { w, h, n } = this.box;
    if (w === 0 || h === 0) return;
    const values = this.controller.get();
    if (!this.posed) {
      const t0 = performance.now();
      // Game mode also draws the game's standing props (its target); still figures and lessons never do.
      const scene = this.mode === "game" ? this.primitive.game.scene?.(values) : undefined;
      this.scene.setFrame(this.primitive.build(values), scene, this.marks);
      stageStats.poseMs += performance.now() - t0;
      stageStats.poses++;
      this.posed = true;
    }
    const t1 = performance.now();
    const ok = renderTo(this.scene.scene, this.scene.camera, w, h, this.ctx, n);
    stageStats.drawMs += performance.now() - t1;
    stageStats.frames++;
    this.placeRing(values);
    if (!ok && !hasWebGL() && !this.drawn) {
      this.drawn = true;
      this.element.setAttribute("data-error", "no-webgl");
      markViewerReady(this.element);
    }
    if (!ok) return;
    this.needsDraw = false;
    if (!this.drawn) {
      this.drawn = true;
      markViewerReady(this.element);
    }
  }

  private placeRing(values: Values): void {
    const ring = this.ring;
    if (!ring) return;
    const handle = this.primitive.handle;
    // A run is the game's own motion: the ring steps aside until it ends (a touch would only interrupt it).
    const hidden = this.controller.state() === "playing";
    if (hidden !== (ring.dataset.hidden === "")) {
      if (hidden) ring.dataset.hidden = "";
      else delete ring.dataset.hidden;
      ring.style.opacity = hidden ? "0" : "";
      ring.style.pointerEvents = hidden ? "none" : "";
    }
    this.scene.project(handle.at(values), this.ringAt);
    ring.style.transform = `translate3d(${this.ringAt.x + this.band.x - RING_HALF}px, ${this.ringAt.y + this.band.y - RING_HALF}px, 0)`;
    // The label sits right of the ring, or left of it near the right edge.
    const side = this.ringAt.x > this.box.cssW - 110 ? "left" : "right";
    if (this.pill && this.pill.dataset.side !== side) {
      this.pill.dataset.side = side;
      this.pill.style.left = side === "right" ? "58px" : "";
      this.pill.style.right = side === "left" ? "58px" : "";
    }
  }

  /** The handle's value for assistive tech, as soon as it changes (not on the next drawn frame, which an off-screen figure skips). */
  private updateAria(values: Values): void {
    const ring = this.ring;
    if (!ring) return;
    const handle = this.primitive.handle;
    const s = motionSlider(this.primitive);
    const now = values[handle.slider];
    const text = now === undefined ? "" : String(Number(now.toFixed(3)));
    if (text === this.ariaValue) return;
    this.ariaValue = text;
    ring.setAttribute("aria-valuenow", text);
    ring.setAttribute("aria-valuetext", `${Number(((now ?? 0) * (s.displayScale ?? 1)).toFixed(1))}${s.unit ?? ""}`);
  }

  // Still mode: a horizontal drag turns the model and a flick keeps it turning, as in KitViewer.
  private listenSpin(): void {
    const canvas = this.canvas;
    let lastX = 0;
    const tracker = velocityTracker();
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.spinning = true;
      this.fling = 0;
      lastX = e.clientX;
      tracker.reset();
      tracker.add(this.yaw, e.timeStamp);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!this.spinning) return;
      this.yaw += (e.clientX - lastX) * DRAG_RADIANS_PER_PIXEL;
      lastX = e.clientX;
      tracker.add(this.yaw, e.timeStamp);
      this.scene.setYaw(this.yaw);
      this.needsDraw = true;
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!this.spinning) return;
      this.spinning = false;
      canvas.style.cursor = "";
      if (e.type === "pointerup" && !reducedMotion.matches) this.fling = tracker.velocity(e.timeStamp);
      schedule();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    this.cleanups.push(() => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    });
  }

  // Game mode: the ring follows the handle; dragging it solves the slider value under the finger, clamped to the range,
  // the step and the reach. Past the reach the model stops and only the ring follows, on a rubber band.
  private listenHandle(ring: HTMLElement): void {
    const handle = this.primitive.handle;
    const slider = allSliders(this.primitive).find((s) => s.id === handle.slider)!;
    let drag: { id: number; left: number; top: number; dx: number; dy: number; limited: boolean } | undefined;
    const reach = (v: Values): [number, number] => {
      const [lo, hi] = handle.reach?.(v) ?? [slider.min, slider.max];
      return [Math.max(slider.min, lo), Math.min(slider.max, hi)];
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || drag) return;
      e.preventDefault();
      ring.setPointerCapture(e.pointerId);
      ring.focus({ preventScroll: true });
      this.controller.stop();
      this.stopBand?.();
      const rect = this.element.getBoundingClientRect();
      // Keep the grab point under the finger: the ring does not jump to centre itself on it.
      const ringX = this.ringAt.x + this.band.x;
      const ringY = this.ringAt.y + this.band.y;
      drag = { id: e.pointerId, left: rect.left, top: rect.top, dx: ringX - (e.clientX - rect.left), dy: ringY - (e.clientY - rect.top), limited: false };
      ring.dataset.dragging = "";
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const x = e.clientX - drag.left + drag.dx;
      const y = e.clientY - drag.top + drag.dy;
      const values = this.controller.get();
      const z = handle.at(values).z;
      const raw = handle.solve(this.scene.unproject(x, y, z), values);
      const [lo, hi] = reach(values);
      const value = clamp(snap(slider, raw), lo, hi);
      this.controller.set({ [slider.id]: value });
      const limited = raw < lo || raw > hi;
      if (limited) {
        const at = this.scene.project(handle.at(this.controller.get()), { x: 0, y: 0 });
        const dx = x - at.x;
        const dy = y - at.y;
        const d = Math.hypot(dx, dy);
        const k = d > 0 ? rubberBand(d, BAND_PX) / d : 0;
        this.band = { x: dx * k, y: dy * k };
        // A tick where the machine stops giving, the way a hard stop feels.
        if (!drag.limited) navigator.vibrate?.(8);
      } else this.band = { x: 0, y: 0 };
      drag.limited = limited;
      this.needsDraw = true;
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = undefined;
      delete ring.dataset.dragging;
      const from = this.band;
      if (from.x === 0 && from.y === 0) return;
      const settle = (k: number) => {
        this.band = { x: from.x * k, y: from.y * k };
        this.needsDraw = true;
        schedule();
      };
      if (reducedMotion.matches) settle(0);
      else this.stopBand = spring(1, 0, 0, settle, { response: 0.3 });
    };
    const key = (e: KeyboardEvent) => {
      const values = this.controller.get();
      const now = values[slider.id] ?? slider.initial;
      const [lo, hi] = reach(values);
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      let next: number | undefined;
      if (step !== undefined) next = clamp(snap(slider, now + step * slider.step), lo, hi);
      else if (e.key === "Home") next = lo;
      else if (e.key === "End") next = hi;
      if (next === undefined) return;
      e.preventDefault();
      this.controller.set({ [slider.id]: next });
    };
    ring.addEventListener("pointerdown", down);
    ring.addEventListener("pointermove", move);
    ring.addEventListener("pointerup", up);
    ring.addEventListener("pointercancel", up);
    ring.addEventListener("lostpointercapture", up);
    ring.addEventListener("keydown", key);
    this.cleanups.push(() => {
      ring.removeEventListener("pointerdown", down);
      ring.removeEventListener("pointermove", move);
      ring.removeEventListener("pointerup", up);
      ring.removeEventListener("pointercancel", up);
      ring.removeEventListener("lostpointercapture", up);
      ring.removeEventListener("keydown", key);
    });
  }

  dispose(): void {
    this.controller.stop();
    this.stopBand?.();
    this.unregister();
    this.ro.disconnect();
    for (const c of this.cleanups) c();
    this.scene.dispose();
    markViewerReady(this.element, false);
  }
}
