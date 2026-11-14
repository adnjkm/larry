import { useState } from "react";
import { Home, Scan } from "./Home.tsx";
import { InspectFlow } from "./Inspect.tsx";
import { lessonFor } from "./lessons/index.ts";
import { inspectLesson } from "./lessons/inspect.ts";
import { generatedStory } from "./stories/index.ts";
import { generatedLesson } from "./templates/index.ts";
import type { Lesson } from "./model.ts";
import { type Sample, SAMPLES } from "./samples.ts";
import { StoryFlow } from "./Story.tsx";
import { WorkshopFlow } from "./Workshop.tsx";

const QUERY = new URLSearchParams(location.search);
const lessons = new WeakMap<Sample, Lesson>();
/** Worked out once per sample, so a generated lesson keeps its identity across renders. */
const lessonOf = (s: Sample): Lesson => {
  const known = lessons.get(s) ?? pick(s);
  lessons.set(s, known);
  return known;
};
/**
 * `?inspect` forces the Inspect lesson, `?generated` the Workshop generated from joints, and `?story`
 * the story generated from the kit, so each can be compared with a hand-written lesson.
 */
const pick = (s: Sample): Lesson =>
  QUERY.has("inspect") ? inspectLesson(s.kit)
  : QUERY.has("generated") ? (generatedLesson(s.kit, `generated-${s.id}`) ?? inspectLesson(s.kit))
  : QUERY.has("story") ? (generatedStory(s.kit, `story-${s.id}`) ?? lessonFor(s.kit, s.id))
  : lessonFor(s.kit, s.id);

type Screen = { at: "home" } | { at: "scan"; sample: Sample } | { at: "lesson"; sample: Sample; run: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "home" });
  const home = () => setScreen({ at: "home" });
  if (screen.at === "home") return <Home samples={SAMPLES} lessonOf={lessonOf} onPick={(sample) => setScreen({ at: "scan", sample })} />;
  const { sample } = screen;
  const lesson = lessonOf(sample);
  if (screen.at === "scan") return <Scan sample={sample} lesson={lesson} onStart={() => setScreen({ at: "lesson", sample, run: 0 })} />;
  const restart = () => setScreen({ at: "lesson", sample, run: screen.run + 1 });
  if (lesson.kind === "story") return <StoryFlow key={screen.run} story={lesson} kit={sample.kit} photo={sample.photo} onHome={home} onRestart={restart} />;
  return lesson.kind === "workshop" ? (
    <WorkshopFlow key={screen.run} lesson={lesson} kit={sample.kit} photo={sample.photo} onHome={home} onRestart={restart} />
  ) : (
    <InspectFlow key={screen.run} lesson={lesson} kit={sample.kit} photo={sample.photo} onHome={home} onRestart={restart} />
  );
}
