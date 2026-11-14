import { useState } from "react";
import { Challenge, type GameProps, useOnMet, Earned, Log, type LogLine, wait } from "./shared.tsx";

// Game numbers, not measured: ink thicker than 7 skips, thinner than 4 leaks through the ball's gap.
const SKIPS_ABOVE = 7;
const LEAKS_BELOW = 4;

const SEGMENTS = 44;
const noise = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A pen drawn tip-down with its tip at 0,0. */
function Pen() {
  return (
    <g>
      <rect x={-11} y={-150} width={22} height={118} rx={6} fill="#d6d4cf" />
      <rect x={-11} y={-150} width={22} height={18} rx={6} fill="#2e2e30" />
      <path d="M -11 -32 L 11 -32 L 3 -6 L -3 -6 Z" fill="#a9adb3" />
      <circle cx={0} cy={-3} r={3.5} fill="#ff0087" />
    </g>
  );
}

export default function Tune({ onMet }: GameProps) {
  const [thick, setThick] = useState(2.5);
  const [mode, setMode] = useState<"idle" | "write" | "tilt">("idle");
  const [written, setWritten] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [drops, setDrops] = useState<number | null>(null);
  const [tries, setTries] = useState(0);

  const skip = thick > SKIPS_ABOVE ? Math.min(0.85, 0.15 + ((thick - SKIPS_ABOVE) / 3) * 0.7) : 0;
  const leak = thick < LEAKS_BELOW ? Math.round((LEAKS_BELOW - thick) * 3) + 1 : 0;

  const change = (v: number) => {
    setThick(v);
    setLine(null);
    setDrops(null);
    setWritten(false);
    setMode("idle");
  };

  const run = async () => {
    setTries((t) => t + 1);
    setMode("write");
    setWritten(false);
    await wait(30);
    setWritten(true);
    await wait(1100);
    setLine(Math.round((1 - skip) * 100));
  };

  const tilt = async () => {
    setTries((t) => t + 1);
    setMode("tilt");
    await wait(1400);
    setDrops(leak);
  };

  const lines: LogLine[] = [];
  if (line !== null) lines.push({ label: "Run · write a line", value: line >= 95 ? `${line}% inked` : `${line}% inked, it skips`, bad: line < 95 });
  if (drops !== null) lines.push({ label: "Tilt · tip down, 1 day", value: drops === 0 ? "dry" : `${drops} drops leaked`, bad: drops > 0 });
  const met = line !== null && line >= 95 && drops === 0;

  // A wavy handwriting line across the paper, cut into segments that skip when the ink is too thick.
  const pts = Array.from({ length: SEGMENTS + 1 }, (_, i) => [40 + (i / SEGMENTS) * 300, 196 + Math.sin(i * 0.9) * 7] as const);
  const segs = pts.slice(0, -1).map((p, i) => ({ p, q: pts[i + 1]!, on: noise(i) >= skip }));

  useOnMet(met, onMet);

  return (
    <Challenge module="Write" need="It must give ink only on paper, and never leak." move="Tune" tests="Run · Tilt" goal="Window">
      <div className="stage">
        <svg viewBox="0 0 380 260">
          {mode !== "tilt" && <rect x={20} y={160} width={340} height={76} rx={6} fill="#fff" stroke="#e4e4e4" />}
          {mode === "write" && (
            <>
              <clipPath id="reveal">
                <rect x={30} y={150} height={100} width={written ? 320 : 0} style={{ transition: written ? "width 1000ms linear" : "none" }} />
              </clipPath>
              <g clipPath="url(#reveal)">
                {segs.map((s, i) => s.on && <line key={i} x1={s.p[0]} y1={s.p[1]} x2={s.q[0]} y2={s.q[1]} stroke="#141414" strokeWidth={2.4} strokeLinecap="round" />)}
              </g>
              <g style={{ transform: `translate(${written ? 340 : 40}px, 193px) rotate(18deg)`, transition: written ? "transform 1000ms linear" : "none" }}>
                <Pen />
              </g>
            </>
          )}
          {mode === "tilt" && (
            <>
              <path d="M 150 238 Q 190 252 230 238" fill="none" stroke="#a9adb3" strokeWidth={3} strokeLinecap="round" />
              <g transform="translate(190 176)">
                <Pen />
              </g>
              {Array.from({ length: leak }, (_, i) => (
                <circle key={i} cx={190 + ((i % 3) - 1) * 3} cy={180} r={3.2} fill="#141414" style={{ animation: `drip 900ms ${i * 160}ms cubic-bezier(0.55, 0, 1, 0.45) forwards`, opacity: 0 }} />
              ))}
            </>
          )}
          {mode === "idle" && (
            <g transform="translate(190 150) rotate(18)">
              <Pen />
            </g>
          )}
        </svg>
        <style>{`@keyframes drip { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 1; transform: translateY(56px); } }`}</style>
      </div>

      <label className="slider">
        <span className="mono">Ink thickness</span>
        <input type="range" min={1} max={10} step={0.5} value={thick} onChange={(e) => change(Number(e.currentTarget.value))} />
        <span className="val">{thick.toFixed(1)}</span>
      </label>

      <div className="row">
        <button type="button" className="btn" onClick={() => void run()}>Run: write</button>
        <button type="button" className="btn secondary" onClick={() => void tilt()}>Tilt: tip down</button>
      </div>

      <Log lines={lines} empty="Set the ink, then run both tests. Changing the ink clears the results." />
      {met && <Earned part="Ink refill" why={`Thin enough to roll out under the ball, thick enough that the ball's tiny gap holds it in. Found in ${tries} tries.`} />}
    </Challenge>
  );
}
