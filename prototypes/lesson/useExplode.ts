// The explode of one screen as React state: the slider's target, and the springs the viewer draws.
import { useEffect, useMemo, useRef, useState } from "react";
import { reducedMotion } from "../../src/motion.ts";
import { aim, idsOf, msUntilShut, resting, sharesOf, springsAt, step, WHOLE } from "./explode.ts";
import type { ExplodePlan } from "./model.ts";

/**
 * The explode of one screen: `target` is what the slider shows, `shown` what the viewer draws (the
 * assemblies' shares with a plan, one number without). It starts shut and opens to `start`.
 */
export function useExplode(plan: ExplodePlan | undefined, start: number) {
  const ids = useMemo(() => idsOf(plan), [plan]);
  const springs = useRef(springsAt(ids, 0));
  const [target, setTarget] = useState(start);
  const [shares, setShares] = useState(() => sharesOf(springs.current));
  const frame = useRef(0);

  const run = () => {
    if (frame.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      // A long frame (a backgrounded tab) is taken as one short one, so the parts never leap.
      springs.current = step(springs.current, Math.min(now - last, 50));
      last = now;
      setShares(sharesOf(springs.current));
      frame.current = resting(springs.current) ? 0 : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  const set = (value: number) => {
    springs.current = aim(springs.current, value, reducedMotion.matches);
    setTarget(value);
    if (reducedMotion.matches) setShares(sharesOf(springs.current));
    else run();
  };
  useEffect(() => {
    if (start !== 0) set(start);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  return {
    target,
    shown: plan ? shares : shares[WHOLE]!,
    set,
    /** Whether the object is together and still, so an action can start. */
    home: () => resting(springs.current) && springs.current.axles.every((a) => a.x === 0),
    /** Milliseconds until a close already under way is shut. */
    msUntilShut: () => msUntilShut(springs.current),
    /** Resolves once every spring has arrived, or false if `alive` turns false first. */
    settled: (alive: () => boolean) =>
      new Promise<boolean>((resolve) => {
        const wait = () => (!alive() ? resolve(false) : resting(springs.current) ? resolve(true) : requestAnimationFrame(wait));
        wait();
      }),
  };
}
