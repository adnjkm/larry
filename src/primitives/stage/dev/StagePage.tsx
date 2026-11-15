// Test harness for the stage, at ?stage=<id> (default: spring). Not the product page.
// window.__stage is the controller; window.__stageMany(n) mounts n still figures below (0 unmounts them).
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { buttons, layout, type } from "../../../ui/styles.ts";
import { colors, fonts } from "../../../tokens.stylex.ts";
import { PRIMITIVES, formatSlider } from "../../../../shared/primitives/library.ts";
import { type Values, type Verdict, startValues } from "../../../../shared/primitives/types.ts";
import { FigureStage, type StageController } from "../FigureStage.tsx";
import { stageStats } from "../renderer.ts";

const styles = stylex.create({
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  mono: { fontFamily: fonts.mono, fontSize: 12, fontVariantNumeric: "tabular-nums" },
  live: { fontFamily: fonts.mono, fontSize: 14, minHeight: 20 },
  verdict: { padding: 12, borderRadius: 12, backgroundColor: colors.soft },
  range: { width: "100%" },
  spacer: { height: 1400, backgroundImage: `repeating-linear-gradient(${colors.paper} 0 40px, ${colors.soft} 40px 80px)` },
  many: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
});

export default function StagePage() {
  const id = new URLSearchParams(location.search).get("stage");
  const primitive = PRIMITIVES.find((p) => p.id === id) ?? PRIMITIVES.find((p) => p.id === "spring")!;
  const game = primitive.game;
  const controller = useRef<StageController | null>(null);
  const [values, setValues] = useState<Values>(() => startValues(primitive));
  const [live, setLive] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [perf, setPerf] = useState("");
  const [many, setMany] = useState(0);
  const [cues, setCues] = useState<string[]>([]);

  useEffect(() => {
    const w = window as unknown as { __stage?: StageController | null; __stageMany?: (n: number) => void };
    w.__stage = controller.current;
    w.__stageMany = setMany;
    const c = controller.current;
    // Meters and the slider's text follow the figure; the page never owns the loop.
    const off = c?.subscribe(setValues);
    return off;
  }, [primitive]);

  useEffect(() => {
    let frames = 0;
    let raf = requestAnimationFrame(function count() {
      frames++;
      raf = requestAnimationFrame(count);
    });
    // Differences of the running totals, so scripts can reset and read stageStats themselves.
    let last = { poseMs: stageStats.poseMs, drawMs: stageStats.drawMs, poses: stageStats.poses, frames: stageStats.frames };
    const timer = setInterval(() => {
      const s = stageStats;
      const poses = Math.max(1, s.poses - last.poses);
      const drawn = Math.max(1, s.frames - last.frames);
      setPerf(`${frames * 2} fps · pose ${((s.poseMs - last.poseMs) / poses).toFixed(3)} ms · draw ${((s.drawMs - last.drawMs) / drawn).toFixed(3)} ms · ${s.contexts} WebGL context`);
      frames = 0;
      last = { poseMs: s.poseMs, drawMs: s.drawMs, poses: s.poses, frames: s.frames };
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const act = async () => {
    const c = controller.current;
    if (!c) return;
    setSweeping(false);
    setVerdict(null);
    setCues([]);
    const run = game.play(c.get());
    const finished = await c.play(run);
    if (finished) setVerdict(run.verdict);
  };

  const number = [...primitive.sliders, ...(game.controls ?? [])].find((s) => s.id === game.number);

  return (
    <main {...stylex.props(layout.page)}>
      <p {...stylex.props(type.label)}>Stage harness · {primitive.id}</p>
      <FigureStage
        primitive={primitive}
        mode="game"
        height={360}
        controllerRef={controller}
        onLive={setLive}
        onCue={(cue) => {
          navigator.vibrate?.(10);
          setCues((all) => [...all, cue.kind]);
        }}
      />
      <p data-live {...stylex.props(styles.live)}>
        {live}
      </p>
      <div {...stylex.props(styles.row)}>
        <button
          type="button"
          data-action="sweep"
          {...stylex.props(buttons.base)}
          onClick={() => {
            const c = controller.current;
            if (!c) return;
            if (c.state() === "sweeping") c.stop();
            else c.sweep();
            setSweeping(c.state() === "sweeping");
          }}
        >
          {sweeping ? "Stop" : "Play"}
        </button>
        <button type="button" data-action="game" {...stylex.props(buttons.base, buttons.primary)} onClick={act}>
          {game.action}
        </button>
      </div>
      {verdict && (
        <div data-verdict={verdict.outcome} {...stylex.props(styles.verdict)}>
          <strong>{verdict.headline}</strong>
          <p {...stylex.props(type.body)}>{verdict.detail}</p>
        </div>
      )}
      {number && (
        <label data-slider={number.id}>
          <span {...stylex.props(type.label)}>
            {number.label} {formatSlider(number, values[number.id] ?? number.initial)}
          </span>
          <input
            type="range"
            min={number.min}
            max={number.max}
            step={number.step}
            value={values[number.id] ?? number.initial}
            onChange={(e) => controller.current?.set({ [number.id]: Number(e.currentTarget.value) })}
            {...stylex.props(styles.range)}
          />
        </label>
      )}
      <p {...stylex.props(styles.mono)}>
        {game
          .meters(values)
          .map((m) => `${m.label} ${m.value.toFixed(m.digits ?? 0)} / ${m.target} ${m.unit}`)
          .join(" · ")}
      </p>
      <p data-perf {...stylex.props(styles.mono)}>
        {perf}
      </p>
      <p data-cues {...stylex.props(styles.mono)}>
        {cues.join(" ")}
      </p>
      <div {...stylex.props(styles.many)}>
        {Array.from({ length: many }, (_, i) => (
          <FigureStage key={i} primitive={PRIMITIVES[i % PRIMITIVES.length]!} height={120} />
        ))}
      </div>
      <div {...stylex.props(styles.spacer)} />
    </main>
  );
}
