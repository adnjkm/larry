import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as stylex from "@stylexjs/stylex";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BufferGeometry, type Group, type Mesh, type OrthographicCamera, PlaneGeometry, Vector3 } from "three";
import { type KitBounds, measureParts } from "../../shared/bounds.ts";
import type { Part } from "../../shared/kit.ts";
import { reducedMotion, velocityTracker } from "../motion.ts";
import { geometries } from "../primitives/stage/scene.ts";
import { shapeKey } from "../primitives/stage/shapes.ts";
import { DEFAULT_LOOK, type DitherLook } from "./ditherLook.ts";
import { materialsFor } from "./ditherMaterial.ts";
import { VIEWER_SELECTOR, markViewerReady, viewerProps } from "../viewport.ts";
import { DEG_TO_RAD } from "../../shared/angles.ts";

const MARGIN = 1.12;
const SPIN_RADIANS_PER_SECOND = 0.5;
const DRAG_RADIANS_PER_PIXEL = 0.012;
/** Seconds for a flick's extra speed to fade to a third, close to how scrolling decelerates. */
const FLING_SECONDS = 0.5;
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
  /** CSS height in px. */
  height?: number;
  /** Bounds to fit the camera to instead of the parts' own, so the view holds still while the parts move or arrive. */
  frame?: KitBounds;
  /** CSS pixels per dither pixel, overriding the look's. 1 is the finest. */
  pixelScale?: number;
  look?: DitherLook;
};

const styles = stylex.create({
  // Both sides are whole multiples of a drawn pixel. A fractional scale would stretch some pixels and break up the dither pattern.
  box: (height: number, pixelSize: number, paper: string) => ({
    position: "relative",
    width: `round(down, 100%, ${pixelSize}px)`,
    height: Math.floor(height / pixelSize) * pixelSize,
    backgroundColor: paper,
    // Horizontal drags turn the model; vertical swipes and pinch zoom stay with the page so a tall viewer never traps them.
    touchAction: "pan-y pinch-zoom",
    overflow: "hidden",
  }),
});

const shapeKeys = new WeakMap<Part["shape"], string>();
function keyOf(part: Part): string {
  let key = shapeKeys.get(part.shape);
  if (key === undefined) shapeKeys.set(part.shape, (key = shapeKey(part.shape)));
  return key;
}

/**
 * The parts' geometries from the stage's shared cache, so a viewer that mounts again (a new lesson step) builds nothing
 * new. Each list of parts takes its references before the last list lets go of its own, so a shape both use is never released.
 */
function useGeometries(parts: Part[]): BufferGeometry[] {
  const held = useMemo(() => {
    const byKey = new Map<string, BufferGeometry>();
    for (const part of parts) {
      const key = keyOf(part);
      if (!byKey.has(key)) byKey.set(key, geometries.acquire(key, part.shape));
    }
    return byKey;
  }, [parts]);
  useEffect(
    () => () => {
      for (const key of held.keys()) geometries.release(key);
    },
    [held],
  );
  return useMemo(() => parts.map((part) => held.get(keyOf(part))!), [parts, held]);
}

const cameraTarget = new Vector3();
const cameraOffset = new Vector3();
const FIT_KEYS = ["zoom", "targetY", "distance"] as const;

function placeCamera(cam: OrthographicCamera, fit: Fit, elevation: number, azimuth: number) {
  const el = elevation * DEG_TO_RAD;
  const az = azimuth * DEG_TO_RAD;
  cameraTarget.set(0, fit.targetY, 0);
  cameraOffset.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(fit.distance);
  cam.position.copy(cameraTarget).add(cameraOffset);
  cam.lookAt(cameraTarget);
  cam.near = 0.1;
  cam.far = fit.distance * 2;
  cam.zoom = fit.zoom;
  cam.updateProjectionMatrix();
}

export const KitViewer = memo(function KitViewer({
  parts,
  spin: wantsSpin = false,
  elevation = 20,
  azimuth = 30,
  height = 360,
  frame,
  pixelScale,
  look = DEFAULT_LOOK,
}: KitViewerProps) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const spin = wantsSpin && !reducedMotion.matches;
  const pixelSize = pixelScale ?? look.pixels.size;
  return (
    <div ref={box} {...viewerProps} {...stylex.props(styles.box(height, pixelSize, look.colors.paper))}>
      <Canvas
        orthographic
        flat
        frameloop={spin && visible ? "always" : "demand"}
        dpr={1 / pixelSize}
        gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
        camera={{ position: [0, 0, 100], near: 0.1, far: 10000 }}
        onCreated={({ gl }) => {
          gl.debug.checkShaderErrors = import.meta.env.DEV;
        }}
      >
        <color attach="background" args={[look.colors.paper]} />
        <Scene parts={parts} spin={spin} elevation={elevation} azimuth={azimuth} frame={frame} look={look} />
      </Canvas>
    </div>
  );
});

