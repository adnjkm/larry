// Geometry for the stage's meshes, built as rarely as possible.
// - `sameShape` compares numbers with a tolerance, so float noise (a bar rotated about its end gets a length that differs in
//   the 15th digit) never rebuilds anything. It replaces JSON.stringify keys on the per-frame path.
// - A coil or a box whose only change is its size is stretched in place (`Stretch`), which is exact for both, keeps the
//   wire round and the corner radius true, and allocates nothing.
// - Everything else comes from a cache keyed by the rounded shape, shared by every figure, with recently released
//   geometry kept for a while because a drag snaps to the slider's step and revisits the same shapes.
import type { BufferAttribute, BufferGeometry } from "three";
import type { Shape } from "../../../shared/kit.ts";
import { boxRadius, torusSegments } from "../../../shared/segments.ts";
import { buildGeometry } from "../../kit3d/geometry.ts";

const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

export function sameShape(a: Shape, b: Shape): boolean {
  if (a === b) return true;
  switch (a.kind) {
    case "box":
      return b.kind === "box" && close(a.width, b.width) && close(a.height, b.height) && close(a.depth, b.depth) && close(a.cornerRadius, b.cornerRadius);
    case "torus":
      return b.kind === "torus" && close(a.radius, b.radius) && close(a.tube, b.tube) && close(a.arcDegrees, b.arcDegrees);
    case "helix":
      return b.kind === "helix" && close(a.radius, b.radius) && close(a.tube, b.tube) && close(a.length, b.length) && close(a.turns, b.turns);
    case "lathe": {
      if (b.kind !== "lathe" || a.profile.length !== b.profile.length) return false;
      for (let i = 0; i < a.profile.length; i++) if (!close(a.profile[i]!.r, b.profile[i]!.r) || !close(a.profile[i]!.y, b.profile[i]!.y)) return false;
      return true;
    }
    case "extrusion": {
      if (b.kind !== "extrusion" || a.outline.length !== b.outline.length || !close(a.depth, b.depth)) return false;
      for (let i = 0; i < a.outline.length; i++) if (!close(a.outline[i]!.x, b.outline[i]!.x) || !close(a.outline[i]!.y, b.outline[i]!.y)) return false;
      return true;
    }
  }
}

/** Shapes within 0.1 micrometre of each other share a key, and so a geometry. Only computed when a shape has changed. */
const q = (n: number) => Math.round(n * 1e4);
export function shapeKey(s: Shape): string {
  switch (s.kind) {
    case "box":
      return `b${q(s.width)},${q(s.height)},${q(s.depth)},${q(s.cornerRadius)}`;
    case "torus":
      return `t${q(s.radius)},${q(s.tube)},${q(s.arcDegrees)}`;
    case "helix":
      return `h${q(s.radius)},${q(s.tube)},${q(s.length)},${q(s.turns)}`;
    case "lathe": {
      let k = "l";
      for (const p of s.profile) k += `${q(p.r)},${q(p.y)};`;
      return k;
    }
    case "extrusion": {
      let k = `e${q(s.depth)}:`;
      for (const p of s.outline) k += `${q(p.x)},${q(p.y)};`;
      return k;
    }
  }
}

/**
 * Whether `next` can be had by stretching a geometry built for `base`.
 * A torus: the same ring and tube, and an arc with the same number of segments.
 * A box: the same effective corner radius, and every side longer than the rounding (each vertex then sits on one side of
 * each axis, and moving the sides apart is exact). A coil: the same radius, wire and turns (only the pitch changes; the
 * wire's round section rides on the stretched centre line, its tilt off by the change in pitch angle, a few degrees).
 */
export function canStretch(base: Shape, next: Shape): boolean {
  // An arc that grows or shrinks with the same segment count: every vertex is recomputed from its place on the ring, exactly.
  if (base.kind === "torus" && next.kind === "torus") return close(base.radius, next.radius) && close(base.tube, next.tube) && torusSegments(base.arcDegrees) === torusSegments(next.arcDegrees);
  if (base.kind === "helix" && next.kind === "helix") return close(base.radius, next.radius) && close(base.tube, next.tube) && close(base.turns, next.turns) && next.length > 2 * next.tube;
  if (base.kind === "box" && next.kind === "box") {
    const r = boxRadius(base);
    if (!close(r, boxRadius(next))) return false;
    if (r === 0) return true;
    const margin = 1e-4;
    return Math.min(base.width, base.height, base.depth) / 2 - r > margin && Math.min(next.width, next.height, next.depth) / 2 - r > -margin;
  }
  return false;
}

/**
 * Whether a part going from `base` to `next` is a size change worth giving its own stretchable geometry: anything
 * canStretch allows, and a torus whose arc crosses into another segment count (the new Stretch is built once there,
 * and stretched until the next crossing).
 */
