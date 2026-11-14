import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type BufferGeometry, type Group, type Mesh, type OrthographicCamera, PlaneGeometry, type ShaderMaterial, Vector3 } from "three";
import type { Part } from "../../shared/kit.ts";
import { colors } from "../tokens.stylex.ts";
import { type BuiltPart, measure, measureParts, rotationOf } from "./buildKit.ts";
import { buildGeometry } from "./geometry.ts";
import { createDitherMaterial, createShadowMaterial } from "./ditherMaterial.ts";

/** The canvas draws this many pixels tall and is scaled up in CSS. */
const PIXEL_ROWS = 180;
const MARGIN = 1.12;
const SPIN_RADIANS_PER_SECOND = 0.5;
const DRAG_RADIANS_PER_PIXEL = 0.012;
/** Time constant of the camera easing, so a new fit is about 95% settled after 0.3 s. */
const FIT_EASE_SECONDS = 0.1;

type Fit = { zoom: number; targetY: number; distance: number };

type KitViewerProps = {
  parts: Part[];
  spin?: boolean;
  /** Degrees above the ground plane. */
  elevation?: number;
  /** Degrees around y, 0 looks along -z. */
  azimuth?: number;
  /** CSS height in px. Pick a multiple of 180 so the pixels stay square. */
  height?: number;
  /** Parts to fit the camera to instead of `parts`, so the view holds still while sliders move the kit. */
  frame?: Part[];
  /** CSS pixels per dither pixel. Unset keeps PIXEL_ROWS rows whatever the height; 1 is the finest. */
  pixelScale?: number;
  /** Colours for a gradient shadow, centre first (see createShadowMaterial). Unset keeps the plain shadow. */
  shadowStops?: readonly string[];
};

const styles = stylex.create({
  box: (height: number) => ({
    position: "relative",
    width: "100%",
    height,
    backgroundColor: colors.paper,
    touchAction: "none",
    overflow: "hidden",
  }),
});

/**
 * One resource per distinct key, shared by every part with that key and kept across rebuilds.
 * A slider tick builds new part objects, but most parts only move, so their shapes and looks are reused.
 */
function useShared<T>(parts: Part[], key: (part: Part) => string, make: (part: Part) => T, dispose: (item: T) => void): T[] {
  const cache = useRef(new Map<string, T>());
  const items = useMemo(
    () =>
      parts.map((part) => {
        const k = key(part);
        let item = cache.current.get(k);
        if (item === undefined) {
          item = make(part);
          cache.current.set(k, item);
        }
        return item;
      }),
    [parts, key, make],
  );
  useEffect(() => {
    const live = new Set(parts.map(key));
    for (const [k, item] of cache.current) {
      if (live.has(k)) continue;
      dispose(item);
      cache.current.delete(k);
    }
  }, [parts, key, dispose]);
  useEffect(() => () => cache.current.forEach(dispose), [dispose]);
  return items;
}

const shapeKey = (part: Part) => JSON.stringify(part.shape);
const makeGeometry = (part: Part) => buildGeometry(part.shape);
const disposeGeometry = (geometry: BufferGeometry) => geometry.dispose();
const lookKey = (part: Part) => `${part.color} ${part.finish}`;
const makeMaterial = (part: Part) => createDitherMaterial(part.color, part.finish);
const disposeMaterial = (material: ShaderMaterial) => material.dispose();

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

export function KitViewer({ parts, spin = false, elevation = 20, azimuth = 30, height = 360, frame, pixelScale, shadowStops }: KitViewerProps) {
  return (
    <div data-kit-viewer {...stylex.props(styles.box(height))}>
      <Canvas
        orthographic
        flat
        frameloop={spin ? "always" : "demand"}
        dpr={pixelScale ? 1 / pixelScale : PIXEL_ROWS / height}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 100], near: 0.1, far: 10000 }}
      >
        <color attach="background" args={[colors.paper]} />
        <Scene parts={parts} spin={spin} elevation={elevation} azimuth={azimuth} frame={frame} shadowStops={shadowStops} />
      </Canvas>
    </div>
  );
}

function Scene({ parts, spin, elevation, azimuth, frame, shadowStops }: { parts: Part[]; spin: boolean; elevation: number; azimuth: number; frame: Part[] | undefined; shadowStops: readonly string[] | undefined }) {
  const { camera, size, gl, invalidate } = useThree();
  const geometries = useShared(parts, shapeKey, makeGeometry, disposeGeometry);
  const built = useMemo((): BuiltPart[] => parts.map((part, i) => ({ part, geometry: geometries[i]!, rotation: rotationOf(part) })), [parts, geometries]);
  const framed = useMemo(() => (frame ? measureParts(frame) : undefined), [frame]);
  const bounds = useMemo(() => framed ?? measure(built), [framed, built]);
  const pivot = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const framesDrawn = useRef(0);
  const fit = useRef<Fit>(undefined);
  const fitGoal = useRef<Fit>(undefined);

  const materials = useShared(parts, lookKey, makeMaterial, disposeMaterial);

  const shadowGeometry = useMemo(() => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  const shadowMaterial = useMemo(() => createShadowMaterial(shadowStops), [shadowStops]);
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
      <mesh ref={shadow} geometry={shadowGeometry} material={shadowMaterial} position={shadowPosition} scale={[shadowRadius.x, 1, shadowRadius.z]} renderOrder={-1} />
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
