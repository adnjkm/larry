// The sample photos and the kits already generated for them, so the prototype runs without the network.
import { type Kit, parseKit } from "../../shared/kit.ts";
import { tidyKit } from "./model.ts";

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });
const idOf = (path: string) => path.split("/").pop()!.replace(/\.\w+$/, "");

export type Sample = { id: string; label: string; photo: string; kit: Kit };

const ORDER = ["pen", "stapler", "bottle", "clothespeg", "jar", "flashlight", "scissors", "mug"];
const LABEL: Record<string, string> = {
  pen: "Click pen",
  stapler: "Stapler",
  bottle: "Water bottle",
  clothespeg: "Clothes peg",
  jar: "Mason jar",
  flashlight: "Flashlight",
  scissors: "Scissors",
  mug: "Mug",
};

export const SAMPLES: Sample[] = Object.entries(photoUrls)
  .flatMap(([path, photo]) => {
    const id = idOf(path);
    const raw = Object.entries(kitJson).find(([p]) => idOf(p) === id)?.[1];
    return raw === undefined ? [] : [{ id, label: LABEL[id] ?? id, photo, kit: tidyKit(parseKit(raw)) }];
  })
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
