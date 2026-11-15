// Linkage's own tests: the generic game and design checks (checks.ts), and geometry proofs of its own.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { checkDesign, checkGame, numberSweep, sample, steps } from "../checks.ts";
import { PLATE_TOP, type Pt } from "../parts.ts";
import { COUPLER, CRANK, FRAME, fourBar, linkage, rig, settle, stallAt, STOP_LO, swingOf, TOLERANCE, wipe } from "./linkage.ts";

const game = linkage.game!;
const [rockerSlider] = linkage.sliders as [NonNullable<(typeof linkage.sliders)[0]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ROCKERS = steps(rockerSlider);
const ANGLES = Array.from({ length: 721 }, (_, i) => i / 2);

/** A box part's x-y outline (a bar rotated about z). */
function corners(p: Part): Pt[] {
  assert.ok(p.shape.kind === "box");
  const a = (p.rotation.z * Math.PI) / 180;
  const [w, h] = [p.shape.width / 2, p.shape.height / 2];
  return ([[-w, -h], [w, -h], [w, h], [-w, h]] as Pt[]).map(([x, y]): Pt => [p.position.x + x * Math.cos(a) - y * Math.sin(a), p.position.y + x * Math.sin(a) + y * Math.cos(a)]);
}
/** Distance from a point to a segment. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
  return Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]));
}
const zRange = (p: Part): [number, number] => {
  const half = p.shape.kind === "box" ? p.shape.depth / 2 : 0;
  return [p.position.z - half, p.position.z + half];
};

describe("linkage", () => {
  it("passes the generic game checks", () => checkGame(linkage));
  it("follows the design language", () => checkDesign(linkage));

  it("keeps every bar its own length at every pose: the loop closes", () => {
    for (const r of ROCKERS) {
      for (const k of ANGLES) {
        const { B, C } = fourBar(r, k);
        assert.ok(Math.abs(dist(rig.A, B) - CRANK) < 1e-9);
        assert.ok(Math.abs(dist(B, C) - COUPLER) < 1e-6, `rocker ${r}, crank ${k}: coupler ${dist(B, C)}`);
        assert.ok(Math.abs(dist(C, rig.D) - r) < 1e-6, `rocker ${r}, crank ${k}: rocker ${dist(C, rig.D)}`);
      }
    }
    assert.equal(dist(rig.A, rig.D), FRAME);
  });

  it("draws the bars from the solved pins, and nothing scrapes the plate", () => {
    for (const r of [50, 66, 90]) {
      for (const k of ANGLES.filter((_, i) => i % 6 === 0)) {
        const parts = linkage.build({ rocker: r, crank: k });
        for (const id of ["crank", "coupler", "rocker"]) {
          const low = Math.min(...corners(find(parts, id)).map((c) => c[1]));
          assert.ok(low >= PLATE_TOP + 4, `rocker ${r}, crank ${k}: ${id} comes down to ${low.toFixed(1)}`);
        }
        const knob = find(parts, "knob");
        assert.ok(knob.position.y - 5.5 >= PLATE_TOP + 4, `rocker ${r}, crank ${k}: knob scrapes`);
      }
    }
  });

  it("stacks the bars in their own layers so none passes through another or a post", () => {
    // Bars sharing a layer must stay apart in x-y; bars on different layers may cross.
    const parts = linkage.build({ rocker: 66, crank: 0 });
    const overlapZ = (a: Part, b: Part) => zRange(a)[0] < zRange(b)[1] - 1e-9 && zRange(b)[0] < zRange(a)[1] - 1e-9;
    assert.ok(!overlapZ(find(parts, "crank"), find(parts, "coupler")));
    assert.ok(!overlapZ(find(parts, "coupler"), find(parts, "rocker")));
    assert.ok(!overlapZ(find(parts, "crank"), find(parts, "rocker")));
    assert.ok(!overlapZ(find(parts, "crank"), find(parts, "post-a")));
    assert.ok(overlapZ(find(parts, "rocker"), find(parts, "post-a")), "the rocker shares the crank post's layer, so check they never meet");
    for (const r of ROCKERS) {
      for (const k of ANGLES) {
        const { C } = fourBar(r, k);
        // The rocker's bar (half width 4, ends 5 past its pins) against the crank post (x ±5 round A, up to 4 over A).
        const gap = segDist([rig.A[0], rig.A[1] + 4], rig.D, C) - 4;
        assert.ok(gap > 3, `rocker ${r}, crank ${k}: rocker ${gap.toFixed(1)} mm from the crank post's top`);
        // The rocker pin C passes through the crank's layer: the crank (24 long, ends 5 past) must never be there.
        assert.ok(dist(C, rig.A) > CRANK + rig.END + 4 + 3, `rocker ${r}, crank ${k}: pin C crosses the crank`);
      }
    }
  });

  it("rocks through less as the rocker lengthens, and the arc behind its tip spans exactly the rock", () => {
    let last = Infinity;
    for (const r of ROCKERS) {
      const s = swingOf(r);
      assert.ok(s.hi - s.lo < last, `rocker ${r}`);
      last = s.hi - s.lo;
      // The sampled rock never leaves the solved ends.
      for (const k of ANGLES) {
        const a = fourBar(r, k).rockerDeg;
        assert.ok(a >= s.lo - 1e-6 && a <= s.hi + 1e-6, `rocker ${r}, crank ${k}: ${a} outside ${s.lo}..${s.hi}`);
      }
      const arc = find(linkage.build({ rocker: r, crank: 0 }), "swing-arc");
      assert.ok(arc.shape.kind === "torus" && Math.abs(arc.shape.arcDegrees - (s.hi - s.lo)) < 1e-9);
    }
    assert.ok(swingOf(50).hi - swingOf(50).lo > 55 && swingOf(90).hi - swingOf(90).lo < 37);
  });

  it("wipes clean for 59 to 65 mm: shorter hits the frame, longer leaves a strip", () => {
    const outcomes = Object.fromEntries(numberSweep(linkage).map((v) => [v.rocker, game.judge(v).outcome]));
    for (let r = 50; r <= 58; r++) assert.equal(outcomes[r], "hits-frame", `rocker ${r}`);
    for (let r = 59; r <= 65; r++) assert.equal(outcomes[r], "wiped-clean", `rocker ${r}`);
    for (let r = 66; r <= 90; r++) assert.equal(outcomes[r], "leaves-strip", `rocker ${r}`);
    // One set of numbers: the meters, the verdict and the stop the picture draws.
    for (const v of numberSweep(linkage)) {
      const r = wipe(v);
      const [past, gap] = game.meters(v);
      assert.equal(past.value, Math.max(0, STOP_LO - r.lo));
      assert.equal(gap.value, Math.max(0, r.lo - STOP_LO));
      assert.equal(r.kind === "hits-frame", past.value > past.target);
      assert.equal(r.kind === "leaves-strip", gap.value > gap.target);
    }
  });

  it("has one target: a round peg in the rocker's plane, held by a post stacked on the rocker's pivot post", () => {
    const parts = [...linkage.build({ rocker: 66, crank: 0 }), ...game.scene!({})];
    const scene = game.scene!({});
    assert.deepEqual(scene.map((p) => p.name).sort(), ["Frame stop", "Post"]);
    const peg = find(scene, "game-stop");
    const stack = find(scene, "game-post");
    const rocker = find(parts, "rocker");
    assert.ok(peg.shape.kind === "lathe" && stack.shape.kind === "box" && rocker.shape.kind === "box");
    assert.ok(rig.PEG_LENGTH >= 10, "the stop is at least 10 mm long");
    // The peg stands in the rocker's plane: its z range covers the rocker's.
    const [pz0, pz1] = [peg.position.z - rig.PEG_LENGTH / 2, peg.position.z + rig.PEG_LENGTH / 2];
    const [rz0, rz1] = zRange(rocker);
    assert.ok(pz0 <= rz0 + 1e-9 && pz1 >= rz1 - 1e-9, `peg z ${pz0}..${pz1}, rocker z ${rz0}..${rz1}`);
    // It starts on the stack's front face, and the stack sits on the pivot post's top.
    assert.ok(Math.abs(pz0 - (stack.position.z + stack.shape.depth / 2)) < 1e-9, "the peg starts on the post's front face");
    const pivotPost = find(parts, "post-d");
    assert.ok(pivotPost.shape.kind === "box");
    assert.ok(Math.abs(stack.position.y - stack.shape.height / 2 - (pivotPost.position.y + pivotPost.shape.height / 2)) < 1e-9, "the stack sits on the pivot post");
    assert.equal(stack.position.x, pivotPost.position.x);
    assert.ok(Math.abs(peg.position.y + rig.PEG_R - (stack.position.y + stack.shape.height / 2)) < 1e-9, "the peg's top is the stack's top");
    assert.equal(stack.parentId, "post-d");
    assert.equal(peg.parentId, "game-post");
    assert.ok(game.scene!({}).every((p) => p.color === find(parts, "post-d").color), "the frame is structure black");
  });

  it("stops the rocker against the stop: its side touches the peg at the stop angle and the peg is never cut into", () => {
    const peg = find(game.scene!({}), "game-stop");
    const at: Pt = [peg.position.x, peg.position.y];
    const gap = (v: { rocker: number; crank: number }) => {
      const c = corners(find(linkage.build(v), "rocker"));
      let d = Infinity;
      for (let i = 0; i < 4; i++) d = Math.min(d, segDist(at, c[i]!, c[(i + 1) % 4]!));
      return d - rig.PEG_R;
    };
    for (const r of [50, 54, 58]) {
      const k = 360 - stallAt(r);
      assert.ok(Number.isFinite(k) && k > 0 && k < 360, `rocker ${r}: stalls at ${k}`);
      assert.ok(Math.abs(fourBar(r, k).rockerDeg - STOP_LO) < 1e-6, `rocker ${r}: the stall is at the stop angle`);
      assert.ok(Math.abs(gap({ rocker: r, crank: k })) < 0.05, `rocker ${r}: the rocker's side is ${gap({ rocker: r, crank: k }).toFixed(3)} mm from the peg at the stall`);
      // Just before the stall (the band that the stop blocks is a few degrees wide for the longest of these) the rocker is clear.
      assert.ok(gap({ rocker: r, crank: k + 0.5 }) > 0, `rocker ${r}: the rocker is touching the peg half a degree early`);
      if (r <= 54) assert.ok(gap({ rocker: r, crank: k + 3 }) > 0.2, `rocker ${r}: the rocker is clear of the peg before the stall`);
    }
    // Rockers that never reach the stop never stall, and every one of them clears the peg at every crank angle.
    for (const r of ROCKERS.filter((q) => q >= 59)) {
      assert.equal(stallAt(r), Infinity);
      for (const k of ANGLES.filter((_, i) => i % 4 === 0)) assert.ok(gap({ rocker: r, crank: k }) >= -1e-6, `rocker ${r}, crank ${k}: the peg is cut into`);
    }
  });

  it("keeps the peg clear of the coupler and the joint pin at every pose the stop allows", () => {
    const peg = find(game.scene!({}), "game-stop");
    const at: Pt = [peg.position.x, peg.position.y];
    for (const r of ROCKERS) {
      for (const k of ANGLES.filter((_, i) => i % 2 === 0)) {
        const { C, rockerDeg } = fourBar(r, k);
        if (rockerDeg < STOP_LO) continue;
        assert.ok(dist(at, C) > 3 + rig.PEG_R + 3, `rocker ${r}, crank ${k}: the peg is ${dist(at, C).toFixed(1)} from the joint pin`);
        const c = corners(find(linkage.build({ rocker: r, crank: k }), "coupler"));
        let d = Infinity;
        for (let i = 0; i < 4; i++) d = Math.min(d, segDist(at, c[i]!, c[(i + 1) % 4]!));
        assert.ok(d > rig.PEG_R + 2, `rocker ${r}, crank ${k}: the coupler is ${d.toFixed(1)} mm from the peg's axis`);
      }
    }
  });

  it("never lets the rocker past the stop in any run: it stops there, shudders, and the crank falls short of a turn", () => {
    for (const v of numberSweep(linkage)) {
      const run = game.play(v);
      const frames = sample(run);
      const kind = wipe(v).kind;
      for (const { ms, frame } of frames) {
        const a = settle(frame.values).rockerDeg;
        assert.ok(a >= STOP_LO - 1e-6, `rocker ${v.rocker} at ${ms} ms: the rocker is at ${a}°, through the stop at ${STOP_LO}°`);
        assert.ok(a <= swingOf(wipe(v).rocker).hi + 1e-6, `rocker ${v.rocker} at ${ms} ms: ${a}° is past its own top`);
      }
      assert.equal(frames[0]!.frame.values.crank, 360, "the run turns the crank backwards from 360");
      const last = run.at(run.durationMs);
      const thuds = (run.cues ?? []).filter((c) => c.kind === "thud");
      if (kind === "hits-frame") {
        const stall = stallAt(wipe(v).rocker);
        const crank = last.values.crank!;
        assert.ok(crank > 20, `rocker ${v.rocker}: the crank ends at ${crank}, not short of a turn`);
        assert.ok(Math.abs(360 - crank - stall) < 1e-6, `rocker ${v.rocker}: the run ends at the stall ${stall}, not ${360 - crank}`);
        assert.ok(Math.abs(settle(last.values).rockerDeg - STOP_LO) < 1e-6, "the rocker rests on the stop");
        assert.equal(last.live, "Jammed!");
        assert.ok(stall > 200, `rocker ${v.rocker}: it stalls after ${stall}°, a long way round`);
        assert.equal(thuds.length, 1);
        // It shudders: after the thud the crank goes back and forth, and never beyond the stall.
        const after = frames.filter((f) => f.ms > thuds[0]!.ms).map((f) => 360 - f.frame.values.crank!);
        assert.ok(Math.max(...after) <= stall + 1e-9);
        assert.ok(Math.min(...after) < stall - 0.5, "the crank backs off the stop");
        assert.ok(Math.abs(settle(run.at(thuds[0]!.ms).values).rockerDeg - STOP_LO) < 0.05, `thud at ${settle(run.at(thuds[0]!.ms).values).rockerDeg}°`);
      } else {
        assert.equal(last.values.crank, 0, `rocker ${v.rocker}: a full turn`);
        assert.equal(thuds.length, 0);
      }
    }
  });

  it("parks the rocker at the same top whatever its length, so only the bottom edge needs a stop", () => {
    const tops = ROCKERS.map((r) => swingOf(r).hi);
    assert.ok(Math.max(...tops) - Math.min(...tops) < 6, `tops range ${Math.min(...tops).toFixed(1)}..${Math.max(...tops).toFixed(1)}`);
    assert.ok(TOLERANCE > 0);
  });
});
