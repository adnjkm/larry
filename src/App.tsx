import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import type { Kit } from "../shared/kit.ts";
import { CapturePicker } from "./capture/CapturePicker.tsx";
import { preparePhoto } from "./capture/preparePhoto.ts";
import { requestKit } from "./capture/requestKit.ts";
import { KitViewer } from "./kit3d/KitViewer.tsx";
import { colors, fonts } from "./tokens.stylex.ts";

type State =
  | { phase: "capture" }
  | { phase: "generating"; first: Blob }
  | { phase: "viewing"; kit: Kit }
  | { phase: "failed"; message: string; retry: () => void };

const styles = stylex.create({
  page: {
    boxSizing: "border-box",
    maxWidth: 480,
    minHeight: "100dvh",
    margin: "0 auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
  },
  title: { margin: 0, fontSize: 32, fontWeight: 600 },
  summary: { margin: 0, fontSize: 16, lineHeight: 1.45, color: colors.graphite },
  heading: { margin: 0, fontFamily: fonts.mono, fontSize: 13, fontWeight: 500, color: colors.graphite, textTransform: "uppercase" },
  parts: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 18 },
  photo: { width: "100%", maxHeight: "60dvh", objectFit: "contain" },
  status: { margin: 0, fontFamily: fonts.mono, fontSize: 16 },
  button: {
    minHeight: 56,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.ink,
    borderRadius: 0,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
  },
  primary: { backgroundColor: colors.orange },
});

export function App() {
  const [state, setState] = useState<State>({ phase: "capture" });

  async function generate(files: File[]) {
    const [first] = files;
    if (!first) return;
    setState({ phase: "generating", first });
    try {
      const photos = await Promise.all(files.map(preparePhoto));
      setState({ phase: "viewing", kit: await requestKit(photos) });
    } catch (error) {
      setState({ phase: "failed", message: error instanceof Error ? error.message : String(error), retry: () => void generate(files) });
    }
  }

  const restart = () => setState({ phase: "capture" });

  return (
    <main {...stylex.props(styles.page)}>
      {state.phase === "capture" && <CapturePicker onPick={(files) => void generate(files)} />}
      {state.phase === "generating" && <Generating photo={state.first} />}
      {state.phase === "viewing" && (
        <>
          <h1 {...stylex.props(styles.title)}>{state.kit.name}</h1>
          <p {...stylex.props(styles.summary)}>{state.kit.summary}</p>
          <KitViewer kit={state.kit} spin />
          <h2 {...stylex.props(styles.heading)}>{state.kit.parts.length} parts</h2>
          <ul {...stylex.props(styles.parts)}>
            {state.kit.parts.map((part) => (
              <li key={part.id}>{part.name}</li>
            ))}
          </ul>
          <button type="button" {...stylex.props(styles.button)} onClick={restart}>
            Scan something else
          </button>
        </>
      )}
      {state.phase === "failed" && (
        <>
          <p {...stylex.props(styles.status)}>{state.message}</p>
          <button type="button" {...stylex.props(styles.button, styles.primary)} onClick={state.retry}>
            Try again
          </button>
          <button type="button" {...stylex.props(styles.button)} onClick={restart}>
            Use other photos
          </button>
        </>
      )}
    </main>
  );
}

function Generating({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  return (
    <>
      {url && <img src={url} alt="Your photo" {...stylex.props(styles.photo)} />}
      <p {...stylex.props(styles.status)}>Larry is taking it apart…</p>
    </>
  );
}
