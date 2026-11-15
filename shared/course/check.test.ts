import assert from "node:assert/strict";
import { test } from "node:test";
import type { Part } from "../kit.ts";
import { courseProblems, radiiAt, reach } from "./check.ts";
import type { GenCourse } from "./gen.ts";

type Pt = [number, number];
const lathe = (id: string, points: Pt[], parentId: string | null, joint: Part["joint"]): Part => {
  const ys = points.map(([, y]) => y);
  return {
    id,
    name: id,
    role: "A part.",
    parentId,
    joint,
    shape: { kind: "lathe", profile: points.map(([r, y]) => ({ r, y })) },
    position: { x: 0, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    color: "#c0c0c0",
    finish: "glossy",
  };
};

/** A plain pen that passes: a tube, a hollow cone under it, a button on top and a panel on its side. */
const pen = (): GenCourse => ({
  object: "Click Pen",
  kit: {
    name: "Click Pen",
    summary: "A click sends the tip out or tucks it away.",
    parts: [
      lathe("barrel", [[5.5, 18], [5.5, 134], [4.8, 134], [4.8, 18], [5.5, 18]], null, null),
      lathe("nose", [[1.5, 0], [2, 0], [5.5, 18], [4.7, 18], [4.7, 20], [4, 20], [4, 9], [1.5, 0]], "barrel", "thread"),
      lathe("button", [[0, 133], [1.7, 133], [1.7, 134.3], [2.8, 134.3], [2.8, 141], [0, 141]], "barrel", "slide"),
      {
        id: "panel",
        name: "panel",
        role: "A coloured strip.",
        parentId: "barrel",
        joint: "glue",
        shape: { kind: "box", width: 0.4, height: 38, depth: 3.6, cornerRadius: 0.1 },
        position: { x: 5.45, y: 100, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        color: "#b0212b",
        finish: "glossy",
      },
    ],
  },
  roles: { case: "barrel", nose: "nose", button: "button" },
  mechanisms: [
    {
      entry: "click-latch",
      name: "Retraction",
      does: "Each click sends the tip out or tucks it away.",
      words: { part: "the tip" },
      tips: {
        spring: ["A spring only pushes back while it is squeezed.", "Look for two things that close on each other."],
        cam: ["The cam pushes the rod up only while a bump is under it.", "The next click has to land between bumps."],
      },
    },
    {
      entry: "ball-tip",
      name: "Ball tip",
      does: "A ball that rolls a thin, even line of ink.",
      words: {},
      tips: { ball: ["The ball can only roll if it touches the paper.", "It also has to sit where the ink reaches it."] },
    },
  ],
});

const part = (course: GenCourse, id: string) => course.kit.parts.find((p) => p.id === id)!;
const has = (problems: string[], text: string) => assert.ok(problems.some((p) => p.includes(text)), `expected a problem about "${text}" in:\n${problems.join("\n")}`);

test("a hollow, upright pen with its roles and tips passes", () => {
  assert.deepEqual(courseProblems(pen()), []);
});

test("a solid case, a clear finish and a missing tip are each reported", () => {
  const course = pen();
  part(course, "barrel").shape = { kind: "lathe", profile: [{ r: 0, y: 18 }, { r: 5.5, y: 18 }, { r: 5.5, y: 134 }, { r: 0, y: 134 }] };
  part(course, "nose").finish = "clear";
  delete course.mechanisms[0]!.tips.cam;
  const problems = courseProblems(course);
  has(problems, "is solid");
  has(problems, "clear finish");
  has(problems, "tip lines for the cam");
});

test("a wall that is too thick, a button wider than the bore and a detail hung off a detail are reported", () => {
  const course = pen();
  part(course, "barrel").shape = { kind: "lathe", profile: [[5.5, 18], [5.5, 134], [2.5, 134], [2.5, 18], [5.5, 18]].map(([r, y]) => ({ r: r!, y: y! })) };
  course.kit.parts.push({ ...part(course, "panel"), id: "sticker", parentId: "panel" });
  const problems = courseProblems(course);
  has(problems, "case wall");
  has(problems, "sticker must be fixed to a role part");

  const wide = pen();
  part(wide, "button").shape = { kind: "lathe", profile: [[0, 133], [5, 133], [5, 141], [0, 141]].map(([r, y]) => ({ r: r!, y: y! })) };
  has(courseProblems(wide), "narrower than the case's inner radius");
});

test("a pen lying down, a nose that stops short and a missing role are reported", () => {
  const lying = pen();
  for (const p of lying.kit.parts) p.rotation = { x: 0, y: 0, z: 90 };
  has(courseProblems(lying), "must stand on the y axis");

  const short = pen();
  part(short, "nose").position.y -= 3;
  has(courseProblems(short), "short of the case's bottom");

  const pinched = pen();
  part(pinched, "nose").shape = { kind: "lathe", profile: [[0.5, 0], [2, 0], [5.5, 18], [4.7, 18], [4.7, 20], [4, 20], [4, 9], [0.5, 0]].map(([r, y]) => ({ r: r!, y: y! })) };
  has(courseProblems(pinched), "too narrow for the tip");

  const noButton = pen();
  delete noButton.roles.button;
  has(courseProblems(noButton), "role button names no part");
});

test("radiiAt finds the bore and the outside, and reach turns a part with its rotation", () => {
  const band = [[4, 0], [5, 0], [5, 10], [4, 10], [4, 0]].map(([r, y]) => ({ r: r!, y: y! }));
  assert.deepEqual(radiiAt(band, 5).sort(), [4, 5]);
  const panel = part(pen(), "panel");
  const turned = reach({ ...panel, position: { x: 0, y: 100, z: 5.45 }, rotation: { x: 0, y: -90, z: 0 } });
  assert.ok(Math.abs(turned.radius - Math.hypot(1.8, 5.65)) < 0.01);
});
