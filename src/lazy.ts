import { lazy } from "react";

/** The 3D viewer and the lesson player are most of the app's code and the capture screen needs neither, so they load on demand. */
const loadKitViewer = () => import("./kit3d/KitViewer.tsx").then((m) => ({ default: m.KitViewer }));
const loadLessonPlayer = () => import("./lesson/LessonPlayer.tsx").then((m) => ({ default: m.LessonPlayer }));

export const KitViewer = lazy(loadKitViewer);
export const LessonPlayer = lazy(loadLessonPlayer);

/** Start the downloads before the screen that needs them, so it appears without a wait. */
export const prefetchKitViewer = () => void loadKitViewer();
export const prefetchLessonPlayer = () => void loadLessonPlayer();
/** Creates the figures' renderer and compiles their shaders while the browser is idle. */
export const prefetchStage = () => void import("./primitives/stage/looks.ts").then(({ warmUpStage }) => warmUpStage());
