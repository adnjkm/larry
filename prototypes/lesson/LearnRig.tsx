// Learn in a story lesson: the primitive from the shared library (src/primitives), drawn by its own figure stage, with
// its slider rows under it. The words, the Why sheet
// and "in this object" are the story's own; the figure, the handle and the sliders are the library's.
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GameStore, useSelect } from "../../src/primitives/game/store.ts";
import { PRIMITIVE_BY_ID } from "../../shared/primitives/catalog.ts";
import { allSliders, type Primitive, type Slider, type Values as PlayValues } from "../../shared/primitives/types.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { playMotion, playTuning, playValues, startValues } from "../../shared/primitives/types.ts";
import { LawPlot, TuneRow } from "../primitives/PrimitiveScreen.tsx";
import { framingParts, type InObject } from "./Learn.tsx";
import { type Rig as RigSpec, type StoryModule, type View, zoneAt } from "./model.ts";
import { initialValues, PRIMITIVES as FIRST_PASS, type Values } from "./primitives/library.ts";
import { Actions, Inset, Need, Say, Strip, TURNS, Viewer, Why } from "./ui.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";
import { StepCard } from "../../src/ui/StepCard.tsx";

/**
 * Primitives Learn still draws from the first-pass copy in ./primitives: the seal's old rig (a ring squeezed between
 * two flanges) was preferred over the library's new one (2026-11-14). It has no drag handle; its slider moves it.
 */
const FIRST_PASS_FIGURE = new Set(["seal"]);

/**
 * The library figure as Learn shows it: no target, no starting challenge and no drag handle, so the figure opens at
 * rest on its sliders' own values and moves only by the control under it (the project owner's call, 2026-11-14).
 */
const learnFigures = new WeakMap<Primitive, Primitive>();
function figureOf(p: Primitive): Primitive {
  const known = learnFigures.get(p);
  if (known) return known;
  const figure = { ...p, game: { ...p.game, scene: undefined, start: undefined } };
  learnFigures.set(p, figure);
  return figure;
}

/** The library's own primitive for a taught one, falling back to what the module holds. */
const libraryOf = (p: { id: string }): Primitive => PRIMITIVE_BY_ID.get(p.id) ?? (p as Primitive);

/** The height the figure has to fill: whatever the one screen leaves it. */
function useHeight() {
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
  return [box, height] as const;
}

/** One slider of a library figure, following the figure's store so a drag of the handle moves it too: a wheel for a turn, else a dithered bar. */
function StoreRow({ store, slider }: { store: GameStore; slider: Slider }) {
  const value = useSelect(store, (v) => v[slider.id] ?? slider.initial);
  return (
    <Strip
      id={slider.id}
      label={slider.label}
      wheel={TURNS.test(slider.label)}
      value={value}
      min={slider.min}
      max={slider.max}
      onChange={(n) => store.controller?.set({ [slider.id]: n })}
    />
  );
}

/** One primitive's figure, then `children`, then the sliders its rig names. Figure and rows share one store. */
function Rig({ primitive, controls, children }: { primitive: Primitive; controls: Readonly<Record<string, string>>; children: ReactNode }) {
  const figure = figureOf(primitive);
  const store = useMemo(() => new GameStore(startValues(figure)), [figure]);
  const [sweeping, setSweeping] = useState(false);
  const [box, height] = useHeight();
  const shown = useMemo(() => primitive.sliders.flatMap((s) => (controls[s.id] ? [{ ...s, label: controls[s.id]! }] : [])), [primitive, controls]);

  useEffect(() => store.subscribe(() => setSweeping(store.controller?.state() === "sweeping")), [store]);

  const toggle = () => {
    const c = store.controller;
    if (!c) return;
    if (c.state() === "sweeping") c.stop();
    else c.sweep();
    setSweeping(c.state() === "sweeping");
  };

  return (
    <>
      <div className="viewer" data-figure={primitive.id} ref={box}>
        {height > 0 ? <FigureStage primitive={figure} mode="game" handle={false} palette="library" height={height} controllerRef={store.attach} /> : null}
        <button type="button" className="play" data-play aria-pressed={sweeping} onClick={toggle}>
          {sweeping ? "Stop" : "Play"}
        </button>
      </div>
      {children}
      <div className="rig-rows" data-rig={primitive.id}>
        {shown.map((s) => (
          <StoreRow key={s.id} store={store} slider={s} />
        ))}
      </div>
    </>
  );
}

