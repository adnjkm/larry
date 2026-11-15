import { definePrimitive } from "@ui-sdk/core";

/**
 * A thumbwheel: a value you change by spinning a wheel sideways, like a camera's zoom wheel.
 * Dragging moves the value with the finger; letting go keeps it spinning and slows it down. Arrow keys, Home and End
 * work too, and screen readers hear it as a slider.
 */
export type ThumbwheelOptions = {
  value?: number;
  min?: number;
  max?: number;
  /** How much the value moves per pixel dragged. */
  perPixel?: number;
  /** How much one arrow key press moves it. */
  step?: number;
  /** What screen readers hear, e.g. "2.4× zoom". */
  valueText?: string;
  onValueChange?: (value: number) => void;
};

/** How quickly a released spin slows, in ms. Larger coasts longer. */
const COAST_MS = 260;

export const thumbwheel = definePrimitive({
  name: "thumbwheel",
  options: {
    value: "number",
    min: "number",
    max: "number",
    perPixel: "number",
    step: "number",
    valueText: "string",
    onValueChange: "callback",
  },
  state: (options: ThumbwheelOptions) => ({
    value: options.value ?? options.min ?? 0,
    // Copied from the options, because a slot's attributes only see state.
    min: options.min ?? 0,
    max: options.max ?? 1,
    valueText: options.valueText,
    /** Value per ms, signed. The wheel smears its ridges by it. */
    velocity: 0,
    dragging: false,
  }),
  api: (context) => {
    let lastX = 0;
    let lastT = 0;
    let coast = 0;

    context.onOptions((options) => {
      context.store.set({ min: options.min ?? 0, max: options.max ?? 1, valueText: options.valueText });
      if (options.value !== undefined && options.value !== context.store.get().value) context.store.set({ value: options.value });
    });

    const set = (next: number) => {
      const { min = -Infinity, max = Infinity, onValueChange } = context.options();
      const value = Math.min(max, Math.max(min, next));
      const hitEnd = value !== next;
      if (value !== context.store.get().value) onValueChange?.(value);
      context.store.set({ value });
      return hitEnd;
    };
    const stopCoasting = () => {
      cancelAnimationFrame(coast);
      coast = 0;
    };

    return {
      set,
      toEnd(end: "min" | "max") {
        stopCoasting();
        set(context.store.get()[end]);
      },
      nudge(steps: number) {
        stopCoasting();
        set(context.store.get().value + steps * (context.options().step ?? 0.1));
        context.store.set({ velocity: 0 });
      },
      grab(x: number, t: number) {
        stopCoasting();
        lastX = x;
        lastT = t;
        context.store.set({ dragging: true, velocity: 0 });
      },
      drag(x: number, t: number) {
        if (!context.store.get().dragging) return;
        const perPixel = context.options().perPixel ?? 0.01;
        const before = context.store.get().value;
        const dv = (x - lastX) * perPixel;
        const dt = Math.max(1, t - lastT);
        lastX = x;
        lastT = t;
        const hitEnd = set(before + dv);
        // Only what the value really moved counts, so pushing past an end leaves the wheel still.
        const moved = context.store.get().value - before;
        // Smoothed, so one jittery move doesn't decide the throw.
        context.store.set({ velocity: hitEnd ? 0 : context.store.get().velocity * 0.5 + (moved / dt) * 0.5 });
      },
      release() {
        if (!context.store.get().dragging) return;
        context.store.set({ dragging: false });
        let last = performance.now();
        const step = (now: number) => {
          const dt = now - last;
          last = now;
          const velocity = context.store.get().velocity * Math.exp(-dt / COAST_MS);
          const hitEnd = set(context.store.get().value + velocity * dt);
          if (hitEnd || Math.abs(velocity) < 0.00005) {
            context.store.set({ velocity: 0 });
            coast = 0;
            return;
          }
          context.store.set({ velocity });
          coast = requestAnimationFrame(step);
        };
        coast = requestAnimationFrame(step);
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      // What the root's children can read, to draw the wheel.
      state: (state) => ({ value: state.value, velocity: state.velocity, dragging: state.dragging }),
      role: "slider",
      focus: "tab-stop",
      keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"],
      attrs: (state) => ({
        tabindex: "0",
        "aria-valuenow": String(state.value),
        "aria-valuemin": String(state.min),
        "aria-valuemax": String(state.max),
        "aria-valuetext": state.valueText,
        "aria-orientation": "horizontal",
        "data-dragging": state.dragging ? "" : undefined,
      }),
      on: {
        keydown: (event, { api }) => {
          if (event.key === "ArrowRight" || event.key === "ArrowUp") api.nudge(1);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") api.nudge(-1);
          else if (event.key === "Home") api.toEnd("min");
          else if (event.key === "End") api.toEnd("max");
          else return;
          event.preventDefault();
        },
        pointerdown: (event, { api, el }) => {
          el?.setPointerCapture(event.pointerId);
          api.grab(event.clientX, event.timeStamp);
        },
        pointermove: (event, { api }) => api.drag(event.clientX, event.timeStamp),
        pointerup: (_event, { api }) => api.release(),
        pointercancel: (_event, { api }) => api.release(),
      },
    }),
  }),
});
