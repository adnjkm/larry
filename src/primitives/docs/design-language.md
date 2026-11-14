# Larry figure design language

## Simple first (this outranks everything below)
These figures teach fundamentals. A reader should recognise the textbook picture at a glance: a seesaw, a wedge between two blocks, a weight on a string. The project owner's note on the first rewrites: high quality, but some are coming out overly complicated, which defeats the point.
- A figure is the piece, plus the least that lets it do its job. If a part can go and the idea still reads, it goes.
- Budget, counting distinct kinds of part at rest (repeated copies such as teeth, spokes or chain links count once): an element has at most 7, a mechanism at most 9. The plate, the handle, the load and arrows are all included in that count.
- The game's scene adds at most 2 kinds of part: one target and, if it cannot float, what holds it. A run shows at most 2 kinds of mark at a time.
- One reference mark per moving end at most. No rulers, no rows of ticks, no scales.
- An element's rig never contains another mechanism. No winches, linkages or valves smuggled into a lever or a spring to make a game work. Pick a simpler game instead.
- One cause, one effect per game: the number changes one thing, and that one thing decides the outcome. The second failure comes from the same quantity running out the other way, not from a second system.
- Explaining text does not rescue a busy picture. If the still needs a caption to be understood, simplify the rig.
- Every other rule in this document is satisfied with fewer parts, never by adding parts. Where a rule below would push you past the budget (an arrow on every force, a mark on every rotating part), keep the ones the idea needs and drop the rest.

Every one of the 17 primitive figures follows this. It exists because the elements and mechanisms were written in two passes and diverged. Numbers are millimetres in figure space, y up.

## Stage
- One base plate under every figure: rounded box 6 thick, corner radius 2, `look.structure`, top face at y = 6. Footprint = the rig's footprint plus 12 on each side. Use the shared `plate()` helper. No discs, no figure without a plate.
- The rig is centred on the plate, and the plate is centred on x = 0, z = 0, across the whole slider range. If motion is one-sided, shift the rig so the union of poses is centred.
- Union of all poses should have width : height between 0.7 and 1.4. Rebuild rigs that are long thin strips (raise them, shorten them) or tall thin sticks (widen them).
- At the starting pose the subject (the pink part) should be the largest non-black thing in the frame.

## Stand vocabulary
- Posts: boxes 10 wide x 8 deep, corner radius 1, `look.structure`. Beams 8 x 8. Use `post()` / `beam()`.
- Pins and axles: radius 3, or 4 when they carry the load. `look.structure`. Use `pin()`.
- No back boards, walls, gantries or cages unless the part is physically what the mechanism needs (a piston's tube, a latch's strike). Prefer one post to two. Black structure must never outweigh the subject.

## Colour roles (one role per colour, no exceptions)
- `look.focus` pink: the part the figure is named after, and every copy of it (both gears, the thread ridge and the nut's thread, the ratchet wheel's teeth and the pawl). Matte or metal finish. Never the rubber finish on pink: it reads maroon.
- `look.structure` black: fixed ground and frame only.
- `look.steel` (metal): moving rigid parts that are not the subject.
- `look.slate`: flexible connectors that are not the subject (cords, non-subject springs).
- `look.stone`: loads only.
- `look.light`: the one handle the finger grabs. Nothing else is light.
- `look.accent` purple: arrows only.

## Input and load markers
- Every figure has exactly one handle, in `look.light`, at the point `handle.at(v)` returns: a knob (lathe, radius 5.5, 20 long) for turning, a disc (radius 15, 4 thick) for pushing, a ring (radius 6, tube 2) for pulling. Use `knob()` / `pushDisc()` / `pullRing()`.
- A load is a stone cube, corner radius 1.5, edge 16 to 30 (cube-root of its weight), with a downward arrow. Use `loadBlock()`.
- Any part that rotates and carries no handle gets a `look.structure` radial mark bar, 3 x 3, out to 0.8 R, so its turning shows in a still. Use `turnMark()`.

## Arrows
- One shared `arrow()` in parts.ts: shaft 4 wide, head 10 x 10, depth 4, 4 clear of the part it acts on, `look.accent`.
- Required wherever a slider is a force or pressure, and on every load. When the lesson is "A against B", draw both A and B at the same scale.
- Scale per figure so the largest arrow over the slider range is about 40 long. An arrow whose force is 0 is not drawn. A non-zero arrow is never shorter than 12.
- Arrows never sit in front of black structure (purple on black is invisible). Move them to the open side.

## The number must show
- Sweeping the first slider must change the picture in a way that shows its consequence, not only a readout. Where the consequence is a distance, draw start marks or ghost ticks (`look.structure`, 2 thick) so travel is visible. Where it is a threshold (holds / slips, sealed / leaks), each side of the threshold needs its own unmistakable pose.
- Sliders whose effect goes as 1/x should not leave half the range looking dead: change the geometry mapping, not the slider's range.

## Minimum feature size
- No visible cross-section under 3. Coil wire diameter at least 2.4. Cords 3.2. Bars 8 thick x 8 deep. Pins radius 3.
- The frame is about 1 mm per rendered pixel; anything thinner turns to dotted noise that differs per device.

## Camera
- `VIEW.bench` (elevation 14, azimuth 24) for rigs laid out left to right. `VIEW.coaxial` (elevation 22, azimuth 24) for rigs built up one vertical axis.
- Any other angle needs a comment naming what it shows that the presets hide. Check every pose: no moving part may appear to pass behind or through structure.

## Sliders and readouts
- Slider ids, ranges and initial values are a contract with stored lessons (`fixtures/lessons/*.json` reference them). Keep them unless the review says the slider is broken; if you change one, say so in your report and make sure `node --test` still passes.
- Readouts: exactly 3 rows. 1) the law with numbers, result last: `F ÷ k = 30 ÷ 2.0 = 15.0 mm`. 2) "Travel": input distance against output distance. 3) "State": what is happening now. No static caveat rows; caveats live in `howItWorks`.

## Physical honesty
- Parts in contact touch and never interpenetrate, at every reachable pose. Where two parts are meant to be in contact, add a test in the model's test file that checks the gap or overlap numerically across the slider range.
- Readout numbers must come from the same expressions `build` uses.

## The model obeys its own number (the most important rule)
The owner's test: Everest's thread is good because changing the pitch changes the ridge you see, and the nut then climbs exactly one pitch per turn. The number is geometry, and the motion follows from it. Our earlier seesaw was bad because you could tilt it to any angle whatever the forces were.
- The first slider changes something physical you can see (a length, a spacing, a thickness, a count), and every motion is constrained by it.
- The rest pose is an equilibrium of the forces drawn. A lever with a heavier torque on one side rests with that side down. Nothing floats or hangs at an angle nothing holds it at.
- Every pose a slider or a drag can reach is one the drawn forces could produce. Where the input force is limited (a 20 N finger), the machine only moves as far as that force can move it: set `handle.reach(v)` so the drag stops there. A cord goes slack rather than pushing. A ratchet does not turn backward past the next tooth.
- When the number changes, the machine re-settles to the pose that number implies. It never keeps a pose the new number forbids.
- Readouts, meters, the verdict and the picture all come from one set of expressions.
