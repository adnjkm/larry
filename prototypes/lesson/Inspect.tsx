import { useEffect, useMemo, useRef, useState } from "react";
import type { Joint, Kit, Part } from "../../shared/kit.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { lerp, smooth } from "./ease.ts";
import { Learn } from "./Learn.tsx";
import { JOINT_PRIMITIVE } from "./lessons/inspect.ts";
import { EMPTY_SCENE, type Inspect, listOf } from "./model.ts";
import { drawObject, restCentre } from "./pose.ts";
import { ExplodeSlider, Header, Shell, type Step, Viewer } from "./ui.tsx";

type Route = "learn" | "apart" | "jobs" | "final";
const FIXED: ReadonlySet<Joint> = new Set(["rivet", "glue", "weld", "molded"]);
const ASSEMBLE_MS = 800;

/** For an object with no hand-written rules: learn its real mechanisms, take it apart, name each part's job, put it back. */
export function InspectFlow({ lesson, kit, photo, onHome, onRestart }: { lesson: Inspect; kit: Kit; photo: string; onHome: () => void; onRestart: () => void }) {
  const routes: Route[] = lesson.teach.length > 0 ? ["learn", "apart", "jobs", "final"] : ["apart", "jobs", "final"];
  const [route, setRoute] = useState<Route>(routes[0]!);
  const [done, setDone] = useState<ReadonlySet<Route>>(new Set());
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const finish = (r: Route) => {
    setDone((d) => new Set(d).add(r));
    const next = routes[routes.indexOf(r) + 1];
    if (next) setRoute(next);
  };
  const TITLE: Record<Route, string> = { learn: "Learn", apart: "Take it apart", jobs: "Name the jobs", final: "Piece it together" };
  const steps: Step[] = routes.map((r, i) => ({
    key: r, title: TITLE[r],
    state: done.has(r) ? "done" : route === r ? "now" : "todo",
    enabled: routes.slice(0, i).every((q) => done.has(q)),
    go: () => setRoute(r),
  }));

  const movingUnmapped = kit.parts.filter((p) => p.joint && !FIXED.has(p.joint) && JOINT_PRIMITIVE[p.joint] === null);
  const name = kit.name.toLowerCase();
  let body;
  if (route === "learn") {
    body = (
      <Learn
        key="learn"
        list={lesson.teach.map((t) => t.primitive)}
        kicker="Inspect · Learn"
        title={`What holds the ${name} together and lets it move.`}
        hint={lesson.teach.length > 1 ? "Its joints work as these mechanisms, one tab each. Play with each one." : "Its joints work as this mechanism. Play with it. Every slider is live."}
        next="Next: take it apart"
        onNext={() => finish("learn")}
      >
        <div className="card" data-mechanisms>
          {lesson.teach.map((t) => (
            <div key={t.primitive.id} className="log-row">
              <span>{t.primitive.name}</span>
              <span>{t.parts.map((p) => p.name).join(", ")} · {t.joints.join(", ")}</span>
            </div>
          ))}
          {movingUnmapped.length > 0 ? <p className="note">{plainSlide(movingUnmapped)}</p> : null}
        </div>
      </Learn>
    );
  } else if (route === "apart") {
    body = <Apart key="apart" lesson={lesson} kit={kit} note={lesson.teach.length === 0 ? structureNote(kit, movingUnmapped) : null} onNext={() => finish("apart")} />;
  } else if (route === "jobs") {
    body = <Jobs key="jobs" lesson={lesson} kit={kit} onNext={() => finish("jobs")} />;
  } else {
    body = <Together key="final" lesson={lesson} kit={kit} done={done.has("final")} onDone={() => setDone((d) => new Set(d).add("final"))} onRestart={onRestart} onHome={onHome} />;
  }
  return (
    <Shell objectName={kit.name} kind="Inspect" photo={photo} steps={steps} onHome={onHome}>
      {body}
    </Shell>
  );
}

