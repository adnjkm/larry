import {
  BoxGeometry,
  type BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape as ThreeShape,
  TorusGeometry,
  Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Shape, ShapeKind } from "../../shared/kit.ts";

type Builders = { [K in ShapeKind]: (shape: Extract<Shape, { kind: K }>) => BufferGeometry };

const SHARP_CORNER_DEGREES = 40;

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
    return recenter(new LatheGeometry(splitSharpCorners(points), 40));
  },

  box: ({ width, height, depth, cornerRadius }) => {
    const radius = Math.min(cornerRadius, Math.min(width, height, depth) / 2);
    return radius > 0 ? new RoundedBoxGeometry(width, height, depth, 3, radius) : new BoxGeometry(width, height, depth);
  },

  // TorusGeometry lies in x-y with its arc starting at +x. Turn it about its own axis so the arc is centred on +x, then lay it into x-z.
  torus: ({ radius, tube, arcDegrees }) => {
    const arc = (Math.min(arcDegrees, 360) * Math.PI) / 180;
    const tubular = Math.max(8, Math.ceil((48 * arc) / (2 * Math.PI)));
    const geometry = new TorusGeometry(radius, tube, 10, tubular, arc);
    geometry.rotateZ(-arc / 2);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  },

  extrusion: ({ outline, depth }) => {
    const shape = new ThreeShape(outline.map(({ x, y }) => new Vector2(x, y)));
    return recenter(new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }));
  },
};

export function buildGeometry(shape: Shape): BufferGeometry {
  return (builders[shape.kind] as (shape: Shape) => BufferGeometry)(shape);
}
