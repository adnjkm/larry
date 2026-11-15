import { useEffect, useMemo, useRef, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { play, useAlive } from "./anim.ts";
import { useExplode } from "./useExplode.ts";
import { type Overlay, presentAfter, type Run, type Shares, STILL, type Story, type Test, type Values, type Verdict } from "./model.ts";
import { compose, drawObject, restCentre } from "./pose.ts";
import { Cheer } from "./Cheer.tsx";
import { Actions, ExplodeSlider, Need, Say, Strip, TURNS, Viewer, Why } from "./ui.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";

const FRAME_SAMPLES = 48;
const CAMERA_MS = 300;

/**
 * The three story screens that run tests on the object. `problem` shows it failing without the
 * module's part; `play` hands the player the control with the part built; `final` runs every test.
 */
export type PlayMode = { kind: "problem"; index: number; seen: boolean } | { kind: "play"; index: number; earned: boolean } | { kind: "final"; done: boolean };

type Props = {
  story: Story;
  kit: Kit;
  mode: PlayMode;
  values: Values;
  onValues: (next: Values) => void;
  onDone: () => void;
  onNext: () => void;
  onHome: () => void;
};

type Status = "idle" | "pass" | "fail";

export function Play({ story, kit, mode, values, onValues, onDone, onNext, onHome }: Props) {
  const alive = useAlive();
  const module = mode.kind === "final" ? null : story.modules[mode.index]!;
  const control = module ? module.play.control : story.final.control;
  const tests: readonly Test[] = mode.kind === "problem" ? [module!.without.test] : module ? module.play.tests : story.final.tests;
  const done = mode.kind === "problem" ? mode.seen : mode.kind === "play" ? mode.earned : mode.done;
  // The problem runs at its own fixed values; the player's control only exists once the part is built.
  const tuning = mode.kind === "problem" ? { ...values, ...module!.without.values } : values;
  const value = tuning[control.key] ?? control.start;

  const world = useMemo(() => {
    const present =
      mode.kind === "problem"
        ? [...presentAfter(story, kit, mode.index - 1), ...module!.without.adds]
        : presentAfter(story, kit, mode.kind === "play" ? mode.index : story.modules.length - 1);
    const rest = story.rest({ kit, present });
    const centre = restCentre(kit, present, rest);
    const ctx = { kit, present, centre };
    const pink = new Set(mode.kind === "play" ? module!.produces : []);
    const draw = (overlay: Overlay, explode: number | Shares) =>
      drawObject({ kit, present, scene: compose(rest, overlay), rigid: overlay.rigid, explode, plan: story.explode, pink, centre, apart: story.apart });
    const held = (v: number): Overlay => ({ ...control.pose(v, ctx), rigid: STILL, live: "" });
    const reach = (run: Run, v: number): Part[] => [
      ...draw(held(v), 0),
      ...Array.from({ length: FRAME_SAMPLES + 1 }, (_, i) => draw(run.at((run.durationMs * i) / FRAME_SAMPLES), 0)).flat(),
    ];
    return { present, ctx, draw, held, reach, zones: control.zones(ctx) };
  }, [story, kit, mode.kind, mode.kind === "final" ? -1 : mode.index, module, control]);

  // A fix that just started working gets a short pop. Only the change counts, so coming back to a
  // finished step stays quiet.
  const [cheers, setCheers] = useState(0);
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && mode.kind !== "problem") setCheers((n) => n + 1);
    wasDone.current = done;
  }, [done, mode.kind]);
  const cheer = module ? module.cheer : story.final.cheer;

  // The final screen opens up on arrival, so the parts it names are all in view.
  const explode = useExplode(story.explode, mode.kind === "final" ? 1 : 0);
  const [anim, setAnim] = useState<Overlay | null>(null);
  const [reach, setReach] = useState<Part[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [arming, setArming] = useState(false);
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Verdict>>>({});
  const outcomesRef = useRef(outcomes);
  const [fails, setFails] = useState(0);
  const [readAhead, setReadAhead] = useState(0);
  const token = useRef(0);

  const runTest = async (test: Test) => {
    if (running) return;
    const mine = ++token.current;
    setRunning(test.id);
    // Armed first: a test never starts on a half-open bottle, so it closes up and waits for every part to land.
    if (!explode.home()) {
      setArming(true);
      explode.set(0);
      if (!(await explode.settled(alive))) return;
      setArming(false);
    }
    const run = test.run(tuning, world.ctx);
    setReach(world.reach(run, value));
    await play(
      CAMERA_MS,
      () => {},
      () => alive() && token.current === mine,
    );
    await play(
      run.durationMs,
      (ms) => setAnim(run.at(ms)),
      () => alive() && token.current === mine,
    );
    if (!alive()) return;
    setAnim(null);
    setReach(null);
    setRunning(null);
    const next = { ...outcomesRef.current, [test.id]: run.verdict };
    outcomesRef.current = next;
    setOutcomes(next);
    if (!run.verdict.pass) setFails((n) => n + 1);
    if (mode.kind === "problem" || tests.every((t) => next[t.id]?.pass)) onDone();
  };

  const turn = (v: number) => {
    outcomesRef.current = {};
    setOutcomes({});
    onValues({ ...values, [control.key]: v });
  };

  const status = (t: Test): Status => {
    const o = outcomes[t.id];
    return o ? (o.pass ? "pass" : "fail") : "idle";
  };
  const closed = explode.target === 0;
  const blocked = mode.kind === "final" && !closed;
  const parts = world.draw(anim ?? world.held(value), explode.shown);
  // The camera, and the shadow sized from the same box, hold still while Explode or the grip moves:
  // the box already holds the object together and fully apart, at both ends of the grip.
  const still = useMemo(() => {
    const ends = [0, world.zones[world.zones.length - 1]?.until ?? value];
    return ends.flatMap((v) => [...world.draw(world.held(v), 0), ...world.draw(world.held(v), 1)]);
  }, [world]);
  const subject = useMemo(() => (reach ? [...still, ...reach] : still), [reach, still]);

  const say =
    mode.kind === "problem"
      ? done
        ? module!.without.line
        : module!.without.say
      : mode.kind === "play"
        ? done
          ? module!.job
          : module!.play.say
        : done
          ? story.final.success
          : blocked
            ? "Put it back together first."
            : story.final.say;
  const kicker = mode.kind === "problem" ? `${module!.title} · Without it` : mode.kind === "play" ? `${module!.title} · Make it work` : story.final.title;

  const hints = module?.hints ?? [];
  const shown = mode.kind === "play" && !done ? Math.min(Math.max(fails, readAhead), hints.length) : 0;
  const hinting = mode.kind === "play" && !done;
  const sheet = (
    <Why label={hinting ? "Hint" : "Why?"} title={module ? module.title : story.final.title}>
      {hinting ? (
        <div className="hints" data-guide-hints>
          {shown === 0 ? <p>Try it first and watch what happens.</p> : null}
          {hints.slice(0, shown).map((h, i) => (
            <p key={h} className="hintline" data-hint={i + 1} data-latest={i === shown - 1 ? "" : undefined}>
              <b>•</b>
              <span>{h}</span>
            </p>
          ))}
          {shown < hints.length ? (
            <button type="button" className="link" data-next-hint onClick={() => setReadAhead(shown + 1)}>
              Next hint
            </button>
          ) : null}
        </div>
      ) : null}
      <div data-why-text>
        {(module ? module.why : story.final.why).map((line, i) => (
          <p key={line} className={i === 0 && !hinting ? "sheet-lead" : undefined}>
            {line}
          </p>
        ))}
      </div>
    </Why>
  );

  const nextLabel =
    mode.kind === "problem"
      ? "Next: learn the fix"
      : mode.kind === "play"
        ? `Next: ${(story.modules[mode.index + 1]?.title ?? story.final.title).toLowerCase()}`
        : "";
  const stage = mode.kind === "problem" ? "problem" : mode.kind === "play" ? (done ? "earned" : "play") : "final";

  return (
    <main className="page" data-stage={stage}>
      {mode.kind === "problem" && module!.need ? <Need text={module!.need} /> : null}
      <Say kicker={kicker} why={sheet} found={done && mode.kind !== "problem"} note={mode.kind === "problem" && done}>
        {say}
      </Say>
      <Viewer parts={parts} subject={subject} view={story.view} live={anim?.live || (arming ? "Closing up…" : undefined)} />
      <Cheer text={cheer} show={cheers} />
      <ExplodeSlider
        value={explode.target}
        disabled={running !== null}
        onChange={(v) => {
          token.current++;
          explode.set(v);
        }}
      />
      {mode.kind === "problem" ? null : (
        <Strip
          id={control.key}
          label={control.verb}
          wheel={TURNS.test(control.verb)}
          value={value}
          min={0}
          max={world.zones[world.zones.length - 1]!.until}
          zones={world.zones}
          disabled={running !== null || done}
          onChange={turn}
        />
      )}
      <div className="tests">
        {tests.map((t) => (
          <button
            key={t.id}
            type="button"
            className="test"
            data-test={t.id}
            data-status={status(t)}
            disabled={running !== null || blocked}
            onClick={() => void runTest(t)}
          >
            <PillSurface>{t.label}</PillSurface>
            {status(t) === "idle" ? null : <span className="sr">{status(t) === "pass" ? ", passed" : ", failed"}</span>}
          </button>
        ))}
      </div>
      {/* No result line under the tests: the instruction above already changes to say what happened. */}
      {mode.kind === "final" && done ? (
        <ul className="payoff" data-payoff>
          {story.final.payoff.map((p) => (
            <li key={p.part}>
              <b>{p.part}</b> {p.job}
            </li>
          ))}
        </ul>
      ) : null}
      {mode.kind === "final" && !done ? (
        <button type="button" className="btn secondary" data-assemble disabled={closed || running !== null} onClick={() => !running && explode.set(0)}>
          Assemble
        </button>
      ) : null}
      <Actions>
        {mode.kind === "final" ? (
          <>
            <button type="button" className="btn secondary" data-restart disabled={!done} onClick={onNext}>
              Start over
            </button>
            <button type="button" className="btn" data-next disabled={!done} onClick={onHome}>
              <PillSurface>Another object</PillSurface>
            </button>
          </>
        ) : (
          // Always there, so the way on is visible; it opens once the task is done.
          <button type="button" className="btn" data-next disabled={!done} onClick={onNext}>
            <PillSurface>{nextLabel}</PillSurface>
          </button>
        )}
      </Actions>
    </main>
  );
}
