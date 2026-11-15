# Motion language

How every primitive's `game.play(values)` moves. It is the grammar Everest's lesson prototype already uses on scanned objects (`prototypes/lesson/` on origin/main: `lessons/stapler.ts`, `templates/thread.ts`, `templates/motions.ts`, `templates/stand.ts`). Match its quality: the machine moves in a way that makes sense.

Nothing is simulated. The game knows what will happen for any setting.

## Outcome first, choreography second
1. One pure function turns the values into a result with a `kind` (for example `weak | short | hard | pass`) and every number the story needs. `meters`, `judge` and `play` all read that one result, so they cannot disagree.
2. `judge` maps the kind to a headline and one sentence that carries the arithmetic: "40 N x 2.0 = 80 N at the staple; 20 sheets need 100 N."
3. `play` returns `{ verdict, durationMs, at(ms) }` and `at` branches on the kind.

## Phases with named durations
Every run is a few phases, each a named constant in milliseconds at the top of the file:
- **Lead** (150-300): the hand arrow appears, nothing moves yet.
- **Act** (350-900): the input moves.
- **Respond**: the mechanism does its thing. Often overlaps Act; for a release it follows it.
- **Hold** (500-700): everything still, so the result can be read.
- **Reset** (500-800): back to the rest pose, with the caption saying so ("Putting it back"). A run that ends in a broken state (cord snapped, crate off the ledge) holds there instead, and the game resets on the next action.
Total under 4500 ms.

## Easing carries meaning
Use the shared helpers in `shared/primitives/motion/ease.ts`:
- `smooth(t)` (ease in and out) for anything a hand moves.
- `easeOut(t)` for anything released, sprung or dropped onto a stop.
- `fall(t)` (t squared) for anything gravity takes.
- `ring(t, cycles)` a decaying cosine, for a spring that overshoots and settles.
- `strain(t)` half a sine: goes a little way and comes back, for a thing that holds.
- `shudder(t)` a dying tremor, for a push that jams.
- `rockBack(t)` |sin| times (1 - t), for a near-topple.
Timing follows physics where it can: a stiffer spring pops back faster, a heavier load rises slower. Derive a duration from the force, clamp it to a sane range.

## Failure is a motion, never only text
Each failing kind has its own unmistakable choreography:
- Too weak to move: it strains 1-2 mm, shudders, settles back.
- Runs out of travel: it moves, hits the stop with a small rebound, and the target is visibly not reached.
- Slips or snaps: holds for a beat, then lets go fast (`fall`), with a cue.
- Too stiff / jams: stops partway and shudders.
A pass is calm: it goes, seats, holds.

## Contact comes from geometry
Where a part meets another (bolt on strike, pawl on tooth, follower on cam, wedge on block) the pose is solved, by closed form or bisection, from the same dimensions `build` uses. Nothing is typed in twice. Nothing passes through anything at any frame: sample the run in a test and check.

## Props and the live caption
- `frame.marks` carries props that exist only while they matter: the hand arrow while pressing, the puck in flight, drops of water. Build them with the same part helpers and colour roles (purple for arrows and drops, stone for loads).
- `frame.live` is 1-6 words, no digits, that name what the motion is doing: "Pad going down", "Pumping", "Click", "Holding", "Putting it back".
- `cues` mark the instants worth a haptic tick: every click, the snap, the thud.

## Two-sided, and proven
- Every game fails on both sides of its window. The window keeps at least two slider steps clear of each end of the slider's range.
- The start values fail.
- Tests (in the model's own test file) check: `judge` passes somewhere and fails on both sides; `play(v).verdict` equals `judge(v)` at every slider step; every frame of every run keeps every value inside its range; `at(0)` matches the start pose and frames are continuous (no jump larger than a sane bound between samples 16 ms apart, except at a cue).

## Scope
All of this happens on the primitive's own rig (`build(values)`), never on a scanned object. The reference for feel is how the lesson prototype makes the elements and mechanisms interactive: every slider live and solved, a "Play" button that sweeps the motion slider back and forth on a 4 second cosine (`prototypes/lesson/Learn.tsx`), and tests that are scripted runs with a verdict. How that prototype poses and manages scanned kits is not a model to follow.

## The play sweep
Every primitive can be swept without a finger: motion slider from min to max and back, `0.5 - 0.5 cos(2 pi t / 4 s)`. The stage provides it from the slider definitions, so models do nothing for it except make every pose in the range a real, good-looking pose.
