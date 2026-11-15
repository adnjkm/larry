// The primitives as the curriculum prompts read them: one line each, with the two ways its number goes wrong.
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { TRADEOFFS } from "../shared/primitives/tradeoffs.ts";

const numberOf = (id: string) =>
  PRIMITIVES.find((p) => p.id === id)
    ?.sliders[0]?.label.replace(/\s*\(.*\)$/, "")
    .toLowerCase() ?? "";

export const catalogueLine = (id: string): string => {
  const p = PRIMITIVES.find((q) => q.id === id);
  const t = TRADEOFFS[id];
  if (!p || !t) throw new Error(`No catalogue line for ${id}`);
  const made = p.madeOf.length > 0 ? ` (${p.madeOf.join(" + ")})` : "";
  return `- ${p.id}${made}: ${p.job}. Number: ${numberOf(id)}. Too little: ${t.little}. Too much: ${t.much}. Seen in: ${p.seenIn.join(", ").toLowerCase()}.`;
};

/** The whole catalogue, one line per primitive. */
export const CATALOGUE = PRIMITIVES.map((p) => catalogueLine(p.id)).join("\n");
