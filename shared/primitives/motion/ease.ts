// Easing with meaning (src/primitives/docs/motion-language.md). Each takes t in [0, 1]. Pure, so runs and tests share them.

/** `n` held inside [lo, hi]; NaN becomes `lo`. */
export const clamp = (n: number, lo: number, hi: number) => (n > lo ? (n < hi ? n : hi) : lo);
export const clamp01 = (n: number) => clamp(n, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ease in and out: anything a hand moves. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Fast start, gentle stop: anything released, sprung, or dropped onto a stop. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** t squared: anything gravity takes. Distance fallen goes with the square of the time. */
export const fall = (t: number) => t * t;

/**
 * A spring that overshoots and settles: 1 at t = 0, a cosine of `cycles` whole swings that dies away to 0 at t = 1.
 * Multiply by the starting displacement: `-x * ring(t, 2)` is a spring let go from x mm squeezed.
 */
export const ring = (t: number, cycles = 2) => Math.cos(2 * Math.PI * cycles * t) * (1 - t) ** 2;

/** Half a sine: goes a little way and comes back, for a thing that holds. 0 at both ends, 1 at t = 0.5. */
export const strain = (t: number) => Math.sin(Math.PI * t);

/** A dying side-to-side tremor, for a push that jams. 0 at both ends, within -1..1. */
export const shudder = (t: number) => Math.sin(2 * Math.PI * 3 * t) * (1 - t);

/** |sin| times (1 - t): rocks up and back down `rocks` times, smaller each time, for a near-topple or a rebound off a stop. Never negative. */
export const rockBack = (t: number, rocks = 2) => Math.abs(Math.sin(Math.PI * rocks * t)) * (1 - t);
