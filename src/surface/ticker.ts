/**
 * One requestAnimationFrame for every 2D dither loop on the page. Each loop runs at its own rate; a loop stops by
 * returning false or by being cancelled, a loop tied to an element sleeps while the element is off screen, and the
 * frame callback itself stops when no loop is awake. Hidden tabs get no frames at all.
 */

type Run = (now: number) => boolean | number | void;
type Loop = { fps: number; last: number; awake: boolean; run: Run };

const loops = new Set<Loop>();
let raf = 0;
let observer: IntersectionObserver | undefined;
const byElement = new WeakMap<Element, Loop>();

function frame(now: number) {
  raf = 0;
  for (const loop of loops) {
    // A frame early is a frame late at 60 Hz, so a loop runs on the first frame within 2 ms of its slot.
    if (!loop.awake || now - loop.last < 1000 / loop.fps - 2) continue;
    loop.last = now;
    const next = loop.run(now);
    if (next === false) loops.delete(loop);
    else if (typeof next === "number") loop.fps = next;
  }
  wake();
}

function wake() {
  if (raf) return;
  for (const loop of loops) {
    if (loop.awake) {
      raf = requestAnimationFrame(frame);
      return;
    }
  }
}

/**
 * Calls `run(now)` up to `fps` times a second until it returns false or the returned function is called. A number
 * returned is the loop's new rate. With `el`, only while `el` is on screen.
 */
export function animate(fps: number, run: Run, el?: Element | null): () => void {
  const loop: Loop = { fps, last: -Infinity, awake: true, run };
  loops.add(loop);
  if (el && typeof IntersectionObserver !== "undefined") {
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const l = byElement.get(entry.target);
        if (l) l.awake = entry.isIntersecting;
      }
      wake();
    });
    byElement.set(el, loop);
    observer.observe(el);
  }
  wake();
  return () => {
    loops.delete(loop);
    if (el && byElement.get(el) === loop) {
      byElement.delete(el);
      observer?.unobserve(el);
    }
  };
}
