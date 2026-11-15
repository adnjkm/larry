// Aiden's camera, then the object's lesson inside the same phone screen. The camera is src/mock/CameraMock.tsx with
// Build it handing over; the lesson is prototypes/lesson's StoryFlow, unchanged.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import baseCss from "../lesson/base.css?inline";
import lessonCss from "../lesson/lesson.css?inline";
import { lessonFor } from "../lesson/lessons/index.ts";
import { SAMPLES } from "../lesson/samples.ts";
import { StoryFlow } from "../lesson/Story.tsx";
import type { Course } from "../lesson/course.ts";
import { CourseFlow } from "../lesson/Course.tsx";
import flaskPhoto from "../../fixtures/photos/flask.jpg?url";
import bottleCourse from "../lesson/lessons/bottle-course.ts";
import penCourse from "../lesson/lessons/pen-course.ts";
import { courseFromGen } from "../lesson/gen/index.ts";
import { GenCourse } from "../../shared/course/gen.ts";
import { useLiveCourse } from "./live/useLiveCourse.ts";
import { CoursePlusFlow } from "../combined/CoursePlus.tsx";
import penPlus from "../combined/pen-plus.ts";
import { TEMPLATE_CSS } from "../primitives/template.css.ts";
import CameraMock, { type PhoneScreen } from "../../src/mock/CameraMock.tsx";

// Set by prototypes/demo/vite.config.ts from LARRY_DEMO.
declare const __DEMO_OBJECT__: string;
/** "plus" plays the combined lesson (prototypes/combined) in place of the object's own. */
declare const __DEMO_VARIANT__: string;
const PLUS = __DEMO_VARIANT__ === "plus";

const SAMPLE = SAMPLES.find((s) => s.id === __DEMO_OBJECT__)!;
const LESSON = lessonFor(SAMPLE.kit, SAMPLE.id);
if (LESSON.kind !== "story") throw new Error(`the ${__DEMO_OBJECT__} lesson should be a story`);
const STORY = LESSON;
/** An object with a mechanism lesson plays that; the others keep their story. */
const COURSES: Readonly<Record<string, Course>> = { pen: penCourse, bottle: bottleCourse };
const COURSE = PLUS ? penPlus : COURSES[__DEMO_OBJECT__];
/** The photo the camera takes, for a hand-written lesson whose model follows another photo than the sample's: the bottle's is Aiden's own flask. */
const PHOTOS: Readonly<Record<string, string>> = { bottle: flaskPhoto };

/**
 * A generated course: fixtures/courses/<name>.json, a GenCourse, fitted with its works by the rig and played as the
 * pen's is. `?course=<name>` picks the file on any demo; LARRY_DEMO=gen plays pen.gen when none is named.
 */
const GEN_FILES = import.meta.glob<{ default: unknown }>("../../fixtures/courses/*.json");
const GEN_NAME = new URLSearchParams(location.search).get("course") ?? (__DEMO_VARIANT__ === "gen" ? "pen.gen" : null);
async function loadGen(name: string): Promise<Course> {
  const load = GEN_FILES[`../../fixtures/courses/${name}.json`];
  if (!load) {
    const found = Object.keys(GEN_FILES).map((path) => path.slice(path.lastIndexOf("/") + 1, -".json".length));
    throw new Error(`fixtures/courses/${name}.json is not there.\nCourses found: ${found.join(", ") || "none"}`);
  }
  return courseFromGen(GenCourse.parse((await load()).default));
}
/**
 * `?live` generates the course from the sample photo when the page opens (POST /api/course, the server beside vite),
 * so it is being made while the shot is framed and scanned. `?live=fresh` skips the server's cache.
 */
const LIVE = new URLSearchParams(location.search).get("live");
function useLive(): { course?: Course; error?: string } {
  const live = useLiveCourse(LIVE === null ? null : SAMPLE.photo, { staged: true, fresh: LIVE === "fresh" });
  return useMemo(() => {
    if (live.status === "failed") return { error: `live: ${live.error}` };
    if (!live.course) return {};
    try {
      return { course: courseFromGen(live.course) };
    } catch (error) {
      return { error: `live: ${error instanceof Error ? error.message : String(error)}` };
    }
  }, [live.status, live.course, live.error]);
}

