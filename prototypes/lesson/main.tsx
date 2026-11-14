// Prototype: the full lesson flow for one scanned object. For each requirement the user learns the
// primitives, builds the part from them, plays with it in a sandbox until the fault is found and
// fixed, then pieces the whole object together. Everything shown is drawn by the dither 3D viewer.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseKit } from "../../shared/kit.ts";
import type { Values } from "../../src/primitives/library.ts";
import { Assemble } from "./Assemble.tsx";
import { Learn } from "./Learn.tsx";
import { BOTTLE_FINAL, BOTTLE_MODULES, type Lesson, type Stage } from "./model.ts";
import { Sandbox } from "./Sandbox.tsx";

const kitJson = import.meta.glob<unknown>("../../fixtures/kits/bottle.json", { eager: true, import: "default" });
const photoUrl = import.meta.glob<string>("../../fixtures/photos/bottle.jpg", { eager: true, query: "?url", import: "default" });

const LESSON: Lesson = {
  objectName: "Water bottle",
  kit: parseKit(Object.values(kitJson)[0]),
  modules: BOTTLE_MODULES,
  final: BOTTLE_FINAL,
};
const PHOTO = Object.values(photoUrl)[0] ?? "";

type Route = number | "final";

function App({ restart }: { restart: () => void }) {
  const { modules } = LESSON;
  const [route, setRoute] = useState<Route>(0);
  const [stages, setStages] = useState<Record<string, Stage>>(() => Object.fromEntries(modules.map((m) => [m.id, "learn" as Stage])));
  const [tuning, setTuning] = useState<Values>(() => Object.fromEntries(modules.map((m) => [m.fault.slider, m.fault.start])));
  const [finalDone, setFinalDone] = useState(false);

  const stageNow = route === "final" ? "final" : stages[modules[route]!.id];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, stageNow]);

  const earnedCount = modules.filter((m) => stages[m.id] === "earned").length;
  const unlocked = (r: Route) => (r === "final" ? earnedCount === modules.length : modules.slice(0, r).every((m) => stages[m.id] === "earned"));
  const setStage = (id: string, stage: Stage) => setStages((s) => (s[id] === stage ? s : { ...s, [id]: stage }));
  const steps: { route: Route; title: string; state: "done" | "now" | "todo" }[] = [
    ...modules.map((m, i) => ({ route: i as Route, title: m.title, state: stages[m.id] === "earned" ? ("done" as const) : route === i ? ("now" as const) : ("todo" as const) })),
    { route: "final" as Route, title: "Piece it together", state: finalDone ? ("done" as const) : route === "final" ? ("now" as const) : ("todo" as const) },
  ];

  let body;
  if (route === "final") {
    body = <Sandbox key="final" lesson={LESSON} mode={{ kind: "final", done: finalDone }} tuning={tuning} onTune={setTuning} onEarned={() => setFinalDone(true)} onNext={restart} />;
  } else {
    const module = modules[route]!;
    const stage = stages[module.id]!;
    const next = () => setRoute(route + 1 < modules.length ? route + 1 : "final");
    if (stage === "learn") body = <Learn key={`${module.id}-learn`} module={module} index={route} onNext={() => setStage(module.id, "assemble")} />;
    else if (stage === "assemble") body = <Assemble key={`${module.id}-assemble`} lesson={LESSON} index={route} onNext={() => setStage(module.id, "sandbox")} />;
    else body = <Sandbox key={module.id} lesson={LESSON} mode={{ kind: "module", index: route, earned: stage === "earned" }} tuning={tuning} onTune={setTuning} onEarned={() => setStage(module.id, "earned")} onNext={next} />;
  }

  return (
    <>
      <header className="top">
        <div className="top-row">
          <div className="top-name">
            <span className="mono">Larry · lesson</span>
            <strong>{LESSON.objectName}</strong>
          </div>
          <figure className="north" title="The scanned photo: what you are building">
            <img src={PHOTO} alt="Scanned water bottle" />
            <figcaption className="mono">Goal</figcaption>
          </figure>
        </div>
        <nav className="strip" aria-label="Progress">
          {steps.map((s, i) => (
            <button key={String(s.route)} type="button" className="step-pill" data-state={s.state} data-pill={String(s.route)} disabled={!unlocked(s.route)} onClick={() => setRoute(s.route)}>
              <span className="mono">{s.state === "done" ? "✓" : String(i + 1).padStart(2, "0")}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
      </header>
      {body}
    </>
  );
}

function Root() {
  const [run, setRun] = useState(0);
  return <App key={run} restart={() => setRun((n) => n + 1)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