/**
 * Where free play stands, for the pills under it: whether it may go on, whether that opens another goal first, and the
 * goal's own button (the valve's Pump, the catch's Pull), which sits beside Next.
 */
type PlayState = { ready: boolean; more: boolean; action?: { label: string; run: () => void } };

/**
 * Free play, for a story with `freePlay`: the library's bare machine worked by a finger on its handle, doing what the
 * real thing does when let go. Once it has been moved, its sliders and the line of its law rise in under it (the same
 * pieces as the primitives bench). Ready once moved and, where it has sliders, one of them tried.
 *
 * A primitive whose free play has goals (`play.tasks`, the spring's weight and green line) plays them as the bench's
 * template lesson does: the first arrives the moment the hand first lets go, having moved it; its words (or a live hint,
 * "Too steep, so it jams.") sit on the pink key over the goal's own sliders; a motor or a button may work the machine
 * meanwhile; and Next reads Continue, locked until the goal is met, until the last goal is met.
 */
function PlayRig({
  primitive,
  onState,
  advance,
  children,
}: {
  primitive: Primitive;
  onState: (s: PlayState) => void;
  advance: { current: (() => boolean) | null };
  children: ReactNode;
}) {
  const store = useMemo(() => new GameStore(playValues(primitive)), [primitive]);
  const motion = playMotion(primitive);
  const tuning = playTuning(primitive);
  const plot = primitive.play?.plot;
  const tasks = primitive.play?.tasks ?? [];
  const [moved, setMoved] = useState(false);
  const [tuned, setTuned] = useState(false);
  const [task, setTask] = useState<number>();
  const current = task === undefined ? undefined : tasks[task];
  const start = useRef(playValues(primitive));

  /** Begins goal `i`; `from` is where the hand let go, so the weight lands on a spring still springing back. */
  const begin = (i: number, from?: number) => {
    const c = store.controller;
    const t = tasks[i];
    if (!c || !t) return;
    setTask(i);
    if (t.start) c.set(t.start);
    if (t.arrive) void c.play(t.arrive(from === undefined ? c.get() : { ...c.get(), [motion.id]: from }));
  };

  useEffect(
    () =>
      store.subscribe(() => {
        const now = store.snapshot();
        if (now[motion.id] !== start.current[motion.id]) setMoved(true);
        if (tuning.some((s) => now[s.id] !== start.current[s.id])) setTuned(true);
      }),
    [store],
  );

  // The first goal begins the moment the hand first lets go of the machine, having moved it, from where it let go.
  const begun = useRef(false);
  const onLetGo = (at: PlayValues) => {
    if (tasks.length === 0 || begun.current || at[motion.id] === start.current[motion.id]) return;
    begun.current = true;
    begin(0, at[motion.id]);
  };

  const met = useSelect(store, (v) => (current ? current.met(v) : false));
  const hint = useSelect(store, (v) => current?.hint?.(v));
  const more = task !== undefined && task < tasks.length - 1;
  const ready = tasks.length > 0 ? met : moved && (tuned || tuning.length === 0);
  const act = current?.action;
  useEffect(() => onState({ ready, more, action: act ? { label: act.label, run: () => store.controller?.set(act.set) } : undefined }), [ready, more, act]);
  // A goal's own sliders, else the play's tuning; laid out for the first goal before it begins, so nothing moves then.
  const ids = tasks.length > 0 ? (current ?? tasks[0]!).sliders : undefined;
  const rows = ids ? ids.map((id) => allSliders(primitive).find((q) => q.id === id)!) : tuning;
  advance.current = () => {
    if (!more || !met) return false;
    begin(task! + 1);
    return true;
  };

  const [box, height] = useHeight();
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => store.subscribe(() => setSweeping(store.controller?.state() === "sweeping")), [store]);
  const toggle = () => {
    const c = store.controller;
    if (!c) return;
    if (c.state() === "sweeping") c.stop();
    else c.sweep();
    setSweeping(c.state() === "sweeping");
  };
  // With goals, the sliders wait for the first one; without, for the first touch.
  const shown = tasks.length > 0 ? current !== undefined : moved;
  return (
    <>
      <div className="viewer" data-figure={primitive.id} data-moved={moved ? "" : undefined} data-task={task} ref={box}>
        {height > 0 ? (
          <FigureStage primitive={primitive} mode="play" palette="library" height={height} controllerRef={store.attach} task={task} onLetGo={onLetGo} />
        ) : null}
        {/* The sweep would fight the goal's weight, so it is free play's alone. */}
        {tasks.length === 0 ? (
          <button type="button" className="play" data-play aria-pressed={sweeping} onClick={toggle}>
            {sweeping ? "Stop" : "Play"}
          </button>
        ) : null}
      </div>
      {children}
      {tasks.length > 0 ? (
        // Laid out from the start with the first goal's words, so the figure keeps its size when it rises in.
        <div className="reveal goal-card" data-shown={current ? "" : undefined} data-met={met ? "" : undefined} aria-hidden={!current}>
          {/* Keyed by what it says, so a new goal, or a hint coming or going, flashes in. */}
          <StepCard key={`${task ?? -1}:${hint ?? ""}`} text={hint ?? (current ?? tasks[0]!).goal} />
        </div>
      ) : null}
      {/* Laid out from the start but hidden, so the figure keeps its size when they rise in. */}
      <div className="tuning rig-rows" data-rig={primitive.id} data-shown={shown ? "" : undefined} inert={!shown}>
        {plot ? <LawPlot store={store} plot={plot} /> : null}
        {rows.map((s) => (
          <TuneRow key={s.id} store={store} slider={s} />
        ))}
      </div>
    </>
  );
}