/** The generated course once it is loaded, or why it could not be. */
function useGen(): { course?: Course; error?: string } {
  const [gen, setGen] = useState<{ course?: Course; error?: string }>({});
  useEffect(() => {
    if (GEN_NAME === null) return;
    let live = true;
    loadGen(GEN_NAME).then(
      (course) => live && setGen({ course }),
      (error: unknown) => live && setGen({ error: `${GEN_NAME}: ${error instanceof Error ? error.message : String(error)}` }),
    );
    return () => {
      live = false;
    };
  }, []);
  return gen;
}

/**
 * The lesson's stylesheets, scoped to the lesson so their element rules (box-sizing, button fonts) never reach the
 * camera. Keyframes stay global, since they're looked up by name; the page rules for html and body are dropped.
 */
const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const css = baseCss + "\n" + lessonCss + "\n" + TEMPLATE_CSS;
const LESSON_CSS = `${(css.match(KEYFRAMES) ?? []).join("\n")}
@scope (.demo-lesson) {
${css
  .replace(KEYFRAMES, "")
  .replace(/html,\s*body\s*\{[^}]*\}/g, "")
  .replace(/:root/g, ":scope")}
}`;

/** Long enough for the last row to land: its 400 ms delay in DEMO_CSS plus its 360 ms. */
const ARRIVE_MS = 900;

/** The lesson in the phone: it fills the screen between the status bar and the gesture bar. */
function Lesson({
  screen,
  onCamera,
  shown,
  course,
  pending,
}: {
  screen: PhoneScreen;
  onCamera: () => void;
  shown: boolean;
  course: Course | undefined;
  /** A course is still being generated: nothing plays until it lands. */
  pending: boolean;
}) {
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // Its rows come in one after another when it first arrives (DEMO_CSS); not on every step after.
  // It waits under the result, already drawn, so "arriving" runs from the moment it is shown, not from when it mounted.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const done = setTimeout(() => setSettled(true), ARRIVE_MS);
    return () => clearTimeout(done);
  }, [shown]);
  const arriving = shown && !settled;
  // The Why and Hint sheets are modal dialogs, drawn over the whole window; these keep them on the phone's screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const scale = r.width / screen.width;
      const root = document.documentElement.style;
      root.setProperty("--phone-left", `${r.left}px`);
      root.setProperty("--phone-bottom", `${window.innerHeight - r.bottom}px`);
      root.setProperty("--phone-top", `${r.top}px`);
      root.setProperty("--phone-width", `${screen.width}px`);
      root.setProperty("--phone-height", `${screen.height}px`);
      root.setProperty("--phone-scale", String(scale));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [screen.width]);
  return (
    <div className="demo-lesson" ref={box} data-arriving={arriving ? "" : undefined}>
      {PLUS ? (
        <CoursePlusFlow
          key={run}
          course={penPlus}
          kit={SAMPLE.kit}
          photo={SAMPLE.photo}
          onHome={onCamera}
          onRestart={() => setRun((r) => r + 1)}
          waiting={!shown}
        />
      ) : pending ? null : course ? (
        <CourseFlow key={run} course={course} kit={SAMPLE.kit} photo={SAMPLE.photo} onHome={onCamera} onRestart={() => setRun((r) => r + 1)} waiting={!shown} dials={PAGES} />
      ) : (
        <StoryFlow key={run} story={STORY} kit={SAMPLE.kit} photo={SAMPLE.photo} onHome={onCamera} onRestart={() => setRun((r) => r + 1)} />
      )}
    </div>
  );
}

/**
 * The demo is one live phone that always opens on the camera. `?dials` adds Aiden's tuning view: the DialKit panels
 * (which remember the last screen picked) and the still phone beside it for comparing.
 */
const TUNING = new URLSearchParams(location.search).has("dials");
/** The lesson's page dial: with the tuning view it joins those panels; `?pages` shows it alone, over the plain demo. */
const PAGES = TUNING ? ("shared" as const) : new URLSearchParams(location.search).has("pages") ? ("own" as const) : undefined;

