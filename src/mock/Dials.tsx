import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef } from "react";
import { TUNING } from "../camera/look.ts";
import { MODEL, type MockSettings, type Pace, type StartScreen } from "./settings.ts";

/** The DialKit panel for the mockup: which object and pace, the phone's shell, and the parts of the look still being tuned. Dev only. */
export default function Dials({
  objects,
  initial,
  onChange,
  onAction,
}: {
  objects: string[];
  initial: MockSettings;
  onChange: (settings: MockSettings) => void;
  onAction: (action: "replay") => void;
}) {
  const reset = useRef<() => void>(undefined);
  const controller = useDialKitController(
    "Camera mockup",
    {
      object: { type: "select", options: objects, default: initial.object },
      pace: { type: "select", options: ["demo", "real"], default: initial.pace },
      screen: { type: "select", options: ["camera", "model"], default: initial.screen },
      replay: { type: "action", label: "Replay" },
      shell: { type: "select", options: ["installed app", "chrome tab"], default: "installed app" },
      usableArea: initial.showUsable,
      sweep: {
        ms: [TUNING.sweep.ms, 600, 4000, 100],
        curve: [TUNING.sweep.curve, 0, 0.4, 0.01],
      },
      develop: {
        sway: [TUNING.develop.wave, 0, 12, 0.5],
        glimmer: [TUNING.develop.light, 0, 1, 0.05],
        speed: [TUNING.develop.speed, 0.2, 3, 0.1],
        glow: [TUNING.develop.glow, 0, 1, 0.05],
        glowBlur: [TUNING.develop.reach, 4, 48, 2],
      },
      model: {
        height: [MODEL.height, 320, 720, 4],
        tilt: [MODEL.tilt, -30, 30, 1],
        steps: [MODEL.steps, 1, 9, 1],
        keyHeight: [MODEL.keyHeight, 16, 64, 2],
      },
      reset: { type: "action", label: "Reset dials" },
    },
    {
      id: "larry-camera",
      persist: true,
      onAction: (action) => {
        if (action === "reset") reset.current?.();
        else if (action === "replay") onAction(action);
      },
    },
  );
  reset.current = () => controller.resetValues();
  const { object, pace, screen, shell, usableArea, sweep, develop, model } = controller.values;

  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current({
      object,
      pace: pace as Pace,
      screen: screen as StartScreen,
      tab: shell === "chrome tab",
      showUsable: usableArea,
      tuning: {
        sweep: { ...TUNING.sweep, ms: sweep.ms, curve: sweep.curve },
        develop: { wave: develop.sway, light: develop.glimmer, speed: develop.speed, glow: develop.glow, reach: develop.glowBlur },
      },
      model: { height: model.height, tilt: model.tilt, steps: model.steps, keyHeight: model.keyHeight },
    });
  }, [
    object,
    pace,
    shell,
    usableArea,
    sweep.ms,
    sweep.curve,
    develop.sway,
    develop.glimmer,
    develop.speed,
    develop.glow,
    develop.glowBlur,
    screen,
    model.height,
    model.tilt,
    model.steps,
    model.keyHeight,
  ]);

  return <DialRoot defaultOpen position="top-right" />;
}
