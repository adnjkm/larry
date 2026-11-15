import * as stylex from "@stylexjs/stylex";
import { Children, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { CAMERA } from "../camera/look.ts";
import { colors, fonts } from "../tokens.stylex.ts";
import { pill } from "../surface/relief.ts";
import { Surface } from "../surface/Surface.tsx";
import { titleCase } from "./titleCase.ts";

/**
 * The words on a dark pill, the same on every one: Open Runde at 17, white, in title case ("Next: Learn the Fix"). Text
 * made of strings is joined before it's cased, so `Next: {title}` cases as one label.
 */
export function PillLabel({ children }: { children: ReactNode }) {
  const parts = Children.toArray(children);
  const text = parts.every((p) => typeof p === "string" || typeof p === "number") ? titleCase(parts.join("")) : children;
  return <span {...stylex.props(s.label)}>{text}</span>;
}

/**
 * The dark raised pill, as the model screen's Build It: a slate cap, dithered, lit from above, with a soft shadow on a
 * light ground. Put it first inside a button that is `position: relative` with `isolation: isolate` and no background
 * of its own; it fills the button and sits under the label. It measures the button, so the button's own CSS sizes it.
 * Its children are the label, set as {@link PillLabel}.
 */
export function PillSurface({ children }: { children?: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      // Whole px, so a button that grows by a fraction doesn't bake again.
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((s) => (s && s.w === w && s.h === h ? s : w > 0 && h > 0 ? { w, h } : null));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <span ref={box} aria-hidden {...stylex.props(s.fill)}>
        {size && (
          <Surface
            shape={pill(size.w, size.h)}
            relief="cap"
            material="slate"
            ground="light"
            grain={CAMERA.grain}
            depth={CAMERA.relief}
            drift={CAMERA.idleDither}
          />
        )}
      </span>
      {children === undefined ? null : <PillLabel>{children}</PillLabel>}
    </>
  );
}

const s = stylex.create({
  // Under the button's label: the button is its own stacking context, so -1 stays inside it.
  label: {
    position: "relative",
    color: colors.paper,
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: "22px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" },
});
