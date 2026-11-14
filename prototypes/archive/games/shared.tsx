import { createContext, type ReactNode, useContext, useEffect } from "react";

/** The scanned object's name, when a game is played from the scan flow. */
export const ObjectName = createContext<string | null>(null);

/** Calls `onMet` once when the requirement becomes met. */
export function useOnMet(met: boolean, onMet?: () => void) {
  useEffect(() => {
    if (met) onMet?.();
  }, [met, onMet]);
}

export type GameProps = { onMet?: () => void };

export type LogLine = { label: string; value: string; bad?: boolean };

/** The frame every game type shares: object, module, the requirement, and the move/test/goal it uses. */
export function Challenge(props: { object?: string; module: string; need: string; move: string; tests: string; goal: string; children: ReactNode }) {
  const scanned = useContext(ObjectName);
  return (
    <main className="page">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mono">{scanned ?? props.object ?? "Click pen"} · module: {props.module}</span>
        <h1 className="need">{props.need}</h1>
      </div>
      <div className="chips">
        <span className="chip"><b>Move</b>{props.move}</span>
        <span className="chip"><b>Test</b>{props.tests}</span>
        <span className="chip"><b>Goal</b>{props.goal}</span>
      </div>
      {props.children}
    </main>
  );
}

export function Log({ lines, empty }: { lines: LogLine[]; empty: string }) {
  return (
    <div className="log" aria-live="polite">
      {lines.length === 0 ? (
        <span className="log-empty">{empty}</span>
      ) : (
        lines.map((l) => (
          <div key={l.label} className="log-row">
            <span>{l.label}</span>
            <span className={l.bad ? "bad" : undefined}>{l.value}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function Earned({ part, why }: { part: string; why: string }) {
  return (
    <div className="earned">
      <span className="mono" style={{ color: "#ff0087" }}>Requirement met · part earned</span>
      <strong>{part}</strong>
      <span>{why}</span>
    </div>
  );
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
