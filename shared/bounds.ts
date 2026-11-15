// Where a part sits in space, without building its geometry. Each shape kind is reduced to a few points in the part's own
// (centred) frame plus a sphere radius to grow them by; the points are rotated into place and boxed. The geometry builders
// in src/kit3d/geometry.ts are the reference: bounds.test.ts checks every kind against their real vertices.
import type { Part, Shape } from "./kit.ts";
import { DEG_TO_RAD } from "./angles.ts";
import { boxRadius, helixSegments, LATHE_SEGMENTS, torusArc, torusSegments } from "./segments.ts";

export type KitBounds = {
  /** Centre of the kit's footprint, the axis it spins around. */
  centerX: number;
  centerZ: number;
  minY: number;
  maxY: number;
  /** Farthest any vertex is from the spin axis. */
  radius: number;
  halfX: number;
  halfZ: number;
};

type Hull = {
  /** x, y, z triples. */
  points: number[];
  /** Every point stands for a ball of this radius. */
  inflate: number;
};


function centre(points: number[]): void {
  for (let axis = 0; axis < 3; axis++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = axis; i < points.length; i += 3) {
      lo = Math.min(lo, points[i]!);
      hi = Math.max(hi, points[i]!);
    }
    const mid = (lo + hi) / 2;
    for (let i = axis; i < points.length; i += 3) points[i]! -= mid;
  }
}

function hullOf(shape: Shape): Hull {
  const points: number[] = [];
  switch (shape.kind) {
    case "box": {
      const r = boxRadius(shape);
      const hx = shape.width / 2 - r;
      const hy = shape.height / 2 - r;
      const hz = shape.depth / 2 - r;
      for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) points.push(x, y, z);
      return { points, inflate: r };
    }
    case "lathe": {
      for (const { r, y } of shape.profile) {
        for (let i = 0; i < LATHE_SEGMENTS; i++) {
          const phi = (i / LATHE_SEGMENTS) * 2 * Math.PI;
          points.push(r * Math.sin(phi), y, r * Math.cos(phi));
        }
      }
      centre(points);
      return { points, inflate: 0 };
    }
    case "torus": {
      const arc = torusArc(shape.arcDegrees);
      const segments = torusSegments(shape.arcDegrees);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments - 0.5) * arc;
        points.push(shape.radius * Math.cos(a), 0, -shape.radius * Math.sin(a));
      }
      return { points, inflate: shape.tube };
    }
    case "helix": {
      const rise = shape.length - 2 * shape.tube;
      const segments = helixSegments(shape.turns);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = 2 * Math.PI * shape.turns * t;
        points.push(shape.radius * Math.cos(a), rise * t, -shape.radius * Math.sin(a));
      }
      centre(points);
      return { points, inflate: shape.tube };
    }
    case "extrusion": {
      for (const z of [0, shape.depth]) for (const { x, y } of shape.outline) points.push(x, y, z);
      centre(points);
      return { points, inflate: 0 };
    }
  }
}

const hulls = new WeakMap<Shape, Hull>();
function hull(shape: Shape): Hull {
  let h = hulls.get(shape);
  if (!h) hulls.set(shape, (h = hullOf(shape)));
  return h;
}

// Scratch space, reused by every call. `footprint` holds x, z and inflate of every point, so the farthest reach can be found once the centre is known.
const turn = new Float64Array(9);
let footprint = new Float64Array(0);

/** Row-major rotation for Euler angles in degrees, applied in x, y, z order (three.js's "XYZ"). */
function rotation(part: Part): Float64Array {
  const { x, y, z } = part.rotation;
  const a = Math.cos(x * DEG_TO_RAD);
  const b = Math.sin(x * DEG_TO_RAD);
  const c = Math.cos(y * DEG_TO_RAD);
  const d = Math.sin(y * DEG_TO_RAD);
  const e = Math.cos(z * DEG_TO_RAD);
  const f = Math.sin(z * DEG_TO_RAD);
  turn.set([c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c]);
  return turn;
}

/** The box around every part, and the farthest reach from its footprint's centre. Never smaller than the built geometry, rarely more than a millimetre larger. */
export function measureParts(parts: readonly Part[]): KitBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  for (const part of parts) count += hull(part.shape).points.length / 3;
  if (footprint.length < count * 3) footprint = new Float64Array(count * 3);

  let n = 0;
  for (const part of parts) {
    const { points, inflate } = hull(part.shape);
    const m = rotation(part);
    const { x: px, y: py, z: pz } = part.position;
    for (let i = 0; i < points.length; i += 3) {
      const x = points[i]!;
      const y = points[i + 1]!;
      const z = points[i + 2]!;
      const wx = m[0]! * x + m[1]! * y + m[2]! * z + px;
      const wy = m[3]! * x + m[4]! * y + m[5]! * z + py;
      const wz = m[6]! * x + m[7]! * y + m[8]! * z + pz;
      minX = Math.min(minX, wx - inflate);
      maxX = Math.max(maxX, wx + inflate);
      minY = Math.min(minY, wy - inflate);
      maxY = Math.max(maxY, wy + inflate);
      minZ = Math.min(minZ, wz - inflate);
      maxZ = Math.max(maxZ, wz + inflate);
      footprint[n++] = wx;
      footprint[n++] = wz;
      footprint[n++] = inflate;
    }
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  let reach = 0;
  for (let i = 0; i < n; i += 3) reach = Math.max(reach, Math.hypot(footprint[i]! - centerX, footprint[i + 1]! - centerZ) + footprint[i + 2]!);
  return { centerX, centerZ, minY, maxY, radius: reach, halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2 };
}

export const measurePoses = (poses: readonly (readonly Part[])[]): KitBounds[] => poses.map(measureParts);
