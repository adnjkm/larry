// A mechanism lesson, played: see course.ts for the shape. One screen at a time, in order; the header has a key per
// mechanism, and the bubble under it names the one in hand.
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { PRIMITIVES } from "../../shared/primitives/library.ts";
import { type Course, FORMAT, type Screen } from "./course.ts";
import { bindStory, familyOf, presentAfter, type Story, type Test, type Values, type Verdict } from "./model.ts";
import { Place } from "./Place.tsx";
import { Rig } from "./Rig.tsx";
import { Actions, Plain, Say, Shell, type Step } from "./ui.tsx";
import { Mechanism, PrimitiveScreen } from "../primitives/PrimitiveScreen.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";
import { CAMERA } from "../../src/camera/look.ts";
import { rrect } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";

const primitive = (id: string) => {
  const found = PRIMITIVES.find((p) => p.id === id);
  if (!found) throw new Error(`no primitive ${id}`);
  return found;
};

type Bench = { story: Story; kit: Kit };
type Of<K extends Screen["kind"]> = Extract<Screen, { kind: K }>;

/** True while the lesson is drawn but not yet on show (the demo keeps it ready under the result screen). */
const Waiting = createContext(false);

export function CourseFlow({
  course,
  kit: scanned,
  photo,
  onHome,
  onRestart,
  waiting = false,
}: {
  course: Course;
  kit: Kit;
  photo: string;
  onHome: () => void;
  onRestart: () => void;
  /** Drawn but not yet shown: nothing plays and no key steps it, so it begins when it arrives. */
  waiting?: boolean;
}) {
  const { story, kit } = useMemo(() => bindStory(course.story, scanned), [course, scanned]);
  const screens = useMemo(() => course.mechanisms.flatMap((m, mechanism) => m.screens.map((screen) => ({ screen, mechanism }))), [course]);
  const [at, setAt] = useState(0);
  const [reached, setReached] = useState(0);
  const [values, setValues] = useState<Values>({});

  const go = (i: number) => {
    const next = screens[i];
    if (!next) return;
    const set = "set" in next.screen ? next.screen.set : undefined;
    if (set) setValues((v) => ({ ...v, ...set }));
    setAt(i);
    setReached((r) => Math.max(r, i));
  };
  const back = () => (at === 0 ? onHome() : go(at - 1));
  const next = () => go(at + 1);

  // "]" and "[" step through the screens without doing them, for rehearsing a demo. The arrow keys belong to the sliders.
  const skip = useRef<(by: number) => void>(undefined);
  skip.current = (by) => !waiting && go(Math.min(screens.length - 1, Math.max(0, at + by)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]") skip.current?.(1);
      else if (e.key === "[") skip.current?.(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { screen, mechanism } = screens[at]!;
  const firstOf = (m: number) => screens.findIndex((s) => s.mechanism === m);
  const steps: Step[] = course.mechanisms.map((m, i) => ({
    key: m.id,
    title: m.name,
    state: i < mechanism ? "done" : i === mechanism ? "now" : "todo",
    enabled: firstOf(i) <= reached,
    go: () => go(firstOf(i)),
  }));
  const name = course.mechanisms[mechanism]!.name;
  // Everything learned so far, in the order it was met: what a "Who does this?" picks from.
  const learned = [...new Set(screens.slice(0, at).flatMap((s) => (s.screen.kind === "primitive" ? [s.screen.id] : [])))];
  const bench = { story, kit };

  let body: ReactNode;
  if (screen.kind === "primitive")
    return (
      <Plain.Provider value>
        <PrimitiveScreen key={at} primitive={primitive(screen.id)} onBack={back} onDone={next} mechanism={{ name, key: mechanism }} steps={steps} />
      </Plain.Provider>
    );
  if (screen.kind === "place")
    body = <Place key={at} story={story} kit={kit} index={screen.module} next="Continue" onNext={next} header={<Mechanism name={name} step={mechanism} />} />;
  else {
    const page = { name, step: mechanism, onNext: next };
    if (screen.kind === "demo") body = <Demo key={at} {...bench} {...page} screen={screen} />;
    else if (screen.kind === "gap") body = <Gap key={at} {...bench} {...page} screen={screen} />;
    else if (screen.kind === "who") body = <Who key={at} {...bench} {...page} screen={screen} options={learned} jobs={course.jobs} />;
    else if (screen.kind === "much") body = <Much key={at} {...bench} {...page} screen={screen} values={values} onValues={setValues} />;
    else if (screen.kind === "broke") body = <Broke key={at} {...bench} {...page} screen={screen} values={values} onValues={setValues} jobs={course.jobs} />;
    else if (screen.kind === "break") body = <Break key={at} {...bench} {...page} screen={screen} values={values} onValues={setValues} />;
    else body = <Final key={at} {...bench} {...page} screen={screen} values={values} onValues={setValues} onNext={onRestart} />;
  }

  return (
    <Plain.Provider value>
      <Waiting.Provider value={waiting}>
        <Shell objectName={story.objectName} photo={photo} steps={steps} onHome={back}>
          {body}
        </Shell>
      </Waiting.Provider>
    </Plain.Provider>
  );
}

type PageProps = { name: string; step: number; onNext: () => void };
const NONE: readonly string[] = [];
const NO_VALUES: Values = {};
const NO_TESTS: readonly Test[] = [];

/** One question's screen: the mechanism, the format and the question, whatever the question shows, the line that answers back, and the way on. */
function Page({
  kind,
  name,
  step,
  say,
  note,
  done,
  line,
  bad,
  next = "Continue",
  onNext,
  children,
}: PageProps & { kind: keyof typeof FORMAT | "demo"; say: string; note?: boolean; done: boolean; line?: string; bad?: boolean; next?: string; children: ReactNode }) {
  return (
    <main className="page step-in" data-step={kind} data-done={done ? "" : undefined}>
      {/* A demo asks nothing: its line is what the mechanism is, so the bubble that names the mechanism holds it. */}
      {kind === "demo" ? (
        <Mechanism name={name} step={step} about={say} />
      ) : (
        <>
          <Mechanism name={name} step={step} />
          <div className="question">
            <span className="mono">{FORMAT[kind]}</span>
            <Say kicker={FORMAT[kind]} note={note}>
              {say}
            </Say>
          </div>
        </>
      )}
      {children}
      {kind === "demo" ? null : (
        <p className="result answer" data-bad={bad ? "" : undefined} data-found={done ? "" : undefined} aria-live="polite">
          {line}
        </p>
      )}
      <Actions>
        <button type="button" className="btn" data-next disabled={!done} onClick={onNext}>
          <PillSurface>{next}</PillSurface>
        </button>
      </Actions>
    </main>
  );
}

/** The parts on the bench once story module `after` is built, and the ones it added, which are drawn pink. */
function useParts(story: Story, kit: Kit, after: number, adds: readonly string[] = NONE, hide: readonly string[] = NONE) {
  return useMemo(() => {
    const hidden = new Set(hide.flatMap((id) => familyOf(kit, id)));
    return { present: [...presentAfter(story, kit, after), ...adds].filter((id) => !hidden.has(id)), pink: after < 0 ? [] : story.modules[after]!.produces };
  }, [story, kit, after, adds, hide]);
}

/** The mechanism working, over and over, before any of it is built: the thing to aim for. */
function Demo({ story, kit, screen, ...page }: Bench & PageProps & { screen: Of<"demo"> }) {
  const { present, pink } = useParts(story, kit, screen.after);
  const loop = useMemo(() => ({ test: screen.run, values: screen.values }), [screen]);
  // A screen's own pink list names parts as the lesson does; the kit may hold each as several pieces.
  const coloured = useMemo(() => screen.pink?.flatMap((id) => familyOf(kit, id)) ?? pink, [screen, kit, pink]);
  const waiting = useContext(Waiting);
  return (
    <Page kind="demo" {...page} say={screen.does} done next="Start Building">
      <Needs lines={screen.needs} />
      <Rig story={story} kit={kit} present={present} pink={coloured} frame={screen.frame} values={screen.values} tests={NO_TESTS} loop={waiting ? undefined : loop} />
    </Page>
  );
}

const NEEDS_RADIUS = 16;

/** What the mechanism has to do, one line each, on a raised pink card between the bubble that names it and its demo: the jobs the lesson then builds. */
function Needs({ lines }: { lines: readonly string[] }) {
  const box = useRef<HTMLUListElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const [w, h] = [Math.round(el.offsetWidth), Math.round(el.offsetHeight)];
      setSize((s) => (s && s.w === w && s.h === h ? s : w > 0 && h > 0 ? { w, h } : null));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <ul ref={box} className="needs">
      {size ? (
        <Surface shape={rrect(size.w, size.h, NEEDS_RADIUS)} relief="keycap" material="pink" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
      ) : null}
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function Gap({ story, kit, screen, ...page }: Bench & PageProps & { screen: Of<"gap"> }) {
  // The build so far, as the next mechanism's own failure shows it.
  const { present } = useParts(story, kit, screen.after, story.modules[screen.after + 1]?.without.adds);
  const [seen, setSeen] = useState(false);
  return (
    <Page kind="gap" {...page} say={screen.try} done={seen} line={seen ? screen.fails : undefined}>
      <Rig story={story} kit={kit} present={present} pink={NONE} frame={screen.frame} values={screen.values} tests={[screen.test]} onResult={() => setSeen(true)} />
    </Page>
  );
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The primitives to pick from, as keys: a wrong one is marked and stays wrong, the right one ends the picking. */
function Choices({ options, answer, picked, onPick }: { options: readonly string[]; answer: string; picked: readonly string[]; onPick: (id: string) => void }) {
  const solved = picked.includes(answer);
  return (
    <div className="tests choices" data-choices>
      {options.map((id) => (
        <button
          key={id}
          type="button"
          className="test"
          data-choice={id}
          data-status={picked.includes(id) ? (id === answer ? "pass" : "fail") : "idle"}
          disabled={solved || picked.includes(id)}
          onClick={() => onPick(id)}
        >
          <PillSurface>{primitive(id).name}</PillSurface>
        </button>
      ))}
    </div>
  );
}

function usePick(answer: string, jobs: Course["jobs"]) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const last = picked[picked.length - 1];
  const solved = picked.includes(answer);
  const wrong = last !== undefined && last !== answer ? `Not the ${lower(primitive(last).name)}. It ${jobs[last] ?? "does another job"}.` : undefined;
  return { picked, solved, wrong, pick: (id: string) => setPicked((p) => [...p, id]) };
}

function Who({ story, kit, screen, options, jobs, ...page }: Bench & PageProps & { screen: Of<"who">; options: readonly string[]; jobs: Course["jobs"] }) {
  const { present } = useParts(story, kit, screen.after);
  const { picked, solved, wrong, pick } = usePick(screen.answer, jobs);
  return (
    <Page kind="who" {...page} say={`${screen.does}.`} done={solved} line={solved ? screen.why : wrong} bad={!solved}>
      <Rig story={story} kit={kit} present={present} pink={NONE} frame={screen.frame} values={NO_VALUES} tests={NO_TESTS} />
      <Choices options={options} answer={screen.answer} picked={picked} onPick={pick} />
    </Page>
  );
}

type Tuned = { values: Values; onValues: (next: Values) => void };

function Much({ story, kit, screen, values, onValues, ...page }: Bench & PageProps & Tuned & { screen: Of<"much"> }) {
  const { present, pink } = useParts(story, kit, screen.after);
  const [last, setLast] = useState<Verdict>();
  const [done, setDone] = useState(false);
  return (
    <Page kind="much" {...page} say={`${screen.does}.`} done={done} line={done ? screen.need : last?.line} bad={!done}>
      <Rig
        story={story}
        kit={kit}
        present={present}
        pink={pink}
        frame={screen.frame}
        controls={[screen.control]}
        values={values}
        onValues={(v) => {
          setLast(undefined);
          onValues(v);
        }}
        tests={screen.tests}
        locked={done}
        onResult={(_, verdict, all) => {
          setLast(verdict);
          if (screen.tests.every((t) => all[t.id]?.pass)) setDone(true);
        }}
      />
    </Page>
  );
}

function Broke({ story, kit, screen, values, onValues, jobs, ...page }: Bench & PageProps & Tuned & { screen: Of<"broke">; jobs: Course["jobs"] }) {
  const { present, pink } = useParts(story, kit, screen.after, NONE, screen.hide);
  const { picked, solved, wrong, pick } = usePick(screen.answer, jobs);
  const [watched, setWatched] = useState<Verdict>();
  const [last, setLast] = useState<Verdict>();
  const [fixed, setFixed] = useState(false);
  const faulty = useMemo(() => ({ ...values, ...screen.fault }), [screen]);
  const behaviour = useMemo(() => [screen.behaviour], [screen]);
  // First the behaviour and the pick; then the same bench with the faulty part's control, to put it right.
  if (!solved)
    return (
      <Page kind="broke" {...page} say="Watch it. Which part is at fault?" done={false} line={wrong ?? watched?.line} bad>
        <Rig story={story} kit={kit} present={present} pink={pink} frame={screen.frame} values={faulty} tests={behaviour} opening={screen.behaviour} onResult={(_, v) => setWatched(v)} />
        <Choices options={screen.options} answer={screen.answer} picked={picked} onPick={pick} />
      </Page>
    );
  return (
    <Page kind="broke" {...page} say={`The ${lower(primitive(screen.answer).name)}. Now fix it.`} note done={fixed} line={last?.line ?? screen.found} bad={last !== undefined && !fixed}>
      <Rig
        story={story}
        kit={kit}
        present={present}
        pink={pink}
        frame={screen.frame}
        controls={[screen.control]}
        values={values}
        onValues={(v) => {
          setLast(undefined);
          onValues(v);
        }}
        tests={screen.tests}
        locked={fixed}
        onResult={(_, verdict, all) => {
          setLast(verdict);
          if (screen.tests.every((t) => all[t.id]?.pass)) setFixed(true);
        }}
      />
    </Page>
  );
}

function Break({ story, kit, screen, values, onValues, ...page }: Bench & PageProps & Tuned & { screen: Of<"break"> }) {
  const { present, pink } = useParts(story, kit, screen.after);
  const [last, setLast] = useState<Verdict>();
  const done = last?.kind === screen.outcome;
  const line = last === undefined ? "Change one thing, then try it." : done ? last.line : last.pass ? "Still working. Change something." : `${last.line} Not the failure asked for.`;
  return (
    <Page kind="break" {...page} say={`${screen.failure}.`} done={done} line={line} bad={last !== undefined && !done}>
      <Rig
        story={story}
        kit={kit}
        present={present}
        pink={pink}
        frame={screen.frame}
        controls={screen.controls}
        values={values}
        onValues={(v) => {
          setLast(undefined);
          onValues(v);
        }}
        tests={[screen.test]}
        locked={done}
        onResult={(_, verdict) => setLast(verdict)}
      />
    </Page>
  );
}

/** The whole object with its last control in hand: every test has to pass. */
function Final({ story, kit, screen, values, onValues, ...page }: Bench & PageProps & Tuned & { screen: Of<"final"> }) {
  const { present } = useParts(story, kit, screen.after);
  const [last, setLast] = useState<Verdict>();
  const [done, setDone] = useState(false);
  return (
    <Page kind="final" {...page} say={screen.say} done={done} line={done ? screen.success : last?.line} bad={!done} next="Start Over">
      <Rig
        story={story}
        kit={kit}
        present={present}
        pink={NONE}
        frame={screen.frame}
        controls={[screen.control]}
        values={values}
        onValues={(v) => {
          setLast(undefined);
          onValues(v);
        }}
        tests={screen.tests}
        onResult={(_, verdict, all) => {
          setLast(verdict);
          if (screen.tests.every((t) => all[t.id]?.pass)) setDone(true);
        }}
      />
    </Page>
  );
}
