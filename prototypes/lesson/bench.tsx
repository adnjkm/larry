// Frame-time bench for the bottle in the real Viewer: Explode opened and closed on its springs, then the
// cap twisted on and off. `?kit=scanned` draws the scanned four-part kit as the lesson did before it
// had its own model. A runner calls window.__bench.run(phase) and reads main-thread time around it.
import { _roots } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { aim, idsOf, sharesOf, springsAt, step } from "./explode.ts";
import { useExplode } from "./useExplode.ts";
import bottle from "./lessons/bottle.ts";
import { bindStory, type Shares, STILL } from "./model.ts";
import { compose, drawObject, restCentre } from "./pose.ts";
import { SAMPLES } from "./samples.ts";
import { Viewer } from "./ui.tsx";

const PHASE_MS = 3000;
type Result = { frames: number; meanMs: number; p95Ms: number; worstMs: number; calls: number; triangles: number };
declare global {
  interface Window {
    /** Plays one phase for PHASE_MS and resolves with its rAF deltas and the viewer's last draw calls. */
    __bench?: { run: (phase: "explode" | "twist") => Promise<Result> };
    /** Freezes the explode `ms` after it was sent to `to` from `from`, sent back at `back` ms if given, to film it frame by frame. */
    __film?: (from: number, to: number, ms: number, back?: number) => void;
  }
}

const scanned = SAMPLES.find((s) => s.id === "bottle")!.kit;
const old = new URLSearchParams(location.search).get("kit") === "scanned";
const { kit } = bindStory(bottle, scanned);
const shown = old ? scanned : kit;
const plan = old ? undefined : bottle.explode;
const present = shown.parts.map((p) => p.id);
const ctx = { kit: shown, present };
const rest = bottle.rest(ctx);
const centre = restCentre(shown, present, rest);
const twist = bottle.final.control;

function Bench() {
  const [turn, setTurn] = useState(0.75);
  const explode = useExplode(plan, 0);
  const [film, setFilm] = useState<Shares | null>(null);
  const draw = (amount: number | Shares, at: number) =>
    drawObject({ kit: shown, present, scene: compose(rest, twist.pose(at, ctx)), rigid: STILL, explode: amount, plan, pink: new Set(), centre });
  const subject = useMemo(() => [...draw(0, 0), ...draw(1, 0.75), ...draw(0, 0.75)], []);
  const parts = draw(film ?? explode.shown, turn);
  const box = useRef<HTMLDivElement>(null);
  const set = useRef(explode.set);
  set.current = explode.set;

  useEffect(() => {
    let raf = 0;
    window.__film = (from, to, ms, back) => {
      let s = aim(springsAt(idsOf(plan), from), to);
      while (s.ms < ms) {
        if (back !== undefined && s.ms < back && s.ms + 1000 / 60 >= back) s = aim(s, from);
        s = step(s, 1000 / 60);
      }
      setFilm(sharesOf(s));
    };
    window.__bench = {
      run: (phase) =>
        new Promise((resolve) => {
          const deltas: number[] = [];
          let start = 0;
          let last = 0;
          let closed = false;
          if (phase === "explode") set.current(1);
          const tick = (now: number) => {
            if (start === 0) [start, last] = [now, now];
            deltas.push(now - last);
            last = now;
            const ms = now - start;
            if (ms >= PHASE_MS) {
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
            if (phase === "explode" && !closed && ms >= PHASE_MS / 2) {
              closed = true;
              set.current(0);
            }
            if (phase === "twist") setTurn(0.4 + 0.35 * Math.cos((2 * Math.PI * ms) / PHASE_MS));
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
