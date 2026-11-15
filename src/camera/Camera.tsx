import * as stylex from "@stylexjs/stylex";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useRef, useState } from "react";
import { colors, fonts } from "../tokens.stylex.ts";
import { CAMERA, type Tuning } from "./look.ts";
import { Shutter } from "./Shutter.tsx";
import { TopBar } from "./TopBar.tsx";
import { type View, Viewfinder, type ViewfinderHandle } from "./Viewfinder.tsx";
import { ZoomWheel } from "./ZoomWheel.tsx";

const flashOut = stylex.keyframes({ "0%": { opacity: 0 }, "15%": { opacity: 0.9 }, "100%": { opacity: 0 } });

/**
 * The camera: the photo bar and flash switch, the viewfinder, and below it the zoom wheel, the shutter and Use. Each
 * shot sweeps the next view up the frame; the last one (or Use) unveils the photo in grey dither and hands the shots
 * over with `onCapture`. After that the controls dim and `busy` turns the photo bar into a loader. Space takes a
 * photo, Enter uses them.
 */
export function Camera({ photo, width, height, busy, tuning, onCapture }: { photo: string; width: number; height: number; busy: boolean; tuning: Tuning; onCapture: (shots: number) => void }) {
  const box = { width: width - 2 * CAMERA.sideInset, height: Math.max(160, height - 2 * CAMERA.barHeight) };
  const [shots, setShots] = useState(0);
  // The photo bar fills when the band reaches the top of the frame, not on the press, so the photo looks carried up into it.
  const [filled, setFilled] = useState(0);
  const [view, setView] = useState<View>({ angle: 0, developed: null });
  const [frozen, setFrozen] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [burst, setBurst] = useState(0);
  const viewfinder = useRef<ViewfinderHandle>(null);

  function capture(n: number) {
    const vf = viewfinder.current;
    if (!vf) return;
    setCaptured(true);
    setFrozen(true);
    setView((v) => ({ ...v, developed: vf.framing() }));
    onCapture(n);
  }

  function shoot() {
    const vf = viewfinder.current;
    if (captured || frozen || shots >= CAMERA.maxPhotos || !vf) return;
    const n = shots + 1;
    setFrozen(true);
    if (flashOn) setBurst((b) => b + 1);
    setShots(n);
    vf.sweep(() => {
      setFilled(n);
      setFrozen(false);
    });
    if (n >= CAMERA.maxPhotos) capture(n);
    else setView((v) => ({ ...v, angle: n }));
  }

  function use() {
    if (!captured && shots > 0 && !frozen) {
      viewfinder.current?.sweep(() => {});
      capture(shots);
    }
  }

  const keys = useRef({ shoot, use });
  keys.current = { shoot, use };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPressed(true);
        keys.current.shoot();
      } else if (e.code === "Enter") keys.current.use();
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setPressed(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const live = !captured;
  return (
    <>
      <div {...stylex.props(s.dimmable, !live && s.dimmed)}>
        <TopBar shots={filled} busy={busy} flashOn={flashOn} onFlash={setFlashOn} />
      </div>
      <Viewfinder ref={viewfinder} photo={photo} box={box} view={view} live={live} frozen={frozen || !live} tuning={tuning} />
      <div {...stylex.props(s.lower, s.dimmable, !live && s.dimmed)}>
        <div {...stylex.props(s.controls((width - box.width) / 2))}>
          <div {...stylex.props(s.slot, s.start)}>
            <ZoomWheel onZoom={(z) => viewfinder.current?.zoom(z)} />
          </div>
          <Shutter disabled={!live} pressed={pressed} onPress={setPressed} onShoot={shoot} />
          <div {...stylex.props(s.slot)}>
            {shots > 0 && shots < CAMERA.maxPhotos && (
              <Button {...stylex.props(s.use)} onClick={use}>
                Use {shots} →
              </Button>
            )}
          </div>
        </div>
      </div>
      {burst > 0 && <div key={burst} {...stylex.props(s.flash)} />}
    </>
  );
}

const s = stylex.create({
  // While Larry works the controls dim, leaving the glowing frame to hold the eye.
  dimmable: { flexShrink: 0, transition: "opacity 500ms ease" },
  dimmed: { opacity: 0.3, pointerEvents: "none" },
  lower: { position: "relative", flexGrow: 1, display: "flex", flexDirection: "column" },
  // Three columns, the outer two equal, so the shutter stays centred however wide the wheel gets. Inset like the frame
  // and with no gap, so each side slot spans exactly from the frame's edge to the shutter.
  controls: (inset: number) => ({ flexGrow: 1, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", paddingInline: inset }),
  slot: { minWidth: 0, display: "flex", justifyContent: "center" },
  start: { justifyContent: "flex-start" },
  use: { padding: 0, borderWidth: 0, backgroundColor: "transparent", color: colors.paper, fontFamily: fonts.sans, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  flash: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: colors.paper,
    pointerEvents: "none",
    opacity: 0,
    animationName: flashOut,
    animationDuration: "420ms",
  },
});
