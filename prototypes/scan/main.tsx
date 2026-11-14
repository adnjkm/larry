// Prototype: sample photo → scan → the object as your goal → its "it must…" requirements → the games.
// Uses the kits already generated for the repo's sample photos, so no Claude call is needed.
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Kit, parseKit } from "../../shared/kit.ts";
import { KitViewer } from "../../src/kit3d/KitViewer.tsx";
import { SYNTHWAVE } from "../../src/primitives/parts.ts";
import { ObjectName } from "../games/shared.tsx";
import { type Module, recipeFor } from "./catalog.ts";

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const idOf = (path: string) => path.split("/").pop()!.replace(/\.\w+$/, "");

type Sample = { id: string; photo: string; kit: Kit };
const SAMPLES: Sample[] = Object.entries(photoUrls).flatMap(([path, photo]) => {
  const raw = Object.entries(kitJson).find(([p]) => idOf(p) === idOf(path))?.[1];
  return raw === undefined ? [] : [{ id: idOf(path), photo, kit: parseKit(raw) }];
});
const ORDER = ["pen", "stapler", "bottle", "mug"];
SAMPLES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

const LABEL: Record<string, string> = { pen: "Click pen", stapler: "Stapler", bottle: "Water bottle", mug: "Mug" };

type Screen = { at: "pick" } | { at: "scan"; s: Sample } | { at: "goal"; s: Sample } | { at: "game"; s: Sample; m: Module };

function App() {
  const [screen, setScreen] = useState<Screen>({ at: "pick" });
  const [done, setDone] = useState<Record<string, true>>({});

  if (screen.at === "pick") return <Pick onPick={(s) => setScreen({ at: "scan", s })} />;
  if (screen.at === "scan") return <Scan sample={screen.s} onDone={() => setScreen({ at: "goal", s: screen.s })} />;
  if (screen.at === "goal")
    return <Goal sample={screen.s} done={done} onBack={() => setScreen({ at: "pick" })} onOpen={(m) => setScreen({ at: "game", s: screen.s, m })} />;
  const { s, m } = screen;
  const Game = m.Game;
  return (
    <ObjectName.Provider value={LABEL[s.id] ?? s.kit.name}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 20px 0" }}>
        <button type="button" className="back" onClick={() => setScreen({ at: "goal", s })}>← {s.kit.name}</button>
      </div>
      <Game onMet={() => setDone((d) => (d[`${s.id}/${m.id}`] ? d : { ...d, [`${s.id}/${m.id}`]: true }))} />
    </ObjectName.Provider>
  );
}

function Pick({ onPick }: { onPick: (s: Sample) => void }) {
  return (
    <main className="page">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mono">Larry · sample photos</span>
        <h1 className="need">Photograph something.</h1>
        <p className="hint">Pick a sample photo. Each already has its kit, so this runs without the network.</p>
      </div>
      <div className="samples">
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" className="sample" onClick={() => onPick(s)}>
            <img src={s.photo} alt={LABEL[s.id] ?? s.id} />
            <span>{LABEL[s.id] ?? s.id}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TONES = [[20, 20, 20], [107, 107, 107], [201, 201, 201], [255, 255, 255]] as const;

/** Draws the photo as 1px Bayer-dithered greys, one canvas pixel per CSS pixel of the card. */
function useDither(src: string, canvas: React.RefObject<HTMLCanvasElement | null>, width: number) {
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const h = Math.round((img.height / img.width) * width);
      c.width = width;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, h);
      const data = ctx.getImageData(0, 0, width, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const lum = (0.2126 * data.data[i]! + 0.7152 * data.data[i + 1]! + 0.0722 * data.data[i + 2]!) / 255;
          const t = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
          const level = Math.min(3, Math.floor(lum * 3 + t));
          const [r, g, b] = TONES[level]!;
          data.data[i] = r;
          data.data[i + 1] = g;
          data.data[i + 2] = b;
        }
      ctx.putImageData(data, 0, 0);
    };
    img.src = src;
  }, [src, canvas, width]);
}

function Scan({ sample, onDone }: { sample: Sample; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [go, setGo] = useState(false);
  const [shown, setShown] = useState(0);
  useDither(sample.photo, canvas, 380);

  useEffect(() => {
    const timers = [setTimeout(() => setGo(true), 120)];
    sample.kit.parts.forEach((_, i) => timers.push(setTimeout(() => setShown(i + 1), 1500 + i * 320)));
    timers.push(setTimeout(onDone, 1500 + sample.kit.parts.length * 320 + 900));
    return () => timers.forEach(clearTimeout);
  }, [sample, onDone]);

  return (
    <main className="page">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mono">{shown < sample.kit.parts.length ? "Larry is taking it apart…" : "Done"}</span>
        <h1 className="need">{shown > 0 ? sample.kit.name : "Scanning"}</h1>
      </div>
      <div className="scan" data-go={go ? "" : undefined}>
        <img src={sample.photo} alt="" />
        <canvas ref={canvas} />
        <span className="beam" />
      </div>
      <ul className="parts">
        {sample.kit.parts.slice(0, shown).map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{p.joint ?? "main part"}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Goal({ sample, done, onBack, onOpen }: { sample: Sample; done: Record<string, true>; onBack: () => void; onOpen: (m: Module) => void }) {
  const modules = useMemo(() => recipeFor(sample.kit.name), [sample]);
  const finished = modules.length > 0 && modules.every((m) => done[`${sample.id}/${m.id}`]);
  return (
    <main className="page">
      <button type="button" className="back" onClick={onBack}>← Photos</button>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="mono">Your goal · {sample.kit.parts.length} parts</span>
        <h1 className="need">{sample.kit.name}</h1>
        <p className="hint">{sample.kit.summary}</p>
      </div>
      <KitViewer kit={sample.kit} spin elevation={14} azimuth={25} height={300} pixelScale={1} shadowStops={SYNTHWAVE} />
      {modules.length > 0 ? (
        <>
          <span className="mono">To build it from scratch, it must…</span>
          <div className="reqs">
            {modules.map((m, i) => {
              const isDone = !!done[`${sample.id}/${m.id}`];
              return (
                <button key={m.id} type="button" className="req" data-done={isDone ? "" : undefined} onClick={() => onOpen(m)}>
                  <span className="num">{isDone ? "✓" : String(i + 1).padStart(2, "0")}</span>
                  <span className="text">{m.need}</span>
                  <span className="chip">{m.move}</span>
                </button>
              );
            })}
          </div>
          {finished ? (
            <div className="earned">
              <span className="mono" style={{ color: "#ff0087" }}>Every requirement met</span>
              <strong>You built a {LABEL[sample.id]?.toLowerCase() ?? sample.kit.name}.</strong>
              <span>Next would be the join: run everything together and see what new requirement it exposes.</span>
            </div>
          ) : (
            <p className="note">Tap a requirement to play it. Prebuilt per function, so other objects with the same job reuse it.</p>
          )}
        </>
      ) : (
        <div className="explore">
          <strong>Explore only.</strong> No prebuilt challenge matches a {sample.kit.name.toLowerCase()} yet, so you get the model and its parts. Scans like this tell us which challenge to write next.
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
