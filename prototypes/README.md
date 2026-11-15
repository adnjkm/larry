# Prototypes

Experiments that run beside the app without changing `src/`.

| Folder | Status |
|---|---|
| [`lesson/`](lesson/) | Current. The 3D dither lessons: learn a primitive, build the part, find and fix the fault. |
| [`demo/`](demo/) | Current. Aiden's camera, then the water bottle lesson in the same phone. `npx vite --config prototypes/demo/vite.config.ts`, then http://localhost:5176/. `Camera.tsx` is a copy of `src/mock/CameraMock.tsx`: when his changes, re-apply them there. |
| `archive/games/` | Superseded. The first 2D game types (Tune, Pick, Place, Stand in, Seal). |
| `archive/scan/` | Superseded. Sample photo to requirements list, using the 2D games. |
