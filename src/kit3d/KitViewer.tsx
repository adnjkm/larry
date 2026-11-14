import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type Group, type Mesh, type OrthographicCamera, PlaneGeometry, Vector3 } from "three";
import type { Kit } from "../../shared/kit.ts";
import { buildKit } from "./buildKit.ts";
import { createDitherMaterial, createShadowMaterial } from "./ditherMaterial.ts";

/** The canvas draws this many pixels tall and is scaled up in CSS. */
const PIXEL_ROWS = 180;
const MARGIN = 1.12;
const SPIN_RADIANS_PER_SECOND = 0.5;
const DRAG_RADIANS_PER_PIXEL = 0.012;

type KitViewerProps = {
  kit: Kit;
  spin?: boolean;
  /** Degrees above the ground plane. */
  elevation?: number;
  /** Degrees around y, 0 looks along -z. */
  azimuth?: number;
  /** CSS height in px. Pick a multiple of 180 so the pixels stay square. */
  height?: number;
};

const styles = stylex.create({
  box: (height: number) => ({
    position: "relative",
    width: "100%",
    height,
    backgroundColor: "#FFFFFF",
    touchAction: "none",
    overflow: "hidden",
  }),
});

export function KitViewer({ kit, spin = false, elevation = 20, azimuth = 30, height = 360 }: KitViewerProps) {
  const built = useMemo(() => buildKit(kit), [kit]);
  useEffect(() => () => built.parts.forEach((p) => p.geometry.dispose()), [built]);

  return (
    <div data-kit-viewer {...stylex.props(styles.box(height))}>
      <Canvas
        orthographic
        flat
        frameloop={spin ? "always" : "demand"}
        dpr={PIXEL_ROWS / height}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 100], near: 0.1, far: 10000 }}
      >
        <color attach="background" args={["#FFFFFF"]} />
        <Scene built={built} spin={spin} elevation={elevation} azimuth={azimuth} />
      </Canvas>
    </div>
  );
}

function Scene({ built, spin, elevation, azimuth }: { built: ReturnType<typeof buildKit>; spin: boolean; elevation: number; azimuth: number }) {
  const { camera, size, gl, invalidate } = useThree();
  const { bounds } = built;
  const pivot = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const framesDrawn = useRef(0);

  const materials = useMemo(() => built.parts.map(({ part }) => createDitherMaterial(part.color, part.finish)), [built]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const shadowGeometry = useMemo(() => new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), []);
  const shadowMaterial = useMemo(createShadowMaterial, []);
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
    const cam = camera as OrthographicCamera;
    const el = (elevation * Math.PI) / 180;
    const az = (azimuth * Math.PI) / 180;
    const target = new Vector3(0, (bounds.minY + bounds.maxY) / 2, 0);
    const height = bounds.maxY - bounds.minY;
    const distance = 2 * (bounds.radius + height) + 100;
    cam.position.copy(target).add(new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance));
    cam.lookAt(target);
    cam.near = 0.1;
    cam.far = distance * 2;

    const halfWide = Math.max(bounds.radius, shadowReach * 0.85);
    const halfTall = (height / 2) * Math.cos(el) + bounds.radius * Math.sin(el);
    cam.zoom = Math.min(size.width / (2 * halfWide * MARGIN), size.height / (2 * halfTall * MARGIN));
    cam.updateProjectionMatrix();
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
          {built.parts.map(({ part, geometry, rotation }, i) => (
            <mesh key={part.id} geometry={geometry} material={materials[i]} position={[part.position.x, part.position.y, part.position.z]} rotation={rotation} />
          ))}
        </group>
      </group>
    </>
  );
}
