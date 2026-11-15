# Prototypes

Experiments that run beside the app without changing `src/`.

| Folder | Status |
|---|---|
| [`lesson/`](lesson/) | Current. The 3D dither lessons: learn a primitive, build the part, find and fix the fault. |
| [`demo/`](demo/) | Current. Aiden's camera, then the object's lesson in the same phone. Two commands, two ports: `pnpm demo` (water bottle, http://localhost:5176/) and `pnpm demo:pen` (click pen, http://localhost:5177/). The camera is `src/mock/CameraMock.tsx` itself, given an `after` screen. |
