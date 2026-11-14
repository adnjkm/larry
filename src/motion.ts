// Physics for gestures. Motion starts from where the element is and how fast it is moving, so a gesture can take over mid-flight.

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/**
 * Moves a value from `from` to `to` on a critically damped spring (no overshoot), starting at `velocity` units per second.
 * `response` is roughly the seconds it takes to settle. Returns a function that stops it where it is.
 */
export function spring(from: number, to: number, velocity: number, onFrame: (value: number) => void, { response = 0.35, onDone }: { response?: number; onDone?: () => void } = {}): () => void {
  const omega = (2 * Math.PI) / response;
  const a = from - to;
  const b = velocity + omega * a;
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    const t = (now - start) / 1000;
    const decay = Math.exp(-omega * t);
    const offset = (a + b * t) * decay;
    const speed = (b - omega * (a + b * t)) * decay;
    if (Math.abs(offset) < 0.5 && Math.abs(speed) < 5) {
      onFrame(to);
      onDone?.();
      return;
    }
    onFrame(to + offset);
    frame = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame);
}

/** How far past a boundary an element follows a drag of `overshoot`: less and less the further it goes, never a hard stop. */
export const rubberBand = (overshoot: number, dimension: number, constant = 0.55) => (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/** Where a flick at `velocity` (per second) would come to rest, the way scrolling decelerates. */
export const project = (velocity: number, decelerationRate = 0.998) => ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);

/** Velocity from the last 100 ms of samples, so a finger that stops before lifting releases at rest. */
export function velocityTracker() {
  let samples: { value: number; time: number }[] = [];
  return {
    add(value: number, time = performance.now()) {
      samples.push({ value, time });
      samples = samples.filter((s) => time - s.time <= 100);
    },
    /** Units per second. */
    velocity(now = performance.now()): number {
      const recent = samples.filter((s) => now - s.time <= 100);
      const first = recent[0];
      const last = recent.at(-1);
      if (!first || !last || last.time - first.time < 8) return 0;
      return ((last.value - first.value) / (last.time - first.time)) * 1000;
    },
    reset() {
      samples = [];
    },
  };
}
