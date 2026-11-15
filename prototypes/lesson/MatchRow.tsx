// One row of the connecting problem (Course.tsx Match): a slot and the job beside it. Under the row waits a raised
// pink band the row's size, cut to nothing; when the right preview lands, the band spreads out from the slot as a
// ripple, its leading edge dithered, and carries a white copy of the words, so the words turn as the pink reaches them.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { CAMERA } from "../../src/camera/look.ts";
import { rrect } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";

const BAND_RADIUS = 16;

export function MatchRow({ index, does, filled, slot }: { index: number; does: string; filled: boolean; slot: ReactNode }) {
  const box = useRef<HTMLLIElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const [w, h] = [Math.round(el.offsetWidth), Math.round(el.offsetHeight)];
      setSize((s) => (s && s.w === w && s.h === h ? s : w > 0 && h > 0 ? { w, h } : null));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // The ripple starts at the slot's centre and must reach the row's far corner (plus the Surface's shadow pad).
  const style = size ? ({ "--reach": `${Math.ceil(Math.hypot(size.w, size.h)) + 8}px` } as CSSProperties) : undefined;
  return (
    <li ref={box} className="match-row" data-filled={filled ? "" : undefined} style={style}>
      {size ? (
        <span className="match-band" aria-hidden>
          <span className="match-lead" />
          <span className="match-fill">
            <Surface shape={rrect(size.w, size.h, BAND_RADIUS)} relief="keycap" material="pink" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
            <span className="match-gap" />
            <span className="match-does">{does}</span>
          </span>
        </span>
      ) : null}
      <span className="match-slot" data-slot={index}>
        {slot}
      </span>
      <span className="match-does">{does}</span>
    </li>
  );
}
