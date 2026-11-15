// A DialKit panel for rehearsing: jump to any page of the lesson, or step one back or on. Dev only. `own` adds the
// panel's root too, for when the camera mock's dials are not already on the page.
import { DialRoot, useDialKitController } from "dialkit";
import "dialkit/styles.css";
import { useEffect, useRef } from "react";

export default function LessonDials({ pages, at, onGo, own }: { pages: readonly string[]; at: number; onGo: (page: number) => void; own: boolean }) {
  const go = useRef(onGo);
  go.current = onGo;
  const here = useRef(at);
  here.current = at;
  const lesson = useDialKitController(
    "Lesson",
    {
      page: { type: "select", options: [...pages], default: pages[at]! },
      back: { type: "action", label: "Previous page" },
      next: { type: "action", label: "Next page" },
    },
    { id: "larry-lesson-pages", persist: false, onAction: (action) => go.current(here.current + (action === "next" ? 1 : -1)) },
  );
  const { page } = lesson.values;

  // Picking a page goes there; moving through the lesson moves the dropdown. `shown` is the page the dropdown was last
  // made to show, so only a pick by hand moves the lesson, never the dropdown catching up with it.
  const shown = useRef(pages[at]);
  useEffect(() => {
    if (page === shown.current) return;
    shown.current = page;
    const picked = pages.indexOf(page);
    if (picked >= 0 && picked !== here.current) go.current(picked);
  }, [page]);
  useEffect(() => {
    if (shown.current === pages[at]) return;
    shown.current = pages[at];
    lesson.setValue("page", pages[at]!);
  }, [at]);

  return own ? <DialRoot defaultOpen position="top-right" /> : null;
}