const SWEEP_SECONDS = 4;

/** A first-pass figure in the lesson's own viewer, with its rig's controls as the same slider rows, and the Play sweep. */
function FirstPassRig({
  id,
  controls,
  goal,
  onMet,
  children,
}: {
  id: string;
  controls: Readonly<Record<string, string>>;
  goal?: RigSpec["goal"];
  onMet?: (met: boolean) => void;
  children: ReactNode;
}) {
  const primitive = FIRST_PASS.find((q) => q.id === id)!;
  const [values, setValues] = useState<Values>(() => (goal ? { ...initialValues(primitive), [goal.slider]: goal.start } : initialValues(primitive)));
  // With a goal, whether the slider sits in the zone that meets the module's requirement.
  const met = goal ? zoneAt(goal.zones, values[goal.slider] ?? goal.start).id === goal.meets : undefined;
  useEffect(() => {
    if (met !== undefined) onMet?.(met);
  }, [met]);
  const [playing, setPlaying] = useState(false);
  const frame = useMemo(() => framingParts(primitive), [primitive]);
  const parts = useMemo(() => primitive.build(values), [primitive, values]);
  const shown = primitive.sliders.filter((s) => controls[s.id]);
  const motion = primitive.sliders[primitive.sliders.length - 1]!;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const phase = 0.5 - 0.5 * Math.cos(((now - start) / 1000 / SWEEP_SECONDS) * 2 * Math.PI);
      setValues((v) => ({ ...v, [motion.id]: motion.min + (motion.max - motion.min) * phase }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, motion]);

  return (
    <>
      <Viewer parts={parts} subject={frame} view={primitive.view}>
        <button type="button" className="play" data-play aria-pressed={playing} onClick={() => setPlaying((x) => !x)}>
          {playing ? "Stop" : "Play"}
        </button>
      </Viewer>
      {children}
      <div className="rig-rows" data-rig={id}>
        {shown.map((s) => (
          <Strip
            key={s.id}
            id={s.id}
            label={controls[s.id]!}
            wheel={TURNS.test(controls[s.id]!)}
            zones={goal?.slider === s.id ? goal.zones : undefined}
            value={values[s.id] ?? s.initial}
            min={s.min}
            max={s.max}
            onChange={(n) => {
              setPlaying(false);
              setValues((v) => ({ ...v, [s.id]: n }));
            }}
          />
        ))}
      </div>
    </>
  );
}

