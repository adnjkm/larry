// A bench for playing every primitive's game in turn (?play or ?play=<id>). Development only: nothing links here.
// The DialKit panel picks the game; "[" and "]" step through them, since the arrow keys belong to the sliders.
import * as stylex from "@stylexjs/stylex";
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef, useState } from "react";
import { layout } from "../../ui/styles.ts";
import { GameScreen } from "../game/GameScreen.tsx";
import { PRIMITIVES } from "../../../shared/primitives/library.ts";
import { startingId } from "../startingId.ts";

const options = PRIMITIVES.map((p, i) => ({ value: p.id, label: `${String(i + 1).padStart(2, "0")} ${p.name} · ${p.game.name}` }));

export default function PlayPage() {
  // The action handler is given to the hook that returns the controller, so it reaches the controller through a ref.
  const step = useRef<(by: number) => void>(undefined);
  const [round, setRound] = useState(0);
  const controller = useDialKitController(
    "Games",
    {
      game: { type: "select", options, default: startingId("play") },
      next: { type: "action", label: "Next game  ]" },
      previous: { type: "action", label: "Previous game  [" },
      restart: { type: "action", label: "Start this one over" },
    },
    // Not persisted: the address bar remembers the game, so a saved choice can never disagree with it.
    { id: "larry-play", onAction: (action) => (action === "restart" ? setRound((n) => n + 1) : step.current?.(action === "next" ? 1 : -1)) },
  );

  const index = Math.max(
    0,
    PRIMITIVES.findIndex((p) => p.id === controller.values.game),
  );
  const primitive = PRIMITIVES[index]!;
  step.current = (by) => {
    const next = PRIMITIVES[(index + by + PRIMITIVES.length) % PRIMITIVES.length]!;
    controller.setValue("game", next.id);
  };

  const id = primitive.id;
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("play", id);
    history.replaceState(null, "", url);
    document.title = `Play · ${id}`;
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]") step.current?.(1);
      else if (e.key === "[") step.current?.(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main {...stylex.props(layout.page)}>
      {/* Keyed so a new game, or "start over", is a new screen: its own controller, phase and verdict. */}
      <GameScreen key={`${primitive.id}:${round}`} primitive={primitive} kicker={`${primitive.level} · game ${index + 1} of ${PRIMITIVES.length}`} onBack={() => step.current?.(-1)} />
      <DialRoot defaultOpen position="top-right" />
    </main>
  );
}
