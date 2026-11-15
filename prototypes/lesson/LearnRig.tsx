// Learn in a story lesson: the primitive from the shared library (src/primitives), drawn by its own figure stage, with
// its drag handle on the part and its slider rows under it, as on the library's game page. The words, the Why sheet
// and "in this object" are the story's own; the figure, the handle and the sliders are the library's.
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GameStore, useSelect } from "../../src/primitives/game/store.ts";
import { PRIMITIVE_BY_ID } from "../../shared/primitives/catalog.ts";
import type { Primitive, Slider } from "../../shared/primitives/library.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { startValues } from "../../shared/primitives/types.ts";
import { framingParts, type InObject } from "./Learn.tsx";
import type { StoryModule, View } from "./model.ts";
import { initialValues, PRIMITIVES as FIRST_PASS, type Values } from "./primitives/library.ts";
import { Actions, Inset, Say, Strip, TURNS, Viewer, Why } from "./ui.tsx";

/**
 * Primitives Learn still draws from the first-pass copy in ./primitives: the seal's old rig (a ring squeezed between
 * two flanges) was preferred over the library's new one (2026-11-14). It has no drag handle; its slider moves it.
 */
const FIRST_PASS_FIGURE = new Set(["seal"]);

/**
 * The library figure as Learn shows it: the game's handle stays, but not its target or its starting challenge, so the
 * figure opens at rest on its sliders' own values and nothing on it asks for a goal Learn does not set.
 */
const learnFigures = new WeakMap<Primitive, Primitive>();
function figureOf(p: Primitive): Primitive {
  const known = learnFigures.get(p);
  if (known) return known;
  const figure = p.game ? { ...p, game: { ...p.game, scene: undefined, start: undefined } } : p;
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
  return <Strip id={slider.id} label={slider.label} wheel={TURNS.test(slider.label)} value={value} min={slider.min} max={slider.max} onChange={(n) => store.controller?.set({ [slider.id]: n })} />;
}

/** One primitive's figure, then `children`, then the sliders its rig names. Figure and rows share one store, so the handle and the rows move together. */
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
        {height > 0 ? <FigureStage primitive={figure} mode="game" palette="library" height={height} controllerRef={store.attach} /> : null}
        <button type="button" className="play" data-play aria-pressed={sweeping} onClick={toggle}>{sweeping ? "Stop" : "Play"}</button>
      </div>
      {children}
      <div className="rig-rows" data-rig={primitive.id}>
        {shown.map((s) => <StoreRow key={s.id} store={store} slider={s} />)}
      </div>
    </>
  );
}

const SWEEP_SECONDS = 4;

/** A first-pass figure in the lesson's own viewer, with its rig's controls as the same slider rows, and the Play sweep. */
function FirstPassRig({ id, controls, children }: { id: string; controls: Readonly<Record<string, string>>; children: ReactNode }) {
  const primitive = FIRST_PASS.find((q) => q.id === id)!;
  const [values, setValues] = useState<Values>(() => initialValues(primitive));
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
        <button type="button" className="play" data-play aria-pressed={playing} onClick={() => setPlaying((x) => !x)}>{playing ? "Stop" : "Play"}</button>
      </Viewer>
      {children}
      <div className="rig-rows" data-rig={id}>
        {shown.map((s) => (
          <Strip key={s.id} id={s.id} label={controls[s.id]!} wheel={TURNS.test(controls[s.id]!)} value={values[s.id] ?? s.initial} min={s.min} max={s.max} onChange={(n) => { setPlaying(false); setValues((v) => ({ ...v, [s.id]: n })); }} />
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
  onNext: () => void;
};

/** One tab per taught primitive: its library figure with the handle on the part, what it does in this object, and its slider. */
export function LearnRig({ module, kicker, next, inObject, view, onNext }: Props) {
  const [tab, setTab] = useState(0);
  const taught = module.teach;
  const p = taught[tab]!;
  const rig = module.learn.rigs[p.id]!;
  // LearnRig is keyed per module, so `inObject` answers the same for a primitive for as long as this screen lives.
  const here = useMemo(() => inObject(p), [p]);

  const use = (
    <section className="use" data-use={p.id}>
      <Inset parts={here.parts} view={view} />
      <p><b>{p.name}.</b> {here.line}</p>
    </section>
  );

  return (
    <main className="page" data-stage="learn">
      <Say
        kicker={kicker}
        why={
          <Why title={p.name}>
            {rig.why.map((line, i) => <p key={line} className={i === 0 ? "sheet-lead" : undefined}>{line}</p>)}
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
      {FIRST_PASS_FIGURE.has(p.id) ? (
        <FirstPassRig key={p.id} id={p.id} controls={rig.controls}>{use}</FirstPassRig>
      ) : (
        <Rig key={p.id} primitive={libraryOf(p)} controls={rig.controls}>{use}</Rig>
      )}
      <Actions>
        <button type="button" className="btn" data-next onClick={onNext}>{next}</button>
      </Actions>
    </main>
  );
}
