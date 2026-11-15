// One primitive's lesson, in the demo lesson's look: two steps, PRIMITIVE_STEPS, one after the other (the header's keys
// are the lesson's, not these):
// 1. Play: the bare machine on the screen and the player's finger on its handle. Its sliders are part of this step, held
//    back until the player has moved the machine, so they can then feel how working it changes. Trying one shows Next.
// 2. Challenge: the game comes back, with its target, because a setting only means something against a goal. Set the
//    number, act once, see what that setting does.
// The figures, models and games are the library's (shared/primitives), driven through the same stage controller and
// store as the library page (src/primitives/game).
import { type CSSProperties, type ReactNode, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DitherRange, TRACK } from "../lesson/controls.tsx";
import { Actions, Need, Say, Shell, type Step } from "../lesson/ui.tsx";
import { controlRows, headlineText } from "../../src/primitives/game/logic.ts";
import { Rows, ToggleRow } from "../../src/primitives/game/parts.tsx";
import { GameStore, useSelect } from "../../src/primitives/game/store.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { PillLabel, PillSurface } from "../../src/ui/PillSurface.tsx";
import { CAMERA } from "../../src/camera/look.ts";
import { BubbleLabel, BubbleTerm } from "../../src/ui/BubbleLabel.tsx";
import { Term } from "../../src/ui/Term.tsx";
import { StepCard } from "../../src/ui/StepCard.tsx";
import { bubble, circle } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import type { FigureMode } from "../../shared/primitives/framing.ts";
import {
  type Cue,
  type Primitive,
  type Slider,
  type Values,
  type Verdict,
  allSliders,
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

/** The mechanism a primitive is being learned for: its name for the bubble, and which header key is its own. */
export type InMechanism = { name: string; key: number };
const Lesson = createContext<InMechanism | undefined>(undefined);

export function PrimitiveScreen({
  primitive,
  onBack,
  onDone,
  mechanism,
  steps = KEY_STEPS,
}: {
  primitive: Primitive;
  onBack: () => void;
  onDone: () => void;
  /** The lesson this screen sits in. Left off on the bench, which shows a placeholder. */
  mechanism?: InMechanism;
  /** The lesson's header keys. */
  steps?: Step[];
}) {
  // A primitive with goals is played and then set to them, all on one screen; the others keep play, then challenge.
  return (
    <Lesson.Provider value={mechanism}>
      {primitive.play?.tasks?.length ? (
        <Shell objectName={primitive.name} steps={steps} onHome={onBack}>
          <TaskPlay primitive={primitive} onDone={onDone} />
        </Shell>
      ) : (
        <TwoSteps primitive={primitive} steps={steps} onBack={onBack} onDone={onDone} />
      )}
    </Lesson.Provider>
  );
}

/**
 * Free play, then its goals, on one screen. First the bare machine and the finger. Once it has been worked and let go,
 * the first goal arrives: its scene drops into the figure (a weight, a line), the goal takes the heading and the slider
 * rises in. While the goal is met, the Continue pill fills from a ghost to solid; full, it opens the next goal, or, after
 * the last, moves on.
 */
function TaskPlay({ primitive, onDone }: { primitive: Primitive; onDone: () => void }) {
  const tasks = primitive.play!.tasks!;
  const store = useMemo(() => new GameStore(playValues(primitive)), [primitive]);
  const motion = playMotion(primitive);
  const tuning = playTuning(primitive);
  const [task, setTask] = useState<number>();
  const current = task === undefined ? undefined : tasks[task];

  /**
   * Begins goal `i`. `from` is where the hand left the machine, for a goal that arrives the moment it is let go: its
   * `arrive` carries on from that let-go (the spring still springing back as the weight falls) rather than from rest.
   * Values are set only when the goal has some: setting any stops the machine's own let-go (the seal's rubber springing
   * back).
   */
  const begin = (i: number, from?: number) => {
    const c = store.controller;
    const t = tasks[i];
    if (!c || !t) return;
    setTask(i);
    if (t.start) c.set(t.start);
    if (t.arrive) void c.play(t.arrive(from === undefined ? c.get() : { ...c.get(), [motion.id]: from }));
  };

  // The first goal begins the moment the hand first lets go of the machine, having moved it: from where it was let go,
  // so a goal that arrives then (the weight dropping on) carries on from the machine's own spring back.
  const started = useRef(false);
  const rest = playValues(primitive)[motion.id];
  const onLetGo = (at: Values) => {
    if (started.current || at[motion.id] === rest) return;
    started.current = true;
    begin(0, at[motion.id]);
  };

  // The task's own sliders, else the play's tuning; laid out for the first task before it begins, so nothing moves then.
  const ids = (current ?? tasks[0]!).sliders;
  const shown = ids ? ids.map((id) => allSliders(primitive).find((s) => s.id === id)!) : tuning;
  const met = useSelect(store, (v) => (current ? current.met(v) : false));
  const hint = useSelect(store, (v) => current?.hint?.(v));
  const last = task === tasks.length - 1;

  return (
    <main className="page step-in" data-step="tasks" data-primitive={primitive.id} data-task={task}>
      <Mechanism />
      <div className="notes">
        {primitive.play?.facts ? (
          <Term word={primitive.name} say={primitive.play.facts.say} points={[primitive.play.facts.note]}>
            {primitive.play.facts.is}
          </Term>
        ) : null}
      </div>
      <Figure primitive={primitive} mode="play" store={store} task={task} onLetGo={onLetGo} />
      {/* What to do now, just over the sliders it is done with. */}
      {/* The challenge, only once there is one. Laid out from the start (holding the first goal's words), so the figure
          keeps its size and the camera holds still when it rises in. */}
      <div className="reveal" data-shown={current ? "" : undefined} aria-hidden={!current}>
        {/* Keyed by what it says, so a new goal, or a hint coming or going, flashes in. */}
        <StepCard key={`${task ?? -1}:${hint ?? ""}`} text={hint ?? (current ?? tasks[0]!).goal} />
      </div>
      <div className="tuning" data-shown={current ? "" : undefined} inert={!current}>
        {shown.map((s) => (
          <TuneRow key={s.id} store={store} slider={s} />
        ))}
      </div>
      <div className="reveal" data-shown={current ? "" : undefined} inert={!current}>
        <Actions>
          {(current ?? tasks[0]!).action ? (
            <button type="button" className="btn" data-action onClick={() => store.controller?.set((current ?? tasks[0]!).action!.set)}>
              <PillSurface>{(current ?? tasks[0]!).action!.label}</PillSurface>
            </button>
          ) : null}
          {/* Keyed by the goal, so each one starts from a ghost. */}
          <FillPill key={task} met={met} label="Continue" onGo={() => (last ? onDone() : begin((task ?? -1) + 1))} />
        </Actions>
      </div>
    </main>
  );
}

/** The keycap row's corner radius, as on the progress keys and the lesson's requirement. */
const MECHANISM_RADIUS = 12;
/** The bubble's tab: how wide its base is and how far it reaches up toward the lit key. */
const TAB_W = 22;
const TAB_H = 10;

/**
 * The row under the header naming the mechanism this lesson is about, on the grey dithered keycap the lesson's
 * requirement row uses (prototypes/lesson/ui.tsx Need), with "Mechanism" for its label. It is a speech bubble: a tab
 * points straight up out of the key, under the header's lit key, as part of the one raised shape. It reads "Ball Tip
 * (MECHANISM)"; given `about`, the bubble grows to explain the mechanism, with that one line under the name. `short`
 * draws the raised shape a second time at that height, and `children` go in the row with the words: both are for a
 * demo's bubble, which draws down to its name as it hands over (prototypes/lesson/Course.tsx DemoBubble).
 */
export function Mechanism({ name, step, about, short, children }: { name?: string; step?: number; about?: string; short?: number; children?: ReactNode } = {}) {
  const lesson = useContext(Lesson);
  const label = name ?? lesson?.name;
  const keyNumber = (step ?? lesson?.key ?? 0) + 1;
  const box = useRef<HTMLParagraphElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, tab: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = (settled = true) => {
      const key = el.closest(".screen")?.querySelector<HTMLElement>(`.top [aria-label^="Step ${keyNumber} "]`);
      // A header that mounts with this row draws its keys a pass later, so there is no key to point at yet. The
      // observer's first call comes after that pass and before anything is painted, so the tab is never seen elsewhere.
      if (!key && !settled) return;
      const at = el.getBoundingClientRect();
      const lit = key?.getBoundingClientRect();
      // Centred under the first key, kept clear of the rounded corners.
      const centre = lit ? lit.left + lit.width / 2 - at.left : at.width / 4;
      const tab = Math.round(Math.min(Math.max(centre, MECHANISM_RADIUS + TAB_W / 2), at.width - MECHANISM_RADIUS - TAB_W / 2));
      setSize({ width: el.offsetWidth, height: el.offsetHeight, tab });
    };
    read(false);
    // Drawn before the frame is painted, not a frame after it.
    const observer = new ResizeObserver(() => flushSync(read));
    observer.observe(el);
    return () => observer.disconnect();
  }, [keyNumber]);
  const raised = (height: number) => (
    <Surface
      shape={bubble(size.width, height, MECHANISM_RADIUS, { x: size.tab, w: TAB_W, h: TAB_H })}
      relief="keycap"
      material="bone"
      ground="light"
      grain={CAMERA.grain}
      depth={CAMERA.relief}
      drift={CAMERA.idleDither}
    />
  );
  return (
    <p ref={box} className="need" data-mechanism>
      {size.width > 0 ? raised(size.height) : null}
      {size.width > 0 && short ? raised(short) : null}
      {label ? (
        <BubbleTerm name={label} kind="mechanism">
          {about}
        </BubbleTerm>
      ) : (
        <BubbleLabel>Lorem Ipsum Dolor Sit Amet, Consectetur Elit</BubbleLabel>
      )}
      {children}
    </p>
  );
}

