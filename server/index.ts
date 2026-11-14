import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { KitError } from "../shared/kit.ts";
import { generateKit, type Photo } from "./generateKit.ts";

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

  try {
    const { kit, ms, costUsd } = await generateKit(photos);
    console.log(`kit "${kit.name}" with ${kit.parts.length} parts in ${ms}ms, $${costUsd.toFixed(3)}`);
    return c.json(kit);
  } catch (error) {
    console.error(error);
    return c.json({ error: error instanceof KitError ? "Larry built an inconsistent kit" : "Larry couldn't build this one" }, 502);
  }
});

export type AppType = typeof app;

serve({ fetch: app.fetch, port: 8787 }, ({ port }) => console.log(`server on :${port}`));
