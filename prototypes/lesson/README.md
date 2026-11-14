# Lesson prototype

Pick a sample photo, then learn how the object works by building it from primitives. Every object and
part is drawn in the 3D dither style (KitViewer). You can always rotate the object and pull it apart
with the Explode slider.

## Run it

```sh
npx -y pnpm@10 install
npx -y pnpm@10 dev:web
```

Open `/prototypes/lesson/` at the address Vite prints. It is built for a phone-sized screen.

- `?generated` forces the lesson made from joint templates, for comparison with a hand-written one.
- `?inspect` forces the take-apart lesson.

## How a lesson runs

Each module meets one requirement ("It must…") in four steps:

1. **Learn**: play with the primitive on its own (lever, spring, thread…). Every slider is live.
2. **Build**: pick up the piece and drop it on the object. That makes the part.
3. **Test and fix**: run tests, watch the object fail in 3D, tap the part at fault, then tune it.
   Every fix has a two-sided window: too low fails one test, too high fails another.
4. **Earned**: the part turns pink and the requirement is ticked.

The final module, **Piece it together**, runs every test at once.

Which lesson an object gets: a hand-written lesson if one matches, otherwise one generated from the
kit's joints and words, otherwise Inspect (take it apart and name each part's job).

## Files

| Path | What it is |
|---|---|
| `model.ts` | The lesson as data: Workshop, Inspect, modules, tests, verdicts |
| `pose.ts` | Turns a kit plus part moves and Explode into what the viewer draws |
| `samples.ts` | The 8 sample photos and their kits, from `fixtures/` |
| `lessons/` | Hand-written lessons (`pen`, `stapler`, `bottle`) and the Inspect lesson |
| `templates/` | One template per mechanism, used to build a lesson for any kit |
| `templates/evidence.ts` | Which template a part gets, from the kit's own words first and its joint second |
| `App.tsx`, `main.tsx` | Picks the lesson for a sample and mounts the app |
| `Home.tsx` | Sample picker and scan screen |
| `Workshop.tsx`, `Learn.tsx`, `Assemble.tsx`, `Sandbox.tsx` | The module steps above |
| `Inspect.tsx` | The take-apart lesson |
| `ui.tsx`, `dither.tsx`, `anim.ts`, `ease.ts` | Shared UI, the dithered photo, animation helpers |
| `base.css`, `lesson.css` | Styles |
| `verify.ts` | Plays every lesson in a headless browser and saves screenshots to `out/lesson/` |

Templates today: thread, press-fit, snap-fit, spring, hinge (lever), seal, stand (weight), clamp (grip).

## Check it

`node prototypes/lesson/verify.ts pen` plays one sample; `node prototypes/lesson/verify.ts` plays them
all (about 20 minutes). Screenshots land in `out/lesson/`.

## Style rules

- Parts are neutral grey. Pink `#FF0087` only on the piece being taught.
- Purple `#8700AF` only for small marks: arrows, drops, edges.
- The Synthwave colours are only for shadows. Dither at 1px.
- No quizzes and no x-ray: Explode is the only way inside.
