import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Part } from "../../shared/kit.ts";
import { type KitBounds, measureParts } from "../../shared/bounds.ts";
import { DEFAULT_LOOK, type DitherLook } from "../../src/kit3d/ditherLook.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { type Slider, formatSlider } from "./primitives/library.ts";
import { SYNTHWAVE } from "./primitives/parts.ts";
import { DitherRange, TRACK, Wheel } from "./controls.tsx";
import { Beam } from "./Beam.tsx";
import { Dither } from "./dither.tsx";
import { DEFAULT_VIEW, type View, type Zone, zoneAt as zoneOf } from "./model.ts";
import { fitFrame, reuseParts } from "./pose.ts";

/** The default dither with a Synthwave gradient for the shadow. */
const LOOK: DitherLook = { ...DEFAULT_LOOK, shadow: { ...DEFAULT_LOOK.shadow, stops: SYNTHWAVE } };

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
      {frame ? <KitViewer parts={parts} frame={frame} elevation={view.elevation} azimuth={view.azimuth} height={size.height} pixelScale={1} look={LOOK} /> : null}
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
      {frame ? <KitViewer parts={parts} frame={frame} elevation={v.elevation} azimuth={v.azimuth} height={INSET} pixelScale={1} look={LOOK} /> : null}
    </div>
  );
}

/** True inside a lesson that shows no numbers: controls drop their values and step dots their counts. */
export const Plain = createContext(false);

export function ExplodeSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const plain = useContext(Plain);
  return (
    <div className="slider" data-explode data-plain={plain ? "" : undefined}>
      <span className="mono">Explode</span>
      <DitherRange label="Explode" position={Math.round(value * TRACK)} valueText="Explode" disabled={disabled} onPosition={(n) => onChange(n / TRACK)} />
      {plain ? null : <span className="val">{Math.round(value * 100)}%</span>}
    </div>
  );
}

/**
 * Where along the track (0 to 1) each value sits. A stiff zone (gain under 1) takes more of the track
 * than its share of the value, so it still takes more thumb to get through it.
 */
function trackOf(min: number, max: number, zones: readonly Zone[] | undefined) {
  const span = max - min || 1;
  const cuts: { from: number; to: number; weight: number }[] = [];
  let from = min;
  for (const z of zones ?? []) {
    const to = Math.min(max, z.until);
    if (to > from) cuts.push({ from, to, weight: (to - from) / (z.gain ?? 1) });
    from = Math.max(from, to);
  }
  if (from < max) cuts.push({ from, to: max, weight: max - from });
  const total = cuts.reduce((a, c) => a + c.weight, 0) || span;
  const toTrack = (v: number) => {
    let at = 0;
    for (const c of cuts) {
      if (v <= c.to) return (at + ((Math.max(v, c.from) - c.from) / (c.to - c.from || 1)) * c.weight) / total;
      at += c.weight;
    }
    return 1;
  };
  const toValue = (t: number) => {
    let left = t * total;
    for (const c of cuts) {
      if (left <= c.weight) return c.from + (left / (c.weight || 1)) * (c.to - c.from);
      left -= c.weight;
    }
    return max;
  };
  return { toTrack, toValue };
}

/**
 * The control for doing something to the object by hand: a notched wheel when it turns something (`wheel`), else a
 * pink dithered bar. It is stiffer where `zones` make it stiff, ticks on the phone when it crosses into a new zone,
 * and the word for the current zone sits beside it. No numbers.
 */
export function Strip(props: { id: string; label: string; value: number; min: number; max: number; zones?: readonly Zone[]; wheel?: boolean; disabled?: boolean; onChange: (v: number) => void }) {
  const { min, max, zones } = props;
  const track = useMemo(() => trackOf(min, max, zones), [min, max, zones]);
  const zoneAt = (v: number) => (zones ? zoneOf(zones, v) : undefined);
  const zone = zoneAt(props.value);
  const change = (position: number) => {
    const next = Math.min(max, Math.max(min, track.toValue(position / TRACK)));
    if (next === props.value) return;
    if (zoneAt(next)?.id !== zone?.id) navigator.vibrate?.(12);
    props.onChange(next);
  };
  const Control = props.wheel ? Wheel : DitherRange;
  return (
    <div className="slider strip" data-strip={props.id} data-free={zones ? undefined : ""}>
      <span className="mono">{props.label}</span>
      <Control label={props.label} position={Math.round(track.toTrack(props.value) * TRACK)} valueText={zone?.word ?? props.label} disabled={props.disabled} onPosition={change} />
      {zone ? <span className="zone" data-zone={zone.id}>{zone.word}</span> : null}
    </div>
  );
}

/** Verbs that turn something, so their control is a wheel. */
export const TURNS = /^(twist|turn|screw|wind)/i;

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
/** The label that gets the beam: the reason behind a step, which we want people to open. "Hint" stays plain. */
const WHY = "Why?";

export function Why({ label = WHY, title, children }: { label?: string; title: string; children: ReactNode }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Once the sheet has been opened and closed on this screen, the button goes back to plain.
  const [seen, setSeen] = useState(false);
  const close = () => sheet.current?.close();
  useLayoutEffect(() => {
    const el = button.current;
    if (!el) return;
    const read = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const lit = label === WHY && !seen && size.width > 0;
  return (
    <>
      <span className="why-wrap">
        <button ref={button} type="button" className="why" data-why data-lit={lit ? "" : undefined} aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>{label}</button>
        {lit ? <Beam width={size.width} height={size.height} /> : null}
      </span>
      <dialog ref={sheet} className="sheet" data-sheet aria-label={title} onClick={(e) => e.target === sheet.current && close()} onClose={() => setSeen(true)}>
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
