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
          <PrimitiveScreen key={`${id}:${round}`} primitive={primitive} onBack={() => step.current?.(-1)} onDone={() => step.current?.(1)} />
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

/* The mechanism bubble: its tab takes the gap under the header, so the key itself stays where it was. */
.need[data-mechanism] { margin-top: -10px; padding-top: 20px; justify-content: center; }

/* The term and its notes read as one group, set further off the bubble. */
.notes { flex: none; display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }

/* A strip slider with end words takes the whole width; the words say what it is. */
.slider.strip[data-ends] { grid-template-columns: minmax(0, 1fr); }

/* The gate: the window the law's line must pass through, grey until it does, then pink. */
.plot-gate line { stroke: var(--graphite); stroke-width: 2px; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.plot-gate[data-met] line { stroke: var(--pink); }
.plot-gate-label { position: absolute; transform: translate(10px, -50%); font-family: "Geist Mono", ui-monospace, monospace; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--graphite); pointer-events: none; }

/* The Continue pill: a ghost outline until its goal is met, then the dark pill fills in from the left; it drains back
   faster if the goal is lost. The label is ink on the ghost and white once full. */
.fill-pill { position: relative; isolation: isolate; background: transparent; box-shadow: 0 0 0 1.5px var(--rule) inset; transition: box-shadow 200ms ease-out; }
.fill-pill[aria-disabled="true"] { cursor: default; }
.fill-pill[aria-disabled="true"]:active { transform: none; }
.fill-solid { position: absolute; inset: 0; isolation: isolate; display: flex; align-items: center; justify-content: center; border-radius: 999px; clip-path: inset(0 100% 0 0 round 999px); transition: clip-path 280ms var(--ease-out); }
.fill-pill[data-met] .fill-solid { clip-path: inset(0 0 0 0 round 999px); transition: clip-path var(--fill-ms) linear; }
.fill-label { position: relative; font-family: "Open Runde", system-ui, sans-serif; font-size: 17px; line-height: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.fill-label-on { color: #fff; }
.fill-pill[data-full] { box-shadow: none; }

/* Each step fades in as it takes the screen. */
.step-in { animation: step-in 320ms var(--ease-out) both; }
@keyframes step-in { from { opacity: 0; } }
.result:empty { display: none; }
.result { min-height: 0; }
.hold-fill { position: absolute; inset: 0; border-radius: 999px; background: var(--pink); opacity: 0.85; transform-origin: left; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .tuning > *, .reveal { transform: none; } }
`;
