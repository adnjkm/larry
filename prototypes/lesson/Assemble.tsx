import { useEffect, useMemo, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { initialValues } from "../../src/primitives/library.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { clamp01, easeOut, lerp } from "./ease.ts";
import { type PartMove, presentAfter, type Scene, type Target, vec, type Vec, type Workshop } from "./model.ts";
import { compose, drawObject, extents, frameAround, placeParts, restCentre } from "./pose.ts";
import { ExplodeSlider, Header, Viewer } from "./ui.tsx";

const FLIGHT_MS = 650;
/** The piece is spent on the way in; the part appears for the last quarter of the flight and settles. */
const LAND = 0.75;
const GAP = 24;

const ringRotation = (axis: Target["ring"]["axis"]): Vec => (axis === "x" ? vec(0, 0, 90) : axis === "z" ? vec(90, 0, 0) : vec());
const sub = (a: Vec | undefined, b: Vec | undefined) => vec((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0), (a?.z ?? 0) - (b?.z ?? 0));

export function Assemble({ lesson, kit, index, onNext }: { lesson: Workshop; kit: Kit; index: number; onNext: () => void }) {
  const module = lesson.modules[index]!;
  const alive = useAlive();
  const setup = useMemo(() => {
    const before = presentAfter(lesson, kit, index - 1);
    const after = presentAfter(lesson, kit, index);
    const restBefore = lesson.rest({ kit, present: before });
    const restAfter = lesson.rest({ kit, present: after });
    const centre = restCentre(kit, after, restAfter);
    const whole = (explode: number) => drawObject({ kit, present: after, scene: restAfter, explode, pink: new Set(), centre, apart: lesson.apart });
    const box = extents(whole(0));
    const raw = module.main.build(initialValues(module.main));
    const rawBox = extents(raw);
    const size = Math.min(100, Math.max(40, 0.55 * Math.max(box.max.x - box.min.x, box.max.y - box.min.y)));
    const scale = Math.min(1, size / Math.max(rawBox.max.x - rawBox.min.x, rawBox.max.y - rawBox.min.y));
    const piece = { raw, scale, centre: vec((rawBox.min.x + rawBox.max.x) / 2, (rawBox.min.y + rawBox.max.y) / 2, 0), at: vec(box.max.x + GAP + size / 2, Math.max(size / 2 + 8, (box.min.y + box.max.y) / 2), 0) };
    const target: Part = {
      id: "target", name: "target", role: "", parentId: null, joint: null,
      shape: { kind: "torus", radius: module.target.ring.radius, tube: 2, arcDegrees: 360 },
      position: module.target.at, rotation: ringRotation(module.target.ring.axis), color: COLOR.accent, finish: "matte",
    };
    const frame = frameAround([...whole(0), ...whole(1), ...placeParts(raw, piece.centre, scale, vec(piece.at.x, piece.at.y + 10, 0)), target]);
    return { before, after, restBefore, restAfter, centre, piece, target, frame };
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
    }, alive);
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

  const names = module.produces.map((id) => kit.parts.find((q) => q.id === id)?.name ?? id).join(" and ");
  const piece = module.main.name.toLowerCase();
  const object = lesson.objectName.toLowerCase();

  return (
    <main className="page" data-stage="assemble">
      <Header kicker={`Module ${index + 1} · Build the part`} title={`Turn the ${piece} into the ${names.toLowerCase()}.`} />
      <p className="hint">The {piece} floats beside the {object}. Pick it up, then drop it on the {module.target.label.toLowerCase()}.</p>
      <Viewer name={lesson.objectName} parts={parts} frame={setup.frame} height={400} />
      <ExplodeSlider value={explode} onChange={setExplode} disabled={flying} />
      <div className="row steps">
        <button type="button" className="step" data-step="piece" data-on={picked ? "" : undefined} disabled={progress !== null} onClick={() => { setPicked(true); setWarn(false); }}>
          <span className="mono">1 · Pick up</span>
          <strong>{module.main.name}</strong>
        </button>
        <button type="button" className="step" data-step="target" data-on={placed ? "" : undefined} disabled={progress !== null} onClick={drop}>
          <span className="mono">2 · Drop on</span>
          <strong>{module.target.label}</strong>
        </button>
      </div>
      {warn ? <p className="hint warn">Pick up the {piece} first.</p> : null}
      {placed ? (
        <>
          <div className="earned">
            <span className="mono" style={{ color: COLOR.focus }}>Part built</span>
            <strong>{names}</strong>
            <span>The {piece} is now the {names.toLowerCase()} on the {object}. It is pink because it is the piece this module is about.</span>
          </div>
          <button type="button" className="btn" data-next onClick={onNext}>Next: test it</button>
        </>
      ) : (
        <button type="button" className="btn secondary" data-fit disabled={progress !== null} onClick={fly}>Fit it</button>
      )}
    </main>
  );
}
