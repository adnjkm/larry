import { type ReactNode, useRef } from "react";
import type { Part } from "../../shared/kit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { type Slider, formatSlider } from "../../src/primitives/library.ts";
import { SYNTHWAVE } from "../../src/primitives/parts.ts";
import { reuseParts } from "./pose.ts";

export type View = { elevation: number; azimuth: number };
export const DEFAULT_VIEW: View = { elevation: 20, azimuth: 30 };

/** The dither viewer in a card, with a live line over it. Drag to turn it. */
export function Viewer(props: { name: string; parts: Part[]; frame: Part[]; view?: View; height?: number; live?: string; hint?: string }) {
  const { elevation, azimuth } = props.view ?? DEFAULT_VIEW;
  const previous = useRef(new Map<string, Part>());
  const parts = reuseParts(previous.current, props.parts);
  return (
    <div className="viewer">
      <KitViewer kit={{ name: props.name, summary: "", parts }} frame={props.frame} elevation={elevation} azimuth={azimuth} height={props.height ?? 360} pixelScale={1} shadowStops={SYNTHWAVE} />
      {props.live ? <span className="live" aria-live="polite">{props.live}</span> : null}
      <span className="drag">{props.hint ?? "Drag to turn"}</span>
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

export function Header(props: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="head">
      <span className="mono">{props.kicker}</span>
      <h1 className="need">{props.title}</h1>
      {props.children}
    </div>
  );
}
