import { useEffect, useMemo, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { initialValues } from "../../src/primitives/library.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { clamp01, easeOut, lerp, smooth } from "./ease.ts";
import { assembledFrom, listOf, type Module, type PartMove, presentAfter, type Scene, type Target, vec, type Vec, type Workshop } from "./model.ts";
import { compose, drawObject, enclosed, extents, placeParts, restCentre } from "./pose.ts";
import { Actions, ExplodeSlider, Say, Viewer, Why } from "./ui.tsx";

const FLIGHT_MS = 650;
/** The piece is spent on the way in; the part appears for the last quarter of the flight and settles. */
const LAND = 0.75;
const GAP = 24;
const REVEAL_MS = 700;

const ringRotation = (axis: Target["ring"]["axis"]): Vec => (axis === "x" ? vec(0, 0, 90) : axis === "z" ? vec(90, 0, 0) : vec());
/** A small piece is drawn up to this much bigger so it reads beside a large object, without looming over a small one. */
const MAX_ENLARGE = 2;
/** Space between the taught primitives' pieces when more than one floats in. */
const PIECE_GAP = 10;

/** The focus pieces of the primitives this module assembles, each at its Learn values, side by side along x. */
function focusPieces(module: Module): Part[] {
  let x = 0;
  return assembledFrom(module).flatMap((p) => {
    // Drawn matte whatever the primitive's finish, so a rubber pad or a metal coil floats in the same bright pink as the part it becomes.
    const parts = p.build(initialValues(p)).filter((q) => q.color === COLOR.focus).map((q) => ({ ...q, finish: "matte" as const }));
    if (parts.length === 0) return [];
    const box = extents(parts);
    const shift = vec(x - box.min.x, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
    x += box.max.x - box.min.x + PIECE_GAP;
    return parts.map((q) => ({ ...q, id: `${p.id}-${q.id}`, position: vec(q.position.x + shift.x, q.position.y + shift.y, q.position.z + shift.z) }));
  });
}

const sub = (a: Vec | undefined, b: Vec | undefined) => vec((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0), (a?.z ?? 0) - (b?.z ?? 0));

export function Assemble({ lesson, kit, index, onNext }: { lesson: Workshop; kit: Kit; index: number; onNext: () => void }) {
  const module = lesson.modules[index]!;
  const alive = useAlive();
  const setup = useMemo(() => {
    const after = presentAfter(lesson, kit, index);
    // A module that earns the first parts (an object's stand earns its root) has nothing to land on, so
    // its parts wait in grey where they sit and turn pink when the piece lands.
    const built = presentAfter(lesson, kit, index - 1);
    const before = built.length > 0 ? built : after;
    const restBefore = lesson.rest({ kit, present: before });
    const restAfter = lesson.rest({ kit, present: after });
    const centre = restCentre(kit, after, restAfter);
    const whole = (explode: number) => drawObject({ kit, present: after, scene: restAfter, explode, pink: new Set(), centre, apart: lesson.apart });
    const box = extents(whole(0));
    const raw = focusPieces(module);
    const rawBox = extents(raw);
    const [wide, tall] = [box.max.x - box.min.x, box.max.y - box.min.y];
    const size = Math.min(100, Math.max(40, 0.55 * Math.max(wide, tall)));
    const scale = Math.min(MAX_ENLARGE, size / Math.max(rawBox.max.x - rawBox.min.x, rawBox.max.y - rawBox.min.y, rawBox.max.z - rawBox.min.z));
    // The piece floats beside a tall object and above a long one, so it adds as little as it can to the view.
    const at = tall >= wide
      ? vec(box.max.x + GAP + size / 2, Math.max(size / 2 + 8, (box.min.y + box.max.y) / 2), 0)
      : vec((box.min.x + box.max.x) / 2, box.max.y + GAP + size / 2, 0);
    const piece = { raw, scale, centre: vec((rawBox.min.x + rawBox.max.x) / 2, (rawBox.min.y + rawBox.max.y) / 2, 0), at };
    const target: Part = {
      id: "target", name: "target", role: "", parentId: null, joint: null,
      shape: { kind: "torus", radius: module.target.ring.radius, tube: 2, arcDegrees: 360 },
      position: module.target.at, rotation: ringRotation(module.target.ring.axis), color: COLOR.accent, finish: "matte",
    };
    const around = [...whole(0), ...placeParts(raw, piece.centre, scale, vec(piece.at.x, piece.at.y + 10, 0)), target];
    return { before, after, restBefore, restAfter, centre, piece, target, around, whole, hidden: module.produces.some((id) => enclosed(id, whole(0))) };
  }, [lesson, kit, index, module]);

  const [picked, setPicked] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [explode, setExplode] = useState(0);
  const [warn, setWarn] = useState(false);
  const [tick, setTick] = useState(0);
  const landed = progress !== null && progress >= LAND;
  const placed = progress === 1;
  const flying = progress !== null && !placed;

  useEffect(() => {
    if (progress !== null) return;
    const id = setInterval(() => setTick((t) => t + 1), 70);
    return () => clearInterval(id);
  }, [progress]);

  const fly = () => {
    if (progress !== null) return;
    setPicked(true);
    const from = explode;
    void play(FLIGHT_MS, (ms) => {
      setProgress(ms / FLIGHT_MS);
      setExplode(from * (1 - easeOut(clamp01(ms / FLIGHT_MS / LAND))));
    }, alive).then((done) => {
      // A part that lands inside another would turn pink out of sight, so the object comes apart to show it.
      if (done && setup.hidden) void play(REVEAL_MS, (ms) => setExplode(smooth(ms / REVEAL_MS)), alive);
    });
  };
  const drop = () => {
    if (!picked) return setWarn(true);
    fly();
  };

  const parts = useMemo(() => {
    const { before, after, restBefore, restAfter, centre, piece, target } = setup;
    const p = progress ?? 0;
    if (landed) {
      const settle = 1 - easeOut(clamp01((p - LAND) / (1 - LAND)));
      const moves: Record<string, PartMove> = {};
      for (const id of after) {
        const from = before.includes(id) ? sub(restBefore.moves[id]?.offset, restAfter.moves[id]?.offset) : module.enter;
        moves[id] = { offset: vec(from.x * settle, from.y * settle, from.z * settle) };
      }
      const scene: Scene = compose(restAfter, { moves, marks: [] });
      return drawObject({ kit, present: after, scene, explode, pink: new Set(module.produces), centre, apart: lesson.apart });
    }
    const object = drawObject({ kit, present: before, scene: restBefore, explode, pink: new Set(), centre, apart: lesson.apart });
    const q = easeOut(clamp01(p / LAND));
    const bob = progress === null ? 4 * Math.sin(tick * 0.3) + (picked ? 10 : 0) : 0;
    const at = vec(lerp(piece.at.x, module.target.at.x, q), lerp(piece.at.y + bob, module.target.at.y, q), lerp(0, module.target.at.z, q));
    const floating = placeParts(piece.raw, piece.centre, lerp(piece.scale, piece.scale * 0.12, q), at).map<Part>((part) => ({ ...part, id: `piece-${part.id}` }));
    const marker: Part = picked ? { ...target, shape: { kind: "torus", radius: module.target.ring.radius, tube: 3, arcDegrees: 360 } } : target;
    return [...object, ...floating, marker];
  }, [setup, kit, lesson.apart, module, progress, landed, tick, picked, explode]);

  const subject = useMemo(() => (landed ? setup.whole(explode) : [...setup.around, ...setup.whole(explode)]), [setup, explode, landed]);
  const names = listOf(module.produces.map((id) => kit.parts.find((q) => q.id === id)?.name ?? id));
  const piece = module.assemble.piece;
  const target = module.target.label;
  const say = placed ? `Built: ${names}.` : warn ? `Tap the ${piece.toLowerCase()} first.` : picked ? `Now tap ${target.toLowerCase()}.` : `Tap the ${piece.toLowerCase()}.`;

  return (
    <main className="page" data-stage="assemble">
      <Say
        kicker={`${module.title} · Build`}
        found={placed}
        why={
          <Why title="Build it">
            <p className="sheet-lead">{module.assemble.title}</p>
            {placed ? <p>{module.assemble.built} Pink marks the part this lesson is about.</p> : <p>Tap the floating piece, then the ring on the {lesson.objectName.toLowerCase()} where it goes.</p>}
          </Why>
        }
      >
        {say}
      </Say>
      <Viewer parts={parts} subject={subject} view={lesson.view} />
      <ExplodeSlider value={explode} onChange={setExplode} disabled={flying} />
      {placed ? null : (
        <div className="row steps">
          <button type="button" className="step" data-step="piece" data-on={picked ? "" : undefined} disabled={progress !== null} onClick={() => { setPicked(true); setWarn(false); }}>
            <span className="mono">1 · Pick up</span>
            <strong>{piece}</strong>
          </button>
          <button type="button" className="step" data-step="target" disabled={progress !== null} onClick={drop}>
            <span className="mono">2 · Drop on</span>
            <strong>{target}</strong>
          </button>
        </div>
      )}
      <Actions>
        <button type="button" className="btn" data-next disabled={!placed} onClick={onNext}>Next: test it</button>
      </Actions>
    </main>
  );
}
