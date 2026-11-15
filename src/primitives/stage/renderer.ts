// One WebGL context for every figure, the way Ciechanowski's watch article draws 94 figures: each figure renders into the
// corner of one shared canvas and copies the result into its own 2D canvas with drawImage, at a whole-number scale, only
// when it is on screen and something changed. The renderer is created on first use and outlives every figure, so a
// lesson that mounts a new figure per step never creates another context.
import { type Camera, type Scene, WebGLRenderer } from "three";
import { colors } from "../../tokens.stylex.ts";

/** What the loop needs from a figure. */
export type Drawable = {
  /** On screen (or near it). */
  visible: boolean;
  /** Drawn at least once; a figure is drawn once even off screen, so it is never blank when scrolled to. */
  drawn: boolean;
  needsDraw: boolean;
  /** Advances motion; returns true while it wants more frames. */
  tick(now: number): boolean;
  draw(): void;
  /** Re-reads the box and the device pixel ratio. */
  measure(): void;
  readonly element: Element;
};

type Shared = { renderer: WebGLRenderer; canvas: HTMLCanvasElement; width: number; height: number; lost: boolean };

let shared: Shared | null | undefined;

/** Counters for tests and the dev page. */
export const stageStats = {
  contexts: 0,
  draws: 0,
  restores: 0,
  /** ms spent posing (build + diff) and drawing (render + copy), and frames counted, since the last reset. */
  poseMs: 0,
  drawMs: 0,
  poses: 0,
  frames: 0,
  reset() {
    this.poseMs = this.drawMs = this.poses = this.frames = 0;
  },
  summary() {
    return {
      poseMsPerFrame: Number((this.poseMs / Math.max(1, this.poses)).toFixed(3)),
      drawMsPerFrame: Number((this.drawMs / Math.max(1, this.frames)).toFixed(3)),
      contexts: this.contexts,
    };
  },
};
if (import.meta.env?.DEV) {
  const g = globalThis as unknown as { __stageStats: typeof stageStats; __stageGL: () => WebGLRenderingContext | undefined };
  g.__stageStats = stageStats;
  // For the context-loss test: the shared context, to lose and restore through WEBGL_lose_context.
  g.__stageGL = () => shared?.renderer.getContext();
}

function create(): Shared | null {
  const canvas = document.createElement("canvas");
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: "low-power" });
  } catch (error) {
    console.error("No WebGL for figures", error);
    return null;
  }
  stageStats.contexts++;
  // The shader check reads the program's info log back from the driver, which stalls the first draw; the shaders are ours and fixed.
  renderer.debug.checkShaderErrors = !!import.meta.env?.DEV;
  renderer.setPixelRatio(1);
  renderer.setClearColor(colors.paper, 1);
  const s: Shared = { renderer, canvas, width: 0, height: 0, lost: false };
  // three.js prevents the default on loss (so the context can come back) and rebuilds its GL state on restore, then
  // re-uploads geometry and programs on the next render. The figures keep showing their last picture meanwhile.
  canvas.addEventListener("webglcontextlost", () => {
    s.lost = true;
  });
  // three.js registers its own restore listener first (in the constructor), so its state is rebuilt by now; the clear
  // colour lives in that state and comes back black.
  canvas.addEventListener("webglcontextrestored", () => {
    s.lost = false;
    renderer.setClearColor(colors.paper, 1);
    stageStats.restores++;
    for (const d of live) d.needsDraw = true;
    schedule();
  });
  return s;
}

/** False once WebGL turned out to be missing, so a figure can say so instead of waiting to draw. */
export const hasWebGL = () => shared !== null;

/** Creates the shared renderer if it does not exist yet and compiles `scene`'s shaders without blocking the main thread. */
export async function precompile(scene: Scene, camera: Camera): Promise<void> {
  if (shared === undefined) shared = create();
  await shared?.renderer.compileAsync(scene, camera);
}

/**
 * Renders `scene` at w x h pixels and copies it into `target` scaled by the whole number `n`. Returns false when there
 * is no context (lost, or WebGL missing), in which case the target keeps what it had.
 */
export function renderTo(scene: Scene, camera: Camera, w: number, h: number, target: CanvasRenderingContext2D, n: number): boolean {
  if (shared === undefined) shared = create();
  const s = shared;
  if (!s || s.lost) return false;
  if (w > s.width || h > s.height) {
    // Grows to the largest figure seen, never shrinks: resizing the drawing buffer per figure would reallocate it per draw.
    s.width = Math.max(s.width, w);
    s.height = Math.max(s.height, h);
    s.renderer.setSize(s.width, s.height, false);
  }
  const r = s.renderer;
  // The bottom-left corner, so gl_FragCoord (the Bayer pattern's phase) starts at 0 for every figure whatever the canvas size.
  r.setViewport(0, 0, w, h);
  r.setScissor(0, 0, w, h);
  r.setScissorTest(true);
  r.render(scene, camera);
  target.drawImage(s.canvas, 0, s.height - h, w, h, 0, 0, w * n, h * n);
  stageStats.draws++;
  return true;
}

// The frame loop: one requestAnimationFrame for every figure. Ticks run first, so a pose set this frame is drawn this frame.
const live = new Set<Drawable>();
let raf = 0;

export function schedule(): void {
  if (raf === 0 && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
}

function frame(now: number): void {
  raf = 0;
  let again = false;
  for (const d of live) if (d.tick(now)) again = true;
  for (const d of live) {
    if (!d.needsDraw || (!d.visible && d.drawn)) continue;
    d.draw();
  }
  if (again) schedule();
}

let io: IntersectionObserver | undefined;
const byElement = new Map<Element, Drawable>();

let watchingDpr = false;
function watchDpr(): void {
  watchingDpr = true;
  // matchMedia on the current ratio fires once when it changes (zoom, moving the window to another screen); re-arm each time.
  const query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  query.addEventListener(
    "change",
    () => {
      for (const d of live) d.measure();
      watchDpr();
    },
    { once: true },
  );
}

export function register(d: Drawable): () => void {
  if (!watchingDpr) watchDpr();
  live.add(d);
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const target = byElement.get(e.target);
        if (!target) continue;
        target.visible = e.isIntersecting;
        if (target.visible && target.needsDraw) schedule();
      }
    },
    { rootMargin: "200px 0px" },
  );
  byElement.set(d.element, d);
  io.observe(d.element);
  schedule();
  return () => {
    live.delete(d);
    byElement.delete(d.element);
    io?.unobserve(d.element);
  };
}
