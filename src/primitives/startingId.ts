import { PRIMITIVES } from "../../shared/primitives/library.ts";

/** The primitive id the address bar asks for in `?<param>=<id>`, or the first primitive's. */
export function startingId(param: string): string {
  const asked = new URLSearchParams(location.search).get(param);
  return (PRIMITIVES.find((p) => p.id === asked) ?? PRIMITIVES[0]!).id;
}
