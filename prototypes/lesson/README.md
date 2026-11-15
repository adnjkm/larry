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

Every step is one phone screen with no scrolling: the top bar (back, object, a dot per step, the goal
photo), one line saying what to do, the 3D viewer filling the rest, the step's controls, and the action
pinned at the bottom. Everything explanatory (the principle, hints, readouts, game numbers) sits behind
one **Why?** or **Hint** button that opens a bottom sheet.

Each module meets one requirement ("It must…") in four steps:

1. **Learn**: play with the primitive on its own (lever, spring, thread…). Every slider is live. Beside
   it, a small drawing of the object with the part pink and one sentence on what the primitive does in
   this object (`uses` in the module).
2. **Build**: tap the piece, then the ring where it goes. That makes the part. A lesson with
   `build: "drag"` (the bottle) plays it by hand instead: the real piece rests beside the object in
   pink, a faint outline marks where it goes, and you drag the piece onto it. The outline turns pink
   when the piece is close, and the piece lands by itself: a thread spins down, anything else presses
   in. Dropped elsewhere, it springs back. `DragBuild.tsx`, `lens.ts` and `outline.ts`.
3. **Test and fix**: run tests, watch the object fail in 3D, tap the part at fault, then tune it with
   the slider that takes the chips' place (`task` is its instruction, 8 words at most).
   Every fix has a two-sided window: too low fails one test, too high fails another.
4. **Earned**: the part turns pink and the requirement is ticked.

The final module, **Piece it together**, runs every test at once.

### Story lessons (the water bottle)

A story lesson (`defineStory`, `Story.tsx`, `Play.tsx`) teaches the same parts with no numbers anywhere:
no units, counts, percentages or slider values on any screen or sheet. Each module runs:

1. **Without it**: the object without this part fails in 3D (the cap shakes off, the neck drips).
2. **Learn**: the primitive from the shared library (`src/primitives`), drawn by its own figure stage with
   its drag handle on the part ("Twist", "Press") and its slider row under it, and a Why sheet in plain words.
3. **Build**: as above.
4. **Make it work**: slide the twist to turn the cap on. The word beside it (Loose, Snug, Too tight)
   comes from the same zones the tests read, and the slider gets stiffer as it tightens.

The final screen runs every test and names each part's job. `defineStory` refuses any copy with a
digit, and `verify.ts` checks that no digit shows on any screen. Only the bottle uses it so far.

The bottle draws its own hand-made model (`lessons/bottle-kit.ts`, the story's `kit`) in place of the
scanned one: a coated double wall on a steel base, a threaded steel neck rolled over at the lip, a steel
cap with a knurled grip, inner thread, top disc and carry loop, and a seal ring with its bead and tab.
The lesson's ids (body, cap, seal-ring, ring-tab) are the roots of its assemblies; every detail part is
fixed to one (molded, weld or glue), and `bindStory` makes each module earn its parts with everything
fixed to them, so they move, show and turn pink together. Beads, seams and rolls are drawn into a
part's lathe profile instead of being parts of their own, which keeps the mesh count low.

### Explode on springs

A lesson with an `explode` plan (the bottle) comes apart by assemblies, each on its own spring
(`explode.ts`, stiffness 64, damping 14.2, just under critical), started 50 ms apart in the plan's
order: the cap leaves first, unscrewing as it lifts, then the seal slides up off the neck; closing
reverses it. The slider and every automatic explode only set the target (`useExplode.ts`); a reversal
restaggers only the assemblies whose target changes. A test never runs on an open object: it closes up
first and waits for every spring to land, and a piece dropped in Build waits above its place until the
object is shut. Reduced motion goes straight to the target. `verify.ts` replays the springs (opening,
closing, reversed at each stagger boundary, prefix states) and fails if any assembly's cut passes into
another's.

Which lesson an object gets: a hand-written lesson if one matches, otherwise one generated from the
kit's joints and words, otherwise Inspect (take it apart and name each part's job).

## Files

| Path | What it is |
|---|---|
| `model.ts` | The lesson as data: Workshop, Inspect, modules, tests, verdicts |
| `pose.ts` | Turns a kit plus part moves and Explode into what the viewer draws |
| `samples.ts` | The 8 sample photos and their kits, from `fixtures/` |
| `lessons/` | Hand-written lessons (`pen`, `stapler`, and `bottle` as a story) and the Inspect lesson |
| `templates/` | One template per mechanism, used to build a lesson for any kit |
| `templates/evidence.ts` | Which template a part gets, from the kit's own words first and its joint second |
| `App.tsx`, `main.tsx` | Picks the lesson for a sample and mounts the app |
| `Home.tsx` | Sample picker and scan screen |
| `Workshop.tsx`, `Learn.tsx`, `Assemble.tsx`, `Sandbox.tsx` | The module steps above |
| `LearnRig.tsx` | A story's Learn step: the library figure, its handle and slider rows from `src/primitives` |
| `DragBuild.tsx`, `lens.ts`, `outline.ts` | Build by dragging: the step, screen to kit and back through the viewer's camera, the ghost outline |
| `Story.tsx`, `Play.tsx` | The story lesson's flow and its test screens (without it, make it work, final) |
| `Inspect.tsx` | The take-apart lesson |
| `ui.tsx`, `dither.tsx`, `anim.ts`, `ease.ts` | Shared UI, the dithered photo, animation helpers |
| `base.css`, `lesson.css` | Styles |
| `explode.ts`, `useExplode.ts` | The explode's springs (pure, replayed by verify) and the screen's hook |
| `lessons/bottle-kit.ts` | The bottle lesson's hand-made model |
| `bench.html`, `bench.tsx` | Frame-time bench and frozen explode frames for the bottle (`?kit=scanned` for the old four-part kit) |
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
