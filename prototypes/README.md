# Prototypes

Experiments that run beside the app without changing `src/`.

| Folder | Status |
|---|---|
| [`lesson/`](lesson/) | Current. The 3D dither lessons: learn a primitive, build the part, find and fix the fault. |
| [`demo/`](demo/) | Current. Aiden's camera, then the water bottle lesson in the same phone. `npx vite --config prototypes/demo/vite.config.ts`, then http://localhost:5176/. The camera is `src/mock/CameraMock.tsx` itself, given an `after` screen. |
