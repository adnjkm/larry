import { KitEvent } from "../../shared/kit.ts";
import { readEvents } from "../ndjson.ts";

export async function* requestKit(photos: Blob[]): AsyncGenerator<KitEvent> {
  const form = new FormData();
  photos.forEach((photo, i) => form.append("photo", photo, `photo-${i}.jpg`));
  yield* readEvents(await fetch("/api/kits", { method: "POST", body: form }), KitEvent);
}
