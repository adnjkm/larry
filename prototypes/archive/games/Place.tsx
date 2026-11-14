import { useRef, useState } from "react";
import { Challenge, type GameProps, useOnMet, Earned, Log, type LogLine, wait } from "./shared.tsx";

// A stapler arm: hinged at the back, your hand presses the far end, the staple sits somewhere between.
// Force at the staple = hand force × (hand distance ÷ staple distance); travel shrinks by the same ratio.
// Game numbers, not measured: 30 N over 30 mm from your hand; 20 sheets need 90 N and 6 mm of travel.
const HAND_FORCE = 30;
const HAND_TRAVEL = 30;
const NEED_FORCE = 90;
const NEED_TRAVEL = 6;

const HINGE_X = 50;
const HAND_X = 330;
const ARM_Y = 112;
const PRESS_DEG = (Math.atan2(30, HAND_X - HINGE_X) * 180) / Math.PI;

export default function Place({ onMet }: GameProps) {
  const [stapleX, setStapleX] = useState(260);
  const [pressed, setPressed] = useState(false);
  const [result, setResult] = useState<{ force: number; travel: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const ratio = (HAND_X - HINGE_X) / (stapleX - HINGE_X);
  const toSvgX = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 380;
  };
  const move = (clientX: number) => {
    setStapleX(Math.max(HINGE_X + 30, Math.min(HAND_X - 20, toSvgX(clientX))));
    setResult(null);
  };

  const squeeze = async () => {
    setBusy(true);
    setPressed(true);
    await wait(450);
    setResult({ force: HAND_FORCE * ratio, travel: HAND_TRAVEL / ratio });
    await wait(700);
    setPressed(false);
    setBusy(false);
  };

  const lines: LogLine[] = [];
  let met = false;
  if (result) {
    const sheets = Math.min(20, Math.floor((20 * result.force) / NEED_FORCE));
    lines.push({ label: "Force on staple", value: `${result.force.toFixed(0)} N · pierces ${sheets} of 20`, bad: result.force < NEED_FORCE });
    lines.push({ label: "Staple travel", value: result.travel < NEED_TRAVEL ? `${result.travel.toFixed(1)} mm · stops short` : `${result.travel.toFixed(1)} mm · closes`, bad: result.travel < NEED_TRAVEL });
    met = result.force >= NEED_FORCE && result.travel >= NEED_TRAVEL;
  }

  useOnMet(met, onMet);

  return (
    <Challenge object="Stapler" module="Squeeze" need="It must push a staple through 20 sheets with an ordinary squeeze." move="Place" tests="Load · 20 sheets" goal="Window">
      <div className="stage">
        <svg
          ref={svg}
          viewBox="0 0 380 260"
          onPointerMove={(e) => dragging.current && move(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <rect x={20} y={226} width={340} height={12} rx={3} fill="#2e2e30" />
          <rect x={HINGE_X - 12} y={ARM_Y} width={24} height={114} fill="#2e2e30" />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={stapleX - 22} y={222 - i * 3} width={44} height={2.4} fill={i % 2 ? "#ecebe7" : "#dcdad4"} />
          ))}
          <g style={{ transform: `rotate(${pressed ? PRESS_DEG : 0}deg)`, transformOrigin: `${HINGE_X}px ${ARM_Y}px`, transition: "transform 360ms cubic-bezier(0.23, 1, 0.32, 1)" }}>
            <rect x={HINGE_X - 8} y={ARM_Y - 7} width={HAND_X - HINGE_X + 22} height={14} rx={7} fill="#a9adb3" />
            <rect x={stapleX - 4} y={ARM_Y + 7} width={8} height={168 - ARM_Y - 22 + 26} fill="#ff0087" />
            <circle cx={HAND_X} cy={ARM_Y} r={10} fill="#d6d4cf" stroke="#6b6b6b" />
          </g>
          <circle cx={HINGE_X} cy={ARM_Y} r={6} fill="#fff" stroke="#2e2e30" strokeWidth={3} />
          <rect
            x={stapleX - 26}
            y={ARM_Y - 20}
            width={52}
            height={140}
            fill="transparent"
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => {
              dragging.current = true;
              svg.current?.setPointerCapture(e.pointerId);
              move(e.clientX);
            }}
          />
          <text x={HINGE_X} y={ARM_Y - 18} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill="#6b6b6b">HINGE</text>
          <text x={HAND_X} y={ARM_Y - 20} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill="#6b6b6b">YOUR HAND</text>
          <text x={stapleX} y={252} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fill="#ff0087">← DRAG STAPLE →</text>
        </svg>
      </div>

      <button type="button" className="btn" onClick={() => void squeeze()} disabled={busy}>Load: squeeze</button>
      <Log lines={lines} empty="Drag the pink staple along the arm, then squeeze. Near the hinge it's strong but barely moves; near your hand it moves far but pushes weakly." />
      {met && <Earned part="Stapler arm" why={`Your hand is ${ratio.toFixed(1)}× further from the hinge than the staple: enough force to pierce, still enough travel to close.`} />}
    </Challenge>
  );
}
