// "Find the spot": the player drags the primitive's piece onto the object, where faint outline rings mark a few
// spots. A wrong spot runs the module's own failure with the piece where it was put (the cap rattles off a neck
// with no thread on it, a seal round the base lets the cap leak), says why, and crosses the spot out; the right
// spot seats the piece with a cheer. A tap on a ring puts the piece there too, so it works without dragging.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Kit, Part, Shape } from "../../shared/kit.ts";
import { play, useAlive } from "./anim.ts";
import { PillSurface } from "../../src/ui/PillSurface.tsx";
import { Cheer } from "./Cheer.tsx";
import { cornersOf, cover, GHOST, MIN_HIT, screenBox } from "./DragBuild.tsx";
import { lensOf, type Point } from "./lens.ts";
import { familyOf, type Mark, type Overlay, presentAfter, type Spot, STILL, type Story, type Test, type Values, vec, type Vec } from "./model.ts";
import { compose, drawObject, extents, framePart, restCentre } from "./pose.ts";
import { COLOR } from "./primitives/parts.ts";
import { Actions, Need, Say, Viewer, Why } from "./ui.tsx";

/** How close, in screen px, the pointer must come to a spot's middle for the piece to snap to it. */
const SNAP_PX = 46;
/** Where the piece waits beside the object, as a share of the object's width out from its right side. */
const TRAY_OUT = 0.55;
const FRAME_SAMPLES = 40;
/** The pop when the right spot is found. */
const FOUND = "Found it!";
/** A crossed-out spot's outline. */
const TRIED = "#d9d9d9";

type Phase = { kind: "loose" } | { kind: "held"; at: Vec; near: string | null } | { kind: "running"; spot: string } | { kind: "found" };

/** How far a part reaches from the upright axis. */
function reachOf(shape: Shape): number {
  if (shape.kind === "lathe") return Math.max(...shape.profile.map((p) => p.r));
  if (shape.kind === "helix" || shape.kind === "torus") return shape.radius;
  return 0;
}

/** A shape wrapped `k` times wider round the axis: rings and profiles grow, anything else keeps its size. */
function widen(shape: Shape, k: number): Shape {
  if (shape.kind === "lathe") return { ...shape, profile: shape.profile.map((p) => ({ ...p, r: p.r * k })) };
  if (shape.kind === "helix" || shape.kind === "torus") return { ...shape, radius: shape.radius * k };
  return shape;
}

/** The piece moved so its middle is at `at` and widened `k` times round the axis, drawn pink. */
function posed(piece: readonly Part[], home: Vec, at: Vec, k: number): Part[] {
  return piece.map((p) => ({
    ...p,
    shape: widen(p.shape, k),
    position: vec(at.x + p.position.x * k, at.y + (p.position.y - home.y), at.z + p.position.z * k),
    color: COLOR.focus,
    finish: "matte",
  }));
}

/** A spot's marker: thin rings just outside where the piece would sit, at its top and bottom. */
function ringsAt(spot: Spot, span: number, color: string): Part[] {
  const half = Math.max(2, span / 2);
  return [-half, half].map((dy, i): Part => ({
    id: `ring-${spot.id}-${i}`,
    name: "spot",
    role: "",
    parentId: null,
    joint: null,
    shape: { kind: "torus", radius: spot.radius + 1.2, tube: 0.7, arcDegrees: 360 },
    position: vec(spot.at.x, spot.at.y + dy, spot.at.z),
    // A torus in the viewer already lies flat round the upright axis.
    rotation: vec(),
    color,
    finish: "matte",
  }));
}

/**
 * The test that answers every drop, so placing a piece has a feedback loop: it plays once on arrival with the piece
 * still in the hand, again after each wrong spot with the piece where it was put, and once more at the right spot,
 * this time with the piece working. `fail` and `pass` are the settings it runs at without and with the piece.
 */
export type Trial = { test: Test; fail: Values; pass: Values };

type Props = {
  story: Story;
  kit: Kit;
  index: number;
  next: string;
  onNext: () => void;
  /** Shown over the instruction in place of the module's requirement. */
  header?: ReactNode;
  /** One line telling the player what to do, in place of the module's own question and its Why button. */
  instruction?: string;
  trial?: Trial;
  /** Parts not on the object yet, though an earlier module of the story makes them. */
  absent?: readonly string[];
};

