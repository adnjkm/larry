import * as stylex from "@stylexjs/stylex";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { colors, fonts } from "../tokens.stylex.ts";
import { Surface, type SurfaceProps } from "./Surface.tsx";
import { circle, drum, pill, rrect, type Relief } from "./relief.ts";

/** A bench for looking at parts side by side, on a dark and a light ground. Not shipped; open /surfaces.html. */

const GRAIN = 1.5;
const DRIFT = 0.6;

/** A thumbwheel drum that turns one groove pitch over t in [0, 1), so the loop is seamless. */
const wheel = (t: number): Relief => [drum({ ridges: 19, rim: 3, turn: (t * 2 * Math.PI) / 19 })];

type Ground = "dark" | "light";

function Specimen({ label, width, height, ...surface }: { label: string; width: number; height: number } & SurfaceProps) {
  return (
    <figure {...stylex.props(s.specimen)}>
      <div {...stylex.props(s.stage)}>
        <div {...stylex.props(s.part(width, height))}>
          <Surface {...surface} />
        </div>
      </div>
      <figcaption {...stylex.props(s.caption)}>{label}</figcaption>
    </figure>
  );
}

/** The wheel turns by itself: slowly, or fast and smeared over three frames. */
function Wheel({ fast }: { fast: boolean }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const period = fast ? 600 : 5000;
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      setAt(((((now - start) / period) % 1) + 1) % 1);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fast]);
  return (
    <Specimen
      label={fast ? "wheel 112×64 · smear 3" : "wheel 112×64"}
      width={112}
      height={64}
      shape={rrect(112, 64, 10)}
      relief={wheel}
      bakeKey="wheel-19-3"
      frames={18}
      at={at}
      smear={fast ? 3 : 0}
      grain={GRAIN}
      drift={DRIFT}
    />
  );
}

function Panel({ ground, fast }: { ground: Ground; fast: boolean }) {
  return (
    <section {...stylex.props(s.panel, ground === "dark" ? s.dark : s.light)}>
      <h2 {...stylex.props(s.heading)}>{ground === "dark" ? "#141414" : "#FFFFFF"}</h2>
      <div {...stylex.props(s.row)}>
        <Specimen label="dish 96" width={96} height={96} shape={circle(96)} relief="dish" grain={GRAIN} drift={DRIFT} />
        <Specimen label="dishPressed 96" width={96} height={96} shape={circle(96)} relief="dishPressed" grain={GRAIN} drift={DRIFT} />
        <Specimen label="cap 42" width={42} height={42} shape={circle(42)} relief="cap" grain={GRAIN} drift={DRIFT} />
        <Specimen label="key 88×44 r10" width={88} height={44} shape={rrect(88, 44, 10)} relief="key" grain={GRAIN} drift={DRIFT} />
        <Specimen label="slot 84×48 · slate" width={84} height={48} shape={pill(84, 48)} relief="slot" material="slate" grain={GRAIN} drift={DRIFT} />
        <Wheel fast={fast} />
      </div>
    </section>
  );
}

function Bench() {
  const [fast, setFast] = useState(false);
  return (
    <main {...stylex.props(s.page)}>
      <label {...stylex.props(s.control)}>
        <Switch checked={fast} onCheckedChange={setFast} aria-label="Spin fast" {...stylex.props(s.toggle(fast))}>
          <SwitchThumb {...stylex.props(s.thumb(fast))} />
        </Switch>
        spin fast
      </label>
      <Panel ground="dark" fast={fast} />
      <Panel ground="light" fast={fast} />
    </main>
  );
}

const s = stylex.create({
  page: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    backgroundColor: "#3A3A3A",
    fontFamily: fonts.sans,
  },
  control: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    color: "#FFFFFF",
    fontFamily: fonts.mono,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  toggle: (on: boolean) => ({
    position: "relative",
    flexShrink: 0,
    width: 40,
    height: 24,
    padding: 0,
    border: 0,
    borderRadius: 12,
    backgroundColor: on ? colors.accent : "#6B6B6B",
  }),
  thumb: (on: boolean) => ({
    position: "absolute",
    top: 2,
    left: on ? 18 : 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  }),
  panel: { borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 24 },
  dark: { backgroundColor: "#141414", color: "#FFFFFF" },
  light: { backgroundColor: "#FFFFFF", color: "#141414" },
  heading: { margin: 0, fontFamily: fonts.mono, fontSize: 12, fontWeight: 400, letterSpacing: "0.08em", opacity: 0.6 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 40 },
  specimen: { margin: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 },
  // The surface paints up to `pad` outside its part; this leaves it room without moving the part.
  stage: { padding: 8 },
  part: (width: number, height: number) => ({ position: "relative", width, height }),
  caption: { fontFamily: fonts.mono, fontSize: 11, opacity: 0.6, whiteSpace: "nowrap" },
});

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing");
document.body.style.margin = "0";
createRoot(root).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
