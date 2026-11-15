import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef, useState } from "react";
import { TUNING } from "../camera/look.ts";
import { MODEL, type MockSettings, type Pace, type Screen } from "./settings.ts";

type Patch = (settings: Partial<MockSettings>) => void;

/**
 * The DialKit panels for the mockup. Dev only. "Mockup" is always there: which screen is on the phone, the object, the
 * pace and the phone's shell. Under it, only the dials for the screen on the phone show, whether it got there from the
 * dropdown or by using the flow: the camera's sweep and develop light, or the model screen's layout.
 */
export default function Dials({
  objects,
  screens,
  current,
  initial,
  onChange,
  onReplay,
}: {
  objects: string[];
  screens: readonly Screen[];
  /** The screen on the phone now. The dropdown follows it. */
  current: Screen;
  initial: MockSettings;
  onChange: Patch;
  onReplay: () => void;
}) {
  const replay = useRef(onReplay);
  replay.current = onReplay;
  const mockup = useDialKitController(
    "Mockup",
    {
      screen: { type: "select", options: [...screens], default: initial.screen },
      replay: { type: "action", label: "Replay this screen" },
      object: { type: "select", options: objects, default: initial.object },
      pace: { type: "select", options: ["demo", "real"], default: initial.pace },
      shell: { type: "select", options: ["installed app", "chrome tab"], default: "installed app" },
      usableArea: initial.showUsable,
    },
    { id: "larry-mockup", persist: true, onAction: (action) => action === "replay" && replay.current() },
  );
  const { screen, object, pace, shell, usableArea } = mockup.values;

  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current({ screen: screen as Screen, object, pace: pace as Pace, tab: shell === "chrome tab", showUsable: usableArea });
  }, [screen, object, pace, shell, usableArea]);

  // Using the flow moves the phone on (a shot develops into the model, Build It opens the lesson); the dropdown follows.
  // Only on a move: on load the saved choice wins, and the phone jumps to it.
  const was = useRef(current);
  useEffect(() => {
    if (was.current === current) return;
    was.current = current;
    if (mockup.values.screen !== current) mockup.setValue("screen", current);
  }, [current]);

  // The screens' panels register after this one, so the Mockup panel and its dropdown stay at the top.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      {mounted && current === "camera" && <CameraDials onChange={onChange} />}
      {mounted && current === "model" && <ModelDials onChange={onChange} />}
      <DialRoot defaultOpen position="top-right" />
    </>
  );
}

/** The camera's look still being tuned: the capture sweep, and the grey photo's swell and glow after the last shot. */
function CameraDials({ onChange }: { onChange: Patch }) {
  const reset = useRef<() => void>(() => {});
  const controller = useDialKitController(
    "Camera",
    {
      sweep: {
        // Renamed from ms when the default went from 2700 to 1400, so a saved 2700 is dropped.
        lengthMs: [TUNING.sweep.ms, 600, 4000, 100],
        curve: [TUNING.sweep.curve, 0, 0.4, 0.01],
      },
      develop: {
        sway: [TUNING.develop.wave, 0, 12, 0.5],
        glimmer: [TUNING.develop.light, 0, 1, 0.05],
        speed: [TUNING.develop.speed, 0.2, 3, 0.1],
        glow: [TUNING.develop.glow, 0, 1, 0.05],
        glowBlur: [TUNING.develop.reach, 4, 48, 2],
      },
      reset: { type: "action", label: "Reset camera dials" },
    },
    { id: "larry-camera", persist: true, onAction: (action) => action === "reset" && reset.current() },
  );
  reset.current = () => controller.resetValues();
  const { sweep, develop } = controller.values;
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current({
      tuning: {
        sweep: { ...TUNING.sweep, ms: sweep.lengthMs, curve: sweep.curve },
        develop: { wave: develop.sway, light: develop.glimmer, speed: develop.speed, glow: develop.glow, reach: develop.glowBlur },
      },
    });
  }, [sweep.lengthMs, sweep.curve, develop.sway, develop.glimmer, develop.speed, develop.glow, develop.glowBlur]);
  return null;
}

/** The model screen's layout still being tuned. */
function ModelDials({ onChange }: { onChange: Patch }) {
  const reset = useRef<() => void>(() => {});
  const controller = useDialKitController(
    "Model",
    {
      height: [MODEL.height, 320, 720, 4],
      tilt: [MODEL.tilt, -30, 30, 1],
      steps: [MODEL.steps, 1, 9, 1],
      keyHeight: [MODEL.keyHeight, 16, 64, 2],
      reset: { type: "action", label: "Reset model dials" },
    },
    { id: "larry-model", persist: true, onAction: (action) => action === "reset" && reset.current() },
  );
  reset.current = () => controller.resetValues();
  const { height, tilt, steps, keyHeight } = controller.values;
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current({ model: { height, tilt, steps, keyHeight } });
  }, [height, tilt, steps, keyHeight]);
  return null;
}
