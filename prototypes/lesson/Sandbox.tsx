import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { formatSlider, initialValues } from "../../src/primitives/library.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { play, useAlive } from "./anim.ts";
import { lerp, smooth } from "./ease.ts";
import { listOf, type Module, type Overlay, passBand, presentAfter, type Run, type Test, type Values, type Verdict, type Workshop } from "./model.ts";
import { compose, drawObject, enclosed, restCentre } from "./pose.ts";
import { ExplodeSlider, Header, SliderRow, Viewer } from "./ui.tsx";

const CLOSE_MS = 350;
const ASSEMBLE_MS = 800;
const REVEAL_MS = 700;
/** Frames sampled from a test to size the camera before it starts, so it holds still through the test. */
const FRAME_SAMPLES = 48;
/** Time for the camera to make room for a test before the object moves. */
const CAMERA_MS = 300;

export type SandboxMode = { kind: "module"; index: number; earned: boolean } | { kind: "final"; done: boolean };

type Props = {
  lesson: Workshop;
  kit: Kit;
  mode: SandboxMode;
  tuning: Values;
  onTune: (next: Values) => void;
  onEarned: () => void;
  onNext: () => void;
  onHome: () => void;
};

type Status = "idle" | "pass" | "fail";

export function Sandbox({ lesson, kit, mode, tuning, onTune, onEarned, onNext, onHome }: Props) {
  const alive = useAlive();
  const module = mode.kind === "module" ? lesson.modules[mode.index]! : null;
  const tests: readonly Test[] = module ? module.tests : lesson.final.tests;
  const isFinal = mode.kind === "final";
  const earned = mode.kind === "module" ? mode.earned : mode.done;
  const index = mode.kind === "module" ? mode.index : lesson.modules.length - 1;

  const world = useMemo(() => {
    const present = presentAfter(lesson, kit, index);
    const rest = lesson.rest({ kit, present });
    const centre = restCentre(kit, present, rest);
    const ctx = { kit, present, centre };
    const draw = (overlay: Overlay | null, explode: number, pink: ReadonlySet<string>) =>
      drawObject({ kit, present, scene: overlay ? compose(rest, overlay) : rest, rigid: overlay?.rigid, explode, pink, centre, apart: lesson.apart });
    const none = new Set<string>();
    const hidden = module ? module.produces.some((id) => enclosed(id, draw(null, 0, none))) : false;
    /** Every pose a run passes through, so the camera can make room for the whole test and hold still through it. */
    const reach = (run: Run): Part[] => [...draw(null, 0, none), ...Array.from({ length: FRAME_SAMPLES + 1 }, (_, i) => draw(run.at((run.durationMs * i) / FRAME_SAMPLES), 0, none)).flat()];
    return { present, ctx, draw, hidden, reach };
  }, [lesson, kit, index, module]);

  const [explode, setExplodeState] = useState(isFinal ? 1 : 0);
  const explodeRef = useRef(explode);
  const [anim, setAnim] = useState<Overlay | null>(null);
  const [reach, setReach] = useState<Part[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Verdict>>>({});
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

  // A part earned inside another would be pink out of sight, so the object comes apart to show it.
  const revealEarned = mode.kind === "module" && mode.earned && world.hidden;
  useEffect(() => {
    if (revealEarned) void tween(1, REVEAL_MS, ++token.current);
  }, [revealEarned]);

  const assemble = () => {
    if (running) return;
    void tween(0, ASSEMBLE_MS, ++token.current);
  };

  const runTest = async (test: Test) => {
    if (running) return;
    const mine = ++token.current;
    setRunning(test.id);
    if (explodeRef.current > 0.001) await tween(0, CLOSE_MS, mine);
    if (!alive()) return;
    const run = test.run(tuning, world.ctx);
    setReach(world.reach(run));
    await play(CAMERA_MS, () => {}, () => alive() && token.current === mine);
    await play(run.durationMs, (ms) => setAnim(run.at(ms)), () => alive() && token.current === mine);
    if (!alive()) return;
    setAnim(null);
    setReach(null);
    setRunning(null);
    const next = { ...outcomesRef.current, [test.id]: run.verdict };
    outcomesRef.current = next;
    setOutcomes(next);
    if (!run.verdict.pass) setFails((n) => n + 1);
    if (tests.every((t) => next[t.id]?.pass)) onEarned();
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

  const hintsShown = module ? Math.min(fails, HINT_COUNT) : 0;
  const revealed = hintsShown === HINT_COUNT;
  const band = useMemo(() => (module && revealed ? passBand(module, tuning, world.ctx) : null), [module, revealed, tuning, world.ctx]);

  const tune = (value: number) => {
    if (!module) return;
    outcomesRef.current = {};
    setOutcomes({});
    onTune({ ...tuning, [module.fault.slider.id]: value });
  };

  const pink = new Set(tapped ? [tapped] : mode.kind === "module" && mode.earned ? module!.produces : []);
  const parts = world.draw(anim, explode, pink);
  const subject = useMemo(() => reach ?? world.draw(null, explode, new Set()), [reach, world, explode]);
  const status = (t: Test): Status => {
    const o = outcomes[t.id];
    return o ? (o.pass ? "pass" : "fail") : "idle";
  };
  const closed = explode <= 0.02;
  const blocked = isFinal && !closed;
  const lines = tests.flatMap((t) => {
    const o = outcomes[t.id];
    return o ? [{ test: t, verdict: o }] : [];
  });
  const shownParts = kit.parts.filter((p) => world.present.includes(p.id));
  const object = lesson.objectName.toLowerCase();

  return (
    <main className="page" data-stage={mode.kind === "module" ? (mode.earned ? "earned" : "sandbox") : "final"}>
      <Header kicker={mode.kind === "module" ? `Module ${mode.index + 1} · Test and fix` : "Final · Piece it together"} title={module ? module.need : lesson.final.need} />
      <Viewer name={lesson.objectName} parts={parts} subject={subject} height={420} live={anim?.live} />
      <ExplodeSlider value={explode} disabled={running !== null} onChange={(v) => { token.current++; setExplode(v); }} />
      {isFinal && !earned ? (
        <button type="button" className="btn secondary" data-assemble disabled={closed || running !== null} onClick={assemble}>Assemble</button>
      ) : null}

      <div className="tests">
        {tests.map((t) => (
          <button key={t.id} type="button" className="test" data-test={t.id} data-status={status(t)} disabled={running !== null || blocked} onClick={() => void runTest(t)}>
            <span className="dot" />
            {t.label}
          </button>
        ))}
      </div>
      {blocked ? <p className="hint">Pull Explode back to 0, or tap Assemble, before you test it.</p> : null}

      <div className="log" aria-live="polite" data-log>
        {lines.length === 0 ? (
          <span className="log-empty">Run a test. The {object} does it, and the result lands here.</span>
        ) : (
          lines.map(({ test, verdict }) => (
            <div key={test.id} className="log-row" data-result={test.id}>
              <span>{test.label}</span>
              <span className={verdict.pass ? undefined : "bad"}>{verdict.line}</span>
            </div>
          ))
        )}
      </div>

      {module && !earned ? (
        <section className="card" data-guide>
          <span className="mono">Find the fault</span>
          {hintsShown === 0 ? <p>Run a test and watch what goes wrong.</p> : null}
          {hintsShown >= 1 ? <Hint n={1} latest={hintsShown === 1}>{module.hints.observe}</Hint> : null}
          {hintsShown >= 2 ? <Hint n={2} latest={hintsShown === 2}>{module.hints.principle}</Hint> : null}
          {hintsShown >= 3 ? (
            <Hint n={3} latest>
              {module.hints.direction}
              <span className="side"><b>Too low</b>{module.hints.low}</span>
              <span className="side"><b>Too high</b>{module.hints.high}</span>
              The band on the slider marks the values that pass at your current settings.
            </Hint>
          ) : null}
          {lines.flatMap(({ verdict }) => (!verdict.pass && verdict.nudge ? [verdict.nudge] : [])).map((n) => <p key={n} className="hintline"><b>!</b>{n}</p>)}
          <span className="mono">Which part is at fault? Tap it.</span>
          <div className="pchips">
            {shownParts.map((p) => (
              <button key={p.id} type="button" className="pchip" data-part={p.id} data-on={tapped === p.id ? "" : undefined} onClick={() => tap(p.id)}>{p.name}</button>
            ))}
          </div>
          {note ? <p className="note-line" data-note data-found={found ? "" : undefined}>{note}</p> : null}
        </section>
      ) : null}

      {module ? (
        <section className="card fix" data-fix data-locked={found ? undefined : ""}>
          <span className="mono">Fix · {module.fault.primitive.name}</span>
          <SliderRow slider={module.fault.slider} value={tuning[module.fault.slider.id] ?? module.fault.start} onChange={tune} disabled={!found || earned} band={band ?? undefined} />
          {found ? (
            <div className="readouts" data-readouts>
              <span className="mono">{module.fault.primitive.name}, as in Learn</span>
              {module.fault.primitive.readouts(readoutValues(module, tuning)).map((r) => (
                <div key={r.label} className="log-row">
                  <span>{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
              <span className="mono">In the {object}</span>
              {module.numbers(tuning).map((r) => (
                <div key={r.label} className="log-row" data-number>
                  <span>{r.label}</span>
                  <span>{r.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">Locked until you find the part at fault.</p>
          )}
          <p className="note">{module.gameNote}</p>
        </section>
      ) : null}

      {isFinal ? (
        <div className="log">
          {lesson.modules.map((m) => (
            <div key={m.id} className="log-row"><span>{m.title}</span><span>{m.fault.slider.label} {formatSlider(m.fault.slider, tuning[m.fault.slider.id] ?? m.fault.start)}</span></div>
          ))}
        </div>
      ) : null}

      {earned && module ? (
        <>
          <div className="earned" data-earned>
            <span className="mono" style={{ color: COLOR.focus }}>Requirement met · part earned</span>
            <strong>{listOf(module.produces.map((id) => kit.parts.find((p) => p.id === id)?.name ?? id))}</strong>
            <span>{module.why}</span>
          </div>
          <button type="button" className="btn" data-next onClick={onNext}>Next: {(lesson.modules[index + 1]?.title ?? "Piece it together").toLowerCase()}</button>
        </>
      ) : null}
      {isFinal && earned ? (
        <>
          <div className="earned" data-earned>
            <span className="mono" style={{ color: COLOR.focus }}>Every requirement met</span>
            <strong>{lesson.final.success}</strong>
            <span>{lesson.final.detail} {kit.parts.length} parts: {listOf(kit.parts.map((p) => p.name.toLowerCase()))}.</span>
          </div>
          <div className="row">
            <button type="button" className="btn secondary" onClick={onNext}>Start over</button>
            <button type="button" className="btn" onClick={onHome}>Another object</button>
          </div>
        </>
      ) : null}
    </main>
  );
}

const HINT_COUNT = 3;

function Hint({ n, latest, children }: { n: number; latest: boolean; children: ReactNode }) {
  return (
    <p className="hintline" data-hint={n} data-latest={latest ? "" : undefined}>
      <b>{n}</b>
      <span>{children}</span>
    </p>
  );
}

function readoutValues(module: Module, tuning: Values): Values {
  const value = tuning[module.fault.slider.id] ?? module.fault.start;
  return { ...initialValues(module.fault.primitive), [module.fault.slider.id]: value, ...module.readoutWith?.(value) };
}
