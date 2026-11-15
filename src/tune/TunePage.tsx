import * as stylex from "@stylexjs/stylex";
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useMemo, useRef } from "react";
import { type Kit, parseKit } from "../../shared/kit.ts";
import { DEFAULT_LOOK as D, type DitherLook } from "../kit3d/ditherLook.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { colors, fonts } from "../tokens.stylex.ts";

const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const models: Record<string, Kit> = Object.fromEntries(
  Object.entries(kitJson).map(([path, raw]) => [path.split("/").pop()?.replace(/\.json$/, "") ?? path, parseKit(raw)]),
);
const modelNames = Object.keys(models);

/** The colour picker can hand back OKLCH or Display P3 strings, and the look only takes #rrggbb. */
function toHex(css: string): string {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  const context = new OffscreenCanvas(1, 1).getContext("2d");
  if (!context) return "#000000";
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const styles = stylex.create({
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, boxSizing: "border-box", fontFamily: fonts.mono, fontSize: 13, color: colors.graphite },
  paper: (color: string) => ({ backgroundColor: color }),
  stage: (width: number) => ({ width, maxWidth: "100%", display: "flex", justifyContent: "center" }),
});

export default function TunePage() {
  // The reset handler is given to the hook that returns the controller, so it reaches the controller through a ref.
  const reset = useRef<() => void>(undefined);
  const controller = useDialKitController(
    "Dither",
    {
      model: { type: "select", options: modelNames, default: modelNames.includes("mug") ? "mug" : modelNames[0] },
      reset: { type: "action", label: "Reset to defaults" },
      pixels: {
        size: [D.pixels.size, 1, 8, 1],
        matrix: { type: "select", options: ["2", "4", "8"], default: String(D.pixels.matrix) },
        dither: [D.pixels.dither, 0, 1],
      },
      tones: {
        count: [D.tones.count, 2, 8, 1],
        dark: [D.tones.dark, 0, 1],
        light: [D.tones.light, 0, 1],
        curve: [D.tones.curve, 0.2, 3, 0.01],
      },
      light: {
        angle: [D.light.angle, -180, 180, 1],
        height: [D.light.height, 0, 90, 1],
        ambient: [D.light.ambient, 0, 1],
        rim: [D.light.rim, -1, 1, 0.01],
        contrast: [D.light.contrast, 0, 3, 0.01],
        brightness: [D.light.brightness, -0.5, 0.5],
        darkColors: [D.light.darkColors, 0, 1],
        specular: [D.light.specular, 0, 3, 0.01],
      },
      shadow: {
        show: D.shadow.show,
        softness: [D.shadow.softness, 0.2, 4, 0.05],
        core: [D.shadow.core, 0, 1],
      },
      colors: { ink: D.colors.ink, paper: D.colors.paper, accent: D.colors.accent },
      view: {
        spin: true,
        elevation: [20, -10, 80, 1],
        azimuth: [30, -180, 180, 1],
        height: [540, 180, 900, 10],
      },
    },
    { id: "larry-dither", persist: true, onAction: (action) => action === "reset" && reset.current?.() },
  );
  const dials = controller.values;
  reset.current = () => {
    const { model } = controller.getValues();
    controller.resetValues();
    controller.setValue("model", model);
  };

  const { pixels, tones, light, shadow, view } = dials;
  const ink = toHex(dials.colors.ink);
  const paper = toHex(dials.colors.paper);
  const accent = toHex(dials.colors.accent);
  const matrix = Number(pixels.matrix) as DitherLook["pixels"]["matrix"];

  const look = useMemo<DitherLook>(
    () => ({
      pixels: { size: pixels.size, matrix, dither: pixels.dither },
      tones: { count: tones.count, dark: tones.dark, light: tones.light, curve: tones.curve },
      light: { ...light },
      shadow: { ...shadow },
      colors: { ink, paper, accent },
    }),
    [pixels.size, matrix, pixels.dither, tones.count, tones.dark, tones.light, tones.curve, light, shadow, ink, paper, accent],
  );

  const kit = models[dials.model] ?? models[modelNames[0] ?? ""];
  if (!kit) return <div {...stylex.props(styles.page)}>No kits in fixtures/kits</div>;

  return (
    <div {...stylex.props(styles.page, styles.paper(paper))}>
      <div {...stylex.props(styles.stage(view.height))}>
        <KitViewer parts={kit.parts} spin={view.spin} elevation={view.elevation} azimuth={view.azimuth} height={view.height} look={look} />
      </div>
      <span>
        {kit.name} · {Math.floor(view.height / pixels.size)} pixels tall
      </span>
      <DialRoot defaultOpen />
    </div>
  );
}
