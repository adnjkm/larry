// One figure's three.js scene: a mesh per part id, posed by diffing each new part list against the last.
// No DOM and no WebGL here, so it runs (and is measured) under node --test.
import { type BufferGeometry, Group, type Material, Mesh, OrthographicCamera, PlaneGeometry, Scene, Vector3 } from "three";
import type { Finish, Part, Shape } from "../../../shared/kit.ts";
import type { KitBounds } from "../../kit3d/buildKit.ts";
import type { Point } from "../../../shared/primitives/types.ts";
import { GeometryCache, Stretch, sameShape, shapeKey, stretchFamily } from "./shapes.ts";

/** Fit margin around the framed bounds, as in KitViewer. */
const MARGIN = 1.12;
const DEG = Math.PI / 180;

/** Where the scene gets its materials. The page passes the dither shaders; tests pass plain ones. Materials are shared, never disposed here. */
export type Looks = { part: (color: string, finish: Finish) => Material; shadow: () => Material };

export type View = { elevation: number; azimuth: number };

type Slot = {
  mesh: Mesh;
  shape: Shape;
  /** The cache key of a shared geometry, or null when `stretch` owns it. */
  key: string | null;
  stretch: Stretch | null;
  color: string;
  finish: Finish;
  seen: number;
};

/** Shared by every figure: geometry outlives a figure, so the next step's figure of the same primitive builds nothing. */
export const geometries = new GeometryCache();
const shadowPlane = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

export class StageScene {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly pivot = new Group();
  private readonly body = new Group();
  private readonly shadow: Mesh;
  private readonly slots = new Map<string, Slot>();
  private frameNo = 0;
  private yaw = 0;
  private readonly v = new Vector3();
  private readonly dir = new Vector3();
  /** The view's size in CSS px: the box, and the drawn area (a little larger, a whole number of dither pixels). */
  private size = { boxW: 1, boxH: 1, viewW: 1, viewH: 1 };

  private readonly bounds: KitBounds;
  private readonly view: View;
  private readonly looks: Looks;
  /** Colour substitutions, e.g. the lesson palette. */
  private readonly recolor: ReadonlyMap<string, string> | undefined;
  /** "spin": fit a circle the model can turn in (still mode). "fixed": fit what this one camera sees (game mode). */
  private readonly fit: "spin" | "fixed";

  constructor(bounds: KitBounds, view: View, looks: Looks, recolor?: ReadonlyMap<string, string>, fit: "spin" | "fixed" = "spin") {
    this.fit = fit;
    this.bounds = bounds;
    this.view = view;
    this.looks = looks;
    this.recolor = recolor;
    const footprint = Math.max(bounds.halfX, bounds.halfZ);
    const az = view.azimuth * DEG;
    const sideways = footprint * 0.3;
    const away = footprint * 0.2;
    this.shadow = new Mesh(shadowPlane, looks.shadow());
    this.shadow.position.set(Math.cos(az) * sideways - Math.sin(az) * away, Math.min(0, bounds.minY), -Math.sin(az) * sideways - Math.cos(az) * away);
    this.shadow.scale.set(bounds.halfX * 1.05 + 3, 1, bounds.halfZ * 1.05 + 3);
    this.shadow.renderOrder = -1;
    this.shadow.frustumCulled = false;
    this.body.position.set(-bounds.centerX, 0, -bounds.centerZ);
    this.pivot.add(this.body);
    this.scene.add(this.shadow, this.pivot);
  }

  /** Poses every part: the rig, then the game's standing props, then the frame's marks. Parts missing from this frame are hidden, kept for when they come back. */
  setFrame(parts: readonly Part[], scene?: readonly Part[], marks?: readonly Part[]): void {
    const n = ++this.frameNo;
    for (let i = 0; i < parts.length; i++) this.place(parts[i]!, n);
    if (scene) for (let i = 0; i < scene.length; i++) this.place(scene[i]!, n);
    if (marks) for (let i = 0; i < marks.length; i++) this.place(marks[i]!, n);
    for (const slot of this.slots.values()) if (slot.seen !== n) slot.mesh.visible = false;
  }

  private place(part: Part, n: number): void {
    let slot = this.slots.get(part.id);
    if (!slot) {
      const key = shapeKey(part.shape);
      const mesh = new Mesh(geometries.acquire(key, part.shape), this.material(part.color, part.finish));
      // Figures are always framed whole, and a stretched geometry's bounding sphere would go stale.
      mesh.frustumCulled = false;
      slot = { mesh, shape: part.shape, key, stretch: null, color: part.color, finish: part.finish, seen: n };
      this.slots.set(part.id, slot);
      this.body.add(mesh);
    } else {
      if (!sameShape(slot.shape, part.shape)) this.reshape(slot, part.shape);
      if (slot.color !== part.color || slot.finish !== part.finish) {
        slot.color = part.color;
        slot.finish = part.finish;
        slot.mesh.material = this.material(part.color, part.finish);
      }
    }
    slot.seen = n;
    const { mesh } = slot;
    mesh.visible = true;
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.rotation.set(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG);
  }

  private reshape(slot: Slot, shape: Shape): void {
    if (slot.stretch?.fits(shape)) {
      slot.stretch.apply(shape);
    } else {
      let geometry: BufferGeometry;
      const stretchable = stretchFamily(slot.shape, shape);
      this.releaseGeometry(slot);
      if (stretchable) {
        // The first size change of a coil or box: from here on it is stretched in place.
        slot.stretch = new Stretch(shape);
        slot.key = null;
        geometry = slot.stretch.geometry;
      } else {
        slot.key = shapeKey(shape);
        geometry = geometries.acquire(slot.key, shape);
      }
      slot.mesh.geometry = geometry;
    }
    slot.shape = shape;
  }

