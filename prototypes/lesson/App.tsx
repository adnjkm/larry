import { useState } from "react";
import { Home, Scan } from "./Home.tsx";
import { InspectFlow } from "./Inspect.tsx";
import { lessonFor } from "./lessons/index.ts";
import { inspectLesson } from "./lessons/inspect.ts";
import { generatedLesson } from "./templates/index.ts";
import type { Lesson } from "./model.ts";
import { type Sample, SAMPLES } from "./samples.ts";
import { WorkshopFlow } from "./Workshop.tsx";

const QUERY = new URLSearchParams(location.search);
/** `?inspect` forces the Inspect lesson and `?generated` the joint-generated one, so either can be compared with a hand-written lesson. */
const lessonOf = (s: Sample): Lesson =>
  QUERY.has("inspect") ? inspectLesson(s.kit) : QUERY.has("generated") ? (generatedLesson(s.kit, `generated-${s.id}`) ?? inspectLesson(s.kit)) : lessonFor(s.kit, s.id);

type Screen = { at: "home" } | { at: "scan"; sample: Sample } | { at: "lesson"; sample: Sample; run: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "home" });
  const home = () => setScreen({ at: "home" });
  if (screen.at === "home") return <Home samples={SAMPLES} lessonOf={lessonOf} onPick={(sample) => setScreen({ at: "scan", sample })} />;
  const { sample } = screen;
  const lesson = lessonOf(sample);
  if (screen.at === "scan") return <Scan sample={sample} lesson={lesson} onStart={() => setScreen({ at: "lesson", sample, run: 0 })} />;
  const restart = () => setScreen({ at: "lesson", sample, run: screen.run + 1 });
  return lesson.kind === "workshop" ? (
    <WorkshopFlow key={screen.run} lesson={lesson} kit={sample.kit} photo={sample.photo} onHome={home} onRestart={restart} />
  ) : (
    <InspectFlow key={screen.run} lesson={lesson} kit={sample.kit} photo={sample.photo} onHome={home} onRestart={restart} />
  );
}
