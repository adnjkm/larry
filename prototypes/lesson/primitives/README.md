# The primitives this prototype was built on

These five files are `src/primitives/{library,parts,types,elements,mechanisms}.ts` exactly as they were when the
lessons here were written (only the import path to `shared/kit.ts` differs). The prototype imports them from here,
so its Learn figures, sliders and fault values stay as they were made.

`src/primitives/` has since been rewritten: every figure there obeys its own number and ships a scripted game
(see `src/primitives/docs/`, and play them at `/?play`). Some slider ranges changed in that rewrite, so pointing
this prototype at the new library is a deliberate step, not a rename: switch the imports back to
`src/primitives/` and run `node prototypes/lesson/verify.ts` to see what needs adjusting.
