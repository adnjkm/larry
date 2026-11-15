// The object on the bench, for a mechanism lesson's questions: the 3D model, the controls a question hands over, and
// the tests it can run. Play.tsx does the same for a story module; this one is given its parts, controls and tests
// directly, so one question can hold two controls, or none, and decide for itself what a result means.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { play, useAlive } from "./anim.ts";
import { type Control, EMPTY_SCENE, type Frame, type Overlay, type Run, STILL, type Story, type Test, type Values, type Verdict } from "./model.ts";
import { compose, drawObject, framePart, restCentre } from "./pose.ts";
import { Strip, TURNS, Viewer } from "./ui.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";

const FRAME_SAMPLES = 48;
const CAMERA_MS = 300;

export type RigProps = {
  story: Story;
  kit: Kit;
  /** The kit parts on the bench. */
  present: readonly string[];
  /** The parts drawn pink: what this mechanism adds. */
  pink?: readonly string[];
  /** The controls the player holds, first one posing the object. None for a question that only watches. */
  controls?: readonly Control[];
  values: Values;
  onValues?: (next: Values) => void;
  tests: readonly Test[];
  /** The dials do not say where they stand ("Snug", "Too tight"): only the tests tell. */
  blind?: boolean;
  /** Nothing can be changed or run: the question is answered. */
  locked?: boolean;
  /** The stretch of the object this question is about. The camera fits it and never moves; left off, it fits the whole object. */
  frame?: Frame;
  /** A run played over and over with a pause between, nothing to press and no status line: a demo of the thing working. Give it a `frame`. */
  loop?: { test: Test; values: Values; pauseMs?: number };
  /** Runs this test once on arrival, so a question about a behaviour opens with the behaviour. */
  opening?: Test;
  /** Each finished run, with every result since the controls last moved. */
  onResult?: (test: Test, verdict: Verdict, all: Readonly<Record<string, Verdict>>) => void;
};

type Status = "idle" | "pass" | "fail";

export function Rig({ story, kit, present, pink = [], controls = [], values, onValues, tests, blind = false, locked = false, frame, loop, opening, onResult }: RigProps) {
  const alive = useAlive();
  const lead = controls[0];
  const valueOf = (c: Control) => values[c.key] ?? c.start;

  const world = useMemo(() => {
    const rest = story.rest({ kit, present });
    const centre = restCentre(kit, present, rest);
    const ctx = { kit, present, centre };
    const coloured = new Set(pink);
    const draw = (overlay: Overlay) =>
      drawObject({ kit, present, scene: compose(rest, overlay), rigid: overlay.rigid, explode: 0, plan: story.explode, pink: coloured, centre, apart: story.apart });
    const held = (v: number | undefined): Overlay => ({ ...(lead && v !== undefined ? lead.pose(v, ctx) : EMPTY_SCENE), rigid: STILL, live: "" });
    const reach = (run: Run): Part[] => Array.from({ length: FRAME_SAMPLES + 1 }, (_, i) => draw(run.at((run.durationMs * i) / FRAME_SAMPLES))).flat();
    const zones = lead?.zones(ctx) ?? [];
    return { ctx, draw, held, reach, zones };
  }, [story, kit, present, pink, lead]);

  const [anim, setAnim] = useState<Overlay | null>(null);
  const [reach, setReach] = useState<Part[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Readonly<Record<string, Verdict>>>({});
  const outcomesRef = useRef(outcomes);
  const token = useRef(0);

  const runTest = async (test: Test) => {
    if (running) return;
    const mine = ++token.current;
    setRunning(test.id);
    const run = test.run(values, world.ctx);
    setReach(world.reach(run));
    const mineStill = () => alive() && token.current === mine;
    await play(CAMERA_MS, () => {}, mineStill);
    await play(run.durationMs, (ms) => setAnim(run.at(ms)), mineStill);
    if (!alive()) return;
    setAnim(null);
    setReach(null);
    setRunning(null);
    const next = { ...outcomesRef.current, [test.id]: run.verdict };
    outcomesRef.current = next;
    setOutcomes(next);
    onResult?.(test, run.verdict, next);
  };

  // The behaviour in question plays once the screen has settled. The timer is cancelled with the effect, so a screen
  // mounted twice in development still plays it once.
  const runOpening = useRef<() => void>(undefined);
  runOpening.current = () => opening && void runTest(opening);
  useEffect(() => {
    if (!opening) return;
    const id = window.setTimeout(() => runOpening.current?.(), 500);
    return () => clearTimeout(id);
  }, [opening]);

  useEffect(() => {
    if (!loop) return;
    let live = true;
    const going = () => live && alive();
    void (async () => {
      await play(500, () => {}, going);
      while (going()) {
        const run = loop.test.run(loop.values, world.ctx);
        // The last frame stays up through the pause, so a line just written is seen before the next run clears it.
        await play(run.durationMs, (ms) => setAnim(run.at(ms)), going);
        await play(loop.pauseMs ?? 900, () => {}, going);
      }
    })();
    return () => {
      live = false;
    };
  }, [loop, world]);

  const turn = (control: Control, v: number) => {
    outcomesRef.current = {};
    setOutcomes({});
    onValues?.({ ...values, [control.key]: v });
  };

  const status = (t: Test): Status => {
    const o = outcomes[t.id];
    return o ? (o.pass ? "pass" : "fail") : "idle";
  };
  const parts = world.draw(anim ?? world.held(lead && valueOf(lead)));
  // The camera holds still while a control moves: its box already holds the object at both ends of the lead control.
  const still = useMemo(() => {
    const ends = lead ? [0, world.zones[world.zones.length - 1]?.until ?? 1] : [undefined];
    return ends.flatMap((v) => world.draw(world.held(v)));
  }, [world]);
  const framed = useMemo(() => (frame ? [framePart(frame)] : null), [frame]);
  const subject = useMemo(() => framed ?? (reach ? [...still, ...reach] : still), [framed, reach, still]);

  return (
    <>
      <Viewer parts={parts} subject={subject} view={story.view} live={loop ? undefined : anim?.live || undefined} />
      {controls.map((c) => {
        const zones = c.zones(world.ctx);
        return (
          <Strip
            key={c.key}
            id={c.key}
            label={c.verb}
            wheel={TURNS.test(c.verb)}
            value={valueOf(c)}
            min={0}
            max={zones[zones.length - 1]!.until}
            zones={zones}
            blind={blind}
            disabled={running !== null || locked}
            onChange={(v) => turn(c, v)}
          />
        );
      })}
      {tests.length > 0 ? (
        <div className="tests">
          {tests.map((t) => (
            <button key={t.id} type="button" className="test" data-test={t.id} data-status={status(t)} disabled={running !== null || locked} onClick={() => void runTest(t)}>
              <PillSurface>{t.label}</PillSurface>
              {status(t) === "idle" ? null : <span className="sr">{status(t) === "pass" ? ", passed" : ", failed"}</span>}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
