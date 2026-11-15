# Where things live

Arrows point the way imports may go: `src → shared`, never back. `pnpm lint` enforces it (`larry/shared-pure`).

| Folder | What it is | Depends on |
|---|---|---|
| `shared/` | Node-safe contracts the server and the app both read: the kit and lesson schemas (`kit.ts`, `lesson.ts`), the lesson rules the prompts, schemas and checks all use (`rules.ts`), the NDJSON stream protocol (`ndjson.ts`), part bounds without building geometry (`bounds.ts`), `angles.ts`, `segments.ts`. | zod, three's math only |
| `shared/primitives/` | The 17 primitives: `types.ts` (Primitive, Slider, `valueOf` and the other slider helpers), `parts.ts` (palette and part helpers), `motion/` (easing, run timing, the sweep), `models/`, `library.ts`, `catalog.ts`, baked `framing.json` (regenerate: `node scripts/generate-framing.ts`), `checks.ts` (test helpers). | `shared/` |
| `server/` | Hono + Claude Agent SDK. Builds JSON schemas (`schemas.ts`), streams kits and lessons, aborts Claude when the client goes away. | `shared/` |
| `src/ui/` | Shared widgets and StyleX style groups (HoldButton, Chevron, Dots, `styles.ts`). Tokens are `src/tokens.stylex.ts`. | |
| `src/viewport.ts` | The viewer contract: height, grain, `viewerProps`, `markViewerReady`, the selectors scripts wait on. | |
| `src/lazy.ts` | Everything loaded after first paint (KitViewer, LessonPlayer, the stage warm-up), with prefetches. | |
| `src/kit3d/` | The scanned kit in 3D: KitViewer (react-three-fiber), geometry, the one dither material (`ditherMaterial.ts`, looks in `ditherLook.ts`), GLB export. | `shared/` |
| `src/primitives/` | Showing primitives: `stage/` (one shared WebGL renderer for every figure, render on demand), FigureStage, PrimitiveFigure, the game screen, and the `?primitives` / `?play` / `?stage` dev pages. | `shared/primitives`, `src/kit3d` |
| `src/surface/` | The 2D dither look system: `dither.ts` (one Bayer, noise, colour snap, rounded-rect distance, pixel raster), `ticker.ts` (one rAF for every 2D loop), baked raised surfaces (`bake.ts`, `paint.ts`, `Surface.tsx`). New raised parts get a `RELIEF` preset, not one-off shading. | |
| `src/camera/` | The camera screen: Camera and its parts, the shot sweep and develop swell (`light.ts`), frozen design values (`look.ts`). | `src/surface` |
| `src/mock/` | The phone-frame shell around the camera for `camera.html`; DialKit loads in dev only. | `src/camera` |
| `src/lesson/`, `src/capture/`, `src/App.tsx` | The app flow: photo → kit stream → lesson stream → lesson player. | everything above |
| `scripts/` | Generators and Playwright checks. `scripts/browser.ts` is the one Chromium harness. | |
| `prototypes/` | Demo apps (`lesson/`, `demo/`). Typechecked with the rest; `prototypes/lesson/primitives/` is a deliberate frozen copy. | |

Baked files to regenerate when their inputs change (a test fails when they are stale): `shared/primitives/framing.json` (`node scripts/generate-framing.ts`), `shared/primitives/models/ratchetTable.ts` (`node scripts/ratchet-table.ts`).
