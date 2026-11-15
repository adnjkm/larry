// The top of the library page for a primitive that has a premade game: the challenge, the figure with its handle, two
// meters, the number, the verdict and the action. Everything the figure shows lives in the stage controller; this
// component renders on phase changes only, and the small components in parts.tsx follow the controller on their own.
import * as stylex from "@stylexjs/stylex";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Chevron } from "../../Chevron.tsx";
import { HoldButton } from "../../lesson/HoldButton.tsx";
import { bars, buttons, type } from "../../styles.ts";
import { colors, fonts } from "../../tokens.stylex.ts";
import { FigureStage } from "../stage/FigureStage.tsx";
import { startValues } from "../stage/view.ts";
import type { Cue, Primitive, Values, Verdict } from "../types.ts";
import { controlRows } from "./logic.ts";
import { Divider, Meters, Rows, SliderRow, ToggleRow, VerdictLine } from "./parts.tsx";
import { GameStore } from "./store.ts";

const STAGE_HEIGHT = 330;
const DOT_OFF = "#DADADA";

type Phase = "ready" | "playing" | "done";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 16 },
  top: { display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", minHeight: 44, marginTop: -8 },
  back: {
    display: "grid",
    placeItems: "center",
    width: 44,
    height: 44,
    marginLeft: -4,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.ink,
    cursor: "pointer",
    touchAction: "manipulation",
    borderRadius: 999,
    outline: { default: "none", ":focus-visible": `2px solid ${colors.pink}` },
  },
  backRing: { display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 999, boxShadow: `0 0 0 1px ${colors.edge}` },
  heading: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 },
  name: { margin: 0, fontSize: 17, lineHeight: "22px", fontWeight: 600, textAlign: "center" },
  dots: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, width: 44, height: 44 },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: DOT_OFF },
  dotOn: { backgroundColor: colors.ink },
  challenge: { display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 },
  kicker: { color: colors.pinkText },
  goal: { margin: 0, fontSize: 24, lineHeight: "28px", fontWeight: 600, letterSpacing: "-0.02em", textWrap: "balance" },
  stage: { position: "relative" },
  live: {
    position: "absolute",
    top: 6,
    left: 0,
    maxWidth: "70%",
    padding: "3px 8px",
    borderRadius: 999,
    backgroundColor: colors.soft,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: "14px",
    color: colors.ink,
    pointerEvents: "none",
    display: { default: "block", ":empty": "none" },
  },
  sweep: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "auto",
    minWidth: 44,
    borderRadius: 999,
    color: colors.ink,
    backgroundColor: "#FFFFFFD9",
    outline: { default: "none", ":focus-visible": `2px solid ${colors.pink}` },
  },
  // The verdict and the action stay in reach above the home indicator; the page's own bottom padding already clears it.
  dock: { flexDirection: "column", alignItems: "stretch", gap: 10, marginBottom: 0 },
  freePlay: { display: "flex", flexDirection: "column", gap: 10 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" },
});

const buzz = (_cue: Cue) => {
  try {
    if ("vibrate" in navigator) navigator.vibrate(10);
  } catch {
    // No haptics here.
  }
};