  private releaseGeometry(slot: Slot): void {
    if (slot.stretch) slot.stretch.dispose();
    else if (slot.key !== null) geometries.release(slot.key);
    slot.stretch = null;
    slot.key = null;
  }

  private material(color: string, finish: Finish): Material {
    return this.looks.part(this.recolor?.get(color) ?? color, finish);
  }

  /** Turns the model (and its shadow) about the vertical axis through its footprint's centre. */
  setYaw(radians: number): void {
    this.yaw = radians;
    this.pivot.rotation.y = radians;
    this.shadow.rotation.y = radians;
  }

  /**
   * Fits the orthographic camera once to the framed bounds, as KitViewer does. `box` is the figure's CSS size; `view` is
   * the drawn area from the same top-left corner, which overhangs the box by under one dither pixel at the right and bottom.
   */
  resize(boxW: number, boxH: number, viewW: number, viewH: number): void {
    this.size = { boxW, boxH, viewW, viewH };
    const { bounds, camera } = this;
    const el = this.view.elevation * DEG;
    const az = this.view.azimuth * DEG;
    const footprint = Math.max(bounds.halfX, bounds.halfZ);
    const shadowReach = footprint * 0.3 + Math.max(bounds.halfX * 1.05 + 3, bounds.halfZ * 1.05 + 3);
    const height = bounds.maxY - bounds.minY;
    let halfWide = Math.max(bounds.radius, shadowReach * 0.85);
    let halfTall = (height / 2) * Math.cos(el) + bounds.radius * Math.sin(el);
    const distance = 2 * (bounds.radius + height) + 100;
    let tx = 0;
    let ty = (bounds.minY + bounds.maxY) / 2;
    let tz = 0;
    if (this.fit === "fixed") {
      // The camera never turns, so fit the box's corners and the shadow as this view projects them, centred on them.
      const rx = Math.cos(az);
      const rz = -Math.sin(az);
      const ux = -Math.sin(el) * Math.sin(az);
      const uy = Math.cos(el);
      const uz = -Math.sin(el) * Math.cos(az);
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      const see = (x: number, y: number, z: number) => {
        const a = x * rx + z * rz;
        const b = x * ux + y * uy + z * uz;
        minA = Math.min(minA, a);
        maxA = Math.max(maxA, a);
        minB = Math.min(minB, b);
        maxB = Math.max(maxB, b);
      };
      for (const x of [-bounds.halfX, bounds.halfX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [-bounds.halfZ, bounds.halfZ]) see(x, y, z);
      const sh = this.shadow;
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * 2 * Math.PI;
        // The shadow's faint rim is allowed to run off the edge, as in still mode.
        see(sh.position.x + Math.cos(t) * sh.scale.x * 0.85, sh.position.y, sh.position.z + Math.sin(t) * sh.scale.z * 0.85);
      }
      halfWide = (maxA - minA) / 2;
      halfTall = (maxB - minB) / 2;
      const midA = (minA + maxA) / 2;
      const midB = (minB + maxB) / 2;
      tx = rx * midA + ux * midB;
      ty = uy * midB;
      tz = rz * midA + uz * midB;
    }
    camera.left = -boxW / 2;
    camera.right = camera.left + viewW;
    camera.top = boxH / 2;
    camera.bottom = camera.top - viewH;
    camera.zoom = Math.min(boxW / (2 * halfWide * MARGIN), boxH / (2 * halfTall * MARGIN));
    camera.near = 0.1;
    camera.far = distance * 2;
    camera.position.set(tx + Math.sin(az) * Math.cos(el) * distance, ty + Math.sin(el) * distance, tz + Math.cos(az) * Math.cos(el) * distance);
    camera.lookAt(tx, ty, tz);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Where a point of the figure's own space shows, in CSS px from the box's top-left corner. */
  project(p: Point, out: { x: number; y: number }): { x: number; y: number } {
    const x = p.x - this.bounds.centerX;
    const z = p.z - this.bounds.centerZ;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    this.v.set(x * c + z * s, p.y, -x * s + z * c).project(this.camera);
    out.x = ((this.v.x + 1) / 2) * this.size.viewW;
    out.y = ((1 - this.v.y) / 2) * this.size.viewH;
    return out;
  }

  /** The point of the figure's plane z = `z` under CSS px (x, y) of the box. */
  unproject(x: number, y: number, z: number): { x: number; y: number } {
    const { v, dir, camera } = this;
    v.set((x / this.size.viewW) * 2 - 1, 1 - (y / this.size.viewH) * 2, -1).unproject(camera);
    camera.getWorldDirection(dir);
    // Into the figure's own frame: undo the turn, then the centring.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const ox = v.x * c - v.z * s + this.bounds.centerX;
    const oz = v.x * s + v.z * c + this.bounds.centerZ;
    const dx = dir.x * c - dir.z * s;
    const dz = dir.x * s + dir.z * c;
    const t = Math.abs(dz) < 1e-9 ? 0 : (z - oz) / dz;
    return { x: ox + t * dx, y: v.y + t * dir.y };
  }

  /** How many meshes and shared geometries the scene holds, for tests. */
  get meshCount(): number {
    return this.slots.size;
  }

  dispose(): void {
    for (const slot of this.slots.values()) this.releaseGeometry(slot);
    this.slots.clear();
    this.body.clear();
  }
}