function plainSlide(parts: readonly Part[]): string {
  return `${parts.map((p) => p.name).join(" and ")} ${parts.length > 1 ? "slide" : "slides"} in place. The library has no primitive for a plain slide yet, so that motion is shown but not taught.`;
}

function structureNote(kit: Kit, movingUnmapped: readonly Part[]): string {
  if (movingUnmapped.length > 0) return `None of its joints is a mechanism in the library. ${plainSlide(movingUnmapped)}`;
  const joints = [...new Set(kit.parts.flatMap((p) => (p.joint ? [p.joint] : [])))];
  if (joints.length === 0) return `The ${kit.name.toLowerCase()} is one piece. It has no moving mechanism, so there is nothing to tune or test.`;
  return `The ${kit.name.toLowerCase()} is a structure with no moving mechanism. Its parts are joined by ${joints.join(" and ")} joints, which hold still, so there is nothing to tune or test. Take it apart and see what each part is for.`;
}

/** The object with every part present, drawn the same way on each Inspect page. */
function useObject(kit: Kit) {
  return useMemo(() => {
    const present = kit.parts.map((p) => p.id);
    const centre = restCentre(kit, present, EMPTY_SCENE);
    const draw = (explode: number, pink: ReadonlySet<string>) => drawObject({ kit, present, scene: EMPTY_SCENE, explode, pink, centre });
    const none = new Set<string>();
    return { draw, subject: (explode: number) => draw(explode, none) };
  }, [kit]);
}

function jointLine(kit: Kit, part: Part): string {
  if (!part.parentId || !part.joint) return "The main part. Everything else attaches to it.";
  const parent = kit.parts.find((p) => p.id === part.parentId)?.name ?? part.parentId;
  const primitive = JOINT_PRIMITIVE[part.joint];
  const how = primitive ? `That joint works as a ${primitive}.` : FIXED.has(part.joint) ? "A fixed joint: it holds still." : "It moves, but not as a mechanism in the library.";
  return `Joined to the ${parent.toLowerCase()} by a ${part.joint} joint. ${how}`;
}

function Apart({ lesson, kit, note, onNext }: { lesson: Inspect; kit: Kit; note: string | null; onNext: () => void }) {
  const object = useObject(kit);
  const [explode, setExplode] = useState(0);
  const [picked, setPicked] = useState<Part | null>(null);
  const [looked, setLooked] = useState<ReadonlySet<string>>(new Set());
  const all = looked.size === kit.parts.length;
  return (
    <main className="page" data-stage="apart">
      <Header kicker="Inspect · Take it apart" title={`What each part of the ${kit.name.toLowerCase()} does.`} />
      {note ? <div className="card" data-structure><p>{note}</p></div> : null}
      <p className="hint">Pull Explode to separate the parts. Tap each part to see its job.</p>
      <Viewer name={lesson.objectName} parts={object.draw(explode, new Set(picked ? [picked.id] : []))} subject={object.subject(explode)} height={400} />
      <ExplodeSlider value={explode} onChange={setExplode} />
      <div className="pchips">
        {kit.parts.map((p) => (
          <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={picked?.id === p.id ? "" : undefined} data-seen={looked.has(p.id) ? "" : undefined} onClick={() => { setPicked(p); setLooked((s) => new Set(s).add(p.id)); }}>{p.name}</button>
        ))}
      </div>
      {picked ? (
        <section className="card" data-role={picked.id}>
          <span className="mono" style={{ color: COLOR.focus }}>{picked.name}</span>
          <p>{picked.role}</p>
          <p className="note">{jointLine(kit, picked)}</p>
        </section>
      ) : (
        <p className="log-empty">Tap a part.</p>
      )}
      <span className="mono">Looked at {looked.size} of {kit.parts.length} parts</span>
      <button type="button" className="btn" data-next disabled={!all} onClick={onNext}>{all ? "Next: name the jobs" : "Look at every part first"}</button>
    </main>
  );
}

