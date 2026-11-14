import { useState } from "react";
import { Challenge, Earned, type GameProps, Log, type LogLine, useOnMet, wait } from "./shared.tsx";

// Static seals are typically squeezed roughly 15–30% of their thickness. Game numbers, not measured:
// under 12% water finds the gaps; over 32% the cap takes more twist than a hand gives.
const LEAKS_BELOW = 12;
const STUCK_ABOVE = 32;

export default function Seal({ onMet }: GameProps) {
  const [squeeze, setSqueeze] = useState(5);
  const [mode, setMode] = useState<"idle" | "flip" | "open">("idle");
  const [drops, setDrops] = useState<number | null>(null);
  const [twist, setTwist] = useState<number | null>(null);

  const leak = squeeze < LEAKS_BELOW ? Math.round((LEAKS_BELOW - squeeze) / 2) + 1 : 0;
  const torque = 0.6 + squeeze * 0.045; // N·m, game numbers; a hand manages about 2
  const reset = (v: number) => {
    setSqueeze(v);
    setDrops(null);
    setTwist(null);
    setMode("idle");
  };

  const flip = async () => {
    setMode("flip");
    await wait(1300);
    setDrops(leak);
  };
  const open = async () => {
    setMode("open");
    await wait(700);
    setTwist(torque);
  };

  const lines: LogLine[] = [];
  if (drops !== null) lines.push({ label: "Tilt · upside down, 1 day", value: drops === 0 ? "dry" : `${drops} drops leaked`, bad: drops > 0 });
  if (twist !== null) lines.push({ label: "Open by hand", value: squeeze > STUCK_ABOVE ? `${twist.toFixed(1)} N·m · stuck` : `${twist.toFixed(1)} N·m · opens`, bad: squeeze > STUCK_ABOVE });
  const met = drops === 0 && twist !== null && squeeze <= STUCK_ABOVE;
  useOnMet(met, onMet);

  // The ring's cross-section flattens as the cap squeezes it.
  const ringH = 10 * (1 - squeeze / 100);
  const ringW = 100 / ringH;

  return (
    <Challenge object="Water bottle" module="Seal" need="It must stay dry upside down, and still open by hand." move="Tune" tests="Tilt · Load" goal="Window">
      <div className="stage">
        <svg viewBox="0 0 380 260">
          <g style={{ transform: mode === "flip" ? "rotate(180deg)" : "none", transformOrigin: "190px 120px", transition: "transform 420ms cubic-bezier(0.23, 1, 0.32, 1)" }}>
            <rect x={150} y={112} width={80} height={120} rx={10} fill="#d6d4cf" />
            <rect x={160} y={110} width={60} height={12} fill="#a9adb3" />
            <rect x={190 - ringW * 3.6} y={112 - ringH} width={ringW * 7.2} height={ringH} rx={ringH / 2} fill="#ff0087" />
            <g style={{ transform: mode === "open" ? "translateY(-10px) rotate(-8deg)" : "none", transformOrigin: "190px 95px", transition: "transform 300ms cubic-bezier(0.23, 1, 0.32, 1)" }}>
              <rect x={146} y={70} width={88} height={112 - ringH - 70} rx={8} fill="#2e2e30" />
            </g>
          </g>
          {mode === "flip" &&
            Array.from({ length: leak }, (_, i) => (
              <circle key={i} cx={176 + (i % 4) * 9} cy={150} r={3.2} fill="#141414" style={{ animation: `seal-drip 800ms ${450 + i * 140}ms cubic-bezier(0.55, 0, 1, 0.45) forwards`, opacity: 0 }} />
            ))}
          <text x={190} y={250} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill="#6b6b6b" letterSpacing="0.08em">
            RING SQUEEZED {squeeze}% · {ringW.toFixed(0) === "10" ? "ROUND" : "FLATTENED"}
          </text>
        </svg>
        <style>{`@keyframes seal-drip { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 1; transform: translateY(80px); } }`}</style>
      </div>

      <label className="slider">
        <span className="mono">Squeeze</span>
        <input type="range" min={0} max={45} step={1} value={squeeze} onChange={(e) => reset(Number(e.currentTarget.value))} />
        <span className="val">{squeeze}%</span>
      </label>

      <div className="row">
        <button type="button" className="btn" onClick={() => void flip()}>Tilt: flip it</button>
        <button type="button" className="btn secondary" onClick={() => void open()}>Load: open it</button>
      </div>

      <Log lines={lines} empty="Set how hard the cap squeezes the ring, then run both tests." />
      {met && <Earned part="Seal ring" why={`At ${squeeze}% the ring fills the gaps between cap and neck, and a hand can still twist it off.`} />}
    </Challenge>
  );
}
