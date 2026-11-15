// Every primitive's game as a lesson screen in the demo's phone (primitives.html, or ?<id> to open one). Dev only.
// The DialKit panel picks the game; "[" and "]" step through them, since the arrow keys belong to the sliders.
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef, useState } from "react";
import baseCss from "../lesson/base.css?inline";
import lessonCss from "../lesson/lesson.css?inline";
import { PRIMITIVES } from "../../shared/primitives/library.ts";
import { PHONE_CSS, Phone } from "./Phone.tsx";
import { PrimitiveScreen } from "./PrimitiveScreen.tsx";

const options = PRIMITIVES.map((p, i) => ({ value: p.id, label: `${String(i + 1).padStart(2, "0")} ${p.name}` }));

/** The primitive the address bar asks for (`?lever`), or the first. */
function startingId(): string {
  const asked = [...new URLSearchParams(location.search).keys()][0];
  return (PRIMITIVES.find((p) => p.id === asked) ?? PRIMITIVES[0]!).id;
}

export function Bench() {
  // The action handler is given to the hook that returns the controller, so it reaches the controller through a ref.
  const step = useRef<(by: number) => void>(undefined);
  const [round, setRound] = useState(0);
  const controller = useDialKitController(
    "Primitives",
    {
      primitive: { type: "select", options, default: startingId() },
      next: { type: "action", label: "Next  ]" },
      previous: { type: "action", label: "Previous  [" },
      restart: { type: "action", label: "Start this one over" },
    },
    // Not persisted: the address bar remembers the primitive, so a saved choice can never disagree with it.
    { id: "larry-primitives-bench", onAction: (action) => (action === "restart" ? setRound((n) => n + 1) : step.current?.(action === "next" ? 1 : -1)) },
  );

  const index = Math.max(
    0,
    PRIMITIVES.findIndex((p) => p.id === controller.values.primitive),
  );
  const primitive = PRIMITIVES[index]!;
  step.current = (by) => controller.setValue("primitive", PRIMITIVES[(index + by + PRIMITIVES.length) % PRIMITIVES.length]!.id);

  const id = primitive.id;
  useEffect(() => {
    history.replaceState(null, "", `${location.pathname}?${id}`);
    document.title = `${primitive.name} · primitives`;
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]") step.current?.(1);
      else if (e.key === "[") step.current?.(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bench">
      <style>{baseCss + lessonCss + PHONE_CSS + BENCH_CSS}</style>
      <Phone>
        <div className="bench-lesson">
          {/* Keyed so a new primitive, or "start over", is a new screen: its own controller, phase and result. */}
          <PrimitiveScreen key={`${id}:${round}`} primitive={primitive} onBack={() => step.current?.(-1)} />
        </div>
      </Phone>
      <DialRoot defaultOpen position="top-right" />
    </div>
  );
}

const BENCH_CSS = `
html, body { background: #efefef; }
.bench { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 16px 336px 16px 16px; box-sizing: border-box; }
.bench-lesson { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; color: #141414; font-family: Geist, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.bench-lesson .screen { height: 100%; max-width: none; }

/* The figure stands on the screen itself, no frame, and takes the height the screen leaves it. */
.figure { position: relative; flex: 1 1 0; min-height: 150px; margin: 0 -16px; }
.figure > :first-child { position: absolute; inset: 0; }

/* The sliders keep their room from the start, hidden; once the figure has been moved they rise in, 40 ms apart. */
.tuning { flex: none; display: flex; flex-direction: column; padding-bottom: 12px; }
.tuning > * { opacity: 0; transform: translateY(12px); transition: opacity 280ms var(--ease-out), transform 360ms var(--ease-out); }
.tuning[data-shown] > * { opacity: 1; transform: none; }
.tuning[data-shown] > :nth-child(2) { transition-delay: 40ms; }
.tuning[data-shown] > :nth-child(3) { transition-delay: 80ms; }

/* A slider's end words sit under the bar's two ends. */
.track-ends { position: relative; min-width: 0; }
.slider[data-ends] { padding-bottom: 14px; }
.ends { position: absolute; left: 0; right: 0; bottom: -12px; display: flex; justify-content: space-between; font-family: "Geist Mono", ui-monospace, monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--graphite); pointer-events: none; }

/* The law, one line: ink on white, a faint zero, a pink dot for where the machine is now. */
.plot { margin: 0 0 8px; }
/* Inset by half the ball, so it is whole at both ends of the line. */
.plot-area { position: relative; height: 72px; margin: 0 7px; }
.plot svg { display: block; width: 100%; height: 72px; overflow: visible; }
.plot-line { fill: none; stroke: var(--ink); stroke-width: 1.5px; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.plot-zero { stroke: var(--rule); stroke-width: 1px; vector-effect: non-scaling-stroke; }
.plot-dot { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; pointer-events: none; }
.plot-dot > * { position: absolute; inset: 0; }
.plot figcaption { margin-top: 4px; }

/* Next rises in the same way once a slider has been tried. */
.reveal { flex: none; opacity: 0; transform: translateY(12px); transition: opacity 280ms var(--ease-out), transform 360ms var(--ease-out); }
.reveal[data-shown] { opacity: 1; transform: none; }
/* Each step fades in as it takes the screen. */
.step-in { animation: step-in 320ms var(--ease-out) both; }
@keyframes step-in { from { opacity: 0; } }
.result:empty { display: none; }
.result { min-height: 0; }
.hold-fill { position: absolute; inset: 0; border-radius: 999px; background: var(--pink); opacity: 0.85; transform-origin: left; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .tuning > *, .reveal { transform: none; } }
`;
