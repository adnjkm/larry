// The Pixel 8a frame the demo uses (src/mock/CameraMock.tsx), for screens that aren't the camera flow: the bezel, the
// status bar, the camera hole and the gesture handle, with the screen in the usable area between the bars. The
// geometry is CameraMock's; it isn't shared yet because CameraMock keeps its frame private.
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** CSS px. 1080 x 2400 at a device pixel ratio of 2.625. */
export const DEVICE = { width: 412, height: 915, radius: 44, bezel: 10, hole: 12 };
const STATUS_BAR = 52;
const GESTURE_BAR = 24;
const HANDLE = { x: 152, y: 900.5, width: 108, height: 3.5 };
const FRAME = { width: DEVICE.width + 2 * DEVICE.bezel, height: DEVICE.height + 2 * DEVICE.bezel };

/** Room the page keeps round the phone. */
const MARGIN = 32;

/** Shrinks the phone on short windows so the whole screen stays visible. */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - MARGIN) / FRAME.height));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

/**
 * The phone, with `children` filling the screen between the status bar and the gesture bar. It sets the --phone-*
 * variables the lesson's Why sheet reads, so a modal dialog drawn over the whole window still lands on the phone.
 */
export function Phone({ children }: { children: ReactNode }) {
  const scale = useFitScale();
  const screen = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const root = document.documentElement.style;
      root.setProperty("--phone-left", `${r.left}px`);
      root.setProperty("--phone-top", `${r.top}px`);
      root.setProperty("--phone-width", `${DEVICE.width}px`);
      root.setProperty("--phone-height", `${DEVICE.height}px`);
      root.setProperty("--phone-scale", String(r.width / DEVICE.width));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [scale]);

  const usableTop = STATUS_BAR;
  const usableHeight = DEVICE.height - STATUS_BAR - GESTURE_BAR;
  return (
    <div style={{ width: FRAME.width * scale, height: FRAME.height * scale, flexShrink: 0 }}>
      <div className="phone" style={{ transform: `scale(${scale})` }}>
        <div className="phone-screen" ref={screen}>
          <div className="phone-usable" style={{ top: usableTop, height: usableHeight }}>
            {children}
          </div>
          <StatusBar />
          <div className="phone-hole" />
          <div className="phone-handle" />
        </div>
      </div>
    </div>
  );
}

/** Android's status bar at 12:30, the icons where Android draws them. */
function StatusBar() {
  return (
    <svg className="phone-status" width={DEVICE.width} height={STATUS_BAR} viewBox={`0 0 ${DEVICE.width} ${STATUS_BAR}`} fill="currentColor" aria-hidden>
      <text x="31" y="30.9" fontFamily="'Google Sans', Roboto, system-ui, sans-serif" fontSize="14.5" fontWeight="500">
        12:30
      </text>
      <path d="M346.65 32 L339.4 21.7 A12.6 12.6 0 0 1 353.9 21.7 Z" />
      <path d="M355.4 32 L367.6 32 L367.6 19.4 Z" />
      <rect x="377.4" y="19.4" width="2.9" height="1.6" rx="0.4" />
      <rect x="375.2" y="20.6" width="7.3" height="11.4" rx="1.3" />
    </svg>
  );
}

export const PHONE_CSS = `
.phone { box-sizing: border-box; width: ${FRAME.width}px; height: ${FRAME.height}px; padding: ${DEVICE.bezel}px; border-radius: ${DEVICE.radius + DEVICE.bezel}px; background: #0a0a0a; box-shadow: 0 40px 80px -24px rgba(0, 0, 0, 0.35); transform-origin: top left; }
.phone-screen { position: relative; width: ${DEVICE.width}px; height: ${DEVICE.height}px; border-radius: ${DEVICE.radius}px; overflow: hidden; background: #fff; color: #141414; }
.phone-usable { position: absolute; left: 0; width: ${DEVICE.width}px; display: flex; flex-direction: column; }
.phone-status { position: absolute; top: 0; left: 0; }
.phone-hole { position: absolute; top: ${STATUS_BAR / 2 - DEVICE.hole / 2}px; left: ${DEVICE.width / 2 - DEVICE.hole / 2}px; width: ${DEVICE.hole}px; height: ${DEVICE.hole}px; border-radius: 999px; background: #000; }
.phone-handle { position: absolute; top: ${HANDLE.y}px; left: ${HANDLE.x}px; width: ${HANDLE.width}px; height: ${HANDLE.height}px; border-radius: 999px; background: #141414; opacity: 0.9; }
`;
