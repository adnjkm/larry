import { useEffect, useState } from "react";
import { Dither } from "./dither.tsx";
import type { Lesson } from "./model.ts";
import type { Sample } from "./samples.ts";

const describe = (lesson: Lesson) =>
  lesson.kind === "workshop" ? `Lesson · ${lesson.modules.length} ${lesson.modules.length === 1 ? "module" : "modules"}` : "Inspect";

export function Home({ samples, lessonOf, onPick }: { samples: readonly Sample[]; lessonOf: (s: Sample) => Lesson; onPick: (s: Sample) => void }) {
  return (
    <main className="page" data-stage="home">
      <div className="head">
        <span className="mono">Larry · sample photos</span>
        <h1 className="need">Photograph something.</h1>
        <p className="hint">Pick a sample photo. Each already has its kit, so this runs without the network.</p>
      </div>
      <div className="samples">
        {samples.map((s) => (
          <button key={s.id} type="button" className="sample" data-sample={s.id} onClick={() => onPick(s)}>
            <Dither src={s.photo} aspect={1} className="tile" />
            <span>{s.label}</span>
            <span className="mono">{describe(lessonOf(s))}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

const SWEEP_MS = 1400;
const PART_GAP_MS = 320;

/** The photo dithered and swept by a beam while the kit's parts stream in, then what lesson it gets. */
export function Scan({ sample, lesson, onStart }: { sample: Sample; lesson: Lesson; onStart: () => void }) {
  const [go, setGo] = useState(false);
  const [shown, setShown] = useState(0);
  const parts = sample.kit.parts;
  const finished = shown === parts.length;

  useEffect(() => {
    const timers = [setTimeout(() => setGo(true), 120)];
    parts.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), SWEEP_MS + 100 + i * PART_GAP_MS)));
    return () => timers.forEach(clearTimeout);
  }, [parts]);

  return (
    <main className="page" data-stage="scan">
      <div className="head">
        <span className="mono">{finished ? "Done" : "Larry is taking it apart…"}</span>
        <h1 className="need">{shown > 0 ? sample.kit.name : "Scanning"}</h1>
      </div>
      <div className="scan" data-go={go ? "" : undefined}>
        <Dither src={sample.photo} className="faint" />
        <div className="reveal"><Dither src={sample.photo} /></div>
        <span className="beam" />
      </div>
      <ul className="parts">
        {parts.slice(0, shown).map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{p.joint ?? "main part"}</span>
          </li>
        ))}
      </ul>
      {finished ? (
        <>
          <p className="hint">
            {lesson.kind === "workshop"
              ? `There is a lesson for this: ${lesson.modules.length} requirements to build, break and fix, then piece it together.`
              : `There is no hand-written lesson for a ${sample.kit.name.toLowerCase()} yet. You can take it apart and learn what each part does, but there are no faults to fix.`}
          </p>
          <button type="button" className="btn" data-start onClick={onStart}>Start</button>
        </>
      ) : null}
    </main>
  );
}
