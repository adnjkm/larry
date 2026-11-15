import * as stylex from "@stylexjs/stylex";
import { Progress, ProgressTrack } from "@ui-sdk/react/progress";
import { DitherBar } from "./DitherBar.tsx";
import { CAMERA } from "./look.ts";

const THIRDS = [1 / 3, 2 / 3];
const GLOW = 8;

/**
 * Photos taken so far, as one bar that fills a third per photo, like a storage bar. While Larry reads the photos the
 * dither drifts faster, so the bar doubles as the loader.
 */
export function PhotoBar({ shots, busy, width, height }: { shots: number; busy: boolean; width: number; height: number }) {
  const max = CAMERA.maxPhotos;
  return (
    <Progress value={shots} max={max} aria-label="Photos" getValueLabel={(value) => `${value ?? 0} of ${max} photos`}>
      <ProgressTrack {...stylex.props(s.track(width, height))}>
        <DitherBar
          fill={shots / max}
          width={width}
          height={height}
          radius={CAMERA.top.barRadius}
          cell={CAMERA.grain}
          dividers={THIRDS}
          glow={GLOW}
          idle={CAMERA.idleDither}
          speed={busy ? 3 : 0.8}
        />
      </ProgressTrack>
    </Progress>
  );
}

const s = stylex.create({
  track: (width: number, height: number) => ({ position: "relative", display: "block", width, height, flexShrink: 0 }),
});