/** How long a met goal takes to fill the pill. */
const FILL_MS = 1200;

/**
 * The Continue pill, a ghost until the goal is met: then the dark pill fills in from the left over FILL_MS, and only
 * once it is full can it be pressed. Unmet on the way, it drains back.
 */
function FillPill({ met, label, onGo }: { met: boolean; label: string; onGo: () => void }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!met) {
      setFull(false);
      return;
    }
    const done = setTimeout(() => setFull(true), FILL_MS);
    return () => clearTimeout(done);
  }, [met]);
  return (
    <button
      type="button"
      className="btn fill-pill"
      data-next
      data-met={met ? "" : undefined}
      data-full={full ? "" : undefined}
      aria-disabled={!full}
      onClick={() => full && onGo()}
      style={{ "--fill-ms": `${FILL_MS}ms` } as CSSProperties}
    >
      {/* The label twice: ink on the ghost, and white inside the dark fill, which reveals it as it grows, so each letter
          turns white the moment the fill reaches it. Its own labels, not PillLabel, whose colour can't be changed. */}
      <span className="fill-label">{label}</span>
      <span className="fill-solid" aria-hidden>
        <PillSurface />
        <span className="fill-label fill-label-on">{label}</span>
      </span>
    </button>
  );
}

function TwoSteps({ primitive, steps, onBack, onDone }: { primitive: Primitive; steps: Step[]; onBack: () => void; onDone: () => void }) {
  const [at, setAt] = useState(0);
  const step: PrimitiveStep = PRIMITIVE_STEPS[at]!;
  const next = () => setAt((i) => Math.min(i + 1, PRIMITIVE_STEPS.length - 1));
  const previous = () => setAt((i) => Math.max(i - 1, 0));
  // Kept here, not in the play step, so coming back from the challenge finds the sliders and Next already out.
  const [moved, setMoved] = useState(false);
  const [tuned, setTuned] = useState(false);

  return (
    <Shell objectName={primitive.name} steps={steps} onHome={at === 0 ? onBack : previous}>
      {step === "play" ? (
        <PlayStep primitive={primitive} moved={moved} tuned={tuned} onMoved={() => setMoved(true)} onTuned={() => setTuned(true)} onNext={next} />
      ) : (
        <ChallengeStep primitive={primitive} onDone={onDone} />
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
      <Mechanism />
      <div className="notes">
        {primitive.play?.facts ? (
          <Term word={primitive.name} say={primitive.play.facts.say} points={[primitive.play.facts.note]}>
            {primitive.play.facts.is}
          </Term>
        ) : null}
      </div>
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

function ChallengeStep({ primitive, onDone }: { primitive: Primitive; onDone: () => void }) {
  const game = primitive.game;
  const store = useMemo(() => new GameStore(startValues(primitive)), [primitive]);
  const [phase, setPhaseState] = useState<Phase>("ready");
  // The run's verdict, shown once a run has finished and until anything on the figure changes.
  const [result, setResult] = useState<Verdict>();
  // Once the goal has been met the way on opens, and stays open while the player goes on trying things.
  const [passed, setPassed] = useState(false);
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
    if (run.verdict.pass) setPassed(true);
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
        <button type="button" className="btn" data-next disabled={!passed} onClick={onDone}>
          <PillSurface>Continue</PillSurface>
        </button>
      </Actions>
    </main>
  );
}

/** The figure on the screen itself, no frame, as tall as the screen leaves it. */
function Figure({ primitive, mode, store, task, onLetGo }: { primitive: Primitive; mode: FigureMode; store: GameStore; task?: number; onLetGo?: (at: Values, way: 1 | -1) => void }) {
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
      {height > 0 ? (
        <FigureStage primitive={primitive} mode={mode} palette="library" height={height} controllerRef={store.attach} onCue={buzz} task={task} onLetGo={onLetGo} />
      ) : null}
    </div>
  );
}

/**
 * A slider as the lesson's pink dithered bar. No number on it: the figure shows what it does. Its two end words, when
 * it has them ("Soft", "Stiff"), sit under the bar's ends and stand in for its name.
 */
export function TuneRow({ store, slider }: { store: GameStore; slider: Slider }) {
  const value = useSelect(store, (v) => v[slider.id] ?? slider.initial);
  const span = slider.max - slider.min || 1;
  const fraction = (value - slider.min) / span;
  const word = slider.ends ? slider.ends[fraction < 0.5 ? 0 : 1] : slider.label;
  return (
    <div className="slider strip" data-free data-slider={slider.id} data-ends={slider.ends ? "" : undefined}>
      {/* With end words the bar needs no name: "Soft" and "Stiff" say what it is. It takes the whole width instead. */}
      {slider.ends ? null : <span className="mono">{slider.label}</span>}
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
const PLOT_H = 120;

/** The primitive's law as one line, reshaped live as the sliders move, with the dot where the machine is now. */
export function LawPlot({ store, plot }: { store: GameStore; plot: NonNullable<NonNullable<Primitive["play"]>["plot"]> }) {
  const p = useSelect(store, (v) => {
    const out = plot(v);
    return JSON.stringify(out);
  });
  const { line, dot, zero, caption, gate } = JSON.parse(p) as ReturnType<typeof plot>;
  const x = (u: number) => (u * PLOT_W).toFixed(1);
  const y = (u: number) => ((1 - u) * (PLOT_H - 4) + 2).toFixed(1);
  const d = line.map(([u, w], i) => `${i === 0 ? "M" : "L"}${x(u)} ${y(w)}`).join(" ");
  return (
    <figure className="plot" data-plot>
      <div className="plot-area">
        <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="none" aria-hidden>
          {zero !== undefined ? <line x1="0" x2={PLOT_W} y1={y(zero)} y2={y(zero)} className="plot-zero" /> : null}
          {gate ? (
            <g className="plot-gate" data-met={gate.met ? "" : undefined}>
              <line x1={x(gate.x)} x2={x(gate.x)} y1={y(gate.low)} y2={y(gate.high)} />
              <line x1={Number(x(gate.x)) - 5} x2={Number(x(gate.x)) + 5} y1={y(gate.low)} y2={y(gate.low)} />
              <line x1={Number(x(gate.x)) - 5} x2={Number(x(gate.x)) + 5} y1={y(gate.high)} y2={y(gate.high)} />
            </g>
          ) : null}
          <path d={d} className="plot-line" />
        </svg>
        {gate?.labels ? (
          <>
            <span className="plot-gate-label" style={{ left: `${gate.x * 100}%`, top: `${(((1 - gate.low) * (PLOT_H - 4) + 2) / PLOT_H) * 100}%` }}>
              {gate.labels[0]}
            </span>
            <span className="plot-gate-label" style={{ left: `${gate.x * 100}%`, top: `${(((1 - gate.high) * (PLOT_H - 4) + 2) / PLOT_H) * 100}%` }}>
              {gate.labels[1]}
            </span>
          </>
        ) : null}
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
