import { useState } from "react";
import { Challenge, Earned, wait } from "./shared.tsx";

type Tip = "out" | "in";
type Option = { id: string; name: string; parts: string; after: (press: number) => Tip; verdict: string };

const PRESSES = 6;
const WANT: Tip[] = Array.from({ length: PRESSES }, (_, i) => (i % 2 === 0 ? "out" : "in"));

const OPTIONS: Option[] = [
  { id: "spring", name: "A spring", parts: "spring", after: () => "in", verdict: "The spring pushes it back every time. It never stays out." },
  { id: "catch", name: "A spring and a catch", parts: "spring + catch", after: () => "out", verdict: "The catch holds it out, but nothing ever lets it go." },
  { id: "cam", name: "A spring, a cam and a catch", parts: "spring + cam + catch", after: (i) => (i % 2 === 0 ? "out" : "in"), verdict: "" },
];

export default function Pick() {
  const [picked, setPicked] = useState<Option | null>(null);
  const [got, setGot] = useState<Tip[]>([]);
  const [pressing, setPressing] = useState(false);
  const [tip, setTip] = useState<Tip>("in");
  const [running, setRunning] = useState(false);

  const choose = async (o: Option) => {
    if (running) return;
    setPicked(o);
    setGot([]);
    setTip("in");
    setRunning(true);
    for (let i = 0; i < PRESSES; i++) {
      await wait(260);
      setPressing(true);
      setTip("out");
      await wait(220);
      setPressing(false);
      const state = o.after(i);
      setTip(state);
      setGot((g) => [...g, state]);
    }
    setRunning(false);
  };

  const done = got.length === PRESSES;
  const matched = got.filter((t, i) => t === WANT[i]).length;
  const met = done && matched === PRESSES;
  const tipOut = tip === "out";

  return (
    <Challenge module="Retract" need="It must stay out after one press, and go back in on the next." move="Pick" tests="Repeat ×6" goal="Survive">
      <div className="stage">
        <svg viewBox="0 0 380 260">
          <g transform="translate(190 0)">
            <rect x={-6} y={pressing ? 34 : 22} width={12} height={20} rx={3} fill="#ff0087" style={{ transition: "y 120ms ease-out" }} />
            <rect x={-14} y={40} width={28} height={150} rx={8} fill="#d6d4cf" />
            <path d="M -14 190 L 14 190 L 5 214 L -5 214 Z" fill="#a9adb3" />
            <g style={{ transform: `translateY(${tipOut ? 16 : 0}px)`, transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1)" }}>
              <rect x={-2} y={196} width={4} height={14} fill="#2e2e30" />
              <circle cx={0} cy={211} r={2.6} fill="#2e2e30" />
            </g>
          </g>
          <text x={190} y={250} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill="#6b6b6b" letterSpacing="0.08em">
            {running ? "PRESSING…" : picked ? (tipOut ? "TIP OUT" : "TIP IN") : "PICK A MECHANISM"}
          </text>
        </svg>
      </div>

      <div className="options">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" className="option" data-picked={picked?.id === o.id || undefined} onClick={() => void choose(o)} disabled={running}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{o.name}</span>
            <span className="parts">{o.parts}</span>
          </button>
        ))}
      </div>

      <div className="log">
        <div className="log-row"><span>Wanted</span><span className="dots">{WANT.map((w, i) => <span key={i} className="dot" data-s={w} />)}</span></div>
        <div className="log-row">
          <span>Got</span>
          <span className="dots">{Array.from({ length: PRESSES }, (_, i) => <span key={i} className="dot" data-s={got[i]} data-wrong={got[i] && got[i] !== WANT[i] ? "" : undefined} />)}</span>
        </div>
        {done && !met && <div className="log-row"><span className="bad">{matched} of {PRESSES} presses right</span></div>}
        {done && !met && picked && <span className="hint" style={{ fontSize: 14 }}>{picked.verdict}</span>}
      </div>
      {met && <Earned part="Click mechanism" why="Each press turns the cam one notch. The catch holds it out on one notch and lets it go on the next." />}
    </Challenge>
  );
}
