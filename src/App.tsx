import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { Kit, KitEvent, Part } from "../shared/kit.ts";
import type { Lesson } from "../shared/lesson.ts";
import { CapturePicker } from "./capture/CapturePicker.tsx";
import { preparePhoto } from "./capture/preparePhoto.ts";
import { requestKit } from "./capture/requestKit.ts";
import { KitViewer } from "./kit3d/KitViewer.tsx";
import { LessonPlayer } from "./lesson/LessonPlayer.tsx";
import { type LessonLoad, addLessonEvent, arrivedOf, hookOf, loadDemo, planning, requestLesson } from "./lesson/lessonSource.ts";
import { NorthStarPanel } from "./lesson/NorthStarPanel.tsx";
import { buttons, layout, notes, type } from "./styles.ts";
import { colors, fonts } from "./tokens.stylex.ts";

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

const styles = stylex.create({
  summary: { margin: 0, fontSize: 14, lineHeight: "19px", color: colors.graphite },
  hook: { display: "flex", flexDirection: "column", gap: 8 },
  parts: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 16, lineHeight: "22px" },
  photo: { width: "100%", maxHeight: "60dvh", objectFit: "contain" },
  status: { margin: 0, fontFamily: fonts.mono, fontSize: 14, lineHeight: "20px" },
});

function addEvent(state: GeneratingState, event: Extract<KitEvent, { type: "started" | "part" }>): GeneratingState {
  if (event.type === "started") return { ...state, header: { name: event.name, summary: event.summary } };
  // A schema retry on the server can send a part again, so a repeated id replaces the earlier copy.
  const at = state.parts.findIndex((p) => p.id === event.part.id);
  return { ...state, parts: at < 0 ? [...state.parts, event.part] : state.parts.with(at, event.part) };
}

export function App() {
  const [state, setState] = useState<State>(DEMO ? { phase: "loading" } : { phase: "capture" });

  const planner = useRef<AbortController>(undefined);

  /** The lesson is written while the person looks at the model, and it keeps arriving while they play it. */
  async function planLesson(kit: Kit) {
    planner.current?.abort();
    const controller = new AbortController();
    planner.current = controller;
    const update = (change: (lesson: LessonLoad) => LessonLoad) =>
      setState((s) => ((s.phase === "viewing" || s.phase === "building") && s.kit === kit ? { ...s, lesson: change(s.lesson) } : s));
    update(planning);
    try {
      for await (const event of requestLesson(kit, controller.signal)) update((lesson) => addLessonEvent(lesson, event));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof DOMException && error.name === "TimeoutError" ? "Larry took too long to plan this one" : error instanceof Error ? error.message : String(error);
      update((lesson) => (lesson.status === "planning" ? { ...lesson, status: "failed", message } : lesson));
    }
  }

  function showKit(kit: Kit, lesson?: Lesson) {
    setState({ phase: "viewing", kit, lesson: lesson ? { status: "complete", lesson } : planning() });
    if (!lesson) void planLesson(kit);
  }

  useEffect(() => {
    if (!DEMO) return;
    let live = true;
    loadDemo(DEMO, LIVE).then(
      ({ kit, lesson }) => live && showKit(kit, lesson),
      (error: unknown) => live && setState({ phase: "failed", message: error instanceof Error ? error.message : String(error), retry: () => location.reload() }),
    );
    return () => {
      live = false;
    };
  }, []);

  async function generate(files: File[]) {
    const [first] = files;
    if (!first) return;
    setState({ phase: "generating", first, parts: [] });
    const fail = (message: string) => setState({ phase: "failed", message, retry: () => void generate(files) });
    try {
      const photos = await Promise.all(files.map(preparePhoto));
      for await (const event of requestKit(photos)) {
        if (event.type === "done") showKit(event.kit);
        else if (event.type === "failed") fail(event.message);
        else setState((s) => (s.phase === "generating" ? addEvent(s, event) : s));
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
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
          {view.header && (
            <div {...stylex.props(layout.inset, layout.tight)}>
              <p {...stylex.props(type.label)}>Larry found a</p>
              <h1 {...stylex.props(type.title)}>{view.header.name}</h1>
              {hook ? (
                <div data-hook {...stylex.props(styles.hook)}>
                  {hook.map((p) => (
                    <p key={p} {...stylex.props(type.story)}>
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <p {...stylex.props(styles.summary)}>{view.header.summary}</p>
              )}
            </div>
          )}
          <KitViewer parts={view.parts} spin height={270} />
          {state.phase === "viewing" ? (
            <NorthStarPanel
              kit={state.kit}
              lesson={state.lesson}
              onStart={() => setState({ ...state, phase: "building" })}
              onRetry={() => void planLesson(state.kit)}
              onRestart={restart}
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
        <LessonPlayer
          kit={state.kit}
          arrived={arrivedOf(state.lesson)}
          stalled={state.lesson.status === "failed" ? { message: state.lesson.message, onRetry: () => void planLesson(state.kit) } : undefined}
          onRestart={restart}
        />
      )}
      {state.phase === "failed" && (
        <>
          <div role="alert" {...stylex.props(notes.base, notes.fail)}>
            <p {...stylex.props(type.label, notes.failText)}>Larry couldn't take it apart</p>
            <p {...stylex.props(type.body)}>{state.message}</p>
          </div>
          <button type="button" {...stylex.props(buttons.base, buttons.primary)} onClick={state.retry}>
            Try again
          </button>
          <button type="button" {...stylex.props(buttons.base, buttons.secondary)} onClick={restart}>
            Take new photos
          </button>
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
      {url && <img src={url} alt="Your photo" {...stylex.props(styles.photo)} />}
      <p role="status" {...stylex.props(styles.status)}>
        Larry is taking it apart…
      </p>
    </>
  );
}
