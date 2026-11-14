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

export function buildPart(part: Part): BuiltPart {
  return {
    part,
    geometry: buildGeometry(part.shape),
    rotation: new Euler(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG, "XYZ"),
  };
}

export function measure(parts: BuiltPart[]): KitBounds {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const world: Vector3[] = [];
  const matrix = new Matrix4();
  const v = new Vector3();

  for (const { part, geometry, rotation } of parts) {
    matrix.compose(new Vector3(part.position.x, part.position.y, part.position.z), new Quaternion().setFromEuler(rotation), new Vector3(1, 1, 1));
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      min.min(v);
      max.max(v);
      world.push(v.clone());
    }
  }

  const centerX = (min.x + max.x) / 2;
  const centerZ = (min.z + max.z) / 2;
  let radius = 0;
  for (const p of world) radius = Math.max(radius, Math.hypot(p.x - centerX, p.z - centerZ));
  return { centerX, centerZ, minY: min.y, maxY: max.y, radius, halfX: (max.x - min.x) / 2, halfZ: (max.z - min.z) / 2 };
}
