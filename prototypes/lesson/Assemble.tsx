import { useEffect, useMemo, useState } from "react";
import type { Part } from "../../shared/kit.ts";
import { initialValues } from "../../src/primitives/library.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { clamp01, easeOut, lerp } from "./ease.ts";
import { lessonPrimitives } from "./Learn.tsx";
import { type Lesson, presentAfter } from "./model.ts";
import { bottleParts, CAP, extents, frameBox, type Move, placeParts, REST, RING, rigOf, vec } from "./pose.ts";
import { Header, Viewer } from "./ui.tsx";

const FRAME = frameBox(-45, 165, 0, 236, 40);
const PIECE_AT = vec(112, 112, 0);
const PIECE_SIZE = 100;
const FLIGHT_MS = 650;
/** The piece is spent on the way in; the part appears for the last quarter of the flight and settles. */
const LAND = 0.75;
const ENTER: Record<string, ReturnType<typeof vec>> = { [CAP]: vec(0, 50, 0), [RING]: vec(60, 0, 0), "ring-tab": vec(60, 0, 0) };

export function Assemble({ lesson, index, onNext }: { lesson: Lesson; index: number; onNext: () => void }) {
  const module = lesson.modules[index]!;
  const alive = useAlive();
  const piece = useMemo(() => {
    const main = lessonPrimitives(module).at(-1)!;
    const raw = main.build(initialValues(main));
    const box = extents(raw);
    return { name: main.name, raw, centre: vec((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, 0), scale: Math.min(1, PIECE_SIZE / Math.max(box.maxX - box.minX, box.maxY - box.minY)) };
  }, [module]);
  const before = presentAfter(lesson, index - 1);
  const after = presentAfter(lesson, index);
  const [picked, setPicked] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [warn, setWarn] = useState(false);
  const [tick, setTick] = useState(0);
  const landed = progress !== null && progress >= LAND;
  const placed = progress === 1;

  useEffect(() => {
    if (progress !== null) return;
    const id = setInterval(() => setTick((t) => t + 1), 70);
    return () => clearInterval(id);
  }, [progress]);

  const fly = () => {
    if (progress !== null) return;
    setPicked(true);
    void play(FLIGHT_MS, (ms) => setProgress(ms / FLIGHT_MS), alive);
  };
  const drop = () => {
    if (!picked) return setWarn(true);
    fly();
  };

  const parts = useMemo(() => {
    const p = progress ?? 0;
    const settle = landed ? easeOut(clamp01((p - LAND) / (1 - LAND))) : 0;
    const moves: Record<string, Partial<Move>> = {};
    if (landed) {
      for (const id of module.produces) {
        const from = ENTER[id] ?? vec(0, 50, 0);
        moves[id] = { dx: from.x * (1 - settle), dy: from.y * (1 - settle) };
      }
      if (module.produces.includes(RING)) moves[CAP] = { dy: -rigOf(lesson.kit, before).seatDrop * (1 - settle) };
    }
    const bottle = bottleParts(lesson.kit, landed ? after : before, { ...REST, moves }, new Set(landed ? module.produces : []));
    if (landed) return bottle;
    const q = easeOut(clamp01(p / LAND));
    const bob = progress === null ? 4 * Math.sin(tick * 0.3) + (picked ? 10 : 0) : 0;
    const at = vec(lerp(PIECE_AT.x, 0, q), lerp(PIECE_AT.y + bob, module.target.y, q), 0);
    const floating = placeParts(piece.raw, piece.centre, lerp(piece.scale, piece.scale * 0.12, q), at).map<Part>((part) => ({ ...part, id: `piece-${part.id}` }));
    const marker: Part = {
      id: "target", name: "target", role: "", parentId: null, joint: null,
      shape: { kind: "torus", radius: 33, tube: picked ? 3 : 2, arcDegrees: 360 },
      position: vec(0, module.target.y, 0), rotation: vec(), color: COLOR.accent, finish: "matte",
    };
    return [...bottle, ...floating, marker];
  }, [lesson.kit, module, before, after, progress, landed, tick, picked, piece]);

  const names = module.produces.map((id) => lesson.kit.parts.find((q) => q.id === id)?.name ?? id).join(" and ");

  return (
    <main className="page" data-stage="assemble">
      <Header kicker={`Module ${index + 1} · Build the part`} title={`Turn the ${piece.name.toLowerCase()} into the ${names}.`} />
      <p className="hint">The {piece.name.toLowerCase()} floats beside the bottle. Pick it up, then drop it on the {module.target.label.toLowerCase()}.</p>
      <Viewer name={lesson.objectName} parts={parts} frame={FRAME} height={400} />
      <div className="row steps">
        <button type="button" className="step" data-step="piece" data-on={picked ? "" : undefined} disabled={progress !== null} onClick={() => { setPicked(true); setWarn(false); }}>
          <span className="mono">1 · Pick up</span>
          <strong>{piece.name}</strong>
        </button>
        <button type="button" className="step" data-step="target" data-on={placed ? "" : undefined} disabled={progress !== null} onClick={drop}>
          <span className="mono">2 · Drop on</span>
          <strong>{module.target.label}</strong>
        </button>
      </div>
      {warn ? <p className="hint warn">Pick up the {piece.name.toLowerCase()} first.</p> : null}
      {placed ? (
        <>
          <div className="earned">
            <span className="mono" style={{ color: COLOR.focus }}>Part built</span>
            <strong>{names}</strong>
            <span>The {piece.name.toLowerCase()} is now the {names} on the bottle. It is pink because it is the piece this module is about.</span>
          </div>
          <button type="button" className="btn" data-next onClick={onNext}>Next: test it</button>
        </>
      ) : (
        <button type="button" className="btn secondary" data-fit disabled={progress !== null} onClick={fly}>Fit it</button>
      )}
    </main>
  );
}
