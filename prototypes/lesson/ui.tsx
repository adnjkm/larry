import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Part } from "../../shared/kit.ts";
import { type KitBounds, measureParts } from "../../src/kit3d/buildKit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { type Slider, formatSlider } from "./primitives/library.ts";
import { SYNTHWAVE } from "./primitives/parts.ts";
import { Dither } from "./dither.tsx";
import { DEFAULT_VIEW, type View, type Zone, zoneAt as zoneOf } from "./model.ts";
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

/** True inside a lesson that shows no numbers: controls drop their values and step dots their counts. */
export const Plain = createContext(false);

export function ExplodeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const plain = useContext(Plain);
  return (
    <label className="slider" data-explode data-plain={plain ? "" : undefined}>
      <span className="mono">Explode</span>
      <span className="track">
        <input type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
      {plain ? null : <span className="val">{Math.round(value * 100)}%</span>}
    </label>
  );
}

/** Pixels of drag that carry a strip through its whole travel where it moves freely. */
const STRIP_PX = 300;
const KEY_PX = 12;

/**
 * A grip you drag sideways to do something to the object by hand (twist a cap on). Its ridges move
 * with the finger, slower where `zones` make it stiff, and the word for the current zone sits beside
 * it. No numbers: how far it has gone shows as a faint fill.
 */
export function Strip(props: { id: string; label: string; value: number; min: number; max: number; zones?: readonly Zone[]; disabled?: boolean; onChange: (v: number) => void }) {
  const { min, max, zones } = props;
  const now = useRef(props.value);
  now.current = props.value;
  const last = useRef<number | null>(null);
  const zoneAt = (v: number) => (zones ? zoneOf(zones, v) : undefined);
  const zone = zoneAt(props.value);
  const step = (px: number) => {
    if (props.disabled || px === 0) return;
    const from = now.current;
    const next = Math.min(max, Math.max(min, from + (px / STRIP_PX) * (max - min) * (zoneAt(from)?.gain ?? 1)));
    if (next === from) return;
    if (zoneAt(next)?.id !== zoneAt(from)?.id) navigator.vibrate?.(12);
    now.current = next;
    props.onChange(next);
  };
  const share = (props.value - min) / (max - min || 1);
  return (
    <div className="strip" data-strip={props.id} data-free={zones ? undefined : ""}>
      <span className="mono">{props.label}</span>
      <span
        className="grip"
        role="slider"
        tabIndex={props.disabled ? -1 : 0}
        aria-label={props.label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={props.value}
        aria-valuetext={zone?.word ?? props.label}
        aria-disabled={props.disabled || undefined}
        style={{ backgroundPositionX: `${share * STRIP_PX}px` }}
        onPointerDown={(e) => {
          if (props.disabled) return;
          // A drag must turn the cap, not start selecting the words around the grip.
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (last.current === null) return;
          step(e.clientX - last.current);
          last.current = e.clientX;
        }}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
        onKeyDown={(e) => {
          const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          step(dir * KEY_PX);
        }}
      >
        <span className="amount" style={{ width: `${share * 100}%` }} />
      </span>
      {zone ? <span className="zone" data-zone={zone.id}>{zone.word}</span> : null}
    </div>
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
  const plain = useContext(Plain);
  return (
    <div className="screen">
      <header className="top">
        <button type="button" className="back" data-home aria-label="Back to photos" onClick={onHome}>←</button>
        <strong className="top-name">{objectName}</strong>
        <nav className="dots-nav" aria-label="Progress">
          {steps.map((s, i) => (
            <button key={s.key} type="button" className="step-dot" data-state={s.state} data-pill={s.key} disabled={!s.enabled} aria-label={`${i + 1}. ${s.title}, ${STATE[s.state]}`} aria-current={s.state === "now" ? "step" : undefined} onClick={s.go}>
              <span aria-hidden="true">{s.state === "done" ? "✓" : plain ? "" : i + 1}</span>
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
