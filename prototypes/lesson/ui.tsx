import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Part } from "../../shared/kit.ts";
import { type KitBounds, measureParts } from "../../src/kit3d/buildKit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { type Slider, formatSlider } from "../../src/primitives/library.ts";
import { SYNTHWAVE } from "../../src/primitives/parts.ts";
import { Dither } from "./dither.tsx";
import { DEFAULT_VIEW, type View } from "./model.ts";
import { fitFrame, reuseParts } from "./pose.ts";

/** The camera frame for `subject` in a box, kept as the same object while it does not change, so the camera holds still. */
function useFrame(subject: readonly Part[], view: View, width: number, height: number): KitBounds | null {
  const last = useRef<{ key: string; frame: KitBounds } | null>(null);
  return useMemo(() => {
    if (width === 0 || height === 0) return null;
    const next = fitFrame(subject, view, width, height);
    const key = JSON.stringify(next);
    if (last.current?.key !== key) last.current = { key, frame: measureParts(next) };
    return last.current.frame;
  }, [subject, view.elevation, view.azimuth, width, height]);
}

/**
 * The dither viewer, filling whatever height the screen leaves it, with a live line over it. Drag to
 * turn it. `subject` is everything that must stay in view on this screen (every pose a test can reach,
 * every part however far apart); the camera fits it and holds still while the parts move inside it.
 */
export function Viewer(props: { parts: Part[]; subject: readonly Part[]; view?: View; live?: string; children?: ReactNode }) {
  const view = props.view ?? DEFAULT_VIEW;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const frame = useFrame(props.subject, view, size.width, size.height);
  const previous = useRef(new Map<string, Part>());
  const parts = reuseParts(previous.current, props.parts);
  return (
    <div className="viewer" ref={box}>
      {frame ? <KitViewer parts={parts} frame={frame} elevation={view.elevation} azimuth={view.azimuth} height={size.height} pixelScale={1} shadowStops={SYNTHWAVE} /> : null}
      {props.live ? <span className="live" aria-live="polite">{props.live}</span> : null}
      {props.children}
      <span className="drag" aria-hidden="true">Drag to turn</span>
    </div>
  );
}

const INSET = 84;

/** A small still of the object with the parts a primitive becomes in pink, so "in this object" points at a place. */
export function Inset({ parts, view }: { parts: Part[]; view?: View }) {
  const v = view ?? DEFAULT_VIEW;
  const frame = useFrame(parts, v, INSET, INSET);
  return (
    <div className="inset" data-inset aria-hidden="true">
      {frame ? <KitViewer parts={parts} frame={frame} elevation={v.elevation} azimuth={v.azimuth} height={INSET} pixelScale={1} shadowStops={SYNTHWAVE} /> : null}
    </div>
  );
}

export function ExplodeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="slider" data-explode>
      <span className="mono">Explode</span>
      <span className="track">
        <input type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
      <span className="val">{Math.round(value * 100)}%</span>
    </label>
  );
}

export function SliderRow(props: { slider: Slider; value: number; onChange: (v: number) => void; disabled?: boolean; band?: readonly [number, number] }) {
  const { slider: s, value, band } = props;
  const at = (v: number) => `${((v - s.min) / (s.max - s.min)) * 100}%`;
  return (
    <label className="slider">
      <span className="mono">{s.label}</span>
      <span className="track">
        {band ? <span className="band" style={{ left: at(band[0]), width: `calc(${at(band[1])} - ${at(band[0])})` }} /> : null}
        <input type="range" min={s.min} max={s.max} step={s.step} value={value} disabled={props.disabled} data-slider={s.id} onChange={(e) => props.onChange(Number(e.target.value))} />
      </span>
      <span className="val">{formatSlider(s, value)}</span>
    </label>
  );
}

/**
 * The one line that says what to do on this screen, under a small label naming where you are. `note`
 * marks the line as feedback on a tap rather than the standing instruction.
 */
export function Say({ kicker, children, why, note, found }: { kicker: string; children: ReactNode; why?: ReactNode; note?: boolean; found?: boolean }) {
  return (
    <div className="say">
      <div className="say-text">
        <span className="mono">{kicker}</span>
        <h1 className="do" data-note={note || found ? "" : undefined} data-found={found ? "" : undefined} aria-live="polite">{children}</h1>
      </div>
      {why}
    </div>
  );
}

/** Everything explanatory on a screen, behind one button: a bottom sheet that is closed until asked for. */
export function Why({ label = "Why?", title, children }: { label?: string; title: string; children: ReactNode }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();
  return (
    <>
      <button type="button" className="why" data-why aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>{label}</button>
      <dialog ref={sheet} className="sheet" data-sheet aria-label={title} onClick={(e) => e.target === sheet.current && close()}>
        <div className="sheet-in">
          <div className="sheet-head">
            <strong>{title}</strong>
            <button type="button" className="link" data-close onClick={close}>Close</button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** The screen's action, pinned to the bottom of the screen. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="actions" data-actions>{children}</div>;
}

export type Step = { key: string; title: string; state: "done" | "now" | "todo"; enabled: boolean; go: () => void };

const STATE: Record<Step["state"], string> = { done: "done", now: "you are here", todo: "to do" };

/** The lesson's top bar: back to the photos, the object, a dot per step, and the scanned photo as the goal. */
export function Shell({ objectName, photo, steps, onHome, children }: { objectName: string; photo: string; steps: Step[]; onHome: () => void; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="top">
        <button type="button" className="back" data-home aria-label="Back to photos" onClick={onHome}>←</button>
        <strong className="top-name">{objectName}</strong>
        <nav className="dots-nav" aria-label="Progress">
          {steps.map((s, i) => (
            <button key={s.key} type="button" className="step-dot" data-state={s.state} data-pill={s.key} disabled={!s.enabled} aria-label={`${i + 1}. ${s.title}, ${STATE[s.state]}`} aria-current={s.state === "now" ? "step" : undefined} onClick={s.go}>
              <span aria-hidden="true">{s.state === "done" ? "✓" : i + 1}</span>
            </button>
          ))}
        </nav>
        <figure className="north" title="The scanned photo: what you are building">
          <Dither src={photo} aspect={1} className="thumb" />
        </figure>
      </header>
      {children}
    </div>
  );
}