export function stretchFamily(base: Shape, next: Shape): boolean {
  if (base.kind === "torus" && next.kind === "torus") return close(base.radius, next.radius) && close(base.tube, next.tube);
  return canStretch(base, next);
}

/** A geometry owned by one mesh that follows its shape's size by moving vertices, never rebuilding. */
export class Stretch {
  readonly geometry: BufferGeometry;
  readonly base: Shape;
  private readonly position: BufferAttribute;
  private readonly rest: Float32Array;
  /** Per vertex: for a box, the side of each axis (-1 or 1); for a coil or torus, how far along (0 to 1) minus a half. */
  private readonly along: Float32Array;
  /** A torus's angle around its tube, per vertex. */
  private readonly around: Float32Array | undefined;

  constructor(shape: Shape) {
    this.base = shape;
    this.geometry = buildGeometry(shape);
    this.position = this.geometry.getAttribute("position") as BufferAttribute;
    this.rest = Float32Array.from(this.position.array as Float32Array);
    if (shape.kind === "helix" || shape.kind === "torus") {
      // TubeGeometry's and TorusGeometry's u runs 0 to 1 along the wire or arc; a torus's v runs once around its tube.
      const uv = this.geometry.getAttribute("uv");
      this.along = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) this.along[i] = uv.getX(i) - 0.5;
      if (shape.kind === "torus") {
        this.around = new Float32Array(uv.count);
        for (let i = 0; i < uv.count; i++) this.around[i] = uv.getY(i) * 2 * Math.PI;
      }
    } else {
      this.along = new Float32Array(this.rest.length);
      for (let i = 0; i < this.rest.length; i++) this.along[i] = this.rest[i]! < 0 ? -1 : 1;
    }
  }

  fits(next: Shape): boolean {
    return canStretch(this.base, next);
  }

  apply(next: Shape): void {
    const out = this.position.array as Float32Array;
    const rest = this.rest;
    const along = this.along;
    if (next.kind === "torus" && this.around) {
      // geometry.ts's torus, centred on +x and laid in x-z: angle a along the arc, b around the tube.
      const normal = this.geometry.getAttribute("normal") as BufferAttribute;
      const n = normal.array as Float32Array;
      const arc = (Math.min(next.arcDegrees, 360) * Math.PI) / 180;
      const { radius, tube } = next;
      for (let i = 0, k = 0; i < along.length; i++, k += 3) {
        const a = along[i]! * arc;
        const b = this.around[i]!;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const cb = Math.cos(b);
        const sb = Math.sin(b);
        out[k] = (radius + tube * cb) * ca;
        out[k + 1] = tube * sb;
        out[k + 2] = -(radius + tube * cb) * sa;
        n[k] = cb * ca;
        n[k + 1] = sb;
        n[k + 2] = -cb * sa;
      }
      normal.needsUpdate = true;
    } else if (next.kind === "helix" && this.base.kind === "helix") {
      const grow = next.length - this.base.length;
      for (let i = 0, k = 1; i < along.length; i++, k += 3) out[k] = rest[k]! + grow * along[i]!;
    } else if (next.kind === "box" && this.base.kind === "box") {
      const dx = (next.width - this.base.width) / 2;
      const dy = (next.height - this.base.height) / 2;
      const dz = (next.depth - this.base.depth) / 2;
      for (let k = 0; k < out.length; k += 3) {
        out[k] = rest[k]! + along[k]! * dx;
        out[k + 1] = rest[k + 1]! + along[k + 1]! * dy;
        out[k + 2] = rest[k + 2]! + along[k + 2]! * dz;
      }
    }
    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

type Entry = { geometry: BufferGeometry; refs: number };

/** Geometry shared by key across every figure. Released geometry waits in an idle list, oldest disposed first. */
export class GeometryCache {
  private readonly live = new Map<string, Entry>();
  /** Insertion-ordered, so the first key is the one released longest ago. */
  private readonly idle = new Map<string, Entry>();
  builds = 0;
  private readonly keepIdle: number;

  constructor(keepIdle = 96) {
    this.keepIdle = keepIdle;
  }

  acquire(key: string, shape: Shape): BufferGeometry {
    let entry = this.live.get(key);
    if (!entry) {
      entry = this.idle.get(key);
      if (entry) this.idle.delete(key);
      else {
        entry = { geometry: buildGeometry(shape), refs: 0 };
        this.builds++;
      }
      this.live.set(key, entry);
    }
    entry.refs++;
    return entry.geometry;
  }

  release(key: string): void {
    const entry = this.live.get(key);
    if (!entry || --entry.refs > 0) return;
    this.live.delete(key);
    this.idle.set(key, entry);
    if (this.idle.size > this.keepIdle) {
      const [oldest, old] = this.idle.entries().next().value as [string, Entry];
      this.idle.delete(oldest);
      old.geometry.dispose();
    }
  }

  get size() {
    return { live: this.live.size, idle: this.idle.size };
  }
}
