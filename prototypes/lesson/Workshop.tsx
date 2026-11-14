import { useEffect, useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { Assemble } from "./Assemble.tsx";
import { Learn } from "./Learn.tsx";
import { faultValues, learnList, type Values, type Workshop } from "./model.ts";
import { Sandbox } from "./Sandbox.tsx";
import { Shell, type Step } from "./ui.tsx";

type Stage = "learn" | "assemble" | "sandbox" | "earned";
type Route = number | "final";

/** A hand-written lesson: per module learn, assemble, sandbox until earned; then piece it together. */
export function WorkshopFlow({ lesson, kit, photo, onHome, onRestart }: { lesson: Workshop; kit: Kit; photo: string; onHome: () => void; onRestart: () => void }) {
  const { modules } = lesson;
  const [route, setRoute] = useState<Route>(0);
  const [stages, setStages] = useState<Readonly<Record<string, Stage>>>(() => Object.fromEntries(modules.map((m) => [m.id, "learn" as Stage])));
  const [tuning, setTuning] = useState<Values>(() => faultValues(lesson));
  const [finalDone, setFinalDone] = useState(false);

  const stageNow = route === "final" ? "final" : stages[modules[route]!.id];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, stageNow]);

  const earned = (id: string) => stages[id] === "earned";
  const unlocked = (r: Route) => (r === "final" ? modules.every((m) => earned(m.id)) : modules.slice(0, r).every((m) => earned(m.id)));
  const setStage = (id: string, stage: Stage) => setStages((s) => (s[id] === stage ? s : { ...s, [id]: stage }));
  const steps: Step[] = [
    ...modules.map((m, i): Step => ({ key: String(i), title: m.title, state: earned(m.id) ? "done" : route === i ? "now" : "todo", enabled: unlocked(i), go: () => setRoute(i) })),
    { key: "final", title: "Piece it together", state: finalDone ? "done" : route === "final" ? "now" : "todo", enabled: unlocked("final"), go: () => setRoute("final") },
  ];

  let body;
  if (route === "final") {
    body = <Sandbox key="final" lesson={lesson} kit={kit} mode={{ kind: "final", done: finalDone }} tuning={tuning} onTune={setTuning} onEarned={() => setFinalDone(true)} onNext={onRestart} onHome={onHome} />;
  } else {
    const module = modules[route]!;
    const stage = stages[module.id]!;
    const next = () => setRoute(route + 1 < modules.length ? route + 1 : "final");
    if (stage === "learn")
      body = (
        <Learn
          key={`${module.id}-learn`}
          list={learnList(module)}
          kicker={`Module ${route + 1} · Learn`}
          title={module.need}
          hint={module.teach.length > 1 ? "First the parts it is made of, then the whole. Play with each one." : "Play with it. Every slider is live."}
          next="Next: build the part"
          own={{
            primitive: module.fault.primitive.id,
            slider: module.fault.slider.id,
            object: lesson.objectName.toLowerCase(),
            numbers: (v) => module.numbers({ ...tuning, [module.fault.key]: v }),
            generic: !module.hideLearnReadouts,
          }}
          onNext={() => setStage(module.id, "assemble")}
        />
      );
    else if (stage === "assemble") body = <Assemble key={`${module.id}-assemble`} lesson={lesson} kit={kit} index={route} onNext={() => setStage(module.id, "sandbox")} />;
    else body = <Sandbox key={module.id} lesson={lesson} kit={kit} mode={{ kind: "module", index: route, earned: stage === "earned" }} tuning={tuning} onTune={setTuning} onEarned={() => setStage(module.id, "earned")} onNext={next} onHome={onHome} />;
  }

  return (
    <Shell objectName={lesson.objectName} kind="Lesson" photo={photo} steps={steps} onHome={onHome}>
      {body}
    </Shell>
  );
}
