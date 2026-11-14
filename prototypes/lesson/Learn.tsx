import { useEffect, useMemo, useState } from "react";
import { framingParts, initialValues, PRIMITIVES, type Primitive, type Values } from "../../src/primitives/library.ts";
import type { Module } from "./model.ts";
import { Header, SliderRow, Viewer } from "./ui.tsx";

const SWEEP_SECONDS = 4;

function primitiveById(id: string): Primitive {
  const p = PRIMITIVES.find((q) => q.id === id);
  if (!p) throw new Error(`no primitive ${id}`);
  return p;
}

/** The module's primitive, preceded by the elements it is made of, so the pieces come before the whole. */
export function lessonPrimitives(module: Module): Primitive[] {
  const main = primitiveById(module.primitives[module.primitives.length - 1]!);
  return [...main.madeOf.map(primitiveById), main];
}

export function Learn({ module, index, onNext }: { module: Module; index: number; onNext: () => void }) {
  const list = useMemo(() => lessonPrimitives(module), [module]);
  const [tab, setTab] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set([0]));
  const [values, setValues] = useState<Record<string, Values>>(() => Object.fromEntries(list.map((p) => [p.id, initialValues(p)])));
  const [playing, setPlaying] = useState(false);
  const p = list[tab]!;
  const v = values[p.id]!;
  const frame = useMemo(() => framingParts(p), [p]);
  const parts = useMemo(() => p.build(v), [p, v]);
  const motion = p.sliders[p.sliders.length - 1]!;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const phase = 0.5 - 0.5 * Math.cos(((now - start) / 1000 / SWEEP_SECONDS) * 2 * Math.PI);
      setValues((all) => ({ ...all, [p.id]: { ...all[p.id]!, [motion.id]: motion.min + (motion.max - motion.min) * phase } }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, p, motion]);

  const open = (i: number) => {
    setTab(i);
    setPlaying(false);
    setSeen((s) => new Set(s).add(i));
  };

  return (
    <main className="page" data-stage="learn">
      <Header kicker={`Module ${index + 1} · Learn`} title={module.need} />
      <p className="hint">First the parts it is made of, then the whole. Play with each one.</p>
      {list.length > 1 ? (
        <div className="tabs" role="tablist">
          {list.map((q, i) => (
            <button key={q.id} type="button" role="tab" aria-selected={i === tab} className="tab" data-seen={seen.has(i) ? "" : undefined} data-tab={q.id} onClick={() => open(i)}>
              {q.name}
              <b>{q.level}</b>
            </button>
          ))}
        </div>
      ) : null}
      <Viewer name={p.name} parts={parts} frame={frame} view={p.view} height={340} />
      <div className="sliders">
        {p.sliders.map((s) => (
          <SliderRow
            key={s.id}
            slider={s}
            value={v[s.id] ?? s.initial}
            onChange={(n) => {
              setPlaying(false);
              setValues((all) => ({ ...all, [p.id]: { ...all[p.id]!, [s.id]: n } }));
            }}
          />
        ))}
        <button type="button" className="btn secondary" onClick={() => setPlaying((x) => !x)}>
          {playing ? "Stop" : `Play ${motion.label.toLowerCase()}`}
        </button>
      </div>
      <div className="log">
        {p.readouts(v).map((r) => (
          <div key={r.label} className="log-row">
            <span>{r.label}</span>
            <span>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <span className="mono">{p.job}</span>
        <p>{p.howItWorks}</p>
        <div className="chips">
          {p.madeOf.length > 0 ? <span className="chip"><b>Made of</b>{p.madeOf.map((id) => primitiveById(id).name).join(" + ")}</span> : null}
          <span className="chip"><b>Seen in</b>{p.seenIn.join(", ")}</span>
        </div>
      </div>
      <button type="button" className="btn" data-next onClick={onNext}>Next: build the part</button>
    </main>
  );
}
