import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { KitError, type KitEvent } from "../shared/kit.ts";
import { type Photo, streamKit } from "./generateKit.ts";

const MEDIA_TYPES = new Set<Photo["mediaType"]>(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTOS = 4;

const app = new Hono().post("/api/kits", async (c) => {
  const form = await c.req.formData();
  const files = form.getAll("photo").filter((v): v is File => v instanceof File);
  if (files.length === 0 || files.length > MAX_PHOTOS) return c.json({ error: `Send 1 to ${MAX_PHOTOS} photos` }, 400);

  const photos: Photo[] = [];
  for (const file of files) {
    if (!MEDIA_TYPES.has(file.type as Photo["mediaType"])) return c.json({ error: `Unsupported image type ${file.type}` }, 415);
    photos.push({ mediaType: file.type as Photo["mediaType"], base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  c.header("Content-Type", "application/x-ndjson");
  return stream(c, async (out) => {
    const send = (event: KitEvent) => out.writeln(JSON.stringify(event));
    let timing = "";
    try {
      for await (const event of streamKit(photos, undefined, (s) => {
        timing = `first part ${s.firstPartMs}ms, done ${s.ms}ms, $${s.costUsd.toFixed(3)}`;
      })) {
        if (out.aborted) break;
        await send(event);
        if (event.type === "done") console.log(`kit "${event.kit.name}" with ${event.kit.parts.length} parts, ${timing}`);
      }
    } catch (error) {
      console.error(error);
      await send({ type: "failed", message: error instanceof KitError ? "Larry built an inconsistent kit" : "Larry couldn't build this one" });
    }
  });
});

export type AppType = typeof app;

serve({ fetch: app.fetch, port: 8787 }, ({ port }) => console.log(`server on :${port}`));
