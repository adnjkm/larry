import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Kit, KitEvent, Part } from "../shared/kit.ts";
import type { Lesson } from "../shared/lesson.ts";
import { CapturePicker } from "./capture/CapturePicker.tsx";
import { preparePhoto } from "./capture/preparePhoto.ts";
import { Chevron } from "./ui/Chevron.tsx";
import { Dots } from "./ui/Dots.tsx";
import { KitViewer, LessonPlayer, prefetchKitViewer, prefetchLessonPlayer, prefetchStage } from "./lazy.ts";
import { requestLesson } from "./lesson/api.ts";
import { type FailedLoad, type LessonLoad, addLessonEvent, arrivedOf, hookOf, planning, shownOf } from "./lesson/load.ts";
import { NorthStarPanel } from "./lesson/NorthStarPanel.tsx";
import { streamEvents } from "../shared/ndjson.ts";
import { colors, fonts } from "./tokens.stylex.ts";
import { bars, buttons, layout, notes, type } from "./ui/styles.ts";
import { VIEWPORT_HEIGHT } from "./viewport.ts";

type Header = { name: string; summary: string };

type GeneratingState = { phase: "generating"; first: Blob; header?: Header; parts: Part[] };

type State =
  | { phase: "capture" }
  | { phase: "loading" }
  | GeneratingState
  | { phase: "viewing" | "building"; kit: Kit; lesson: LessonLoad }
  | { phase: "failed"; message: string; retry: () => void };

/** `?demo=<name>` loads a kit and lesson checked into fixtures/, so the app runs with no camera and no network. Add `&live` to plan the lesson on the server instead. */
const params = new URLSearchParams(location.search);
const DEMO = params.get("demo");
const LIVE = params.has("live");

const sweep = stylex.keyframes({
  from: { transform: "translateY(-100%)" },
  to: { transform: "translateY(250%)" },
});

const styles = stylex.create({
  summary: { margin: 0, fontSize: 14, lineHeight: "20px", color: colors.graphite },
  hook: { display: "flex", flexDirection: "column", gap: 8 },
  parts: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 16, lineHeight: "22px" },
  photoFrame: { position: "relative", overflow: "hidden" },
  photo: { display: "block", width: "100%", maxHeight: "60dvh", objectFit: "contain" },
  shimmer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    pointerEvents: "none",
    backgroundImage: `radial-gradient(${colors.accent} 0.9px, transparent 1.3px)`,
    backgroundSize: "4px 4px",
    maskImage: "linear-gradient(transparent, black, transparent)",
    animationName: { default: sweep, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "3.2s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    opacity: { default: 0.55, "@media (prefers-reduced-motion: reduce)": 0 },
  },
  status: { margin: 0, fontFamily: fonts.mono, fontSize: 14, lineHeight: "20px" },
});

/** fetch rejects with a TypeError only when the request never reached the server. */
const messageOf = (error: unknown): string =>
  error instanceof TypeError ? "Larry couldn't reach the server. Check your connection and try again." : error instanceof Error ? error.message : String(error);

function addEvent(state: GeneratingState, event: Extract<KitEvent, { type: "started" | "part" }>): GeneratingState {
  if (event.type === "started") return { ...state, header: { name: event.name, summary: event.summary } };
  return { ...state, parts: [...state.parts, event.part] };
}

