// One primitive's lesson, in the demo lesson's look: two steps, PRIMITIVE_STEPS, one after the other (the header's keys
// are the lesson's, not these):
// 1. Play: the bare machine on the screen and the player's finger on its handle. Its sliders are part of this step, held
//    back until the player has moved the machine, so they can then feel how working it changes. Trying one shows Next.
// 2. Challenge: the game comes back, with its target, because a setting only means something against a goal. Set the
//    number, act once, see what that setting does.
// The figures, models and games are the library's (shared/primitives), driven through the same stage controller and
// store as the library page (src/primitives/game).
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DitherRange, TRACK } from "../lesson/controls.tsx";
import { Actions, Need, Say, Shell, type Step } from "../lesson/ui.tsx";
import { controlRows, headlineText } from "../../src/primitives/game/logic.ts";
import { Rows, ToggleRow } from "../../src/primitives/game/parts.tsx";
import { GameStore, useSelect } from "../../src/primitives/game/store.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { PillLabel, PillSurface } from "../../src/ui/PillSurface.tsx";
import { CAMERA } from "../../src/camera/look.ts";
import { circle } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import type { FigureMode } from "../../shared/primitives/framing.ts";
import {
  type Cue,
  type Primitive,
  type Slider,
  type Values,
  type Verdict,
  numberSlider,
  playMotion,
  playTuning,
  playValues,
  snap,
  startValues,
} from "../../shared/primitives/types.ts";

/** A primitive's lesson, in order. */
export const PRIMITIVE_STEPS = ["play", "challenge"] as const;
export type PrimitiveStep = (typeof PRIMITIVE_STEPS)[number];

/** Keys in the header's progress bar, which belongs to the lesson round this screen: the first is lit, the rest locked. */
const KEYS = 3;
const KEY_STEPS: Step[] = Array.from({ length: KEYS }, (_, i) => ({
  key: String(i),
  title: `Step ${i + 1}`,
  state: i === 0 ? "now" : "todo",
  enabled: i === 0,
  go: () => {},
}));

/** How long a held action takes to fill. */
const HOLD_MS = 700;

/** What each cue feels like, as a vibration pattern in ms. */
const BUZZ: Record<Cue["kind"], number | number[]> = { click: 6, snap: [12, 24, 12], thud: 18, pop: 10, slip: [6, 20, 6], drip: 4, ring: [8, 30, 8] };
const buzz = (cue: Cue) => navigator.vibrate?.(BUZZ[cue.kind]);

export function PrimitiveScreen({ primitive, onBack }: { primitive: Primitive; onBack: () => void }) {
  const [at, setAt] = useState(0);
  const step: PrimitiveStep = PRIMITIVE_STEPS[at]!;
  const next = () => setAt((i) => Math.min(i + 1, PRIMITIVE_STEPS.length - 1));
  const previous = () => setAt((i) => Math.max(i - 1, 0));
  // Kept here, not in the play step, so coming back from the challenge finds the sliders and Next already out.
  const [moved, setMoved] = useState(false);
  const [tuned, setTuned] = useState(false);

  return (
    <Shell objectName={primitive.name} steps={KEY_STEPS} onHome={at === 0 ? onBack : previous}>
      {step === "play" ? (
        <PlayStep primitive={primitive} moved={moved} tuned={tuned} onMoved={() => setMoved(true)} onTuned={() => setTuned(true)} onNext={next} />
      ) : (
        <ChallengeStep primitive={primitive} />
      )}
    </Shell>
  );
}

function PlayStep({
  primitive,
  moved,
  tuned,
  onMoved,
  onTuned,
  onNext,
}: {
  primitive: Primitive;
  moved: boolean;
  tuned: boolean;
  onMoved: () => void;
  onTuned: () => void;
  onNext: () => void;
}) {
  const store = useMemo(() => new GameStore(playValues(primitive)), [primitive]);
  const motion = playMotion(primitive);
  // The sliders that change the primitive itself. The motion slider isn't one: the handle on the figure drives it.
  const tuning = playTuning(primitive);
  const plot = primitive.play?.plot;

  // Moved: the handle has taken the machine away from rest. Tuned: a slider has changed what it is. With no slider to
  // try, moving it is enough to go on.
  const start = useRef(playValues(primitive));
  useEffect(
    () =>
      store.subscribe(() => {
        const now = store.snapshot();
        if (now[motion.id] !== start.current[motion.id]) onMoved();
        if (tuning.some((s) => now[s.id] !== start.current[s.id])) onTuned();
      }),
    [store],
  );
  const ready = tuned || (moved && tuning.length === 0);

  return (
    <main className="page step-in" data-step="play" data-primitive={primitive.id} data-moved={moved ? "" : undefined}>
      <Say kicker={primitive.level}>{primitive.name}</Say>
      <Figure primitive={primitive} mode="play" store={store} />
      {/* Laid out from the start but hidden, so the figure keeps its size and the camera holds still when they arrive. */}
      <div className="tuning" data-shown={moved ? "" : undefined} inert={!moved}>
        {plot ? <LawPlot store={store} plot={plot} /> : null}
        {tuning.map((s) => (
          <TuneRow key={s.id} store={store} slider={s} />
        ))}
      </div>
      <div className="reveal" data-shown={ready ? "" : undefined} inert={!ready}>
        <Actions>
          <button type="button" className="btn" data-next onClick={onNext}>
            <PillSurface>Next: The Challenge</PillSurface>
          </button>
        </Actions>
      </div>
    </main>
  );
}

