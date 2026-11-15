import type { CatalogEntry } from "../lesson.ts";
import { PRIMITIVES } from "./library.ts";
import type { Primitive } from "./types.ts";

export const PRIMITIVE_BY_ID: ReadonlyMap<string, Primitive> = new Map(PRIMITIVES.map((p) => [p.id, p]));

export const CATALOG: CatalogEntry[] = PRIMITIVES.map((p) => ({
  id: p.id,
  sliders: p.sliders.map(({ id, min, max, initial }) => ({ id, min, max, initial })),
}));
