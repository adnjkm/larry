import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { buildGeometry } from "./geometry.ts";
import { measureParts } from "../../shared/bounds.ts";
import type { Part, Shape } from "../../shared/kit.ts";

const SHAPES: Shape[] = [
  { kind: "box", width: 40, height: 10, depth: 6, cornerRadius: 0 },
  { kind: "box", width: 40, height: 10, depth: 6, cornerRadius: 2.4 },
  { kind: "lathe", profile: [{ r: 0, y: 0 }, { r: 12, y: 0 }, { r: 12, y: 30 }, { r: 5, y: 38 }, { r: 0, y: 38 }] },
  { kind: "torus", radius: 20, tube: 2, arcDegrees: 360 },
  { kind: "torus", radius: 20, tube: 2, arcDegrees: 200 },
  { kind: "helix", radius: 8, tube: 1.2, length: 40, turns: 5 },
  { kind: "helix", radius: 8, tube: 1.2, length: 40, turns: 2.5 },
  { kind: "extrusion", outline: [{ x: 0, y: 0 }, { x: 30, y: 4 }, { x: 34, y: 14 }, { x: 6, y: 10 }], depth: 5 },
];
const TURNS = [{ x: 0, y: 0, z: 0 }, { x: 20, y: 35, z: -50 }, { x: 90, y: 0, z: 45 }, { x: -130, y: 70, z: 10 }];
/** mm. A coil's hull rings its wire with a ball, which the wire's slanted round section stays a hair inside. */
const TOLERANCE = 0.05;

function part(shape: Shape, rotation: Part["rotation"]): Part {
  return { id: "p", name: "p", role: "", parentId: null, joint: null, shape, color: "#000000", finish: "matte", position: { x: 7, y: -3, z: 11 }, rotation };
}

function builtBounds(p: Part, around: { x: number; z: number }) {
  const m = new Matrix4().compose(new Vector3(p.position.x, p.position.y, p.position.z), new Quaternion().setFromEuler(new Euler(...(["x", "y", "z"] as const).map((k) => (p.rotation[k] * Math.PI) / 180) as [number, number, number])), new Vector3(1, 1, 1));
  const position = buildGeometry(p.shape).getAttribute("position");
  const v = new Vector3();
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  let radius = 0;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(m);
    lo.min(v);
    hi.max(v);
    radius = Math.max(radius, Math.hypot(v.x - around.x, v.z - around.z));
  }
  return { lo, hi, radius };
}

describe("measureParts", () => {
  for (const shape of SHAPES) {
    it(`bounds a ${shape.kind} without being smaller than its geometry or much larger`, () => {
      for (const rotation of TURNS) {
        const p = part(shape, rotation);
        const b = measureParts([p]);
        const real = builtBounds(p, { x: b.centerX, z: b.centerZ });
        const at = `${shape.kind} turned ${JSON.stringify(rotation)}`;
        assert.ok(b.centerX - b.halfX <= real.lo.x + TOLERANCE && b.centerX + b.halfX >= real.hi.x - TOLERANCE, `${at}: x`);
        assert.ok(b.minY <= real.lo.y + TOLERANCE && b.maxY >= real.hi.y - TOLERANCE, `${at}: y`);
        assert.ok(b.centerZ - b.halfZ <= real.lo.z + TOLERANCE && b.centerZ + b.halfZ >= real.hi.z - TOLERANCE, `${at}: z`);
        assert.ok(b.radius >= real.radius - TOLERANCE, `${shape.kind}: radius`);
        const slack = Math.max(b.halfX * 2 - (real.hi.x - real.lo.x), b.maxY - b.minY - (real.hi.y - real.lo.y), b.halfZ * 2 - (real.hi.z - real.lo.z));
        assert.ok(slack <= 2.5, `${at}: ${slack.toFixed(2)} mm larger than the geometry`);
      }
    });
  }
});
