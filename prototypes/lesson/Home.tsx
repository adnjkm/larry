import { useEffect, useState } from "react";
import { Dither } from "./dither.tsx";
import type { Lesson } from "./model.ts";
import type { Sample } from "./samples.ts";
import { Actions, Say } from "./ui.tsx";

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
/** A story lesson shows no digits, so its counts are spelled out. */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const spelled = (n: number, one: string) => `${WORDS[n] ?? n} ${n === 1 ? one : `${one}s`}`;
const describe = (lesson: Lesson, s: Sample) =>
  lesson.kind === "workshop"
    ? count(lesson.modules.length, "build")
    : lesson.kind === "story"
      ? spelled(lesson.modules.length, "build").toLowerCase()
      : count(s.kit.parts.length, "part");

export function Home({ samples, lessonOf, onPick }: { samples: readonly Sample[]; lessonOf: (s: Sample) => Lesson; onPick: (s: Sample) => void }) {
  return (
    <main className="page screen" data-stage="home">
      <Say kicker="Larry">Pick something to take apart.</Say>
      <div className="samples">
        {samples.map((s) => (
          <button key={s.id} type="button" className="sample" data-sample={s.id} onClick={() => onPick(s)}>
            <Dither src={s.photo} aspect={1} className="tile" />
            <span>{s.label}</span>
            <span className="mono">{describe(lessonOf(s), s)}</span>
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
    <main className="page screen" data-stage="scan">
      <Say kicker={finished ? sample.kit.name : "Scanning"} found={finished}>
        {finished
          ? lesson.kind === "workshop"
            ? `${count(lesson.modules.length, "thing")} to build and fix.`
            : lesson.kind === "story"
              ? `${spelled(lesson.modules.length, "part")} to build.`
              : "Take it apart and see each job."
          : "Finding its parts…"}
      </Say>
      <div className="scan" data-go={go ? "" : undefined}>
        <Dither src={sample.photo} aspect={1} className="faint" />
        <div className="reveal">
          <Dither src={sample.photo} aspect={1} />
        </div>
        <span className="beam" />
      </div>
      <ul className="parts" aria-label="Parts found">
        {parts.slice(0, shown).map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      <Actions>
        <button type="button" className="btn" data-start disabled={!finished} onClick={onStart}>
          Start
        </button>
      </Actions>
    </main>
  );
}
