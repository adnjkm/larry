import { useMemo, useRef, useState } from "react";
import type { Joint, Kit, Part } from "../../shared/kit.ts";
import { play, useAlive } from "./anim.ts";
import { lerp, smooth } from "./ease.ts";
import { Learn } from "./Learn.tsx";
import { JOINT_PRIMITIVE } from "./lessons/inspect.ts";
import { EMPTY_SCENE, type Inspect, listOf } from "./model.ts";
import { drawObject, restCentre } from "./pose.ts";
import { Actions, ExplodeSlider, Say, Shell, type Step, Viewer, Why } from "./ui.tsx";

type Route = "learn" | "apart" | "jobs" | "final";
const FIXED: ReadonlySet<Joint> = new Set(["rivet", "glue", "weld", "molded"]);
const ASSEMBLE_MS = 800;

/** For an object with no hand-written rules: learn its real mechanisms, take it apart, name each part's job, put it back. */
export function InspectFlow({ lesson, kit, photo, onHome, onRestart }: { lesson: Inspect; kit: Kit; photo: string; onHome: () => void; onRestart: () => void }) {
  const routes: Route[] = lesson.teach.length > 0 ? ["learn", "apart", "jobs", "final"] : ["apart", "jobs", "final"];
  const [route, setRoute] = useState<Route>(routes[0]!);
  const [done, setDone] = useState<ReadonlySet<Route>>(new Set());

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
  let body;
  if (route === "learn") {
    body = (
      <Learn
        key="learn"
        list={lesson.teach.map((t) => t.primitive)}
        kicker="Learn"
        next="Next: take it apart"
        view={lesson.view}
        inObject={(p) => {
          const t = lesson.teach.find((q) => q.primitive === p)!;
          return { line: t.parts[0]!.role, parts: drawWhole(kit, 0, new Set(t.parts.map((q) => q.id))) };
        }}
        onNext={() => finish("learn")}
      />
    );
  } else if (route === "apart") {
    body = <Apart key="apart" lesson={lesson} kit={kit} note={lesson.teach.length === 0 ? structureNote(kit, movingUnmapped) : null} slide={lesson.teach.length > 0 && movingUnmapped.length > 0 ? plainSlide(movingUnmapped) : null} onNext={() => finish("apart")} />;
  } else if (route === "jobs") {
    body = <Jobs key="jobs" lesson={lesson} kit={kit} onNext={() => finish("jobs")} />;
  } else {
    body = <Together key="final" lesson={lesson} kit={kit} done={done.has("final")} onDone={() => setDone((d) => new Set(d).add("final"))} onRestart={onRestart} onHome={onHome} />;
  }
  return (
    <Shell objectName={kit.name} photo={photo} steps={steps} onHome={onHome}>
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
function drawWhole(kit: Kit, explode: number, pink: ReadonlySet<string>): Part[] {
  const present = kit.parts.map((p) => p.id);
  return drawObject({ kit, present, scene: EMPTY_SCENE, explode, pink, centre: restCentre(kit, present, EMPTY_SCENE) });
}

function useObject(kit: Kit) {
  return useMemo(() => {
    const none = new Set<string>();
    return { draw: (explode: number, pink: ReadonlySet<string>) => drawWhole(kit, explode, pink), subject: (explode: number) => drawWhole(kit, explode, none) };
  }, [kit]);
}

function jointLine(kit: Kit, part: Part): string {
  if (!part.parentId || !part.joint) return "The main part. Everything else attaches to it.";
  const parent = kit.parts.find((p) => p.id === part.parentId)?.name ?? part.parentId;
  const primitive = JOINT_PRIMITIVE[part.joint];
  const how = primitive ? `That joint works as a ${primitive}.` : FIXED.has(part.joint) ? "A fixed joint: it holds still." : "It moves, but not as a mechanism in the library.";
  return `Joined to the ${parent.toLowerCase()} by a ${part.joint} joint. ${how}`;
}

function Apart({ lesson, kit, note, slide, onNext }: { lesson: Inspect; kit: Kit; note: string | null; slide: string | null; onNext: () => void }) {
  const object = useObject(kit);
  const [explode, setExplode] = useState(0);
  const [picked, setPicked] = useState<Part | null>(null);
  const [looked, setLooked] = useState<ReadonlySet<string>>(new Set());
  const all = looked.size === kit.parts.length;
  return (
    <main className="page" data-stage="apart">
      <Say
        kicker={`Take it apart · ${looked.size} of ${kit.parts.length} seen`}
        note={picked !== null}
        why={
          <Why title="Take it apart">
            {note ? <p className="sheet-lead" data-structure>{note}</p> : null}
            {slide ? <p>{slide}</p> : null}
            {picked ? <p data-joint>{jointLine(kit, picked)}</p> : <p>Pull Explode to separate the parts. Tap each part to see its job.</p>}
          </Why>
        }
      >
        {picked ? <span data-role={picked.id}><b>{picked.name}.</b> {picked.role}</span> : "Tap each part to see its job."}
      </Say>
      <Viewer parts={object.draw(explode, new Set(picked ? [picked.id] : []))} subject={object.subject(explode)} view={lesson.view} />
      <ExplodeSlider value={explode} onChange={setExplode} />
      <div className="pchips">
        {kit.parts.map((p) => (
          <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={picked?.id === p.id ? "" : undefined} data-seen={looked.has(p.id) ? "" : undefined} onClick={() => { setPicked(p); setLooked((s) => new Set(s).add(p.id)); }}>{p.name}</button>
        ))}
      </div>
      <Actions>
        <button type="button" className="btn" data-next disabled={!all} onClick={onNext}>Next: name the jobs</button>
      </Actions>
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
      <Say kicker={`Which part does this? · ${at + 1} of ${lesson.prompts.length}`}>
        <q className="prompt" data-prompt={prompt.id}>{prompt.role}</q>
      </Say>
      <Viewer parts={object.draw(explode, new Set(tapped ? [tapped.id] : []))} subject={object.subject(explode)} view={lesson.view} />
      <ExplodeSlider value={explode} onChange={setExplode} />
      <div className="pchips">
        {kit.parts.map((p) => (
          <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={tapped?.id === p.id ? "" : undefined} disabled={right} onClick={() => setTapped(p)}>{p.name}</button>
        ))}
      </div>
      <p className="result" data-note={tapped ? "" : undefined} data-found={right ? "" : undefined} aria-live="polite">
        {tapped ? (right ? `Yes. The ${tapped.name.toLowerCase()}.` : `No. That is the ${tapped.name.toLowerCase()}.`) : "\u00a0"}
      </p>
      <Actions>
        <button type="button" className="btn" data-next disabled={!right} onClick={() => (last ? onNext() : (setAt(at + 1), setTapped(null)))}>{last ? "Next: piece it together" : "Next job"}</button>
      </Actions>
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
  const name = kit.name.toLowerCase();
  return (
    <main className="page" data-stage="final">
      <Say
        kicker="Piece it together"
        found={done}
        why={
          <Why title="Piece it together">
            <p>
              {kit.parts.length} parts: {listOf(kit.parts.map((p) => p.name.toLowerCase()))}.{" "}
              {mechanisms.length > 0 ? `Its joints work as ${mechanisms.join(" and ")}.` : "No part of it moves against another."}
            </p>
          </Why>
        }
      >
        {done ? `You took apart a ${name}.` : `Put the ${name} back together.`}
      </Say>
      <Viewer parts={object.draw(explode, new Set())} subject={object.subject(explode)} view={lesson.view} />
      <ExplodeSlider value={explode} onChange={(v) => { token.current++; setExplode(v); }} />
      {done ? null : <button type="button" className="btn secondary" data-assemble onClick={assemble}>Assemble</button>}
      <Actions>
        <button type="button" className="btn secondary" disabled={!done} onClick={onRestart}>Start over</button>
        <button type="button" className="btn" data-next disabled={!done} onClick={onHome}>Another object</button>
      </Actions>
    </main>
  );
}
