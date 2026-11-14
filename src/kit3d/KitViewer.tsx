import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type Group, type Mesh, type OrthographicCamera, PlaneGeometry, type ShaderMaterial, Vector3 } from "three";
import type { Kit, Part } from "../../shared/kit.ts";
import { type BuiltPart, buildPart, measure, measureParts } from "./buildKit.ts";
import { DEFAULT_LOOK, type DitherLook } from "./ditherLook.ts";
import { applyLook, createDitherMaterial, createLookUniforms, createShadowMaterial } from "./ditherMaterial.ts";

const MARGIN = 1.12;
const SPIN_RADIANS_PER_SECOND = 0.5;
const DRAG_RADIANS_PER_PIXEL = 0.012;
/** Time constant of the camera easing, so a new fit is about 95% settled after 0.3 s. */
const FIT_EASE_SECONDS = 0.1;

type Fit = { zoom: number; targetY: number; distance: number };

type KitViewerProps = {
  kit: Kit;
  spin?: boolean;
  /** Degrees above the ground plane. */
  elevation?: number;
  /** Degrees around y, 0 looks along -z. */
  azimuth?: number;
  /** CSS height in px. */
  height?: number;
  /** Parts to fit the camera to instead of the kit's own, so the view holds still while sliders move the kit. */
  frame?: Part[];
  /** CSS pixels per dither pixel, overriding the look's. 1 is the finest. */
  pixelScale?: number;
  /** Colours for a gradient shadow, centre first (see createShadowMaterial). Unset keeps the look's shadow. */
  shadowStops?: readonly string[];
  look?: DitherLook;
};

const styles = stylex.create({
  // Both sides are whole multiples of a drawn pixel. A fractional scale would stretch some pixels and break up the dither pattern.
  box: (height: number, pixelSize: number, paper: string) => ({
    position: "relative",
    width: `round(down, 100%, ${pixelSize}px)`,
    height: Math.floor(height / pixelSize) * pixelSize,
    backgroundColor: paper,
    touchAction: "none",
    overflow: "hidden",
  }),
});

/** Makes one resource per part object and keeps it across rebuilds, disposing it only once its part is gone. */
function usePerPart<T>(parts: Part[], make: (part: Part) => T, dispose: (item: T) => void): T[] {
  const cache = useRef(new Map<Part, T>());
  const items = useMemo(() => parts.map((part) => cache.current.get(part) ?? make(part)), [parts, make]);
  useEffect(() => {
    const live = new Map(parts.map((part, i) => [part, items[i] as T]));
    for (const [part, item] of cache.current) if (!live.has(part)) dispose(item);
    cache.current = live;
  }, [parts, items, dispose]);
  useEffect(() => () => cache.current.forEach(dispose), [dispose]);
  return items;
}

const disposeMaterial = (material: ShaderMaterial) => material.dispose();
const disposeGeometry = ({ geometry }: BuiltPart) => geometry.dispose();

function placeCamera(cam: OrthographicCamera, fit: Fit, elevation: number, azimuth: number) {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const target = new Vector3(0, fit.targetY, 0);
  cam.position.copy(target).add(new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(fit.distance));
  cam.lookAt(target);
  cam.near = 0.1;
  cam.far = fit.distance * 2;
  cam.zoom = fit.zoom;
  cam.updateProjectionMatrix();
}

export function KitViewer({ kit, spin = false, elevation = 20, azimuth = 30, height = 360, frame, pixelScale, shadowStops, look = DEFAULT_LOOK }: KitViewerProps) {
  const pixelSize = pixelScale ?? look.pixels.size;
  return (
    <div data-kit-viewer {...stylex.props(styles.box(height, pixelSize, look.colors.paper))}>
      <Canvas
        orthographic
        flat
        frameloop={spin ? "always" : "demand"}
        dpr={1 / pixelSize}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 100], near: 0.1, far: 10000 }}
      >
        <color attach="background" args={[look.colors.paper]} />
        <Scene parts={kit.parts} spin={spin} elevation={elevation} azimuth={azimuth} frame={frame} shadowStops={shadowStops} look={look} />
      </Canvas>
    </div>
  );
}