type Phase = "ready" | "playing" | "done";

function ChallengeStep({ primitive }: { primitive: Primitive }) {
  const game = primitive.game;
  const store = useMemo(() => new GameStore(startValues(primitive)), [primitive]);
  const [phase, setPhaseState] = useState<Phase>("ready");
  // The run's verdict, shown once a run has finished and until anything on the figure changes.
  const [result, setResult] = useState<Verdict>();
  const phaseRef = useRef<Phase>("ready");
  const before = useRef<Values>({});
  const runId = useRef(0);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  useEffect(
    () =>
      store.subscribe(() => {
        // After a run the figure stays on its last frame; any change after that is the player's, so the result is stale.
        if (phaseRef.current === "done") {
          setResult(undefined);
          setPhase("ready");
        }
      }),
    [store],
  );

  const number = numberSlider(primitive);
  const rows = controlRows(game.controls ?? [], game.number);

  /** Puts the figure back where it was before the run, keeping the player's settings. */
  const reset = () => {
    const c = store.controller;
    if (!c) return;
    const now = c.get();
    const kept = Object.fromEntries([game.number, ...(game.controls ?? []).map((s) => s.id)].map((id) => [id, now[id]!]));
    setResult(undefined);
    setPhase("ready");
    c.set({ ...before.current, ...kept });
  };

  const act = async () => {
    const c = store.controller;
    if (!c || phaseRef.current === "playing") return;
    if (phaseRef.current === "done") return reset();
    before.current = { ...c.get() };
    const run = game.play(c.get());
    const id = ++runId.current;
    setPhase("playing");
    const finished = await c.play(run);
    if (id !== runId.current) return;
    if (!finished) return setPhase("ready");
    setResult(run.verdict);
    setPhase("done");
  };

  const label = phase === "done" ? (result?.pass ? "Play Again" : "Try Again") : game.action;
  const hold = phase === "ready" && /^hold/i.test(game.action);

  return (
    <main className="page step-in" data-step="challenge" data-game={primitive.id} data-phase={phase}>
      <Need text={game.goal} met={result && result.pass} />
      <Say kicker={game.name}>{game.name}</Say>
      <Figure primitive={primitive} mode="game" store={store} />
      <div className="sliders">
        <TuneRow store={store} slider={number} />
        {rows.map((row) =>
          row.kind === "slider" ? (
            <TuneRow key={row.slider.id} store={store} slider={row.slider} />
          ) : (
            <Rows key={row.sliders[0]!.id}>
              <ToggleRow store={store} sliders={row.sliders} />
            </Rows>
          ),
        )}
      </div>
      <p className="result" data-verdict={result?.outcome} data-bad={result && !result.pass ? "" : undefined} aria-live="polite">
        {result ? (
          <>
            <b>{headlineText(result)}</b> {result.detail}
          </>
        ) : null}
      </p>
      <Actions>
        {hold ? (
          <HoldPill label={label} onHeld={act} />
        ) : (
          <button type="button" className="btn" data-action="act" disabled={phase === "playing"} onClick={act}>
            <PillSurface>{label}</PillSurface>
          </button>
        )}
      </Actions>
    </main>
  );
}

/** The figure on the screen itself, no frame, as tall as the screen leaves it. */
function Figure({ primitive, mode, store }: { primitive: Primitive; mode: FigureMode; store: GameStore }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setHeight(Math.floor(el.clientHeight));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="figure" ref={box}>
      {height > 0 ? <FigureStage primitive={primitive} mode={mode} palette="library" height={height} controllerRef={store.attach} onCue={buzz} /> : null}
    </div>
  );
}

