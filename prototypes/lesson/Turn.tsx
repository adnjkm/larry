// An assemble step for a part whose job is in how it turns, not where it sits: the cam. The primitive's own figure
// stands in the middle (the rod on its rim is the pen's tip), and the player drags on how far each click should turn
// it. Two clicks then play on the figure: a turn that lands on a bump leaves the rod up, and the next has to let it
// down again. Nothing is narrated; the figure is the feedback, and Replay Test plays the last choice again.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PRIMITIVES } from "../../shared/primitives/library.ts";
import { rise } from "../../shared/primitives/models/cam.ts";
import type { Values } from "../../shared/primitives/types.ts";
import { CAMERA } from "../../src/camera/look.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import type { StageController } from "../../src/primitives/stage/controller.ts";
import { pill } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import { useAlive } from "./anim.ts";
import { Advance } from "./Tip.tsx";
import { Actions, Say } from "./ui.tsx";

export type TurnOption = { id: string; label: string; /** How much of a whole turn one click gives the cam. */ turns: number };

type Props = {
  header: ReactNode;
  say: string;
  options: readonly TurnOption[];
  tip?: readonly string[];
  next: string;
  onNext: () => void;
};

/** Bumps low enough that the cam turns round and round without wedging its rod. */
const LIFT = 8;
const CHIP = { w: 104, h: 44 };
const [TURN_MS, HOLD_MS, REST_MS] = [620, 850, 500];
/** Strong ease-in-out, for the cam's own turning. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function Turn({ header, say, options, tip, next, onNext }: Props) {
  const alive = useAlive();
  const cam = PRIMITIVES.find((p) => p.id === "cam")!;
  const stage = useRef<StageController | null>(null);
  const figure = useRef<HTMLDivElement>(null);
  // The cam starts with the rod down, halfway between two bumps, so a turn's first landing is what decides it.
  const start = useMemo(() => {
    const v: Values = { lift: LIFT };
    let top = 0;
    for (let i = 0; i < 200; i++) if (rise(v, i / 200) > rise(v, top)) top = i / 200;
    return (top + 0.25) % 1;
  }, []);
  const up = (turn: number) => rise({ lift: LIFT }, ((turn % 1) + 1) % 1) > LIFT * 0.6;
  const works = (o: TurnOption) => up(start + o.turns) && !up(start + 2 * o.turns);

  const [running, setRunning] = useState(false);
  const [found, setFound] = useState(false);
  const [last, setLast] = useState<TurnOption>();
  const [tried, setTried] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; scale: number; dx: number; dy: number } | null>(null);

  const show = (turn: number) => stage.current?.set({ lift: LIFT, turn: ((turn % 1) + 1) % 1 });
  useEffect(() => {
    const id = requestAnimationFrame(() => show(start));
    return () => cancelAnimationFrame(id);
  }, [start]);

  /** Two clicks, each turning the cam by the option's share of a turn, with a beat after each to see where the rod is. */
  const play = (o: TurnOption) => {
    if (running) return;
    setRunning(true);
    setLast(o);
    const began = performance.now();
    const total = 2 * (TURN_MS + HOLD_MS) + REST_MS;
    const at = (ms: number) => {
      const click = Math.min(1, Math.floor(ms / (TURN_MS + HOLD_MS)));
      const into = ms - click * (TURN_MS + HOLD_MS);
      return start + o.turns * (click + ease(Math.min(1, into / TURN_MS)));
    };
    const tick = () => {
      if (!alive()) return;
      const ms = performance.now() - began;
      if (ms < total - REST_MS) {
        show(at(ms));
        requestAnimationFrame(tick);
        return;
      }
      show(start + 2 * o.turns);
      window.setTimeout(() => {
        if (!alive()) return;
        setRunning(false);
        if (works(o)) setFound(true);
        else setTried((t) => new Set([...t, o.id]));
      }, REST_MS);
    };
    show(start);
    requestAnimationFrame(tick);
  };

  const overFigure = (el: HTMLElement) => {
    const a = el.getBoundingClientRect();
    const b = figure.current?.getBoundingClientRect();
    const [x, y] = [a.left + a.width / 2, a.top + a.height / 2];
    return !!b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  };

  return (
    <main className="page step-in" data-step="turn">
      {header}
      <Say kicker="Assemble">{say}</Say>
      <div ref={figure} className="turn-figure" data-over={drag && !running ? "" : undefined}>
        <FigureStage primitive={cam} mode="play" handle={false} palette="library" height={300} controllerRef={stage} />
        <button type="button" className="replay" data-replay disabled={running || !last} onClick={() => last && play(last)}>
          Replay Test
        </button>
      </div>
      <div className="turn-tray">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="turn-chip"
            data-option={o.id}
            data-tried={tried.has(o.id) ? "" : undefined}
            data-picked={found && last?.id === o.id ? "" : undefined}
            data-dragging={drag?.id === o.id ? "" : undefined}
            disabled={running || found}
            style={drag?.id === o.id ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
            onPointerDown={(e) => {
              if (running || found) return;
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              // The phone is drawn scaled, so a screen pixel is not a lesson pixel.
              setDrag({ id: o.id, x: e.clientX, y: e.clientY, scale: el.getBoundingClientRect().width / el.offsetWidth || 1, dx: 0, dy: 0 });
            }}
            onPointerMove={(e) => setDrag((d) => (d && d.id === o.id ? { ...d, dx: (e.clientX - d.x) / d.scale, dy: (e.clientY - d.y) / d.scale } : d))}
            onPointerUp={(e) => {
              const d = drag;
              setDrag(null);
              if (!d || d.id !== o.id) return;
              // A tap picks it too, so it works without dragging.
              if (Math.hypot(d.dx, d.dy) < 6 || overFigure(e.currentTarget)) play(o);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            <Surface shape={pill(CHIP.w, CHIP.h)} relief="keycap" material="bone" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <Actions>
        <Advance done={found} next={next} onNext={onNext} tip={tip} />
      </Actions>
    </main>
  );
}
