// Where a point of the kit lands on screen in a KitViewer, and back again. It reads the viewer's own
// camera and the group it turns on drag, so the answer stays exact after the view is turned or resized.
import { _roots } from "@react-three/fiber";
import { Vector3 } from "three";
import { vec, type Vec } from "./model.ts";

export type Point = { x: number; y: number };
export type Lens = {
  /** A kit point in viewport pixels. */
  toScreen: (p: Vec) => Point;
  /** The kit point under a viewport pixel, on the plane facing the camera through `through`. */
  toKit: (x: number, y: number, through: Vec) => Vec;
  /** The kit's direction toward the camera, a unit vector. Moving along it changes nothing on screen, only what is drawn in front. */
  facing: Vec;
  /** The canvas in viewport pixels. */
  rect: DOMRect;
};

export function lensOf(viewer: Element): Lens | null {
  const canvas = viewer.querySelector("canvas");
  const state = canvas ? _roots.get(canvas)?.store.getState() : undefined;
  // KitViewer draws the parts in a group offset by the frame's centre, inside the group a drag turns.
  const model = state?.scene.children.find((c) => c.type === "Group")?.children[0];
  if (!canvas || !state || !model) return null;
  const { camera } = state;
  camera.updateMatrixWorld();
  model.updateWorldMatrix(true, false);
  const rect = canvas.getBoundingClientRect();
  const toScreen = (p: Vec): Point => {
    const v = model.localToWorld(new Vector3(p.x, p.y, p.z)).project(camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  };
  const toKit = (x: number, y: number, through: Vec): Vec => {
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((y - rect.top) / rect.height) * 2;
    const near = new Vector3(nx, ny, -1).unproject(camera);
    const ray = new Vector3(nx, ny, 1).unproject(camera).sub(near);
    const facing = camera.getWorldDirection(new Vector3());
    const anchor = model.localToWorld(new Vector3(through.x, through.y, through.z));
    const t = anchor.sub(near).dot(facing) / ray.dot(facing);
    const w = model.worldToLocal(near.add(ray.multiplyScalar(t)));
    return vec(w.x, w.y, w.z);
  };
  const back = camera.getWorldDirection(new Vector3()).negate().transformDirection(model.matrixWorld.clone().invert());
  return { toScreen, toKit, facing: vec(back.x, back.y, back.z), rect };
}
