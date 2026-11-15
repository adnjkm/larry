import { GenCourse } from "../../../shared/course/gen.ts";
import { readEvents } from "../../../shared/ndjson.ts";

export type LiveOpts = {
  /** Use the faster staged generator when the server has it. */
  staged?: boolean;
  /** Skip the server's cache and generate again. */
  fresh?: boolean;
  /** Called with each progress event the generator sends. */
  onProgress?: (event: { type: string }) => void;
};

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A photo as a blob with an image type the server accepts: a URL is fetched, a blob without a type is guessed from the URL. */
export async function photoBlob(photo: Blob | string): Promise<Blob> {
  if (typeof photo !== "string") return photo;
  const blob = await (await fetch(photo)).blob();
  const guessed = TYPES[photo.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() ?? ""];
  return blob.type.startsWith("image/") ? blob : new Blob([blob], { type: guessed ?? "image/jpeg" });
}

/** Posts the photo to /api/course and resolves with the validated course. */
export async function fetchCourse(photo: Blob | string, opts: LiveOpts, signal: AbortSignal): Promise<GenCourse> {
  const blob = await photoBlob(photo);
  const body = new FormData();
  body.append("photo", blob, "photo");
  const query = new URLSearchParams();
  if (opts.staged) query.set("staged", "1");
  if (opts.fresh) query.set("fresh", "1");
  const response = await fetch(`/api/course${query.size ? `?${query}` : ""}`, { method: "POST", body, signal });
  for await (const event of readEvents<{ type: string; course?: unknown; message?: string }>(response)) {
    if (event.type === "failed") throw new Error(event.message ?? "Larry couldn't build this lesson");
    if (event.type === "done") return GenCourse.parse(event.course);
    opts.onProgress?.(event);
  }
  throw new Error("Larry stopped before finishing");
}
