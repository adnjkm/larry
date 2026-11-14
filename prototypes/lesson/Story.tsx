import { useMemo, useState } from "react";
import type { Kit } from "../../shared/kit.ts";
import { Assemble } from "./Assemble.tsx";
import { Learn, objectFor } from "./Learn.tsx";
import { bindStory, rigList, type Story, type Values } from "./model.ts";
import { Play } from "./Play.tsx";
import { Plain, Shell, type Step } from "./ui.tsx";

/** Each module: see it fail without the part, learn the primitive, build the part, make it work by hand. */
type Stage = "problem" | "learn" | "assemble" | "play" | "earned";
type Route = number | "final";

const startValues = (story: Story): Values => Object.fromEntries([...story.modules.map((m) => m.play.control), story.final.control].map((c) => [c.key, c.start]));

/** A story lesson, told with no numbers anywhere: every screen sits inside Plain. */
export function StoryFlow({ story: written, kit: scanned, photo, onHome, onRestart }: { story: Story; kit: Kit; photo: string; onHome: () => void; onRestart: () => void }) {
  const { story, kit } = useMemo(() => bindStory(written, scanned), [written, scanned]);
  const { modules } = story;
  const [route, setRoute] = useState<Route>(0);
  const [stages, setStages] = useState<Readonly<Record<string, Stage>>>(() => Object.fromEntries(modules.map((m) => [m.id, "problem" as Stage])));
  const [values, setValues] = useState<Values>(() => startValues(story));
  const [finalDone, setFinalDone] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());

  const earned = (id: string) => stages[id] === "earned";
  const unlocked = (r: Route) => (r === "final" ? modules.every((m) => earned(m.id)) : modules.slice(0, r).every((m) => earned(m.id)));
  const setStage = (id: string, stage: Stage) => setStages((s) => (s[id] === stage ? s : { ...s, [id]: stage }));
  const steps: Step[] = [
    ...modules.map((m, i): Step => ({ key: String(i), title: m.title, state: earned(m.id) ? "done" : route === i ? "now" : "todo", enabled: unlocked(i), go: () => setRoute(i) })),
    { key: "final", title: story.final.title, state: finalDone ? "done" : route === "final" ? "now" : "todo", enabled: unlocked("final"), go: () => setRoute("final") },
  ];

  let body;
  if (route === "final") {
    body = <Play key="final" story={story} kit={kit} mode={{ kind: "final", done: finalDone }} values={values} onValues={setValues} onDone={() => setFinalDone(true)} onNext={onRestart} onHome={onHome} />;
  } else {
    const module = modules[route]!;
    const stage = stages[module.id]!;
    const next = () => setRoute(route + 1 < modules.length ? route + 1 : "final");
    if (stage === "problem")
      body = <Play key={`${module.id}-problem`} story={story} kit={kit} mode={{ kind: "problem", index: route, seen: seen.has(module.id) }} values={values} onValues={setValues} onDone={() => setSeen((s) => new Set([...s, module.id]))} onNext={() => setStage(module.id, "learn")} onHome={onHome} />;
    else if (stage === "learn")
      body = (
        <Learn
          key={`${module.id}-learn`}
          list={rigList(module)}
          words={{ say: module.learn.say, why: (p) => module.learn.rigs[p.id]!.why }}
          kicker={`${module.title} · Learn`}
          next="Next: build it"
          inObject={(p) => objectFor(story, kit, module, p)}
          view={story.view}
          onNext={() => setStage(module.id, "assemble")}
        />
      );
    else if (stage === "assemble")
      body = (
        <Assemble
          key={`${module.id}-assemble`}
          lesson={story}
          kit={kit}
          index={route}
          next="Next: try it"
          onNext={() => {
            const c = module.play.control;
            setValues((v) => ({ ...v, [c.key]: c.start }));
            setStage(module.id, "play");
          }}
        />
      );
    else body = <Play key={module.id} story={story} kit={kit} mode={{ kind: "play", index: route, earned: stage === "earned" }} values={values} onValues={setValues} onDone={() => setStage(module.id, "earned")} onNext={next} onHome={onHome} />;
  }

  return (
    <Plain.Provider value>
      <Shell objectName={story.objectName} photo={photo} steps={steps} onHome={onHome}>
        {body}
      </Shell>
    </Plain.Provider>
  );
}