type Props = {
  module: StoryModule;
  kicker: string;
  next: string;
  inObject: (p: StoryModule["teach"][number]) => InObject;
  view?: View;
  /** Learn as free play (Story `freePlay`). */
  freePlay?: boolean;
  onNext: () => void;
};

/** One tab per taught primitive: its library figure with the handle on the part, what it does in this object, and its slider. */
export function LearnRig({ module, kicker, next, inObject, view, freePlay = false, onNext }: Props) {
  const [tab, setTab] = useState(0);
  const taught = module.teach;
  const p = taught[tab]!;
  const rig = module.learn.rigs[p.id]!;
  // LearnRig is keyed per module, so `inObject` answers the same for a primitive for as long as this screen lives.
  const here = useMemo(() => inObject(p), [p]);
  const [met, setMet] = useState(false);
  const [played, setPlayed] = useState<PlayState>({ ready: false, more: false });
  const advance = useRef<(() => boolean) | null>(null);
  const library = libraryOf(p);
  const playing = freePlay && library.play !== undefined;

  const use = (
    <section className="use" data-use={p.id}>
      <Inset parts={here.parts} view={view} />
      <p>
        <b>{p.name}.</b> {here.line}
      </p>
    </section>
  );

  return (
    <main className="page" data-stage="learn">
      {module.need ? (
        <Need text={module.need} met={rig.goal ? met : playing && library.play?.tasks?.length ? played.ready && !played.more : undefined} />
      ) : null}
      <Say
        kicker={kicker}
        why={
          <Why title={p.name}>
            {rig.why.map((line, i) => (
              <p key={line} className={i === 0 ? "sheet-lead" : undefined}>
                {line}
              </p>
            ))}
          </Why>
        }
      >
        {module.learn.say}
      </Say>
      {taught.length > 1 ? (
        <div className="tabs" role="tablist">
          {taught.map((q, i) => (
            <button key={q.id} type="button" role="tab" aria-selected={i === tab} className="tab" data-tab={q.id} onClick={() => setTab(i)}>
              {q.name}
            </button>
          ))}
        </div>
      ) : null}
      {playing ? (
        <PlayRig key={p.id} primitive={library} onState={setPlayed} advance={advance}>
          {use}
        </PlayRig>
      ) : FIRST_PASS_FIGURE.has(p.id) ? (
        <FirstPassRig key={p.id} id={p.id} controls={rig.controls} goal={rig.goal} onMet={setMet}>
          {use}
        </FirstPassRig>
      ) : (
        <Rig key={p.id} primitive={library} controls={rig.controls}>
          {use}
        </Rig>
      )}
      <Actions>
        {playing && played.action ? (
          <button type="button" className="btn" data-action onClick={played.action.run}>
            <PillSurface>{played.action.label}</PillSurface>
          </button>
        ) : null}
        {/* Locked until the requirement is met (where the primitive can be tuned to it), or until free play has been tried. */}
        <button
          type="button"
          className="btn"
          data-next
          disabled={(rig.goal !== undefined && !met) || (playing && !played.ready)}
          onClick={() => (playing && advance.current?.()) || onNext()}
        >
          <PillSurface>{playing && played.more ? "Continue" : next}</PillSurface>
        </button>
      </Actions>
    </main>
  );
}
