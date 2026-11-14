import { useEffect, useRef } from "react";

/** Calls `frame` with elapsed milliseconds on every animation frame, then once at exactly `duration`. Resolves false if `alive` turned false. */
export function play(duration: number, frame: (ms: number) => void, alive: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (!alive()) return resolve(false);
      const ms = now - start;
      if (ms >= duration) {
        frame(duration);
        return resolve(true);
      }
      frame(ms);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** A function that says whether the component is still mounted, for cancelling `play`. */
export function useAlive(): () => boolean {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return () => alive.current;
}
