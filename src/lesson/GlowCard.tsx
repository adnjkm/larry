import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import glow from "../assets/glow-card.png";
import { notes } from "../ui/styles.ts";

const styles = stylex.create({
  wrap: { position: "relative", marginBlock: 10 },
  glow: { position: "absolute", top: -20, bottom: -20, left: -18, right: -18, opacity: 0.6, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", imageRendering: "pixelated", pointerEvents: "none" },
  card: { position: "relative" },
});

/** A card with the dithered orange glow behind it. Use one per screen. */
export function GlowCard({ children, ...rest }: { children: ReactNode } & Record<`data-${string}`, string | true | undefined>) {
  return (
    <div {...stylex.props(styles.wrap)}>
      <div aria-hidden style={{ backgroundImage: `url(${glow})` }} {...stylex.props(styles.glow)} />
      <div {...rest} {...stylex.props(notes.base, styles.card)}>
        {children}
      </div>
    </div>
  );
}
