// The sample photos and the kits already generated for them, so the prototype runs without the network.
import { type Kit, parseKit } from "../../shared/kit.ts";

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const idOf = (path: string) => path.split("/").pop()!.replace(/\.\w+$/, "");

export type Sample = { id: string; label: string; photo: string; kit: Kit };

const ORDER = ["pen", "stapler", "bottle", "mug"];
const LABEL: Record<string, string> = { pen: "Click pen", stapler: "Stapler", bottle: "Water bottle", mug: "Mug" };

export const SAMPLES: Sample[] = Object.entries(photoUrls)
  .flatMap(([path, photo]) => {
    const id = idOf(path);
    const raw = Object.entries(kitJson).find(([p]) => idOf(p) === id)?.[1];
    return raw === undefined ? [] : [{ id, label: LABEL[id] ?? id, photo, kit: parseKit(raw) }];
  })
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
