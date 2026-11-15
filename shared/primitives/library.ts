import { ELEMENTS } from "./elements.ts";
import { MECHANISMS } from "./mechanisms.ts";
import type { Primitive } from "./types.ts";

export const PRIMITIVES: Primitive[] = [...ELEMENTS, ...MECHANISMS];