export function Place({ story, kit, index, next, onNext, header, instruction, trial, absent }: Props) {
  const alive = useAlive();
  const module = story.modules[index]!;
  const place = module.place!;

  const setup = useMemo(() => {
    const pieceIds = new Set(place.piece);
    const piece = place.piece.map((id) => kit.parts.find((p) => p.id === id)!);
    const home = piece[0]!.position;
    const own = reachOf(piece[0]!.shape) || 1;
    // The object as the problem showed it (the part not yet doing its job), without the piece the player holds. At
    // rest it also leaves off what only the failure needs (a cap resting on the neck) and anything covering the spots.
    const missing = new Set((absent ?? []).flatMap((id) => familyOf(kit, id)));
    const present = [...presentAfter(story, kit, index - 1), ...module.without.adds].filter((id) => !pieceIds.has(id) && !missing.has(id));
    const hidden = new Set([...module.without.adds, ...(place.hide ?? [])].flatMap((id) => familyOf(kit, id)));
    const atRest = present.filter((id) => !hidden.has(id));
    const rest = story.rest({ kit, present });
    const centre = restCentre(kit, present, rest);
    const ctx = { kit, present, centre };
    const drawOf =
      (shown: string[], at = rest, pink: ReadonlySet<string> = new Set()) =>
      (overlay: Overlay) =>
        drawObject({
          kit,
          present: shown,
          scene: compose(at, overlay),
          rigid: overlay.rigid,
          explode: 0,
          plan: story.explode,
          pink: new Set(pink),
          centre,
          apart: story.apart,
        }).map((p) => (p.id.startsWith("place-") ? { ...p, color: COLOR.focus } : p));
    const draw = drawOf(present);
    // The object with the piece fitted and working, for the test at the right spot and for how it stands afterwards.
    const whole = [...present, ...place.piece];
    const wholeCtx = { kit, present: whole, centre };
    const fitted = new Set(place.piece.flatMap((id) => familyOf(kit, id)));
    const drawWhole = drawOf(whole, story.rest({ kit, present: whole }), fitted);
    const still: Overlay = { moves: {}, marks: [], rigid: STILL, live: "" };
    const object = drawOf(atRest)(still);
    const box = extents(object);
    // On an object framed at one end, the piece waits beside that end, not beside the middle of the whole thing.
    const beside = place.frame ?? box;
    const tray = vec(box.max.x + (box.max.x - box.min.x) * TRAY_OUT, (beside.min.y + beside.max.y) / 2, 0);
    const at = (spot: Spot) => posed(piece, home, spot.at, spot.radius / own);
    // The piece where a spot puts it, as marks riding the object, so a test that shakes the object shakes it too.
    const marksAt = (spot: Spot): Mark[] =>
      at(spot).map((p) => ({ id: `place-${p.id}`, shape: p.shape, at: p.position, rotation: p.rotation, ride: place.ride }));
    const inTray = posed(piece, home, tray, 1);
    const span = extents(posed(piece, home, home, 1)).max.y - extents(posed(piece, home, home, 1)).min.y;
    const spotsDrawn = place.spots.flatMap((s) => at(s));
    const around = place.frame ? [framePart(place.frame), ...inTray] : [...object, ...inTray, ...spotsDrawn];
    return { piece, home, own, ctx, draw, still, object, tray, at, marksAt, inTray, span, around, wholeCtx, drawWhole };
  }, [story, kit, index, module, place, absent]);

  const [phase, setPhase] = useState<Phase>({ kind: "loose" });
  const [tried, setTried] = useState<ReadonlySet<string>>(new Set());
  const [line, setLine] = useState<{ text: string; bad: boolean } | null>(null);
  const [anim, setAnim] = useState<Overlay | null>(null);
  /** The running test, or the finished object, is drawn with the piece fitted. */
  const [fitted, setFitted] = useState(false);
  const [reach, setReach] = useState<Part[] | null>(null);
  const [cheers, setCheers] = useState(0);
  const live = useRef({ phase, piece: [] as Vec[] });

  const spotById = (id: string) => place.spots.find((s) => s.id === id)!;
  const right = place.spots.find((s) => s.right)!;

  const pieceNow = (): Part[] => {
    if (phase.kind === "found") return trial ? [] : setup.at(right);
    if (phase.kind === "held") return phase.near ? setup.at(spotById(phase.near)) : posed(setup.piece, setup.home, phase.at, 1);
    if (phase.kind === "running") return [];
    return setup.inTray;
  };
  const shownPiece = pieceNow();
  live.current = { phase, piece: shownPiece.length > 0 ? cornersOf(extents(shownPiece)) : [] };

  // Two faint rings round every spot still to try, at the piece's top and bottom there, lit while the piece hovers
  // it; tried ones go grey.
  const rings =
    phase.kind === "found" || phase.kind === "running"
      ? []
      : place.spots.flatMap((s) =>
          ringsAt(
            s,
            setup.span,
            tried.has(s.id) ? TRIED : phase.kind === "held" && phase.near === s.id ? GHOST.lit : phase.kind === "held" ? GHOST.held : GHOST.idle,
          ),
        );
  const parts = anim ? (fitted ? setup.drawWhole(anim) : setup.draw(anim)) : fitted ? setup.drawWhole(setup.still) : [...setup.object, ...rings, ...shownPiece];
  // A framed object keeps its frame while a wrong spot's failure plays.
  const subject = useMemo(() => (reach && !place.frame ? [...setup.around, ...reach] : setup.around), [reach, setup]);

  const run = async (spot: Spot) => {
    setPhase({ kind: "running", spot: spot.id });
    if (spot.right) {
      if (trial) {
        // The same test, now with the piece doing its job.
        const works = trial.test.run({ ...trial.pass }, setup.wholeCtx);
        setLine(null);
        setFitted(true);
        await play(works.durationMs, (ms) => setAnim(works.at(ms)), alive);
        if (!alive()) return;
        setAnim(null);
      }
      setPhase({ kind: "found" });
      setLine({ text: spot.line, bad: false });
      setCheers((n) => n + 1);
      return;
    }
    const test = trial ? trial.test.run({ ...trial.fail }, setup.ctx) : module.without.test.run({ ...module.without.values }, setup.ctx);
    const withPiece = (o: Overlay): Overlay => ({ ...o, marks: [...o.marks, ...setup.marksAt(spot)] });
    setReach(Array.from({ length: FRAME_SAMPLES + 1 }, (_, i) => setup.draw(withPiece(test.at((test.durationMs * i) / FRAME_SAMPLES)))).flat());
    setLine(null);
    await play(test.durationMs, (ms) => setAnim(withPiece(test.at(ms))), alive);
    if (!alive()) return;
    setAnim(null);
    setReach(null);
    setTried((t) => new Set([...t, spot.id]));
    setLine({ text: spot.line, bad: true });
    setPhase({ kind: "loose" });
  };

  // The test as things stand: with the piece still in the hand it fails, and once the piece is found it passes. It
  // plays on arrival, so what the piece is for is seen before it is placed, and again whenever Replay Test is pressed.
  const [replaying, setReplaying] = useState(false);
  const replay = useRef<() => void>(undefined);
  replay.current = () => {
    if (!trial || replaying || phase.kind === "running" || phase.kind === "held") return;
    const done = phase.kind === "found";
    const test = done ? trial.test.run({ ...trial.pass }, setup.wholeCtx) : trial.test.run({ ...trial.fail }, setup.ctx);
    setReplaying(true);
    if (!done) setPhase({ kind: "running", spot: "" });
    void play(test.durationMs, (ms) => setAnim(test.at(ms)), alive).then(() => {
      if (!alive()) return;
      setAnim(null);
      setReplaying(false);
      if (done) return;
      setLine({ text: test.verdict.line, bad: true });
      setPhase({ kind: "loose" });
    });
  };
  // As soon as the screen is up: a wait here reads as the screen being slow.
  useEffect(() => {
    const id = requestAnimationFrame(() => replay.current?.());
    return () => cancelAnimationFrame(id);
  }, []);

  // The grip over the piece and a tap target over every spot follow them on screen every frame.
  const box = useRef<HTMLDivElement>(null);
  const grab = useRef<HTMLButtonElement>(null);
  const spotEls = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      const viewer = box.current?.querySelector(".viewer");
      const lens = viewer ? lensOf(viewer) : null;
      if (viewer instanceof HTMLElement && lens) {
        const rect = viewer.getBoundingClientRect();
        const scale = viewer.offsetWidth > 0 ? rect.width / viewer.offsetWidth : 1;
        if (grab.current && live.current.piece.length > 0) cover(grab.current, rect, scale, screenBox(lens, live.current.piece), MIN_HIT);
        for (const s of place.spots) {
          const el = spotEls.current.get(s.id);
          if (el) cover(el, rect, scale, screenBox(lens, cornersOf(extents(setup.at(s)))), MIN_HIT);
        }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [place, setup]);

  const lens = () => {
    const viewer = box.current?.querySelector(".viewer");
    return viewer ? lensOf(viewer) : null;
  };
  /** The spot whose middle is nearest the pointer, if near enough, and the piece's middle under the pointer. */
  const follow = (p: Point) => {
    const l = lens();
    if (!l) return null;
    const at = l.toKit(p.x, p.y, setup.tray);
    let near: string | null = null;
    let best = SNAP_PX;
    for (const s of place.spots) {
      if (tried.has(s.id)) continue;
      const q = l.toScreen(s.at);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) [best, near] = [d, s.id];
    }
    return { at, near };
  };

  const busy = phase.kind === "running";
  const found = phase.kind === "found";
  const say = found ? right.line : place.say;

  return (
    <main className="page" data-stage="place" ref={box}>
      {header ?? (module.need ? <Need text={module.need} met={found ? true : undefined} /> : null)}
      <Say
        kicker={`${module.title} · Find the spot`}
        found={found}
        why={instruction ? undefined : (
          <Why title={module.title}>
            <div data-why-text>
              {module.why.map((l, i) => (
                <p key={l} className={i === 0 ? "sheet-lead" : undefined}>
                  {l}
                </p>
              ))}
            </div>
          </Why>
        )}
      >
        {instruction ?? say}
      </Say>
      {/* No status chip over the picture when a test answers each drop: the picture and the line under it say it. */}
      <Viewer parts={parts} subject={subject} view={story.view} live={trial ? undefined : anim?.live}>
        {trial ? (
          <button type="button" className="replay" data-replay disabled={replaying || phase.kind === "running" || phase.kind === "held"} onClick={() => replay.current?.()}>
            Replay Test
          </button>
        ) : null}
        {found ? null : (
          <>
            <button
              ref={grab}
              type="button"
              className="grab"
              data-piece
              data-held={phase.kind === "held" ? "" : undefined}
              disabled={busy}
              aria-label="The piece. Drag it onto a ring on the object."
              onPointerDown={(e) => {
                if (busy) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const f = follow({ x: e.clientX, y: e.clientY });
                if (f) setPhase({ kind: "held", ...f });
              }}
              onPointerMove={(e) => {
                if (live.current.phase.kind !== "held") return;
                const f = follow({ x: e.clientX, y: e.clientY });
                if (!f) return;
                if (f.near && f.near !== (live.current.phase.kind === "held" ? live.current.phase.near : null)) navigator.vibrate?.(8);
                setPhase({ kind: "held", ...f });
              }}
              onPointerUp={() => {
                const now = live.current.phase;
                if (now.kind !== "held") return;
                if (now.near) void run(spotById(now.near));
                else setPhase({ kind: "loose" });
              }}
              onPointerCancel={() => setPhase({ kind: "loose" })}
            />
            {place.spots.map((s) => (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) spotEls.current.set(s.id, el);
                  else spotEls.current.delete(s.id);
                }}
                type="button"
                className="grab spot"
                data-spot={s.id}
                data-tried={tried.has(s.id) ? "" : undefined}
                disabled={busy || tried.has(s.id)}
                aria-label="Put the piece here"
                onClick={() => void run(s)}
              />
            ))}
          </>
        )}
      </Viewer>
      <Cheer text={FOUND} show={cheers} />
      {/* With a test answering each drop, the picture is the feedback: no line of commentary under it. */}
      {trial ? null : (
        <p className="result" data-result-line data-bad={line?.bad ? "" : undefined}>
          {line ? line.text : " "}
        </p>
      )}
      <Actions>
        <button type="button" className="btn" data-next disabled={!found} onClick={onNext}>
          <PillSurface>{next}</PillSurface>
        </button>
      </Actions>
    </main>
  );
}
