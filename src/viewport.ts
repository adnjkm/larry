/** The height of every 3D viewer and figure stage, so swapping one for another never shifts the page. */
export const VIEWPORT_HEIGHT = 270;

/** CSS pixels per dither pixel in the lesson's build viewer. The primitives' figure stage uses the same 1.5 (its GRAIN_CSS_PX), so the two never differ in grain. */
export const VIEWPORT_GRAIN = 1.5;

/**
 * Every canvas (KitViewer and the primitives' FigureStage) is wrapped in an element with `data-kit-viewer` (viewerProps) and gets `data-ready` (markViewerReady) once it
 * has drawn a frame. The lesson's swipe ignores drags that start on a viewer, and the Playwright scripts wait on them.
 */
export const VIEWER_SELECTOR = "[data-kit-viewer]";
export const READY_VIEWER_SELECTOR = "[data-kit-viewer][data-ready]";

/** Spread on a viewer's wrapper element. */
export const viewerProps = { "data-kit-viewer": "" } as const;

export function markViewerReady(wrapper: Element | null | undefined, ready = true) {
  if (ready) wrapper?.setAttribute("data-ready", "");
  else wrapper?.removeAttribute("data-ready");
}
