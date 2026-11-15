import {
  BoxGeometry,
  type BufferGeometry,
  Curve,
  ExtrudeGeometry,
  LatheGeometry,
  Shape as ThreeShape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Shape, ShapeKind } from "../../shared/kit.ts";
import { LATHE_SEGMENTS, boxRadius, helixSegments, torusArc, torusSegments } from "../../shared/segments.ts";

type Builders = { [K in ShapeKind]: (shape: Extract<Shape, { kind: K }>) => BufferGeometry };

const SHARP_CORNER_DEGREES = 40;

/** The wire's centre line: starts on +x at y = 0, climbs `rise` along y over `turns` right-handed turns. */
class HelixCurve extends Curve<Vector3> {
  radius: number;
  rise: number;
  turns: number;

  constructor(radius: number, rise: number, turns: number) {
    super();
    this.radius = radius;
    this.rise = rise;
    this.turns = turns;
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    const a = 2 * Math.PI * this.turns * t;
    return target.set(this.radius * Math.cos(a), this.rise * t, -this.radius * Math.sin(a));
  }
}

function recenter(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  return geometry;
}

// LatheGeometry smooths normals across every profile vertex. Repeating a vertex at a sharp corner gives that corner a hard edge.
function splitSharpCorners(points: Vector2[]): Vector2[] {
  const out: Vector2[] = [];
  const minCos = Math.cos((SHARP_CORNER_DEGREES * Math.PI) / 180);
  points.forEach((p, i) => {
    out.push(p);
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!prev || !next) return;
    const a = p.clone().sub(prev).normalize();
    const b = next.clone().sub(p).normalize();
    if (a.dot(b) < minCos) out.push(p.clone());
  });
  return out;
}

const builders: Builders = {
  lathe: ({ profile }) => {
    const points = profile.map(({ r, y }) => new Vector2(r, y));
    return recenter(new LatheGeometry(splitSharpCorners(points), LATHE_SEGMENTS));
  },

  box: (shape) => {
    const { width, height, depth } = shape;
    const radius = boxRadius(shape);
    return radius > 0 ? new RoundedBoxGeometry(width, height, depth, 3, radius) : new BoxGeometry(width, height, depth);
  },

  // TorusGeometry lies in x-y with its arc starting at +x. Turn it about its own axis so the arc is centred on +x, then lay it into x-z.
  torus: ({ radius, tube, arcDegrees }) => {
    const arc = torusArc(arcDegrees);
    const geometry = new TorusGeometry(radius, tube, 10, torusSegments(arcDegrees), arc);
    geometry.rotateZ(-arc / 2);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  },

  helix: ({ radius, tube, length, turns }) => {
    const rise = length - 2 * tube;
    const path = new HelixCurve(radius, rise, turns);
    return recenter(new TubeGeometry(path, helixSegments(turns), tube, 8));
  },

  extrusion: ({ outline, depth }) => {
    const shape = new ThreeShape(outline.map(({ x, y }) => new Vector2(x, y)));
    return recenter(new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }));
  },
};

export function buildGeometry(shape: Shape): BufferGeometry {
  return (builders[shape.kind] as (shape: Shape) => BufferGeometry)(shape);
}
