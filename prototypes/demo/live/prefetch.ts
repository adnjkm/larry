import type { GenCourse } from "../../../shared/course/gen.ts";
import { fetchCourse, type LiveOpts } from "./client.ts";

/** One generation in flight or finished, shared by whoever asks for the same photo. */
export type Run = { promise: Promise<GenCourse>; startedAt: number; abort: () => void; settled: boolean; subs: number; prefetched: boolean };

const runs = new Map<Blob | string, Run>();
const keyOf = (photo: Blob | string, opts: LiveOpts) => (typeof photo === "string" ? `${photo}|${opts.staged ? 1 : 0}|${opts.fresh ? 1 : 0}` : photo);

/** The run for this photo, started if there is none yet. */
export function runCourse(photo: Blob | string, opts: LiveOpts = {}): Run {
  const key = keyOf(photo, opts);
  const known = runs.get(key);
  if (known) return known;
  const controller = new AbortController();
  const run: Run = { startedAt: Date.now(), abort: () => controller.abort(), settled: false, subs: 0, prefetched: false, promise: undefined as never };
  run.promise = fetchCourse(photo, opts, controller.signal).then(
    (course) => {
      run.settled = true;
      return course;
    },
    (error: unknown) => {
      run.settled = true;
      if (runs.get(key) === run) runs.delete(key); // a failed or aborted run is tried again next time
      throw error;
    },
  );
  run.promise.catch(() => {}); // the hook reports it; this keeps an unread run from being an unhandled rejection
  runs.set(key, run);
  return run;
}

/** Call the moment the shutter is pressed: generation runs while the scan animation plays, and useLiveCourse picks it up. */
export function prefetchCourse(photo: Blob | string, opts: LiveOpts = {}): void {
  runCourse(photo, opts).prefetched = true;
}

/**
 * Joins the run for this photo. When the last one to join lets go, a run the hook started itself is aborted (after a
 * tick, so a remount in between keeps it); a prefetched run is left to finish.
 */
export function joinCourse(photo: Blob | string, opts: LiveOpts = {}): { run: Run; leave: () => void } {
  const run = runCourse(photo, opts);
  run.subs++;
  return {
    run,
    leave: () => {
      run.subs--;
      if (run.prefetched) return;
      setTimeout(() => run.subs === 0 && !run.settled && dropCourse(photo, opts), 0);
    },
  };
}

/** Forgets a run, aborting it if it is still going. */
export function dropCourse(photo: Blob | string, opts: LiveOpts = {}): void {
  const key = keyOf(photo, opts);
  runs.get(key)?.abort();
  runs.delete(key);
}
