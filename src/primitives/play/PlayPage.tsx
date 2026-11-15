// A bench for playing every primitive's game in turn (?play or ?play=<id>). Development only: nothing links here.
// The DialKit panel picks the game; "[" and "]" step through them, since the arrow keys belong to the sliders.
import * as stylex from "@stylexjs/stylex";
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef, useState } from "react";
import { layout } from "../../ui/styles.ts";
import { GameScreen } from "../game/GameScreen.tsx";
import { PRIMITIVES, type Primitive } from "../../../shared/primitives/library.ts";

const GAMES = PRIMITIVES.filter((p) => p.game);
const options = GAMES.map((p, i) => ({ value: p.id, label: `${String(i + 1).padStart(2, "0")} ${p.name} · ${p.game?.name ?? ""}` }));

function startingId(): string {
  const asked = new URLSearchParams(location.search).get("play");
  return GAMES.some((p) => p.id === asked) ? (asked as string) : ((GAMES[0] as Primitive | undefined)?.id ?? "");
}

export default function PlayPage() {
  // The action handler is given to the hook that returns the controller, so it reaches the controller through a ref.
  const step = useRef<(by: number) => void>(undefined);
  const [round, setRound] = useState(0);
  const controller = useDialKitController(
    "Games",
    {
      game: { type: "select", options, default: startingId() },
      next: { type: "action", label: "Next game  ]" },
      previous: { type: "action", label: "Previous game  [" },
      restart: { type: "action", label: "Start this one over" },
    },
    // Not persisted: the address bar remembers the game, so a saved choice can never disagree with it.
    { id: "larry-play", onAction: (action) => (action === "restart" ? setRound((n) => n + 1) : step.current?.(action === "next" ? 1 : -1)) },
  );

  const index = Math.max(
    0,
    GAMES.findIndex((p) => p.id === controller.values.game),
  );
  const primitive = GAMES[index];
  step.current = (by) => {
    const next = GAMES[(index + by + GAMES.length) % GAMES.length];
    if (next) controller.setValue("game", next.id);
  };

  const id = primitive?.id;
  useEffect(() => {
    if (!id) return;
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

  if (!primitive) return <main {...stylex.props(layout.page)}>No primitive has a game yet.</main>;

  return (
    <main {...stylex.props(layout.page)}>
      {/* Keyed so a new game, or "start over", is a new screen: its own controller, phase and verdict. */}
      <GameScreen key={`${primitive.id}:${round}`} primitive={primitive} kicker={`${primitive.level} · game ${index + 1} of ${GAMES.length}`} onBack={() => step.current?.(-1)} />
      <DialRoot defaultOpen position="top-right" />
    </main>
  );
}
