// A mechanism lesson, played: see course.ts for the shape. One screen at a time, in order; the header has a key per
// mechanism, and the bubble under it names the one in hand.
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { PRIMITIVES } from "../../shared/primitives/library.ts";
import { type Course, FORMAT, type Screen } from "./course.ts";
import { bindStory, familyOf, presentAfter, type Story, type Test, type Values, type Verdict } from "./model.ts";
import { MatchRow } from "./MatchRow.tsx";
import { Place } from "./Place.tsx";
import { Rig } from "./Rig.tsx";
import { Actions, Plain, Say, Shell, type Step } from "./ui.tsx";
import { Mechanism, PrimitiveScreen } from "../primitives/PrimitiveScreen.tsx";
import { FigureStage } from "../../src/primitives/stage/FigureStage.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";
import { CAMERA } from "../../src/camera/look.ts";
import { feature, type Relief, rrect } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import { BubbleTerm } from "../../src/ui/BubbleLabel.tsx";
import { reducedMotion } from "../../src/motion.ts";

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
    else if (screen.kind === "match") body = <Match key={at} {...page} screen={screen} jobs={course.jobs} />;
    else if (screen.kind === "works") body = <Works key={at} {...bench} {...page} screen={screen} values={values} onValues={setValues} onNext={screen.last ? onRestart : next} />;
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
  // A demo doesn't cut to the next screen: its rows go and its bubble draws down first (DemoBubble), then it moves on.
  const [leaving, setLeaving] = useState(false);
  return (
    <main className="page step-in" data-step={kind} data-done={done ? "" : undefined} data-leaving={leaving ? "" : undefined}>
      {/* A demo asks nothing: its line is what the mechanism is, so the bubble that names the mechanism holds it. */}
      {kind === "demo" ? (
        <DemoBubble name={name} step={step} about={say} leaving={leaving} onLeft={onNext} />
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
        <button type="button" className="btn" data-next disabled={!done} onClick={kind === "demo" ? () => setLeaving(true) : onNext}>
          <PillSurface>{next}</PillSurface>
        </button>
      </Actions>
    </main>
  );
}

/** How long a demo's bubble takes to draw down to its name. Its other rows are gone sooner (lesson.css, data-leaving). */
const LEAVE_MS = 260;
/** With reduced motion nothing moves: the one bubble fades into the other where it stands. */
const LEAVE_REDUCED_MS = 200;
/** The curve for something that moves while staying on screen. */
const MOVE = "cubic-bezier(0.77, 0, 0.175, 1)";
/** How much of the bubble's top and of its bottom is the same at any height: the tab and top edge, the round corners and bottom edge. */
const BUBBLE_END = 16;

/**
 * A demo's bubble, which explains the mechanism. Every later screen opens on the same bubble holding the name alone,
 * so on the way out this one becomes that one, and the next screen's bubble is then drawn exactly over it: the two
 * read as one.
 *
 * The one-line bubble waits here from the start, hidden: its raised shape (Mechanism's `short`) and its words. On
 * Continue the tall shape is cut away from below while the short one's lower part rides up under the cut, so the
 * bottom edge rises with nothing redrawn; the cut climbs the short shape as it goes, so the bubble starts as all of
 * the tall one and ends as nearly all of the short one. The explaining line fades, and the name and its kind move to
 * where the short bubble sets them. The row keeps its height throughout, so the demo's viewer is never resized.
 */
function DemoBubble({ name, step, about, leaving, onLeft }: { name: string; step: number; about: string; leaving: boolean; onLeft: () => void }) {
  const after = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState<number>();
  useLayoutEffect(() => setShort(after.current?.offsetHeight), []);
  const left = useRef(onLeft);
  left.current = onLeft;
  useLayoutEffect(() => {
    if (!leaving) return;
    const next = after.current;
    const row = next?.parentElement;
    const [tall, low] = row?.querySelectorAll<HTMLCanvasElement>(":scope > canvas") ?? [];
    // Nothing to draw down to (the row was never laid out): just move on.
    if (!next || !row || !tall || !low) return left.current();
    const words = (["name", "kind"] as const).flatMap((part) => {
      const [old, now] = row.querySelectorAll<HTMLElement>(`[data-term="${part}"]`);
      return old && now ? [{ old, now }] : [];
    });
    const running: Animation[] = [];
    const run = (el: Element, frames: Keyframe[], timing: KeyframeAnimationOptions) => running.push(el.animate(frames, { ...timing, fill: "both" }));

    if (reducedMotion.matches) {
      const fade = { duration: LEAVE_REDUCED_MS, easing: "ease-out" };
      // The short shape comes in over the tall one before the tall one goes, so the bubble is never see-through.
      run(low, [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], fade);
      run(tall, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], fade);
      for (const { old, now } of words) {
        run(old, [{ opacity: 1 }, { opacity: 0 }], fade);
        run(now, [{ opacity: 0 }, { opacity: 1 }], fade);
      }
    } else {
      const move = { duration: LEAVE_MS, easing: MOVE };
      // The cut, measured up from the bubble's bottom edge. Both shapes are drawn with room round them for a shadow.
      const [from, to] = [row.offsetHeight, next.offsetHeight];
      const pad = -tall.offsetTop;
      const [cut0, cut1] = [BUBBLE_END, Math.max(BUBBLE_END, to - BUBBLE_END)];
      // The tall one keeps a pixel under the cut, so no hairline opens between the two as they pass through half pixels.
      run(tall, [{ clipPath: `inset(0px 0px ${pad + cut0 - 1}px 0px)` }, { clipPath: `inset(0px 0px ${pad + cut1 + from - to - 1}px 0px)` }], move);
      run(
        low,
        [
          { transform: `translateY(${from - to}px)`, clipPath: `inset(${pad + to - cut0}px 0px 0px 0px)` },
          { transform: "translateY(0px)", clipPath: `inset(${pad + to - cut1}px 0px 0px 0px)` },
        ],
        move,
      );
      // Each word twice, one over the other and moving as one: the demo's (16, bold) fades off the next screen's (15),
      // so the weight eases over as it shrinks instead of changing at the cut. The phone may be drawn at a scale, and
      // a transform is in the row's own pixels.
      const scale = row.getBoundingClientRect().width / row.offsetWidth || 1;
      const fit = (a: DOMRect, b: DOMRect) => `translate(${(b.left - a.left) / scale}px, ${(b.top - a.top) / scale}px) scale(${b.width / a.width}, ${b.height / a.height})`;
      const still = "translate(0px, 0px) scale(1, 1)";
      for (const { old, now } of words) {
        const [a, b] = [old.getBoundingClientRect(), now.getBoundingClientRect()];
        old.style.transformOrigin = now.style.transformOrigin = "0 0";
        run(old, [{ transform: still, opacity: 1 }, { transform: fit(a, b), opacity: 0 }], move);
        run(now, [{ transform: fit(b, a) }, { transform: still }], move);
      }
    }
    running[0]!.onfinish = () => left.current();
    return () => running.forEach((a) => a.cancel());
  }, [leaving]);
  return (
    <Mechanism name={name} step={step} about={about} short={short}>
      <span ref={after} className="bubble-after" aria-hidden>
        <BubbleTerm name={name} kind="mechanism" />
      </span>
    </Mechanism>
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
    <Page kind="demo" {...page} say={screen.does} done next="Continue to Mechanism">
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

/** A primitive as a small still picture with its name under it in Paper Mono: no frame, just the thing. */
function Chip({ id, slotted = false }: { id: string; slotted?: boolean }) {
  const p = primitive(id);
  // In its slot the picture alone, at the slot's size: the name went with it from the tray.
  const size = slotted ? SLOT : CHIP;
  return (
    <>
      <span className="chip-figure" aria-hidden={!slotted} aria-label={slotted ? p.name : undefined} role={slotted ? "img" : undefined}>
        <FigureStage primitive={p} mode="play" handle={false} palette="library" height={size} />
      </span>
      {slotted ? null : <span className="chip-name">{p.name}</span>}
    </>
  );
}

/** A preview's picture in the tray is this many px square. */
const CHIP = 84;
/** The well a preview drops into is this many px square: two lines of the job beside it (lesson.css .match-does). */
const SLOT = 52;
const WELL_RADIUS = 14;
/** Deeper than the camera's slots, so an empty well reads from across the screen. */
const WELL: Relief = [feature.sink(4, 5)];

/** An empty slot: a well sunk into the page, dithered and lit like every other raised or sunk part. */
function Well() {
  return (
    <span className="well" aria-hidden>
      <Surface shape={rrect(SLOT, SLOT, WELL_RADIUS)} relief={WELL} bakeKey="well" material="bone" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
    </span>
  );
}

type Drag = { id: string; x: number; y: number; scale: number; dx: number; dy: number; over: number | null };

/**
 * The row a dragged preview is over, judged by where its picture is, not the pointer: anywhere on a row counts, and
 * failing that the nearest slot within reach, so a drop never has to be exact.
 */
function rowUnder(chip: HTMLElement): number | null {
  const picture = (chip.querySelector(".chip-figure") ?? chip).getBoundingClientRect();
  const [x, y] = [picture.left + picture.width / 2, picture.top + picture.height / 2];
  let nearest: { row: number; d: number } | null = null;
  for (const slot of document.querySelectorAll<HTMLElement>(".demo-lesson [data-slot], [data-slot]")) {
    const row = Number(slot.dataset.slot);
    const band = (slot.closest(".match-row") ?? slot).getBoundingClientRect();
    if (x >= band.left && x <= band.right && y >= band.top && y <= band.bottom) return row;
    const s = slot.getBoundingClientRect();
    const d = Math.hypot(x - (s.left + s.width / 2), y - (s.top + s.height / 2));
    if (d < s.width * 1.4 && (!nearest || d < nearest.d)) nearest = { row, d };
  }
  return nearest?.row ?? null;
}

/**
 * The connecting problem: the mechanism's sub-functions, each with an empty slot, and the primitives just learned
 * waiting below. Each is dragged to the job it does. A right one stays and turns pink; a wrong one goes back.
 */
function Match({ screen, jobs, ...page }: PageProps & { screen: Of<"match">; jobs: Readonly<Record<string, string>> }) {
  // The tray starts in a different order from the rows, so the answer is never "straight across".
  const tray = useMemo(() => {
    const ids = [...new Set(screen.rows.map((r) => r.primitive))];
    return [...ids.slice(1), ...ids.slice(0, 1)];
  }, [screen]);
  const [placed, setPlaced] = useState<Readonly<Record<number, string>>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [miss, setMiss] = useState<string>();
  const [why, setWhy] = useState<string>();
  const done = screen.rows.every((_, i) => placed[i] !== undefined);
  const used = new Set(Object.values(placed));

  const drop = (id: string, row: number | null) => {
    if (row === null || placed[row] !== undefined) return;
    if (screen.rows[row]!.primitive !== id) {
      setWhy(undefined);
      setMiss(`Not the ${lower(primitive(id).name)}. It ${jobs[id] ?? "does another job"}.`);
      return;
    }
    setMiss(undefined);
    setWhy(screen.rows[row]!.why);
    setPlaced((p) => ({ ...p, [row]: id }));
  };

  return (
    <Page kind="match" {...page} say="Drag each one to the job it does." done={done} line={miss ?? why} bad={miss !== undefined}>
      <ul className="match-rows">
        {screen.rows.map((row, i) => (
          <MatchRow key={row.does} index={i} does={row.does} filled={placed[i] !== undefined} over={drag?.over === i && placed[i] === undefined} slot={placed[i] ? <Chip id={placed[i]} slotted /> : <Well />} />
        ))}
      </ul>
      <div className="match-tray">
        {tray.map((id) =>
          used.has(id) && !screen.rows.some((r, i) => r.primitive === id && placed[i] === undefined) ? (
            <span key={id} className="match-chip" data-gone="" />
          ) : (
            <button
              key={id}
              type="button"
              className="match-chip"
              data-chip={id}
              data-dragging={drag?.id === id ? "" : undefined}
              style={drag?.id === id ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
              onPointerDown={(e) => {
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                // The phone is drawn scaled, so a screen pixel is not a lesson pixel.
                setDrag({ id, x: e.clientX, y: e.clientY, scale: el.getBoundingClientRect().width / el.offsetWidth || 1, dx: 0, dy: 0, over: null });
              }}
              onPointerMove={(e) => {
                const over = rowUnder(e.currentTarget);
                setDrag((d) => (d && d.id === id ? { ...d, dx: (e.clientX - d.x) / d.scale, dy: (e.clientY - d.y) / d.scale, over } : d));
              }}
              onPointerUp={(e) => {
                if (drag?.id === id) drop(id, rowUnder(e.currentTarget));
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <Chip id={id} />
            </button>
          ),
        )}
      </div>
    </Page>
  );
}

/** The hard problem: every dial at once, set wrong and saying nothing, and a test for each sub-function. All must pass at one setting. */
function Works({ story, kit, screen, values, onValues, ...page }: Bench & PageProps & Tuned & { screen: Of<"works"> }) {
  const { present, pink } = useParts(story, kit, screen.after);
  // Each dial carries its primitive's name, not what it does: knowing which one to reach for is the question.
  const controls = useMemo(() => screen.dials.map((d) => ({ ...d.control, verb: primitive(d.primitive).name })), [screen]);
  const tests = useMemo(() => screen.goals.map((g) => g.test), [screen]);
  const [last, setLast] = useState<Verdict>();
  const [results, setResults] = useState<Readonly<Record<string, Verdict>>>({});
  const done = tests.every((t) => results[t.id]?.pass);
  return (
    <Page kind="works" {...page} say={screen.say} done={done} line={done ? screen.success : last?.line} bad={!done && last !== undefined && !last.pass} next={screen.last ? "Start Over" : "Continue"}>
      <ul className="goals">
        {screen.goals.map((g) => {
          const r = results[g.test.id];
          return (
            <li key={g.does} data-state={r ? (r.pass ? "pass" : "fail") : "idle"}>
              {g.does}
            </li>
          );
        })}
      </ul>
      <Rig
        story={story}
        kit={kit}
        present={present}
        pink={pink}
        frame={screen.frame}
        controls={controls}
        values={values}
        onValues={(v) => {
          setLast(undefined);
          setResults({});
          onValues(v);
        }}
        tests={tests}
        blind
        locked={done}
        onResult={(_, verdict, all) => {
          setLast(verdict);
          setResults(all);
        }}
      />
    </Page>
  );
}

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
        blind
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
