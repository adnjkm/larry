import { useEffect, useMemo, useRef, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { reducedMotion, spring } from "../../src/motion.ts";
import { play, useAlive } from "./anim.ts";
import { clamp01, easeOut, lerp, smooth } from "./ease.ts";
import { type Lens, lensOf, type Point } from "./lens.ts";
import { outline } from "./outline.ts";
import { AXIS, type Builds, listOf, presentAfter, type Scene, vec, type Vec } from "./model.ts";
import { centreOf, compose, drawObject, enclosed, type Extents, extents, restCentre } from "./pose.ts";
import { Actions, ExplodeSlider, Say, Viewer, Why } from "./ui.tsx";

/**
 * The piece rests beside the object until it is picked up, follows the finger while held, springs
 * back when dropped wide, and once dropped on its ghost lands by itself before it is placed.
 */
type Phase =
  | { kind: "loose"; at: Vec; missed: boolean }
  | { kind: "held"; at: Vec; near: boolean }
  | { kind: "landing"; from: Vec; to: Vec; ms: number }
  | { kind: "placed" };

/** A thread spins down as it lands; anything else presses in. Reduced motion snaps straight in. */
type Landing = "screw" | "press" | "snap";

/** The ghost is the piece's outline: faint purple where it goes, pink once the piece is close. */
const GHOST = { idle: "#c7a6d9", held: "#a66cc6", lit: "#ff3d9e" } as const;

const GAP = 24;
const MIN_HIT = 56;
/** The piece snaps when the finger is within this many ghost radii of it, and starts to pull from further out. */
const NEAR = 1.15;
const REACH = 2.4;
const MAGNET = 0.45;
const EDGE = 12;
/** Extra mm between a held piece and the ghost along the line of sight, past their own sizes. */
const CLEAR = 6;

const APPROACH_MS = 240;
const SCREW_MS = 720;
const PRESS_MS = 320;
const SNAP_MS = 160;
const LOWER_MS = 420;
const REVEAL_MS = 700;
/** An exploded object closes up this fast once a piece is dropped on it, and always before the piece seats. */
const CLOSE_MS = 380;
const SCREW_TURNS = 2;
const PRESS_DIP = 1.5;

const add = (a: Vec, b: Vec) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec, b: Vec) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const mix = (a: Vec, b: Vec, t: number) => vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
const cornersOf = ({ min, max }: Extents): Vec[] => [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => vec(x, y, z))));

