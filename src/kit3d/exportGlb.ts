import { DoubleSide, Group, Mesh, MeshStandardMaterial, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Finish, Kit } from "../../shared/kit.ts";
import { buildPart } from "./buildKit.ts";

const MM_TO_M = 0.001;

const SURFACE: Record<Finish, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.85, metalness: 0 },
  glossy: { roughness: 0.25, metalness: 0.05 },
  metal: { roughness: 0.35, metalness: 0.8 },
  rubber: { roughness: 0.95, metalness: 0 },
  clear: { roughness: 0.1, metalness: 0 },
};

/** The kit as a three scene in metres. Kit units are millimetres, glTF's are metres. */
function buildScene(kit: Kit) {
  const root = new Group();
  root.name = kit.name;
  root.scale.setScalar(MM_TO_M);
  const owned: { dispose: () => void }[] = [];
  for (const { part, geometry, rotation } of kit.parts.map(buildPart)) {
    const material = new MeshStandardMaterial({
      color: part.color,
      ...SURFACE[part.finish],
      side: DoubleSide,
      ...(part.finish === "clear" ? { transparent: true, opacity: 0.4 } : {}),
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = part.name;
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.rotation.copy(rotation);
    root.add(mesh);
    owned.push(geometry, material);
  }
  const scene = new Scene();
  scene.add(root);
  return { scene, dispose: () => owned.forEach((o) => o.dispose()) };
}

async function kitToGlb(kit: Kit): Promise<ArrayBuffer> {
  const { scene, dispose } = buildScene(kit);
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true });
    if (!(result instanceof ArrayBuffer)) throw new Error("The exporter did not return a binary glTF");
    return result;
  } finally {
    dispose();
  }
}

const glbFileName = (kit: Kit) => `${kit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "model"}.glb`;

/**
 * Saves the kit as a .glb. A touch device gets the share sheet, which is how a phone saves to Files or sends a file on;
 * a download link is unreliable in a Home Screen app. Elsewhere, or if sharing is refused, it is a plain download.
 */
export async function downloadGlb(kit: Kit): Promise<void> {
  const file = new File([await kitToGlb(kit)], glbFileName(kit), { type: "model/gltf-binary" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
