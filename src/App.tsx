import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { Kit, KitEvent, Part } from "../shared/kit.ts";
import type { Lesson } from "../shared/lesson.ts";
import { CapturePicker } from "./capture/CapturePicker.tsx";
import { preparePhoto } from "./capture/preparePhoto.ts";
import { requestKit } from "./capture/requestKit.ts";
import { KitViewer } from "./kit3d/KitViewer.tsx";
import { LessonPlayer } from "./lesson/LessonPlayer.tsx";
import { type LessonLoad, addLessonEvent, arrivedOf, loadDemo, planning, requestLesson } from "./lesson/lessonSource.ts";
import { NorthStarPanel } from "./lesson/NorthStarPanel.tsx";
import { colors, fonts } from "./tokens.stylex.ts";

type Header = { name: string; summary: string };

type Generating = { phase: "generating"; first: Blob; header?: Header; parts: Part[] };

type State =
  | { phase: "capture" }
  | { phase: "loading" }
  | Generating
  | { phase: "viewing" | "building"; kit: Kit; lesson: LessonLoad }
  | { phase: "failed"; message: string; retry: () => void };

/** `?demo=<name>` loads a kit and lesson checked into fixtures/, so the app runs with no camera and no network. Add `&live` to plan the lesson on the server instead. */
const params = new URLSearchParams(location.search);
const DEMO = params.get("demo");
const LIVE = params.has("live");

const styles = stylex.create({
  page: {
    boxSizing: "border-box",
    maxWidth: 480,
    minHeight: "100dvh",
    margin: "0 auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  title: { margin: 0, fontSize: 32, fontWeight: 600 },
  summary: { margin: 0, fontSize: 16, lineHeight: 1.45, color: colors.graphite },
  heading: { margin: 0, fontFamily: fonts.mono, fontSize: 13, fontWeight: 500, color: colors.graphite, textTransform: "uppercase" },
  parts: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 18 },
  photo: { width: "100%", maxHeight: "60dvh", objectFit: "contain" },
  status: { margin: 0, fontFamily: fonts.mono, fontSize: 16 },
  button: {
    minHeight: 56,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.ink,
    borderRadius: 0,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
  },
  primary: { backgroundColor: colors.orange },
});

function addEvent(state: Generating, event: Extract<KitEvent, { type: "started" | "part" }>): Generating {
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

  return (
    <main {...stylex.props(styles.page)}>
      {state.phase === "capture" && <CapturePicker onPick={(files) => void generate(files)} />}
      {state.phase === "loading" && <p {...stylex.props(styles.status)}>Loading…</p>}
      {state.phase === "generating" && !view && <Generating photo={state.first} />}
      {view && (
        <>
          {view.header && <h1 {...stylex.props(styles.title)}>{view.header.name}</h1>}
          {view.header && <p {...stylex.props(styles.summary)}>{view.header.summary}</p>}
          <KitViewer kit={{ name: view.header?.name ?? "", summary: view.header?.summary ?? "", parts: view.parts }} spin />
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
              <h2 {...stylex.props(styles.heading)}>{view.parts.length} parts</h2>
              <ul {...stylex.props(styles.parts)}>
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
          <p {...stylex.props(styles.status)}>{state.message}</p>
          <button type="button" {...stylex.props(styles.button, styles.primary)} onClick={state.retry}>
            Try again
          </button>
          <button type="button" {...stylex.props(styles.button)} onClick={restart}>
            Use other photos
          </button>
        </>
      )}
    </main>
  );
}

function Generating({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  return (
    <>
      {url && <img src={url} alt="Your photo" {...stylex.props(styles.photo)} />}
      <p {...stylex.props(styles.status)}>Larry is taking it apart…</p>
    </>
  );
}