function Scene({ parts, spin, elevation, azimuth, frame, shadowStops, look }: { parts: Part[]; spin: boolean; elevation: number; azimuth: number; frame: Part[] | undefined; shadowStops: readonly string[] | undefined; look: DitherLook }) {
  const { camera, size, gl, invalidate } = useThree();
  const built = usePerPart(parts, buildPart, disposeGeometry);
  const framed = useMemo(() => (frame ? measureParts(frame) : undefined), [frame]);
  const bounds = useMemo(() => framed ?? measure(built), [framed, built]);
  const pivot = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const framesDrawn = useRef(0);
  const fit = useRef<Fit>(undefined);
  const fitGoal = useRef<Fit>(undefined);

  const lookUniforms = useMemo(() => createLookUniforms(), []);
  useLayoutEffect(() => {
    applyLook(lookUniforms, look);
    invalidate();
  }, [lookUniforms, look, invalidate]);

  const makeMaterial = useCallback((part: Part) => createDitherMaterial(part.color, part.finish, lookUniforms), [lookUniforms]);
  const materials = usePerPart(parts, makeMaterial, disposeMaterial);

  const shadowGeometry = useMemo(() => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  const shadowMaterial = useMemo(() => createShadowMaterial(lookUniforms, shadowStops), [lookUniforms, shadowStops]);
  useEffect(
    () => () => {
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
    [shadowGeometry, shadowMaterial],
  );

  const footprint = Math.max(bounds.halfX, bounds.halfZ);
  const shadowRadius = { x: bounds.halfX * 1.05 + 3, z: bounds.halfZ * 1.05 + 3 };
  const sideways = footprint * 0.3;
  const away = footprint * 0.2;
  const shadowReach = sideways + Math.max(shadowRadius.x, shadowRadius.z);

  useLayoutEffect(() => {
    const el = (elevation * Math.PI) / 180;
    const height = bounds.maxY - bounds.minY;
    const halfWide = Math.max(bounds.radius, shadowReach * 0.85);
    const halfTall = (height / 2) * Math.cos(el) + bounds.radius * Math.sin(el);
    fitGoal.current = {
      zoom: Math.min(size.width / (2 * halfWide * MARGIN), size.height / (2 * halfTall * MARGIN)),
      targetY: (bounds.minY + bounds.maxY) / 2,
      distance: 2 * (bounds.radius + height) + 100,
    };
    // The first fit snaps so a static viewer is right on its first frame. Later fits are eased in useFrame.
    fit.current ??= { ...fitGoal.current };
    placeCamera(camera as OrthographicCamera, fit.current, elevation, azimuth);
    invalidate();
  }, [camera, size, bounds, shadowReach, elevation, azimuth, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    Object.assign(canvas.style, { imageRendering: "pixelated", width: "100%", height: "100%", touchAction: "none", cursor: "grab" });
    let lastX = 0;
    const down = (e: PointerEvent) => {
      dragging.current = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current += (e.clientX - lastX) * DRAG_RADIANS_PER_PIXEL;
      lastX = e.clientX;
      invalidate();
    };
    const up = () => {
      dragging.current = false;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [gl, invalidate]);

  useFrame((_, delta) => {
    const current = fit.current;
    const goal = fitGoal.current;
    if (current && goal) {
      const k = 1 - Math.exp(-delta / FIT_EASE_SECONDS);
      let moving = false;
      for (const key of ["zoom", "targetY", "distance"] as const) {
        const gap = goal[key] - current[key];
        if (Math.abs(gap) < 1e-3 * Math.max(1, Math.abs(goal[key]))) current[key] = goal[key];
        else {
          current[key] += gap * k;
          moving = true;
        }
      }
      if (moving) {
        placeCamera(camera as OrthographicCamera, current, elevation, azimuth);
        invalidate();
      }
    }
    if (spin && !dragging.current) yaw.current += delta * SPIN_RADIANS_PER_SECOND;
    if (pivot.current) pivot.current.rotation.y = yaw.current;
    if (shadow.current) shadow.current.rotation.y = yaw.current;
    if (++framesDrawn.current === 1) {
      // The first frame is presented once this animation frame ends.
      requestAnimationFrame(() => gl.domElement.closest("[data-kit-viewer]")?.setAttribute("data-ready", ""));
    }
  });

  const az = (azimuth * Math.PI) / 180;
  const shadowPosition: [number, number, number] = [
    Math.cos(az) * sideways - Math.sin(az) * away,
    Math.min(0, bounds.minY),
    -Math.sin(az) * sideways - Math.cos(az) * away,
  ];

  return (
    <>
      <mesh ref={shadow} visible={look.shadow.show} geometry={shadowGeometry} material={shadowMaterial} position={shadowPosition} scale={[shadowRadius.x, 1, shadowRadius.z]} renderOrder={-1} />
      <group ref={pivot}>
        <group position={[-bounds.centerX, 0, -bounds.centerZ]}>
          {built.map(({ part, geometry, rotation }, i) => (
            <mesh key={part.id} geometry={geometry} material={materials[i]} position={[part.position.x, part.position.y, part.position.z]} rotation={rotation} />
          ))}
        </group>
      </group>
    </>
  );
}
