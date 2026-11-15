// What going wrong looks like for each primitive's one number, in words that hold for any object it appears in.
// The curriculum prompts read these, so a lesson's "too little" and "too much" are always the two failures the
// primitive's own game can show.
export type Tradeoff = { little: string; much: string };

export const TRADEOFFS: Record<string, Tradeoff> = {
  lever: { little: "the load is too heavy for the hand", much: "the hand moves far and the load barely moves" },
  wheel: { little: "too heavy to turn", much: "the hand has to travel too far round" },
  wedge: { little: "slides in easily but hardly spreads anything", much: "takes too much force to drive, and pops back out" },
  cord: { little: "hangs slack and carries nothing", much: "snaps" },
  spring: { little: "too soft to push back", much: "too stiff to move by hand" },
  weight: { little: "too light to do the job", much: "too heavy for what holds it" },
  grip: { little: "slips", much: "crushes what it holds, or cannot be moved on purpose" },
  seal: { little: "leaks", much: "the seal is crushed, or the joint is too hard to close" },
  gear: { little: "turns fast but weakly", much: "turns strongly but slowly" },
  pulley: { little: "too heavy to pull", much: "a lot of cord pulled for a little lift" },
  thread: { little: "many turns for little travel", much: "quick, but works loose under load" },
  cam: { little: "the push does not reach", much: "the ramp is too steep and jams" },
  linkage: { little: "the far end swings too far", much: "the far end does not swing far enough" },
  ratchet: { little: "slips back a long way before it catches", much: "the teeth are too small to hold the load" },
  catch: { little: "lets go when it should hold", much: "too hard to close or to release" },
  valve: { little: "lets fluid back through", much: "too hard to push anything through" },
  piston: { little: "builds pressure but moves little", much: "needs too hard a push" },
};