export function Demo() {
  const gen = useGen();
  const live = useLive();
  const error = LIVE !== null ? live.error : GEN_NAME !== null ? gen.error : undefined;
  if (error) return <pre className="demo-error">{error}</pre>;
  if (LIVE === null && GEN_NAME !== null && !gen.course) return null;
  const course = LIVE !== null ? live.course : GEN_NAME !== null ? gen.course : COURSE;
  const pending = LIVE !== null && !live.course;
  return (
    <>
      <style>{LESSON_CSS}</style>
      <style>{DEMO_CSS}</style>
      <CameraMock
        object={__DEMO_OBJECT__}
        after={(props) => <Lesson {...props} course={course} pending={pending} />}
        dials={TUNING}
        compare={TUNING}
        mechanisms={course?.mechanisms.length}
        kit={course?.reveal ?? course?.story.kit}
        photo={course === COURSE ? PHOTOS[__DEMO_OBJECT__] : undefined}
      />
    </>
  );
}

const DEMO_CSS = `
.demo-error { margin: 0; padding: 24px; white-space: pre-wrap; font: 14px/1.5 ui-monospace, Menlo, monospace; color: #141414; background: #fff; }
.demo-lesson { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; color: #141414; font-family: Geist, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.demo-lesson .screen { height: 100%; max-width: none; }
/* The Why card sits in the middle of the phone's screen, at the phone's scale. */
.demo-lesson dialog.sheet[open] {
  position: fixed; inset: auto; margin: 0;
  left: calc(var(--phone-left) + var(--phone-width) * var(--phone-scale) / 2);
  top: calc(var(--phone-top) + var(--phone-height) * var(--phone-scale) / 2);
  width: min(calc(var(--phone-width) - 40px), 380px);
  translate: -50% -50%; scale: var(--phone-scale);
}
.demo-lesson dialog.sheet .sheet-in { max-height: calc(var(--phone-height) * 0.64); }

/* Build It hands the results screen to the lesson as one view transition (handOver in src/mock/CameraMock.tsx). The
   progress bar is the one thing that carries over: it flies from under "3 mechanisms" up into the lesson's header,
   turning its first key pink as it lands. The results screen fades under the incoming lesson, and the lesson's rows
   follow the bar in, top to bottom. */
html:active-view-transition-type(handover)::view-transition-old(root) { display: none; }
html:active-view-transition-type(handover)::view-transition-new(root) { animation: none; }
::view-transition-group(lesson-progress) { animation-duration: 480ms; animation-timing-function: cubic-bezier(0.77, 0, 0.175, 1); }
::view-transition-old(lesson-progress),
::view-transition-new(lesson-progress) { animation-duration: 480ms; animation-timing-function: cubic-bezier(0.77, 0, 0.175, 1); }

/* The back arrow with the bar's landing, then each row 40 ms after the one above. */
.demo-lesson[data-arriving] :is(.top .back, .page > *) { animation: demo-row-in 360ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay: 160ms; }
.demo-lesson[data-arriving] .page > :nth-child(2) { animation-delay: 200ms; }
.demo-lesson[data-arriving] .page > :nth-child(3) { animation-delay: 240ms; }
.demo-lesson[data-arriving] .page > :nth-child(4) { animation-delay: 280ms; }
.demo-lesson[data-arriving] .page > :nth-child(5) { animation-delay: 320ms; }
.demo-lesson[data-arriving] .page > :nth-child(6) { animation-delay: 360ms; }
.demo-lesson[data-arriving] .page > :nth-child(n + 7) { animation-delay: 400ms; }
@keyframes demo-row-in { from { opacity: 0; transform: translateY(8px); } }

/* The mechanism's demo takes the place the model left: it comes in from the right as the model goes off to the left.
   The lesson is see-through while it arrives, so the result under it is seen leaving. */
.demo-lesson[data-arriving] { background: transparent; }
.demo-lesson[data-arriving] .page[data-step="demo"] > .viewer { animation: demo-swipe-in 520ms cubic-bezier(0.6, 0, 0.2, 1) both; animation-delay: 0ms; }
/* Waiting under the result, the lesson's header bar is not yet the bar: the result's own is. */
[data-after][data-waiting] * { view-transition-name: none !important; }
/* One screen to the right: the same distance, time and curve as the model leaving (swipedOut in CameraMock.tsx). */
@keyframes demo-swipe-in { from { transform: translateX(var(--phone-width)); } }
@keyframes demo-fade { from { opacity: 0; } }

/* Reduced motion: the bar doesn't travel, it crossfades where it lands; the rows fade without rising. */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(lesson-progress) { animation: none; }
  .demo-lesson[data-arriving] :is(.top .back, .page > *, .page[data-step="demo"] > .viewer) { animation-name: demo-fade; }
}
`;
