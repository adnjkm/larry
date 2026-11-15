/** The height of every 3D viewer and figure stage, so swapping one for another never shifts the page. */
export const VIEWPORT_HEIGHT = 270;

/** CSS pixels per dither pixel in the lesson's build viewer, so the grain matches the other viewers. */
export const VIEWPORT_GRAIN = VIEWPORT_HEIGHT / 180;

/**
 * Every canvas (KitViewer and the primitives' FigureStage) is wrapped in an element with `data-kit-viewer` and gets `data-ready` once it
 * has drawn a frame. The lesson's swipe ignores drags that start on a viewer, and the Playwright scripts wait on them.
 */
export const VIEWER_SELECTOR = "[data-kit-viewer]";
export const READY_VIEWER_SELECTOR = "[data-kit-viewer][data-ready]";
