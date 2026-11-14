import { type ReactNode, useEffect, useMemo, useState } from "react";
import { framingParts, initialValues, type Primitive, type Readout, type Values } from "../../src/primitives/library.ts";
import { primitiveById } from "./model.ts";
import { Header, SliderRow, Viewer } from "./ui.tsx";

const SWEEP_SECONDS = 4;

/**
 * The object's own numbers for one primitive's slider, shown under that primitive while it is moved, so
 * Learn and the fix card never give two answers to one question. `generic` keeps the primitive's own
 * readouts beside them; it is false when numbers fixed in the primitive (the lever's 100 N load) would
 * contradict the object's.
 */
export type Own = { primitive: string; slider: string; object: string; numbers: (value: number) => readonly Readout[]; generic: boolean };

type Props = { list: readonly Primitive[]; kicker: string; title: string; hint: string; next: string; own?: Own; children?: ReactNode; onNext: () => void };

/** One tab per primitive, each a live figure with its sliders, so the user plays with every piece before using it. */
export function Learn({ list, kicker, title, hint, next, own, children, onNext }: Props) {
  const [tab, setTab] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(new Set([0]));
  const [values, setValues] = useState<Record<string, Values>>(() => Object.fromEntries(list.map((p) => [p.id, initialValues(p)])));
  const [playing, setPlaying] = useState(false);
  const p = list[tab]!;
  const v = values[p.id]!;
  const frame = useMemo(() => framingParts(p), [p]);
  const parts = useMemo(() => p.build(v), [p, v]);
  const motion = p.sliders[p.sliders.length - 1]!;
  const mine = own?.primitive === p.id ? own : undefined;

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
      <Header kicker={kicker} title={title} />
      <p className="hint">{hint}</p>
      {children}
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
      <Viewer name={p.name} parts={parts} subject={frame} view={p.view} height={340} />
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
      {mine ? (
        <div className="log" data-own>
          <div className="readouts">
            <span className="mono">In the {mine.object}</span>
            {mine.numbers(v[mine.slider] ?? 0).map((r) => (
              <div key={r.label} className="readout" data-number>
                <span>{r.label}</span>
                <span>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {mine && !mine.generic ? null : (
        <div className="log" data-generic>
          {mine ? <span className="mono">This {p.name.toLowerCase()}</span> : null}
          {p.readouts(v).map((r) => (
            <div key={r.label} className="log-row">
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <span className="mono">{p.job}</span>
        <p>{p.howItWorks}</p>
        <div className="chips">
          {p.madeOf.length > 0 ? <span className="chip"><b>Made of</b>{p.madeOf.map((id) => primitiveById(id).name).join(" + ")}</span> : null}
          <span className="chip"><b>Seen in</b>{p.seenIn.join(", ")}</span>
        </div>
      </div>
      <button type="button" className="btn" data-next onClick={onNext}>{next}</button>
    </main>
  );
}
