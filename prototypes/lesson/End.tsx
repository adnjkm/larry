// The lesson's last screen: the mechanisms that were built, each under its own key, and the object they make together,
// arriving a part at a time as it did on the result screen that opened the lesson.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Kit, Part } from "../../shared/kit.ts";
import { ACCENT } from "../../src/camera/look.ts";
import { DEFAULT_LOOK, type DitherLook } from "../../src/kit3d/ditherLook.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";
import { Mechanism } from "../primitives/PrimitiveScreen.tsx";
import { Actions } from "./ui.tsx";

const LOOK: DitherLook = { ...DEFAULT_LOOK, colors: { ...DEFAULT_LOOK.colors, accent: ACCENT.toLowerCase() } };
/** As on the result screen: the model leans a little. */
const TILT = -9;
/** The bubbles land first; then the parts arrive, this far apart at most, the whole object inside about a second and a half. */
const [PARTS_AT, PART_GAP, PARTS_WITHIN] = [520, 120, 1500];

export function End({ kit, mechanisms, next, onNext }: { kit: Kit; mechanisms: readonly string[]; next: string; onNext: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setHeight(Math.round(el.offsetHeight));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [parts, setParts] = useState<Part[]>([]);
  useEffect(() => {
    const gap = Math.min(PART_GAP, PARTS_WITHIN / kit.parts.length);
    const timers = kit.parts.map((part, i) => window.setTimeout(() => setParts((now) => [...now, part]), PARTS_AT + i * gap));
    return () => timers.forEach(clearTimeout);
  }, [kit]);

  return (
    <main className="page" data-step="end">
      <div className="end-pair">
        {mechanisms.map((name, i) => (
          <div key={name} className="end-part">
            <Mechanism name={name} step={i} />
          </div>
        ))}
      </div>
      <div ref={box} className="end-model">
        {height > 0 && parts.length > 0 ? <KitViewer parts={parts} spin roll={TILT} height={height} look={LOOK} /> : null}
      </div>
      <Actions>
        <button type="button" className="btn" data-next onClick={onNext}>
          <PillSurface>{next}</PillSurface>
        </button>
      </Actions>
    </main>
  );
}
