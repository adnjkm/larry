// The way on from a question. Until it is answered there is nothing to continue to, so the pill is a ghost that
// offers a tip instead: it opens a card with more of an explanation, and a second press puts the card away so the
// player can have a go. Once the question is answered it is the dark Continue pill.
import { useLayoutEffect, useRef, useState } from "react";
import { CAMERA } from "../../src/camera/look.ts";
import { rrect } from "../../src/surface/relief.ts";
import { Surface } from "../../src/surface/Surface.tsx";
import { PillSurface } from "../../src/ui/PillSurface.tsx";

const CARD_RADIUS = 18;

function TipCard({ lines }: { lines: readonly string[] }) {
  const box = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={box} className="tip-card" role="note" data-tip-card>
      {size ? (
        <Surface shape={rrect(size.w, size.h, CARD_RADIUS)} relief="keycap" material="bone" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
      ) : null}
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export function Advance({ done, next, onNext, tip }: { done: boolean; next: string; onNext: () => void; /** More of an explanation, a line each. Without it the pill is just Continue, off until done. */ tip?: readonly string[] }) {
  const [open, setOpen] = useState(false);
  if (done || !tip || tip.length === 0)
    return (
      <button type="button" className="btn" data-next disabled={!done} onClick={onNext}>
        <PillSurface>{next}</PillSurface>
      </button>
    );
  return (
    <>
      {open ? <TipCard lines={tip} /> : null}
      <button type="button" className="btn ghost" data-tip aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Back" : "Tip"}
      </button>
    </>
  );
}
