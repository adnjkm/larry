import * as stylex from "@stylexjs/stylex";
import { camera } from "./camera.stylex.ts";
import { FlashToggle } from "./FlashToggle.tsx";
import { CAMERA, even } from "./look.ts";
import { PhotoBar } from "./PhotoBar.tsx";

/** The camera's top row: the photo bar centred, the flash switch at the end, an equal slot at the start. */
export function TopBar({ shots, busy, flashOn, onFlash }: { shots: number; busy: boolean; flashOn: boolean; onFlash: (on: boolean) => void }) {
  const { height, barAspect, switchAspect } = CAMERA.top;
  const side = even(height * switchAspect);
  return (
    <div {...stylex.props(s.row(CAMERA.barHeight))}>
      <div {...stylex.props(s.side(side))} />
      <PhotoBar shots={shots} busy={busy} width={even(height * barAspect)} height={height} />
      <div {...stylex.props(s.side(side), s.end)}>
        <FlashToggle on={flashOn} onChange={onFlash} width={side} height={height} />
      </div>
    </div>
  );
}

const s = stylex.create({
  row: (height: number) => ({
    height,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: 20,
    transition: `height 700ms ${camera.easeOut}`,
  }),
  side: (width: number) => ({ width, flexShrink: 0, display: "flex" }),
  end: { justifyContent: "flex-end" },
});
