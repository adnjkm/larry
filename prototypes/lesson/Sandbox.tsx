import { useMemo, useRef, useState } from "react";
import { formatSlider, PRIMITIVES, type Slider, type Values } from "../../src/primitives/library.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { timelineFor } from "./choreo.ts";
import { lerp, smooth } from "./ease.ts";
import { FINAL_TESTS, type Lesson, presentAfter, TEST_LABEL, type TestId } from "./model.ts";
import { bottleParts, frameBox, type Pose, REST, rigOf } from "./pose.ts";
import { ENGAGE, type Outcome, simulate } from "./sim.ts";
import { Header, SliderRow, Viewer } from "./ui.tsx";

const FRAME_REST = frameBox(-45, 45, 0, 236, 45);
const FRAME_EXPLODED = frameBox(-45, 45, 0, 300, 45);
/** The flip lifts the bottle 90 mm before turning it. */
const FRAME_FLIP = frameBox(-45, 45, 0, 330, 45);
const CLOSE_MS = 350;
const ASSEMBLE_MS = 800;

export type SandboxMode = { kind: "module"; index: number; earned: boolean } | { kind: "final"; done: boolean };

type Props = {
  lesson: Lesson;
  mode: SandboxMode;
  tuning: Values;
  onTune: (next: Values) => void;
  onEarned: () => void;
  onNext: () => void;
};

type Status = "idle" | "pass" | "fail";

