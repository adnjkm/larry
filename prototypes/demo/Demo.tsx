// Aiden's camera, then the water bottle lesson inside the same phone screen. The camera is src/mock/CameraMock.tsx with
// Build it handing over; the lesson is prototypes/lesson's StoryFlow, unchanged.
import { useLayoutEffect, useRef, useState } from "react";
import baseCss from "../lesson/base.css?inline";
import lessonCss from "../lesson/lesson.css?inline";
import { lessonFor } from "../lesson/lessons/index.ts";
import { SAMPLES } from "../lesson/samples.ts";
import { StoryFlow } from "../lesson/Story.tsx";
import CameraMock, { type PhoneScreen } from "../../src/mock/CameraMock.tsx";

const SAMPLE = SAMPLES.find((s) => s.id === "bottle")!;
const LESSON = lessonFor(SAMPLE.kit, SAMPLE.id);
if (LESSON.kind !== "story") throw new Error("the bottle lesson should be a story");
const STORY = LESSON;

/**
 * The lesson's stylesheets, scoped to the lesson so their element rules (box-sizing, button fonts) never reach the
 * camera. Keyframes stay global, since they're looked up by name; the page rules for html and body are dropped.
 */
const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const css = baseCss + "\n" + lessonCss;
const LESSON_CSS = `${(css.match(KEYFRAMES) ?? []).join("\n")}
@scope (.demo-lesson) {
${css
  .replace(KEYFRAMES, "")
  .replace(/html,\s*body\s*\{[^}]*\}/g, "")
  .replace(/:root/g, ":scope")}
}`;

/** The lesson in the phone: it fills the screen between the status bar and the gesture bar. */
function Lesson({ screen, onCamera }: { screen: PhoneScreen; onCamera: () => void }) {
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // The Why and Hint sheets are modal dialogs, drawn over the whole window; these keep them on the phone's screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const scale = r.width / screen.width;
      const root = document.documentElement.style;
      root.setProperty("--phone-left", `${r.left}px`);
      root.setProperty("--phone-bottom", `${window.innerHeight - r.bottom}px`);
      root.setProperty("--phone-top", `${r.top}px`);
      root.setProperty("--phone-width", `${screen.width}px`);
      root.setProperty("--phone-height", `${screen.height}px`);
      root.setProperty("--phone-scale", String(scale));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [screen.width]);
  return (
    <div className="demo-lesson" ref={box}>
      <StoryFlow key={run} story={STORY} kit={SAMPLE.kit} photo={SAMPLE.photo} onHome={onCamera} onRestart={() => setRun((r) => r + 1)} />
    </div>
  );
}

const INTRO = {
  eyebrow: "Larry · demo",
  heading: "Photo to lesson",
  blurb: "Tap the shutter one to three times, then Use. When the model is ready, Build it starts the lesson.",
};

export function Demo() {
  return (
    <>
      <style>{LESSON_CSS}</style>
      <style>{DEMO_CSS}</style>
      <CameraMock object="bottle" intro={INTRO} after={(props) => <Lesson {...props} />} />
    </>
  );
}

const DEMO_CSS = `
.demo-lesson { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; color: #141414; font-family: Geist, system-ui, sans-serif; -webkit-font-smoothing: antialiased; animation: demo-lesson-in 420ms cubic-bezier(0.23, 1, 0.32, 1); }
.demo-lesson .screen { height: 100%; max-width: none; }
/* The Why card sits in the middle of the phone's screen, at the phone's scale. */
.demo-lesson dialog.sheet[open] {
  position: fixed; inset: auto; margin: 0;
  left: calc(var(--phone-left) + var(--phone-width) * var(--phone-scale) / 2);
  top: calc(var(--phone-top) + var(--phone-height) * var(--phone-scale) / 2);
  width: min(calc(var(--phone-width) - 40px), 380px);
  translate: -50% -50%; scale: var(--phone-scale);
}
.demo-lesson dialog.sheet .sheet-in { max-height: calc(var(--phone-height) * 0.64); }
@keyframes demo-lesson-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .demo-lesson { animation: none; } }
`;
