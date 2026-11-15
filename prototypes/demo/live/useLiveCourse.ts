import { useEffect, useState } from "react";
import type { GenCourse } from "../../../shared/course/gen.ts";
import type { LiveOpts } from "./client.ts";
import { joinCourse } from "./prefetch.ts";

export type LiveCourse = { status: "idle" | "working" | "done" | "failed"; course?: GenCourse; error?: string; elapsedMs: number };

/**
 * Turns a photo into a lesson through POST /api/course. A run already started by prefetchCourse for the same photo is
 * picked up, and elapsedMs counts from when that began. A run the hook started itself is aborted on unmount.
 */
export function useLiveCourse(photo: Blob | string | null, opts: LiveOpts = {}): LiveCourse {
  const { staged, fresh } = opts;
  const [state, setState] = useState<Omit<LiveCourse, "elapsedMs">>({ status: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (photo === null) {
      setState({ status: "idle" });
      setElapsedMs(0);
      return;
    }
    const { run, leave } = joinCourse(photo, { staged, fresh });
    let live = true;
    setState({ status: "working" });
    const tick = () => live && setElapsedMs(Date.now() - run.startedAt);
    tick();
    const timer = setInterval(() => !run.settled && tick(), 250);
    run.promise.then(
      (course) => {
        if (!live) return;
        tick();
        setState({ status: "done", course });
      },
      (error: unknown) => {
        if (!live) return;
        tick();
        setState({ status: "failed", error: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
      clearInterval(timer);
      leave();
    };
  }, [photo, staged, fresh]);

  return { ...state, elapsedMs };
}