export function App() {
  const [state, setState] = useState<State>(DEMO ? { phase: "loading" } : { phase: "capture" });

  const planner = useRef<AbortController>(undefined);

  /** The lesson is written while the person looks at the model, and it keeps arriving while they play it. */
  async function planLesson(kit: Kit, after?: FailedLoad) {
    planner.current?.abort();
    const controller = new AbortController();
    planner.current = controller;
    const update = (change: (lesson: LessonLoad) => LessonLoad) =>
      setState((s) => ((s.phase === "viewing" || s.phase === "building") && s.kit === kit ? { ...s, lesson: change(s.lesson) } : s));
    update(() => planning(after));
    try {
      for await (const event of requestLesson(kit, controller.signal, after && shownOf(after))) update((lesson) => addLessonEvent(lesson, event));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof DOMException && error.name === "TimeoutError" ? "Larry took too long to plan this one" : messageOf(error);
      update((lesson) => (lesson.status === "planning" ? { ...lesson, status: "failed", message } : lesson));
    }
  }

  function showKit(kit: Kit, lesson?: Lesson) {
    prefetchLessonPlayer();
    prefetchStage();
    setState({ phase: "viewing", kit, lesson: lesson ? { status: "complete", lesson } : planning() });
    if (!lesson) void planLesson(kit);
  }

  useEffect(() => {
    if (!DEMO) return;
    let live = true;
    import("./lesson/demo.ts")
      .then(({ loadDemo }) => loadDemo(DEMO, LIVE))
      .then(
        ({ kit, lesson }) => live && showKit(kit, lesson),
        (error: unknown) =>
          live && setState({ phase: "failed", message: error instanceof Error ? error.message : String(error), retry: () => location.reload() }),
      );
    return () => {
      live = false;
    };
  }, []);

  async function generate(files: File[]) {
    const [first] = files;
    if (!first) return;
    prefetchKitViewer();
    setState({ phase: "generating", first, parts: [] });
    const fail = (message: string) => setState({ phase: "failed", message, retry: () => void generate(files) });
    try {
      const photos = await Promise.all(files.map(preparePhoto));
      const form = new FormData();
      photos.forEach((photo, i) => form.append("photo", photo, `photo-${i}.jpg`));
      for await (const event of streamEvents<KitEvent>("/api/kits", { body: form })) {
        if (event.type === "done") showKit(event.kit);
        else if (event.type === "failed") fail(event.message);
        else setState((s) => (s.phase === "generating" ? addEvent(s, event) : s));
      }
    } catch (error) {
      fail(messageOf(error));
    }
  }

  const restart = () => {
    planner.current?.abort();
    setState({ phase: "capture" });
  };

  const view =
    state.phase === "viewing"
      ? { header: state.kit, parts: state.kit.parts, done: true }
      : state.phase === "generating" && state.parts.length > 0
        ? { header: state.header, parts: state.parts, done: false }
        : undefined;

  const hook = state.phase === "viewing" ? hookOf(state.lesson) : undefined;
  const failedLesson = (state.phase === "viewing" || state.phase === "building") && state.lesson.status === "failed" ? state.lesson : undefined;

  return (
    <main {...stylex.props(layout.page)}>
      {state.phase === "capture" && <CapturePicker onPick={(files) => void generate(files)} />}
      {state.phase === "loading" && (
        <p role="status" {...stylex.props(styles.status)}>
          Loading…
        </p>
      )}
      {state.phase === "generating" && !view && <GeneratingPhoto photo={state.first} />}
      {view && (
        <>
          {state.phase === "viewing" && (
            <div {...stylex.props(bars.top)}>
              <Button data-action="restart" {...stylex.props(buttons.base, buttons.topText)} onClick={restart}>
                <Chevron />
                New photo
              </Button>
            </div>
          )}
          {view.header && (
            <div {...stylex.props(layout.inset, layout.tight)}>
              <p {...stylex.props(type.label)}>Larry found a</p>
              <h1 {...stylex.props(type.title)}>{view.header.name}</h1>
            </div>
          )}
          <Suspense fallback={<div style={{ height: VIEWPORT_HEIGHT }} />}>
            <KitViewer parts={view.parts} spin height={VIEWPORT_HEIGHT} />
          </Suspense>
          {view.header &&
            (hook ? (
              <div data-hook {...stylex.props(layout.inset, styles.hook)}>
                {hook.map((p) => (
                  <p key={p} {...stylex.props(type.story)}>
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p {...stylex.props(layout.inset, styles.summary)}>{view.header.summary}</p>
            ))}
          {state.phase === "viewing" ? (
            <NorthStarPanel
              kit={state.kit}
              lesson={state.lesson}
              onStart={() => setState({ ...state, phase: "building" })}
              onRetry={() => void planLesson(state.kit, failedLesson)}
            />
          ) : (
            <>
              <h2 {...stylex.props(layout.inset, type.label)}>{view.parts.length} parts</h2>
              <ul {...stylex.props(layout.inset, styles.parts)}>
                {view.parts.map((part) => (
                  <li key={part.id}>{part.name}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {state.phase === "building" && (
        <Suspense fallback={null}>
          <LessonPlayer
            kit={state.kit}
            arrived={arrivedOf(state.lesson)}
            stalled={failedLesson && { message: failedLesson.message, onRetry: () => void planLesson(state.kit, failedLesson) }}
            onRestart={restart}
          />
        </Suspense>
      )}
      {state.phase === "failed" && (
        <>
          <div role="alert" {...stylex.props(notes.base, notes.fail)}>
            <p {...stylex.props(type.label, notes.failText)}>Larry couldn't take it apart</p>
            <p {...stylex.props(type.body)}>{state.message}</p>
          </div>
          <Button {...stylex.props(buttons.base, buttons.primary)} onClick={state.retry}>
            Try again
          </Button>
          <Button {...stylex.props(buttons.base, buttons.secondary)} onClick={restart}>
            Photograph something else
          </Button>
        </>
      )}
    </main>
  );
}

function GeneratingPhoto({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  return (
    <>
      {url && (
        <div {...stylex.props(styles.photoFrame)}>
          <img src={url} alt="Your photo" {...stylex.props(styles.photo)} />
          <div aria-hidden {...stylex.props(styles.shimmer)} />
        </div>
      )}
      <p role="status" {...stylex.props(styles.status)}>
        Larry is taking it apart
        <Dots />
      </p>
    </>
  );
}
