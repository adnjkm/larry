import { type BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Part } from "../../shared/kit.ts";
import { buildGeometry } from "./geometry.ts";

export type BuiltPart = { part: Part; geometry: BufferGeometry; rotation: Euler };

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

const DEG = Math.PI / 180;

export const rotationOf = (part: Part) => new Euler(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG, "XYZ");

export function buildPart(part: Part): BuiltPart {
  return { part, geometry: buildGeometry(part.shape), rotation: rotationOf(part) };
}

/** Bounds of parts that are only measured, never drawn. Their geometry is freed straight away. */
export function measureParts(parts: Part[]): KitBounds {
  const built = parts.map(buildPart);
  const bounds = measure(built);
  for (const { geometry } of built) geometry.dispose();
  return bounds;
}

export function measure(parts: BuiltPart[]): KitBounds {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const matrices = parts.map(({ part, rotation }) =>
    new Matrix4().compose(new Vector3(part.position.x, part.position.y, part.position.z), new Quaternion().setFromEuler(rotation), new Vector3(1, 1, 1)),
  );
  const v = new Vector3();
  const eachVertex = (visit: (v: Vector3) => void) =>
    parts.forEach(({ geometry }, i) => {
      const position = geometry.getAttribute("position");
      for (let k = 0; k < position.count; k++) visit(v.fromBufferAttribute(position, k).applyMatrix4(matrices[i]!));
    });

  eachVertex((p) => {
    min.min(p);
    max.max(p);
  });
  const centerX = (min.x + max.x) / 2;
  const centerZ = (min.z + max.z) / 2;
  let radius = 0;
  eachVertex((p) => {
    radius = Math.max(radius, Math.hypot(p.x - centerX, p.z - centerZ));
  });
  return { centerX, centerZ, minY: min.y, maxY: max.y, radius, halfX: (max.x - min.x) / 2, halfZ: (max.z - min.z) / 2 };
}
