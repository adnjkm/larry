import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef, useState } from "react";
import { CAMERA } from "../camera/look.ts";
import { rrect } from "../surface/relief.ts";
import { Surface } from "../surface/Surface.tsx";
import { colors, fonts } from "../tokens.stylex.ts";

/** The card's corner radius, as on the keys and the cards above it. */
const RADIUS = 12;

/**
 * The challenge in hand, on the pink raised key the header lights its step with, just over the sliders it is met with.
 */
export function StepCard({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
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
    <div ref={box} {...stylex.props(s.card)} data-step-card>
      {size ? (
        <Surface shape={rrect(size.w, size.h, RADIUS)} relief="keycap" material="pink" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
      ) : null}
      {/* A white flash over the key as it arrives, so a new challenge is seen to be new. The card is keyed by its text. */}
      <span {...stylex.props(s.flash)} aria-hidden />
      <p {...stylex.props(s.text)} aria-live="polite">
        {text}
      </p>
    </div>
  );
}


const flash = stylex.keyframes({
  "0%": { opacity: 0 },
  "15%": { opacity: 0.9 },
  "45%": { opacity: 0 },
  "60%": { opacity: 0.6 },
  "100%": { opacity: 0 },
});

const s = stylex.create({
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: RADIUS,
    backgroundColor: "#fff",
    opacity: 0,
    pointerEvents: "none",
    animationName: flash,
    animationDuration: "720ms",
    animationTimingFunction: "ease-out",
    "@media (prefers-reduced-motion: reduce)": { animationName: "none" },
  },
  card: { position: "relative", flex: "none", padding: "10px 14px 12px", color: colors.paper },
  text: { position: "relative", margin: 0, fontFamily: fonts.sans, fontSize: 16, lineHeight: "22px", fontWeight: 600 },
});