export function GameScreen({ primitive, kicker, onBack, children }: { primitive: Primitive; kicker: string; onBack: () => void; children?: ReactNode }) {
  const game = primitive.game!;
  const store = useMemo(() => new GameStore(startValues(primitive, "game")), [primitive]);
  const [phase, setPhaseState] = useState<Phase>("ready");
  // What the verdict line shows instead of the live judge: frozen while a run plays, then the run's own.
  const [fixed, setFixed] = useState<Verdict>();
  const [sweeping, setSweeping] = useState(false);
  const phaseRef = useRef<Phase>("ready");
  const before = useRef<Values>({});
  const runId = useRef(0);
  const liveEl = useRef<HTMLSpanElement>(null);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const setLive = (text: string) => {
    if (liveEl.current) liveEl.current.textContent = text;
  };

  useEffect(
    () =>
      store.subscribe(() => {
        // After a run the figure is left on its last frame; any change since then is the player's, so the run's verdict is stale.
        if (phaseRef.current === "done") {
          setFixed(undefined);
          setPhase("ready");
        }
        setSweeping(store.controller?.state() === "sweeping");
      }),
    [store],
  );

  const number = [...primitive.sliders, ...(game.controls ?? [])].find((s) => s.id === game.number);
  const rows = controlRows(game.controls ?? [], game.number);
  const others = primitive.sliders.filter((s) => s.id !== game.number);

  const reset = () => {
    const c = store.controller;
    if (!c) return;
    const now = c.get();
    const kept = Object.fromEntries([game.number, ...(game.controls ?? []).map((s) => s.id)].map((id) => [id, now[id]!]));
    setFixed(undefined);
    setPhase("ready");
    c.set({ ...before.current, ...kept });
  };

  const act = async () => {
    const c = store.controller;
    if (!c || phaseRef.current === "playing") return;
    if (phaseRef.current === "done") return reset();
    before.current = { ...c.get() };
    const run = game.play(c.get());
    const id = ++runId.current;
    setFixed(game.judge(c.get()));
    setSweeping(false);
    setPhase("playing");
    const finished = await c.play(run);
    if (id !== runId.current) return;
    setLive("");
    if (!finished) {
      setFixed(undefined);
      setPhase("ready");
      return;
    }
    setFixed(run.verdict);
    setPhase("done");
  };

  const toggleSweep = () => {
    const c = store.controller;
    if (!c) return;
    if (c.state() === "sweeping") c.stop();
    else c.sweep();
    setSweeping(c.state() === "sweeping");
  };

  const playing = phase === "playing";
  const label = phase === "done" ? (fixed?.pass ? "Play again" : "Try again") : game.action;
  const hold = phase === "ready" && /^hold/i.test(game.action);

  return (
    <>
      <div data-game={primitive.id} data-phase={phase} {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.top)}>
          <button type="button" aria-label="Back to the library list" onClick={onBack} {...stylex.props(styles.back)}>
            <span {...stylex.props(styles.backRing)}>
              <Chevron />
            </span>
          </button>
          <div {...stylex.props(styles.heading)}>
            <p {...stylex.props(type.label)}>{kicker}</p>
            <h1 {...stylex.props(styles.name)}>{primitive.name}</h1>
          </div>
          <div aria-hidden {...stylex.props(styles.dots)}>
            <span {...stylex.props(styles.dot, styles.dotOn)} />
            <span {...stylex.props(styles.dot)} />
            <span {...stylex.props(styles.dot)} />
          </div>
        </div>

        <div {...stylex.props(styles.challenge)}>
          <p {...stylex.props(type.label, styles.kicker)}>Game · {game.name}</p>
          <p {...stylex.props(styles.goal)}>{game.goal}</p>
          <p {...stylex.props(type.muted)}>{game.rules}</p>
        </div>

        <div {...stylex.props(styles.stage)}>
          <FigureStage primitive={primitive} mode="game" palette="library" height={STAGE_HEIGHT} controllerRef={store.attach} onLive={setLive} onCue={buzz} />
          <span ref={liveEl} data-live aria-hidden {...stylex.props(styles.live)} />
          <button type="button" data-action="sweep" aria-pressed={sweeping} onClick={toggleSweep} {...stylex.props(buttons.base, buttons.secondary, styles.sweep)}>
            {sweeping ? "Stop" : "Play"}
          </button>
        </div>

        <Rows>
          <Meters store={store} game={game} />
          <Divider />
          {number && <SliderRow store={store} slider={number} ink />}
          {rows.map((row) =>
            row.kind === "slider" ? <SliderRow key={row.slider.id} store={store} slider={row.slider} ink /> : <ToggleRow key={row.sliders[0]!.id} store={store} sliders={row.sliders} />,
          )}
        </Rows>

        <div {...stylex.props(bars.action, styles.dock)}>
          <VerdictLine store={store} game={game} fixed={fixed} source={fixed ? "run" : "judge"} />
          {phase === "done" && (
            <p role="status" {...stylex.props(styles.hidden)}>
              {fixed?.headline} {fixed?.detail}
            </p>
          )}
          {hold ? (
            <HoldButton label={label} onHeld={act} data-action="act" />
          ) : (
            <button type="button" data-action="act" data-phase={phase} disabled={playing} onClick={act} {...stylex.props(buttons.base, buttons.primary, playing && buttons.disabled)}>
              {label}
            </button>
          )}
        </div>
      </div>

      {others.length > 0 && (
        <section {...stylex.props(styles.freePlay)}>
          <p {...stylex.props(type.label)}>Free play · move the figure yourself</p>
          <Rows>
            {others.map((s) => (
              <SliderRow key={s.id} store={store} slider={s} />
            ))}
          </Rows>
        </section>
      )}
      {children}
    </>
  );
}