function Jobs({ lesson, kit, onNext }: { lesson: Inspect; kit: Kit; onNext: () => void }) {
  const object = useObject(kit);
  const [explode, setExplode] = useState(1);
  const [at, setAt] = useState(0);
  const [tapped, setTapped] = useState<Part | null>(null);
  const prompt = lesson.prompts[at]!;
  const right = tapped?.id === prompt.id;
  const last = at === lesson.prompts.length - 1;
  return (
    <main className="page" data-stage="jobs">
      <Header kicker={`Inspect · Name the jobs · ${at + 1} of ${lesson.prompts.length}`} title="Which part does this?" />
      <blockquote className="prompt" data-prompt={prompt.id}>{prompt.role}</blockquote>
      <Viewer name={lesson.objectName} parts={object.draw(explode, new Set(tapped ? [tapped.id] : []))} subject={object.subject(explode)} height={360} />
      <ExplodeSlider value={explode} onChange={setExplode} />
      <div className="pchips">
        {kit.parts.map((p) => (
          <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={tapped?.id === p.id ? "" : undefined} disabled={right} onClick={() => setTapped(p)}>{p.name}</button>
        ))}
      </div>
      {tapped ? (
        <p className="note-line" data-note data-found={right ? "" : undefined}>
          {right ? `Yes. The ${tapped.name.toLowerCase()}.` : `No. The ${tapped.name.toLowerCase()}: ${tapped.role}`}
        </p>
      ) : null}
      {right ? (
        <button type="button" className="btn" data-next onClick={() => (last ? onNext() : (setAt(at + 1), setTapped(null)))}>{last ? "Next: piece it together" : "Next job"}</button>
      ) : null}
    </main>
  );
}

function Together({ lesson, kit, done, onDone, onRestart, onHome }: { lesson: Inspect; kit: Kit; done: boolean; onDone: () => void; onRestart: () => void; onHome: () => void }) {
  const object = useObject(kit);
  const alive = useAlive();
  const [explode, setExplodeState] = useState(done ? 0 : 1);
  const ref = useRef(explode);
  const token = useRef(0);
  const setExplode = (v: number) => {
    ref.current = v;
    setExplodeState(v);
    if (v <= 0.02 && !done) onDone();
  };
  const assemble = () => {
    const mine = ++token.current;
    const from = ref.current;
    void play(ASSEMBLE_MS, (ms) => setExplode(lerp(from, 0, smooth(ms / ASSEMBLE_MS))), () => alive() && token.current === mine);
  };
  const mechanisms = lesson.teach.map((t) => t.primitive.name.toLowerCase());
  return (
    <main className="page" data-stage="final">
      <Header kicker="Inspect · Piece it together" title={`Put the ${kit.name.toLowerCase()} back together.`} />
      <Viewer name={lesson.objectName} parts={object.draw(explode, new Set())} subject={object.subject(explode)} height={400} />
      <ExplodeSlider value={explode} onChange={(v) => { token.current++; setExplode(v); }} />
      {done ? (
        <>
          <div className="earned" data-earned>
            <span className="mono" style={{ color: COLOR.focus }}>Taken apart and rebuilt</span>
            <strong>You took apart a {kit.name.toLowerCase()}.</strong>
            <span>
              {kit.parts.length} parts: {listOf(kit.parts.map((p) => p.name.toLowerCase()))}.{" "}
              {mechanisms.length > 0 ? `Its joints work as ${mechanisms.join(" and ")}.` : "No part of it moves against another."}
            </span>
          </div>
          <div className="row">
            <button type="button" className="btn secondary" onClick={onRestart}>Start over</button>
            <button type="button" className="btn" onClick={onHome}>Another object</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn secondary" data-assemble onClick={assemble}>Assemble</button>
      )}
    </main>
  );
}