function screenBox(lens: Lens, points: readonly Vec[]) {
  const s = points.map(lens.toScreen);
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Puts an overlay on a screen box, at least `min` pixels each way, in the viewer's own coordinates. */
function cover(el: HTMLElement, viewer: DOMRect, b: ReturnType<typeof screenBox>, min: number) {
  const w = Math.max(min, b.x1 - b.x0);
  const h = Math.max(min, b.y1 - b.y0);
  Object.assign(el.style, { left: `${(b.x0 + b.x1) / 2 - w / 2 - viewer.left}px`, top: `${(b.y0 + b.y1) / 2 - h / 2 - viewer.top}px`, width: `${w}px`, height: `${h}px`, visibility: "visible" });
}

/** The piece's path from where it was let go to its place. `k` is how far parts lifted out of its way still are. */
function landingPath(style: Landing, from: Vec, to: Vec, hover: number, lowers: boolean) {
  const seatMs = style === "snap" ? SNAP_MS : APPROACH_MS + (style === "screw" ? SCREW_MS : PRESS_MS);
  const totalMs = seatMs + (lowers && style !== "snap" ? LOWER_MS : 0);
  const above = vec(to.x, to.y + hover, to.z);
  const at = (ms: number): { at: Vec; turn: number; k: number } => {
    if (style === "snap") return { at: mix(from, to, easeOut(clamp01(ms / SNAP_MS))), turn: 0, k: ms >= SNAP_MS ? 0 : 1 };
    if (ms < APPROACH_MS) return { at: mix(from, above, easeOut(ms / APPROACH_MS)), turn: 0, k: 1 };
    const q = clamp01((ms - APPROACH_MS) / (seatMs - APPROACH_MS));
    const k = 1 - smooth(clamp01((ms - seatMs) / LOWER_MS));
    if (style === "screw") {
      // Down the thread: each turn carries it the same way further.
      const e = smooth(q);
      return { at: vec(to.x, to.y + hover * (1 - e), to.z), turn: SCREW_TURNS * 360 * e, k };
    }
    const dy = q < 0.6 ? lerp(hover, -PRESS_DIP, (q / 0.6) ** 2) : lerp(-PRESS_DIP, 0, smooth((q - 0.6) / 0.4));
    return { at: vec(to.x, to.y + dy, to.z), turn: 0, k };
  };
  return { seatMs, totalMs, at };
}

/** Build by hand: drag the real piece, in pink, onto a pale ghost of itself where it goes on the object. */
export function DragBuild({ lesson, kit, index, next, onNext }: { lesson: Builds; kit: Kit; index: number; next: string; onNext: () => void }) {
  const module = lesson.modules[index]!;
  const alive = useAlive();
  const setup = useMemo(() => {
    const produces = module.produces;
    const after = presentAfter(lesson, kit, index);
    const before = presentAfter(lesson, kit, index - 1);
    const restAfter = lesson.rest({ kit, present: after });
    const centre = restCentre(kit, after, restAfter);
    const draw = (present: readonly string[], scene: Scene, explode: number, pink = new Set<string>()) => drawObject({ kit, present, scene, explode, pink, centre, apart: lesson.apart });
    const own = (parts: Part[]) => parts.filter((p) => produces.includes(p.id));
    const home = extents(own(draw(after, restAfter, 0)));
    const homeCentre = centreOf(home);
    // Parts already on the object that sit where the piece goes (a cap over the seal) lift clear until it is in.
    const blockers = before.flatMap((id) => {
      if (kit.parts.find((p) => p.id === id)?.parentId === null) return [];
      const b = extents(draw(before, restAfter, 0).filter((p) => p.id === id));
      const overlaps = b.min.x < home.max.x && b.max.x > home.min.x && b.min.y < home.max.y + 1 && b.max.y > home.min.y && b.min.z < home.max.z && b.max.z > home.min.z;
      return overlaps ? [{ id, lift: home.max.y - b.min.y + Math.max(GAP, 2 * (home.max.y - home.min.y)) }] : [];
    });
    const lifted = (k: number): Scene => compose(restAfter, { moves: Object.fromEntries(blockers.map((b) => [b.id, { offset: vec(0, b.lift * k, 0) }])), marks: [] });
    const object = (explode: number, k: number) => draw(before, lifted(k), explode);
    const ghost = (explode: number) => own(draw(after, restAfter, explode));
    const piece = (at: Vec, turn: number): Part[] => {
      const moves = Object.fromEntries(produces.map((id) => [id, { offset: sub(at, homeCentre), turns: [{ axis: AXIS.y, pivot: homeCentre, deg: turn }] }]));
      return draw(produces, compose(restAfter, { moves, marks: [] }), 0, new Set(produces)).map((p) => ({ ...p, id: `piece-${p.id}` }));
    };
    // The piece rests on the table beside a tall object, and above a long one.
    const box = extents([...draw(after, restAfter, 0), ...object(0, 1)]);
    const half = sub(home.max, homeCentre);
    const tray = box.max.y - box.min.y >= box.max.x - box.min.x
      ? vec(box.max.x + GAP + half.x, box.min.y + half.y, (box.min.z + box.max.z) / 2)
      : vec((box.min.x + box.max.x) / 2, box.max.y + GAP + half.y, (box.min.z + box.max.z) / 2);
    const whole = (explode: number) => draw(after, restAfter, explode);
    return {
      after, restAfter, centre, tray, object, ghost, piece, whole, lifts: blockers.length > 0,
      hover: module.main.id === "thread" ? Math.max(8, 0.6 * (home.max.y - home.min.y)) : 6,
      around: [...piece(tray, 0), ...object(0, 1)],
      hidden: produces.some((id) => enclosed(id, whole(0))),
    };
  }, [lesson, kit, index, module]);

  const [phase, setPhase] = useState<Phase>({ kind: "loose", at: setup.tray, missed: false });
  const [explode, setExplode] = useState(0);
  const placed = phase.kind === "placed";
  const screws = module.main.id === "thread";

  const pose = phase.kind === "landing"
    ? landingPath(reducedMotion.matches ? "snap" : screws ? "screw" : "press", phase.from, phase.to, setup.hover, setup.lifts).at(phase.ms)
    : { at: phase.kind === "placed" ? setup.tray : phase.at, turn: 0, k: 1 };
  const tone = phase.kind === "held" ? (phase.near ? GHOST.lit : GHOST.held) : GHOST.idle;

  const parts = useMemo(() => {
    if (phase.kind === "placed") return drawObject({ kit, present: setup.after, scene: setup.restAfter, explode, pink: new Set(module.produces), centre: setup.centre, apart: lesson.apart });
    const ghost = phase.kind === "landing" ? [] : outline(setup.ghost(explode), tone);
    return [...setup.object(explode, pose.k), ...ghost, ...setup.piece(pose.at, pose.turn)];
  }, [setup, kit, lesson.apart, module, phase.kind, explode, tone, pose.at, pose.turn, pose.k]);
  const subject = useMemo(() => (placed ? setup.whole(explode) : [...setup.around, ...setup.whole(explode)]), [setup, explode, placed]);

  // What the pointer handlers and the overlay loop read between renders.
  const live = useRef({ piece: [] as Vec[], ghost: [] as Vec[], at: setup.tray, phase });
  const ghostNow = setup.ghost(explode);
  live.current = { piece: cornersOf(extents(setup.piece(pose.at, pose.turn))), ghost: ghostNow.length > 0 ? cornersOf(extents(ghostNow)) : [], at: pose.at, phase };
  const ghostCentre = () => centreOf(extents(setup.ghost(explode)));

  const handle = useRef<HTMLButtonElement>(null);
  const spot = useRef<HTMLSpanElement>(null);
  const grab = useRef<Point | null>(null);
  /**
   * A held piece rides this far toward the camera, beyond the ghost and the object. The camera is
   * orthographic, so it looks no different, but it is always drawn in front and never cuts the outline.
   */
  const front = useRef(vec());
  const stopBack = useRef<(() => void) | null>(null);
  useEffect(() => () => stopBack.current?.(), []);

  // The grip and the ghost's spot follow the piece and the ghost on screen every frame, whichever way the view is turned.
  useEffect(() => {
    if (placed) return;
    let frame = requestAnimationFrame(function tick() {
      const viewer = handle.current?.parentElement;
      const lens = viewer ? lensOf(viewer) : null;
      if (viewer && lens && handle.current && spot.current) {
        const rect = viewer.getBoundingClientRect();
        cover(handle.current, rect, screenBox(lens, live.current.piece), MIN_HIT);
        if (live.current.ghost.length > 0) cover(spot.current, rect, screenBox(lens, live.current.ghost), 0);
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [placed]);

  const lensNow = () => (handle.current?.parentElement ? lensOf(handle.current.parentElement) : null);

  const land = (from: Vec) => {
    stopBack.current?.();
    // The piece lands on the object put back together: aim at the ghost's assembled spot, and close
    // any explode while the piece flies in, so it is whole before the piece seats (or at once, for
    // reduced motion).
    const to = centreOf(extents(setup.ghost(0)));
    const path = landingPath(reducedMotion.matches ? "snap" : screws ? "screw" : "press", from, to, setup.hover, setup.lifts);
    const opened = explode;
    const closeMs = reducedMotion.matches ? 0 : Math.min(CLOSE_MS, path.seatMs * 0.7);
    if (closeMs === 0) setExplode(0);
    let seated = false;
    setPhase({ kind: "landing", from, to, ms: 0 });
    void play(path.totalMs, (ms) => {
      if (opened > 0 && closeMs > 0) setExplode(opened * (1 - smooth(Math.min(1, ms / closeMs))));
      if (!seated && ms >= path.seatMs) {
        seated = true;
        navigator.vibrate?.(18);
      }
      setPhase({ kind: "landing", from, to, ms });
    }, alive).then((done) => {
      if (!done) return;
      setPhase({ kind: "placed" });
      // A part that lands inside another would turn pink out of sight, so the object comes apart to show it.
      if (setup.hidden) void play(REVEAL_MS, (ms) => setExplode(smooth(ms / REVEAL_MS)), alive);
    });
  };

  const sendBack = (from: Vec) => {
    stopBack.current?.();
    if (reducedMotion.matches) return setPhase({ kind: "loose", at: setup.tray, missed: true });
    setPhase({ kind: "loose", at: from, missed: true });
    // It stays in front of the ghost on the way home and drops back beside the object only at the end.
    const lift = front.current;
    const behind = sub(from, lift);
    stopBack.current = spring(100, 0, 0, (left) => {
      const k = left / 100;
      setPhase({ kind: "loose", at: add(mix(setup.tray, behind, k), mix(vec(), lift, Math.min(1, 5 * k))), missed: true });
    }, { response: 0.4 });
  };

  /** Where the piece goes under the finger: on the plane through the ghost, pulled toward it as it gets close. */
  const follow = (lens: Lens, x: number, y: number) => {
    const g = grab.current ?? { x: 0, y: 0 };
    const target = {
      x: Math.min(lens.rect.right - EDGE, Math.max(lens.rect.left + EDGE, x - g.x)),
      y: Math.min(lens.rect.bottom - EDGE, Math.max(lens.rect.top + EDGE, y - g.y)),
    };
    const to = add(ghostCentre(), front.current);
    const ghostOnScreen = lens.toScreen(to);
    const b = screenBox(lens, live.current.ghost);
    const radius = Math.max(24, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2);
    const d = Math.hypot(target.x - ghostOnScreen.x, target.y - ghostOnScreen.y);
    const finger = lens.toKit(target.x, target.y, to);
    return { at: mix(finger, to, MAGNET * smooth(clamp01(1 - d / (REACH * radius)))), near: d < NEAR * radius };
  };

  const held = phase.kind === "held";
  const near = phase.kind === "held" && phase.near;
  const pieceName = module.assemble.piece.toLowerCase();
  const target = module.target.label.toLowerCase();
  const names = listOf(module.produces.map((id) => kit.parts.find((q) => q.id === id)?.name ?? id));
  const say = placed ? `Built: ${names}.`
    : phase.kind === "landing" ? (screws ? "Twisting it on…" : "Pressing it in…")
    : near ? "Let go."
    : phase.kind === "loose" && phase.missed ? `Not there. Find the faint ${pieceName}.`
    : `Drag the ${pieceName} onto the ${target}.`;

  return (
    <main className="page" data-stage="assemble" data-build="drag">
      <Say
        kicker={`${module.title} · Build`}
        found={placed}
        why={
          <Why title="Build it">
            <p className="sheet-lead">{module.assemble.title}</p>
            {placed ? <p>{module.assemble.built} Pink marks the part this lesson is about.</p> : <p>Drag the pink {pieceName} onto its faint outline on the {lesson.objectName.toLowerCase()}. It clicks into place when it's close.</p>}
          </Why>
        }
      >
        {say}
      </Say>
      <Viewer parts={parts} subject={subject} view={lesson.view}>
        {placed ? null : (
          <>
            <span ref={spot} className="ghost-spot" data-ghost aria-hidden="true" />
            <button
              ref={handle}
              type="button"
              className="grab"
              data-piece
              data-held={held ? "" : undefined}
              data-near={near ? "" : undefined}
              disabled={phase.kind === "landing"}
              aria-label={`${module.assemble.piece}. Drag it onto the ${target}, or press Enter to put it there.`}
              onPointerDown={(e) => {
                const lens = lensNow();
                if (!lens || phase.kind === "landing") return;
                // Holding the piece must move the piece, not select text or turn the view.
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                stopBack.current?.();
                const at = live.current.at;
                const p = lens.toScreen(at);
                grab.current = { x: e.clientX - p.x, y: e.clientY - p.y };
                const reach = (pts: readonly Vec[]) => pts.length > 0 ? Math.hypot(pts[7]!.x - pts[0]!.x, pts[7]!.y - pts[0]!.y, pts[7]!.z - pts[0]!.z) / 2 : 0;
                const depth = reach(live.current.piece) + reach(live.current.ghost) + CLEAR;
                front.current = vec(lens.facing.x * depth, lens.facing.y * depth, lens.facing.z * depth);
                setPhase({ kind: "held", ...follow(lens, e.clientX, e.clientY) });
              }}
              onPointerMove={(e) => {
                if (live.current.phase.kind !== "held") return;
                const lens = lensNow();
                if (!lens) return;
                const next = follow(lens, e.clientX, e.clientY);
                if (next.near && !near) navigator.vibrate?.(8);
                setPhase({ kind: "held", ...next });
              }}
              onPointerUp={() => {
                const now = live.current.phase;
                if (now.kind !== "held") return;
                if (now.near) land(now.at);
                else sendBack(now.at);
              }}
              onPointerCancel={() => {
                const now = live.current.phase;
                if (now.kind === "held") sendBack(now.at);
              }}
              onKeyDown={(e) => {
                // A keyboard has no way to drag, so Enter or Space puts the piece in its place.
                if ((e.key !== "Enter" && e.key !== " ") || live.current.phase.kind !== "loose") return;
                e.preventDefault();
                land(live.current.at);
              }}
            />
          </>
        )}
      </Viewer>
      <ExplodeSlider value={explode} onChange={setExplode} disabled={phase.kind === "held" || phase.kind === "landing"} />
      <Actions>
        <button type="button" className="btn" data-next disabled={!placed} onClick={onNext}>{next}</button>
      </Actions>
    </main>
  );
}