function Scene({
  parts,
  spin,
  elevation,
  azimuth,
  frame,
  look,
}: {
  parts: Part[];
  spin: boolean;
  elevation: number;
  azimuth: number;
  frame: KitBounds | undefined;
  look: DitherLook;
}) {
  const { camera, size, gl, invalidate } = useThree();
  const shapes = useGeometries(parts);
  const bounds = useMemo(() => frame ?? measureParts(parts), [frame, parts]);
  const pivot = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const yaw = useRef(0);
  /** Radians per second the model keeps turning after a flick, on top of the idle spin. */
  const fling = useRef(0);
  const dragging = useRef(false);
  const framesDrawn = useRef(0);
  const fit = useRef<Fit>(undefined);
  const fitGoal = useRef<Fit>(undefined);

  const materialSet = useMemo(() => materialsFor(look), [look]);
  const materials = useMemo(() => parts.map((part) => materialSet.part(part.color, part.finish)), [parts, materialSet]);
  const shadowMaterial = materialSet.shadow();
  const shadowGeometry = useMemo(() => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  useEffect(() => () => shadowGeometry.dispose(), [shadowGeometry]);

  const footprint = Math.max(bounds.halfX, bounds.halfZ);
  const shadowRadius = { x: bounds.halfX * 1.05 + 3, z: bounds.halfZ * 1.05 + 3 };
  const sideways = footprint * 0.3;
  const away = footprint * 0.2;
  const shadowReach = sideways + Math.max(shadowRadius.x, shadowRadius.z);

  useLayoutEffect(() => {
    // A viewer hidden with display: none measures 0 x 0, which would fit the camera to nothing.
    if (size.width === 0 || size.height === 0) return;
    const el = elevation * DEG_TO_RAD;
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
    Object.assign(canvas.style, { imageRendering: "pixelated", width: "100%", height: "100%", touchAction: "pan-y pinch-zoom", cursor: "grab" });
    let lastX = 0;
    const tracker = velocityTracker();
    const down = (e: PointerEvent) => {
      dragging.current = true;
      fling.current = 0;
      lastX = e.clientX;
      tracker.reset();
      tracker.add(yaw.current, e.timeStamp);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current += (e.clientX - lastX) * DRAG_RADIANS_PER_PIXEL;
      lastX = e.clientX;
      tracker.add(yaw.current, e.timeStamp);
      invalidate();
    };
    const up = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      canvas.style.cursor = "grab";
      // The model leaves the finger at the speed it was turning.
      if (e.type === "pointerup" && !reducedMotion.matches) fling.current = tracker.velocity(e.timeStamp);
      invalidate();
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

  useFrame((_, elapsed) => {
    // After a pause (off screen, or a still view that was only redrawn on demand) the first frame would otherwise lurch.
    const delta = Math.min(elapsed, 0.1);
    const current = fit.current;
    const goal = fitGoal.current;
    if (current && goal) {
      const k = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / FIT_EASE_SECONDS);
      let moving = false;
      for (const key of FIT_KEYS) {
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
    if (!dragging.current) {
      yaw.current += delta * ((spin ? SPIN_RADIANS_PER_SECOND : 0) + fling.current);
      fling.current = Math.abs(fling.current) < 0.05 ? 0 : fling.current * Math.exp(-delta / FLING_SECONDS);
      if (fling.current !== 0) invalidate();
    }
    if (pivot.current) pivot.current.rotation.y = yaw.current;
    if (shadow.current) shadow.current.rotation.y = yaw.current;
    if (++framesDrawn.current === 1) {
      // The first frame is presented once this animation frame ends.
      requestAnimationFrame(() => markViewerReady(gl.domElement.closest(VIEWER_SELECTOR)));
    }
  });

  const az = azimuth * DEG_TO_RAD;
  const shadowPosition: [number, number, number] = [
    Math.cos(az) * sideways - Math.sin(az) * away,
    Math.min(0, bounds.minY),
    -Math.sin(az) * sideways - Math.cos(az) * away,
  ];

  return (
    <>
      <mesh
        ref={shadow}
        visible={look.shadow.show}
        geometry={shadowGeometry}
        material={shadowMaterial}
        position={shadowPosition}
        scale={[shadowRadius.x, 1, shadowRadius.z]}
        renderOrder={-1}
      />
      <group ref={pivot}>
        <group position={[-bounds.centerX, 0, -bounds.centerZ]}>
          {parts.map((part, i) => (
            <mesh
              key={part.id}
              geometry={shapes[i]}
              material={materials[i]}
              position={[part.position.x, part.position.y, part.position.z]}
              rotation={[part.rotation.x * DEG_TO_RAD, part.rotation.y * DEG_TO_RAD, part.rotation.z * DEG_TO_RAD]}
            />
          ))}
        </group>
      </group>
    </>
  );
}