/**
 * A slider as the lesson's pink dithered bar. No number on it: the figure shows what it does. Its two end words, when
 * it has them ("Soft", "Stiff"), sit under the bar's ends so the direction means something.
 */
export function TuneRow({ store, slider }: { store: GameStore; slider: Slider }) {
  const value = useSelect(store, (v) => v[slider.id] ?? slider.initial);
  const span = slider.max - slider.min || 1;
  const fraction = (value - slider.min) / span;
  const word = slider.ends ? slider.ends[fraction < 0.5 ? 0 : 1] : slider.label;
  return (
    <div className="slider strip" data-free data-slider={slider.id} data-ends={slider.ends ? "" : undefined}>
      <span className="mono">{slider.label}</span>
      <div className="track-ends">
        <DitherRange
          label={slider.label}
          position={Math.round(fraction * TRACK)}
          valueText={word}
          onPosition={(p) => store.controller?.set({ [slider.id]: snap(slider, slider.min + (p / TRACK) * span) })}
        />
        {slider.ends ? (
          <span className="ends" aria-hidden>
            <span>{slider.ends[0]}</span>
            <span>{slider.ends[1]}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

const PLOT_W = 380;
/** The plot's ball, CSS px across. */
const BALL = 14;
const PLOT_H = 72;

/** The primitive's law as one line, reshaped live as the sliders move, with the dot where the machine is now. */
export function LawPlot({ store, plot }: { store: GameStore; plot: NonNullable<NonNullable<Primitive["play"]>["plot"]> }) {
  const p = useSelect(store, (v) => {
    const out = plot(v);
    return JSON.stringify(out);
  });
  const { line, dot, zero, caption } = JSON.parse(p) as ReturnType<typeof plot>;
  const x = (u: number) => (u * PLOT_W).toFixed(1);
  const y = (u: number) => ((1 - u) * (PLOT_H - 4) + 2).toFixed(1);
  const d = line.map(([u, w], i) => `${i === 0 ? "M" : "L"}${x(u)} ${y(w)}`).join(" ");
  return (
    <figure className="plot" data-plot>
      <div className="plot-area">
        <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-hidden>
          {zero !== undefined ? <line x1="0" x2={PLOT_W} y1={y(zero)} y2={y(zero)} className="plot-zero" /> : null}
          <path d={d} className="plot-line" />
        </svg>
        {dot ? (
          <span className="plot-dot" style={{ left: `${dot[0] * 100}%`, top: `${(((1 - dot[1]) * (PLOT_H - 4) + 2) / PLOT_H) * 100}%` }}>
            {/* A pink ball, raised and dithered like the progress keys. */}
            <Surface
              shape={circle(BALL)}
              relief="cap"
              material="pink"
              ground="light"
              grain={CAMERA.grain}
              depth={CAMERA.relief}
              drift={CAMERA.idleDither}
              pad={4}
            />
          </span>
        ) : null}
      </div>
      {caption ? <figcaption className="mono">{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * The dark pill for an action you hold ("Hold to press"): it fills pink from the left while held and runs when full.
 * Android cancels a click once a press becomes a long press, so it listens to the press itself. A click with no press
 * before it (keyboard, screen reader) runs at once.
 */
function HoldPill({ label, onHeld }: { label: string; onHeld: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  const holding = useRef<Animation | null>(null);
  const pressed = useRef(false);
  const release = () => {
    const animation = holding.current;
    holding.current = null;
    if (!animation) return;
    const progress = Number(animation.currentTime ?? 0) / HOLD_MS;
    animation.cancel();
    fill.current?.animate([{ transform: `scaleX(${progress})` }, { transform: "scaleX(0)" }], { duration: 160, easing: "ease-out" });
  };
  return (
    <button
      type="button"
      className="btn hold"
      data-action="act"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pressed.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const animation = fill.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: HOLD_MS,
          easing: "linear",
          fill: "forwards",
        });
        if (!animation) return;
        holding.current = animation;
        animation.onfinish = () => {
          if (holding.current !== animation) return;
          holding.current = null;
          animation.cancel();
          navigator.vibrate?.(15);
          onHeld();
        };
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (!pressed.current) onHeld();
        pressed.current = false;
      }}
    >
      <PillSurface />
      <span ref={fill} className="hold-fill" aria-hidden style={{ transform: "scaleX(0)" } as CSSProperties} />
      <PillLabel>{label}</PillLabel>
    </button>
  );
}
