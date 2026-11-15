// The primitive template's own rules, on top of the lesson's stylesheets: loaded by the bench and by any lesson that
// shows a primitive screen (the demo).
export const TEMPLATE_CSS = `
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
