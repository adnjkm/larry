import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { useRef, useState } from "react";
import { buttons, type } from "../styles.ts";
import { colors } from "../tokens.stylex.ts";

/** How long a press takes to fill. Long enough to feel like doing the thing, short enough for a demo. */
const HOLD_MS = 700;

const styles = stylex.create({
  wrap: { display: "flex", flexDirection: "column", gap: 6, flexGrow: 1 },
  button: { position: "relative", overflow: "hidden", isolation: "isolate" },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: -1, backgroundColor: colors.accent, transformOrigin: "left", transform: "scaleX(0)", pointerEvents: "none" },
  hint: { textAlign: "center" },
});

/**
 * A button that runs when held until it fills, for actions that are physical ("Pour and hold", "Press with a thumb").
 * Android cancels a click once a press turns into a long press, so this listens to the press itself, not the click.
 * The fill is linear because it shows time passing; letting go early snaps it back fast. A click with no press
 * before it (keyboard, screen reader) runs at once.
 */
export function HoldButton({ label, onHeld, ...rest }: { label: string; onHeld: () => void } & Record<`data-${string}`, string>) {
  const fill = useRef<HTMLSpanElement>(null);
  const holding = useRef<Animation | null>(null);
  const pressed = useRef(false);
  const [hint, setHint] = useState(false);

  const release = () => {
    const animation = holding.current;
    holding.current = null;
    if (!animation) return;
    const progress = Number(animation.currentTime ?? 0) / HOLD_MS;
    animation.cancel();
    fill.current?.animate([{ transform: `scaleX(${progress})` }, { transform: "scaleX(0)" }], { duration: 160, easing: "ease-out" });
    setHint(true);
  };

  return (
    <div {...stylex.props(styles.wrap)}>
      <Button
        {...rest}
        {...stylex.props(buttons.base, buttons.primary, styles.button)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pressed.current = true;
          // Keeps the press on this button even if the page shifts under a held pointer.
          e.currentTarget.setPointerCapture(e.pointerId);
          const animation = fill.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: HOLD_MS, easing: "linear", fill: "forwards" });
          if (!animation) return;
          holding.current = animation;
          animation.onfinish = () => {
            if (holding.current !== animation) return;
            holding.current = null;
            navigator.vibrate?.(15);
            onHeld();
          };
        }}
        onPointerUp={release}
        onPointerCancel={release}
        // A long press would otherwise open the browser's menu or start selecting.
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (!pressed.current) onHeld();
          pressed.current = false;
        }}
      >
        <span ref={fill} aria-hidden {...stylex.props(styles.fill)} />
        {label}
      </Button>
      {hint && (
        <p role="status" {...stylex.props(type.label, styles.hint)}>
          Hold until it fills
        </p>
      )}
    </div>
  );
}
