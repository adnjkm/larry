import { useEffect, useMemo, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { initialValues, type Primitive, type Readout, type Values } from "./primitives/library.ts";
import type { Built, Builds, View } from "./model.ts";
import { drawObject, enclosed, restCentre } from "./pose.ts";
import { Actions, Inset, Say, SliderRow, Strip, Viewer, Why } from "./ui.tsx";

/** Parts at every combination of slider extremes. The camera fits these once, so it holds still while a slider moves the parts. */
export function framingParts(p: Primitive): Part[] {
  const combos = p.sliders.reduce<Values[]>((acc, s) => acc.flatMap((v) => [{ ...v, [s.id]: s.min }, { ...v, [s.id]: s.max }]), [{}]);
  return combos.flatMap((v, i) => p.build(v).map((part) => ({ ...part, id: `${part.id}~${i}` })));
}

const SWEEP_SECONDS = 4;

/**
 * The object's own numbers for one primitive's slider, shown in the Why sheet while it is moved, so
 * Learn and the fix never give two answers to one question. `generic` keeps the primitive's own
 * readouts beside them; it is false when numbers fixed in the primitive (the lever's 100 N load) would
 * contradict the object's.
 */
export type Own = { primitive: string; slider: string; object: string; numbers: (value: number) => readonly Readout[]; generic: boolean };

/** What a primitive does in this object, in one sentence, and the object drawn with those parts pink. */
export type InObject = { line: string; parts: Part[] };

/** The whole object at rest with this module's parts pink, opened up when they sit inside another part. */
export function objectFor(lesson: Builds, kit: Kit, m: Built & { uses: Readonly<Record<string, string>> }, p: Primitive): InObject {
  const present = kit.parts.map((q) => q.id);
  const scene = lesson.rest({ kit, present });
  const draw = (explode: number) => drawObject({ kit, present, scene, explode, plan: lesson.explode, pink: new Set(m.produces), centre: restCentre(kit, present, scene), apart: lesson.apart });
  const shut = draw(0);
  return { line: m.uses[p.id]!, parts: m.produces.some((id) => enclosed(id, shut)) ? draw(0.6) : shut };
}

/** Learn in words only: the instruction, and per primitive why it matters, in place of its numbers. Its sliders become grips with no values. */
export type Words = { say: string; why: (p: Primitive) => readonly string[] };

type Props = {
  list: readonly Primitive[];
  words?: Words;
  kicker: string;
  next: string;
  own?: Own;
  inObject: (p: Primitive) => InObject;
  view?: View;
  onNext: () => void;
};

/** One tab per primitive, each a live figure with its sliders, beside a small drawing of where it sits in the object. */
export function Learn({ list, words, kicker, next, own, inObject, view, onNext }: Props) {
  const [tab, setTab] = useState(0);
  const [values, setValues] = useState<Record<string, Values>>(() => Object.fromEntries(list.map((p) => [p.id, initialValues(p)])));
  const [playing, setPlaying] = useState(false);
  const p = list[tab]!;
  const v = values[p.id]!;
  const frame = useMemo(() => framingParts(p), [p]);
  const parts = useMemo(() => p.build(v), [p, v]);
  // Learn is keyed per module, so `inObject` answers the same for a primitive for as long as this screen lives.
  const here = useMemo(() => inObject(p), [p]);
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

  return (
    <main className="page" data-stage="learn">
      <Say
        kicker={kicker}
        why={
          words ? (
            <Why title={p.name}>
              {words.why(p).map((line, i) => <p key={line} className={i === 0 ? "sheet-lead" : undefined}>{line}</p>)}
            </Why>
          ) : (
          <Why title={p.name}>
            <p className="sheet-lead">{p.job}</p>
            <p>{p.howItWorks}</p>
            {mine ? (
              <div className="readouts" data-own>
                <span className="mono">In the {mine.object}</span>
                {mine.numbers(v[mine.slider] ?? 0).map((r) => (
                  <div key={r.label} className="readout" data-number>
                    <span>{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {mine && !mine.generic ? null : (
              <div className="readouts" data-generic>
                <span className="mono">This {p.name.toLowerCase()}</span>
                {p.readouts(v).map((r) => (
                  <div key={r.label} className="readout">
                    <span>{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </Why>
          )
        }
      >
        {words ? words.say : "Slide to see how it works."}
      </Say>
      {list.length > 1 ? (
        <div className="tabs" role="tablist">
          {list.map((q, i) => (
            <button key={q.id} type="button" role="tab" aria-selected={i === tab} className="tab" data-tab={q.id} onClick={() => { setTab(i); setPlaying(false); }}>
              {q.name}
            </button>
          ))}
        </div>
      ) : null}
      <Viewer parts={parts} subject={frame} view={p.view}>
        <button type="button" className="play" data-play aria-pressed={playing} onClick={() => setPlaying((x) => !x)}>{playing ? "Stop" : "Play"}</button>
      </Viewer>
      <section className="use" data-use={p.id}>
        <Inset parts={here.parts} view={view} />
        <p><b>{p.name}.</b> {here.line}</p>
      </section>
      <div className="sliders">
        {p.sliders.map((s) => {
          const change = (n: number) => {
            setPlaying(false);
            setValues((all) => ({ ...all, [p.id]: { ...all[p.id]!, [s.id]: n } }));
          };
          const value = v[s.id] ?? s.initial;
          return words
            ? <Strip key={s.id} id={s.id} label={s.label} value={value} min={s.min} max={s.max} onChange={change} />
            : <SliderRow key={s.id} slider={s} value={value} onChange={change} />;
        })}
      </div>
      <Actions>
        <button type="button" className="btn" data-next onClick={onNext}>{next}</button>
      </Actions>
    </main>
  );
}
