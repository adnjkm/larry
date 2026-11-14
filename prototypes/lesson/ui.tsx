import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Part } from "../../shared/kit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { type Slider, formatSlider } from "../../src/primitives/library.ts";
import { SYNTHWAVE } from "../../src/primitives/parts.ts";
import { Dither } from "./dither.tsx";
import { DEFAULT_VIEW, type View } from "./model.ts";
import { fitFrame, reuseParts } from "./pose.ts";


/**
 * The dither viewer in a card, with a live line over it. Drag to turn it. `subject` is everything
 * that must stay in view on this screen (every pose a test can reach, every part however far apart);
 * the camera fits it to fill most of the card and holds still while the parts move inside it.
 */
export function Viewer(props: { name: string; parts: Part[]; subject: readonly Part[]; view?: View; height?: number; live?: string; hint?: string }) {
  const view = props.view ?? DEFAULT_VIEW;
  const height = props.height ?? 360;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const lastFrame = useRef<{ key: string; frame: Part[] } | null>(null);
  const frame = useMemo(() => {
    if (width === 0) return null;
    const next = fitFrame(props.subject, view, width, height);
    const key = JSON.stringify(next);
    if (lastFrame.current?.key !== key) lastFrame.current = { key, frame: next };
    return lastFrame.current.frame;
  }, [props.subject, view.elevation, view.azimuth, width, height]);
  const previous = useRef(new Map<string, Part>());
  const parts = reuseParts(previous.current, props.parts);
  return (
    <div className="viewer" ref={box}>
      {frame ? <KitViewer kit={{ name: props.name, summary: "", parts }} frame={frame} elevation={view.elevation} azimuth={view.azimuth} height={height} pixelScale={1} shadowStops={SYNTHWAVE} /> : <div style={{ height }} />}
      {props.live ? <span className="live" aria-live="polite">{props.live}</span> : null}
      <span className="drag">{props.hint ?? "Drag to turn"}</span>
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

export function Header(props: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="head">
      <span className="mono">{props.kicker}</span>
      <h1 className="need">{props.title}</h1>
      {props.children}
    </div>
  );
}

export type Step = { key: string; title: string; state: "done" | "now" | "todo"; enabled: boolean; go: () => void };

/** The lesson's top bar: object name, the scanned photo as the goal, and the progress strip. */
export function Shell({ objectName, kind, photo, steps, onHome, children }: { objectName: string; kind: string; photo: string; steps: Step[]; onHome: () => void; children: ReactNode }) {
  return (
    <>
      <header className="top">
        <div className="top-row">
          <div className="top-name">
            <button type="button" className="crumb mono" data-home onClick={onHome}>← Photos · {kind}</button>
            <strong>{objectName}</strong>
          </div>
          <figure className="north" title="The scanned photo: what you are building">
            <Dither src={photo} aspect={1} className="thumb" />
            <figcaption className="mono">Goal</figcaption>
          </figure>
        </div>
        <nav className="strip" aria-label="Progress" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <button key={s.key} type="button" className="step-pill" data-state={s.state} data-pill={s.key} disabled={!s.enabled} onClick={s.go}>
              <span className="mono">{s.state === "done" ? "✓" : String(i + 1).padStart(2, "0")}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
      </header>
      {children}
    </>
  );
}
