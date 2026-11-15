// Learn in a story lesson: the primitive from the shared library (src/primitives), drawn by its own figure stage, with
// its drag handle on the part and its slider rows under it, as on the library's game page. The words, the Why sheet
// and "in this object" are the story's own; the figure, the handle and the sliders are the library's.
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Rows, SliderRow } from "../../src/primitives/game/parts.tsx";
import { GameStore } from "../../src/primitives/game/store.ts";
import { PRIMITIVE_BY_ID } from "../../src/primitives/catalog.ts";
import type { Primitive } from "../../src/primitives/library.ts";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { startValues } from "../../src/primitives/stage/view.ts";
import type { InObject } from "./Learn.tsx";
import type { StoryModule, View } from "./model.ts";
import { Actions, Inset, Say, Why } from "./ui.tsx";

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

/** One primitive's figure, then `children`, then the sliders its rig names. Figure and rows share one store, so the handle and the rows move together. */
function Rig({ primitive, controls, children }: { primitive: Primitive; controls: Readonly<Record<string, string>>; children: ReactNode }) {
  const figure = figureOf(primitive);
  const store = useMemo(() => new GameStore(startValues(figure, "game")), [figure]);
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
        <Rows>
          {shown.map((s) => <SliderRow key={s.id} store={store} slider={s} ink />)}
        </Rows>
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
      <Rig key={p.id} primitive={libraryOf(p)} controls={rig.controls}>
        <section className="use" data-use={p.id}>
          <Inset parts={here.parts} view={view} />
          <p><b>{p.name}.</b> {here.line}</p>
        </section>
      </Rig>
      <Actions>
        <button type="button" className="btn" data-next onClick={onNext}>{next}</button>
      </Actions>
    </main>
  );
}
