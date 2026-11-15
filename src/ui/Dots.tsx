import * as stylex from "@stylexjs/stylex";

const blink = stylex.keyframes({
  "0%, 100%": { opacity: 0.15 },
  "50%": { opacity: 1 },
});

const styles = stylex.create({
  dot: {
    animationName: { default: blink, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.2s",
    // Stepped, so it ticks like the dither instead of fading smoothly.
    animationTimingFunction: "steps(4, end)",
    animationIterationCount: "infinite",
  },
  second: { animationDelay: "0.2s" },
  third: { animationDelay: "0.4s" },
});

/** Three dots that tick in turn, for a status that ends in "…". Still, and fully visible, under reduced motion. */
export function Dots() {
  return (
    <span aria-hidden>
      <span {...stylex.props(styles.dot)}>.</span>
      <span {...stylex.props(styles.dot, styles.second)}>.</span>
      <span {...stylex.props(styles.dot, styles.third)}>.</span>
    </span>
  );
}
