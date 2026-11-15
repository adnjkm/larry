import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef } from "react";
import { TUNING } from "../camera/look.ts";
import { type MockSettings, type Pace } from "./settings.ts";

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
  onAction: (action: "replay" | "jump") => void;
}) {
  const reset = useRef<() => void>(undefined);
  const controller = useDialKitController(
    "Camera mockup",
    {
      object: { type: "select", options: objects, default: initial.object },
      pace: { type: "select", options: ["demo", "real"], default: initial.pace },
      replay: { type: "action", label: "Back to camera" },
      jump: { type: "action", label: "Jump to result" },
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
      reset: { type: "action", label: "Reset dials" },
    },
    {
      id: "larry-camera",
      persist: true,
      onAction: (action) => {
        if (action === "reset") reset.current?.();
        else if (action === "replay" || action === "jump") onAction(action);
      },
    },
  );
  reset.current = () => controller.resetValues();
  const { object, pace, shell, usableArea, sweep, develop } = controller.values;

  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    changed.current({
      object,
      pace: pace as Pace,
      tab: shell === "chrome tab",
      showUsable: usableArea,
      tuning: {
        sweep: { ...TUNING.sweep, ms: sweep.ms, curve: sweep.curve },
        develop: { wave: develop.sway, light: develop.glimmer, speed: develop.speed, glow: develop.glow, reach: develop.glowBlur },
      },
    });
  }, [object, pace, shell, usableArea, sweep.ms, sweep.curve, develop.sway, develop.glimmer, develop.speed, develop.glow, develop.glowBlur]);

  return <DialRoot defaultOpen position="top-right" />;
}
