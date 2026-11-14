// Frame-time bench for the bottle in the real Viewer: Explode opened and closed, then the cap twisted
// on and off. /tmp-style runners call window.__bench.run(phase) and read main-thread time around it.
import { _roots } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { smooth } from "./ease.ts";
import bottle from "./lessons/bottle.ts";
import { STILL } from "./model.ts";
import { compose, drawObject, restCentre } from "./pose.ts";
import { SAMPLES } from "./samples.ts";
import { Viewer } from "./ui.tsx";

const PHASE_MS = 3000;
type Result = { frames: number; meanMs: number; p95Ms: number; worstMs: number; calls: number; triangles: number };
declare global {
  interface Window {
    /** Plays one phase for PHASE_MS and resolves with its rAF deltas and the viewer's last draw calls. */
    __bench?: { run: (phase: "explode" | "twist") => Promise<Result> };
  }
}

const kit = SAMPLES.find((s) => s.id === "bottle")!.kit;
const present = kit.parts.map((p) => p.id);
const ctx = { kit, present };
const rest = bottle.rest(ctx);
const centre = restCentre(kit, present, rest);
const twist = bottle.final.control;

function Bench() {
  const [pose, setPose] = useState({ explode: 0, turn: 0.75 });
  const draw = (explode: number, turn: number) =>
    drawObject({ kit, present, scene: compose(rest, twist.pose(turn, { ...ctx })), rigid: STILL, explode, pink: new Set(), centre, apart: bottle.apart });
  const subject = useMemo(() => [...draw(0, 0), ...draw(1, 0.75), ...draw(0, 0.75)], []);
  const parts = draw(pose.explode, pose.turn);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const phases: Record<string, (ms: number) => { explode: number; turn: number }> = {
      explode: (ms) => ({ explode: ms < PHASE_MS / 2 ? smooth(Math.min(1, ms / 1000)) : 1 - smooth(Math.min(1, (ms - PHASE_MS / 2) / 1000)), turn: 0.75 }),
      twist: (ms) => ({ explode: 0, turn: 0.4 + 0.35 * Math.cos((2 * Math.PI * ms) / PHASE_MS) }),
    };
    let raf = 0;
    window.__bench = {
      run: (name) =>
        new Promise((resolve) => {
          const deltas: number[] = [];
          let start = 0;
          let last = 0;
          const tick = (now: number) => {
            if (start === 0) [start, last] = [now, now];
            deltas.push(now - last);
            last = now;
            if (now - start >= PHASE_MS) {
              const canvas = box.current?.querySelector("canvas");
              const info = canvas ? _roots.get(canvas)?.store.getState().gl.info.render : undefined;
              const sorted = deltas.slice(1).sort((a, b) => a - b);
              return resolve({
                frames: sorted.length,
                meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
                p95Ms: sorted[Math.floor(sorted.length * 0.95)]!,
                worstMs: sorted[sorted.length - 1]!,
                calls: info?.calls ?? -1,
                triangles: info?.triangles ?? -1,
              });
            }
            setPose(phases[name]!(now - start));
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        }),
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main className="page" ref={box} style={{ height: 560, flex: "none" }}>
      <Viewer parts={parts} subject={subject} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Bench />);