export function Sandbox({ lesson, mode, tuning, onTune, onEarned, onNext }: Props) {
  const alive = useAlive();
  const module = mode.kind === "module" ? lesson.modules[mode.index]! : null;
  const tests: TestId[] = module ? module.tests : FINAL_TESTS;
  const present = presentAfter(lesson, mode.kind === "module" ? mode.index : lesson.modules.length - 1);
  const presentKey = present.join(",");
  const rig = useMemo(() => rigOf(lesson.kit, present), [lesson.kit, presentKey]);
  const isFinal = mode.kind === "final";
  const earned = mode.kind === "module" ? mode.earned : mode.done;

  const [explode, setExplodeState] = useState(isFinal ? 1 : 0);
  const explodeRef = useRef(explode);
  const [anim, setAnim] = useState<Pose | null>(null);
  const [running, setRunning] = useState<TestId | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<TestId, Outcome>>>({});
  const outcomesRef = useRef(outcomes);
  const [fails, setFails] = useState(0);
  const [tapped, setTapped] = useState<string | null>(null);
  const [found, setFound] = useState(earned && !isFinal);
  const [note, setNote] = useState<string | null>(null);
  const token = useRef(0);

  const setExplode = (v: number) => {
    explodeRef.current = v;
    setExplodeState(v);
  };

  const tween = async (to: number, ms: number, mine: number) => {
    const from = explodeRef.current;
    await play(ms, (t) => setExplode(lerp(from, to, smooth(t / ms))), () => alive() && token.current === mine);
  };

  const assemble = () => {
    if (running) return;
    void tween(0, ASSEMBLE_MS, ++token.current);
  };

  const runTest = async (test: TestId) => {
    if (running) return;
    const mine = ++token.current;
    setRunning(test);
    if (explodeRef.current > 0.001) await tween(0, CLOSE_MS, mine);
    if (!alive()) return;
    const outcome = simulate(test, tuning);
    const line = timelineFor(outcome, rig);
    await play(line.duration, (ms) => setAnim(line.at(ms)), () => alive() && token.current === mine);
    if (!alive()) return;
    setAnim(null);
    setRunning(null);
    const next = { ...outcomesRef.current, [test]: outcome };
    outcomesRef.current = next;
    setOutcomes(next);
    if (!outcome.pass) setFails((n) => n + 1);
    if (tests.every((t) => next[t]?.pass)) onEarned();
  };

  const tap = (id: string) => {
    setTapped(id);
    if (!module) return;
    if (fails === 0) return setNote("Run a test first and watch what goes wrong.");
    if (id === module.suspect) {
      setFound(true);
      return setNote("That is the part at fault. The fix control below is unlocked.");
    }
    setNote(module.misses[id] ?? module.missDefault);
  };

  const primitive = module ? PRIMITIVES.find((p) => p.id === module.fault.primitive) : undefined;
  const slider: Slider | undefined = module ? primitive?.sliders.find((s) => s.id === module.fault.slider) : undefined;
  const hintsShown = module ? Math.min(fails, module.hints.length) : 0;
  const revealed = module ? hintsShown === module.hints.length : false;

  const tune = (value: number) => {
    if (!module) return;
    outcomesRef.current = {};
    setOutcomes({});
    onTune({ ...tuning, [module.fault.slider]: value });
  };

  const pink = new Set(tapped ? [tapped] : mode.kind === "module" && mode.earned ? module!.produces : []);
  const pose: Pose = { ...(anim ?? REST), explode };
  const parts = bottleParts(lesson.kit, present, pose, pink);
  const status = (t: TestId): Status => {
    const o = outcomes[t];
    return o ? (o.pass ? "pass" : "fail") : "idle";
  };
  const closed = explode <= 0.02;
  const blocked = isFinal && !closed;
  const frame = running === "flip" ? FRAME_FLIP : explode > 0.02 ? FRAME_EXPLODED : FRAME_REST;
  const lines = tests.flatMap((t) => (outcomes[t] ? [outcomes[t]] : []));
  const readoutValues: Values = { ...tuning, turns: ENGAGE / (tuning.pitch ?? 4) };

  return (
    <main className="page" data-stage={mode.kind === "module" ? (mode.earned ? "earned" : "sandbox") : "final"}>
      <Header kicker={mode.kind === "module" ? `Module ${mode.index + 1} · Sandbox` : "Piece it together"} title={module ? module.need : lesson.final.need} />
      <Viewer name={lesson.objectName} parts={parts} frame={frame} height={420} live={anim?.live} />

      <label className="slider" data-explode>
        <span className="mono">Explode</span>
        <span className="track">
          <input type="range" min={0} max={1} step={0.01} value={explode} disabled={running !== null} onChange={(e) => { token.current++; setExplode(Number(e.target.value)); }} />
        </span>
        <span className="val">{Math.round(explode * 100)}%</span>
      </label>
      {isFinal && !earned ? (
        <button type="button" className="btn secondary" data-assemble disabled={closed || running !== null} onClick={assemble}>Assemble</button>
      ) : null}

      <div className="tests">
        {tests.map((t) => (
          <button key={t} type="button" className="test" data-test={t} data-status={status(t)} disabled={running !== null || blocked} onClick={() => void runTest(t)}>
            <span className="dot" />
            {TEST_LABEL[t]}
          </button>
        ))}
      </div>
      {blocked ? <p className="hint">Pull Explode back to 0, or tap Assemble, before you test it.</p> : null}

      <div className="log" aria-live="polite" data-log>
        {lines.length === 0 ? (
          <span className="log-empty">Run a test. The bottle does it, and the result lands here.</span>
        ) : (
          lines.map((o) => (
            <div key={o.test} className="log-row" data-result={o.test}>
              <span>{TEST_LABEL[o.test]}</span>
              <span className={o.pass ? undefined : "bad"}>{o.says}</span>
            </div>
          ))
        )}
      </div>

      {module && !earned ? (
        <section className="card" data-guide>
          <span className="mono">Find the fault</span>
          {hintsShown === 0 ? <p>Run a test and watch what goes wrong.</p> : null}
          {module.hints.slice(0, hintsShown).map((h, i) => (
            <p key={h} className="hintline" data-hint={i + 1} data-latest={i === hintsShown - 1 ? "" : undefined}>
              <b>{i + 1}</b>
              {h}
            </p>
          ))}
          {lines.flatMap((o) => (o.test === "open" && !o.pass && o.nudge ? [o.nudge] : [])).map((n) => <p key={n} className="hintline"><b>!</b>{n}</p>)}
          <span className="mono">Which part is at fault? Tap it.</span>
          <div className="pchips">
            {lesson.kit.parts.filter((p) => present.includes(p.id)).map((p) => (
              <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={tapped === p.id ? "" : undefined} onClick={() => tap(p.id)}>{p.name}</button>
            ))}
          </div>
          {note ? <p className="note-line" data-note data-found={found ? "" : undefined}>{note}</p> : null}
        </section>
      ) : null}

      {module && primitive && slider ? (
        <section className="card fix" data-fix data-locked={found ? undefined : ""}>
          <span className="mono">Fix · {primitive.name}</span>
          <SliderRow slider={slider} value={tuning[slider.id] ?? slider.initial} onChange={tune} disabled={!found || earned} band={revealed ? module.fix.window : undefined} />
          {found ? null : <p className="hint">Locked until you find the part at fault.</p>}
          {found && revealed
            ? primitive.readouts(readoutValues).map((r) => (
                <div key={r.label} className="log-row">
                  <span>{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))
            : null}
          <p className="note">{module.gameNote}</p>
        </section>
      ) : null}

      {isFinal ? (
        <div className="log">
          {lesson.modules.map((m) => {
            const s = primitiveSlider(m.fault.primitive, m.fault.slider);
            return s ? <div key={m.id} className="log-row"><span>{m.title}</span><span>{s.label} {formatSlider(s, tuning[s.id] ?? s.initial)}</span></div> : null;
          })}
        </div>
      ) : null}

      {earned && module ? (
        <>
          <div className="earned" data-earned>
            <span className="mono" style={{ color: COLOR.focus }}>Requirement met · part earned</span>
            <strong>{module.produces.map((id) => lesson.kit.parts.find((p) => p.id === id)?.name ?? id).join(" and ")}</strong>
            <span>{module.why}</span>
          </div>
          <button type="button" className="btn" data-next onClick={onNext}>{mode.kind === "module" && mode.index < lesson.modules.length - 1 ? "Next module" : "Piece it together"}</button>
        </>
      ) : null}
      {isFinal && earned ? (
        <>
          <div className="earned" data-earned>
            <span className="mono" style={{ color: COLOR.focus }}>Every requirement met</span>
            <strong>{lesson.final.success}</strong>
            <span>It stays shut when shaken, stays dry upside down, and opens by hand, with the parts you earned: {lesson.kit.parts.map((p) => p.name).join(", ")}.</span>
          </div>
          <button type="button" className="btn secondary" onClick={onNext}>Start over</button>
        </>
      ) : null}
    </main>
  );
}

function primitiveSlider(primitive: string, slider: string): Slider | undefined {
  return PRIMITIVES.find((p) => p.id === primitive)?.sliders.find((s) => s.id === slider);
}
