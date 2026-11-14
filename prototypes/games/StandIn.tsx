import { useRef, useState } from "react";
import { Challenge, Earned, Log, type LogLine, wait } from "./shared.tsx";

// Game numbers, not measured: the refill drags with 1.5 N of friction; a click over 10 N feels like work.
const FRICTION = 1.5;
const COMFORT = 10;
const COMPRESSION_OUT = 4; // mm the spring is squeezed when the tip is out
const COMPRESSION_PRESS = 8; // mm at the bottom of a click
const PUSHES_TO_LEARN = 3;

export default function StandIn() {
  const [phase, setPhase] = useState<"hand" | "spring">("hand");
  const [tipOut, setTipOut] = useState(false);
  const [drag, setDrag] = useState(0);
  const [pushes, setPushes] = useState(0);
  const [k, setK] = useState(0.2);
  const [result, setResult] = useState<{ returned: boolean; press: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);

  const click = () => {
    if (phase === "hand") setTipOut(true);
  };

  // Hand phase: the user drags the tip back up into the barrel, standing in for the missing spring.
  const onDown = (e: React.PointerEvent) => {
    if (phase !== "hand" || !tipOut) return;
    start.current = e.clientY;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDrag(Math.max(0, Math.min(1, (start.current - e.clientY) / 40)));
  };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > 0.7) {
      setTipOut(false);
      const n = pushes + 1;
      setPushes(n);
      if (n >= PUSHES_TO_LEARN) setTimeout(() => setPhase("spring"), 700);
    }
    setDrag(0);
  };

  const run = async () => {
    setBusy(true);
    const returned = k * COMPRESSION_OUT > FRICTION;
    const press = k * COMPRESSION_PRESS + FRICTION;
    setTipOut(true);
    await wait(500);
    if (returned) setTipOut(false);
    await wait(400);
    setResult({ returned, press });
    setBusy(false);
  };

  const offset = tipOut ? 16 * (1 - drag) : 0;
  const lines: LogLine[] = [];
  let met = false;
  if (result) {
    lines.push({ label: "Return after use", value: result.returned ? "pulls back in" : `stays out · ${(k * COMPRESSION_OUT).toFixed(1)} N < ${FRICTION} N friction`, bad: !result.returned });
    lines.push({ label: "Push to click", value: `${result.press.toFixed(1)} N${result.press > COMFORT ? " · too stiff" : ""}`, bad: result.press > COMFORT });
    met = result.returned && result.press <= COMFORT;
  }

  return (
    <Challenge module="Retract" need="It must hide the tip when you're done." move={phase === "hand" ? "Stand in" : "Tune"} tests="Run" goal="Window">
      <div className="stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <svg viewBox="0 0 380 260">
          <g transform="translate(190 0)">
            <rect x={-14} y={30} width={28} height={160} rx={8} fill="#d6d4cf" />
            <path d="M -14 190 L 14 190 L 5 214 L -5 214 Z" fill="#a9adb3" />
            {phase === "spring" && (
              <path d="M -6 150 l 12 4 l -12 4 l 12 4 l -12 4 l 12 4 l -12 4 l 12 4" fill="none" stroke="#ff0087" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            )}
            <g style={{ transform: `translateY(${offset}px)`, transition: start.current === null ? "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)" : "none" }}>
              <rect x={-2} y={196} width={4} height={14} fill="#2e2e30" />
              <circle cx={0} cy={211} r={2.6} fill="#2e2e30" />
              {phase === "hand" && tipOut && <circle cx={0} cy={222} r={18} fill="#ff0087" opacity={0.12} />}
            </g>
          </g>
          <text x={190} y={252} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill={phase === "hand" && tipOut ? "#ff0087" : "#6b6b6b"} letterSpacing="0.08em">
            {phase === "hand" ? (tipOut ? "DRAG THE TIP UP, BACK INSIDE" : `CLICK IT OUT · ${pushes} OF ${PUSHES_TO_LEARN} PUSHED BACK`) : "THE SPRING DOES YOUR JOB NOW"}
          </text>
        </svg>
      </div>

      {phase === "hand" ? (
        <>
          <button type="button" className="btn" onClick={click} disabled={tipOut}>Click: tip out</button>
          <p className="hint">Nothing pulls the tip back in, so your finger has to. Do it {PUSHES_TO_LEARN} times.</p>
        </>
      ) : (
        <>
          <p className="hint">That push was a spring's job. Pick one stiff enough to beat the friction, soft enough to click.</p>
          <label className="slider">
            <span className="mono">Stiffness</span>
            <input type="range" min={0.1} max={2} step={0.05} value={k} onChange={(e) => { setK(Number(e.currentTarget.value)); setResult(null); }} />
            <span className="val">{k.toFixed(2)} N/mm</span>
          </label>
          <button type="button" className="btn" onClick={() => void run()} disabled={busy}>Run: click and let go</button>
          <Log lines={lines} empty="Set a stiffness, then run it." />
          {met && <Earned part="Return spring" why={`At ${k.toFixed(2)} N/mm it pulls the refill back against the friction, and a click still takes under ${COMFORT} N.`} />}
        </>
      )}
    </Challenge>
  );
}
