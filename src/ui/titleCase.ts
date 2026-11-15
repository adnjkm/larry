// Short words stay lower case inside a label, as in a book title: articles, the short conjunctions and the
// short prepositions. "It", "Me" and the like are capitalised; they aren't on the list.
const SMALL = new Set([
  "a",
  "an",
  "the",
  "and",
  "but",
  "or",
  "nor",
  "for",
  "so",
  "yet",
  "as",
  "at",
  "by",
  "in",
  "of",
  "off",
  "on",
  "per",
  "to",
  "up",
  "via",
  "vs",
]);

/**
 * A label in title case: "Next: learn the fix" reads "Next: Learn the Fix". Every word is capitalised except the small
 * ones in the middle; the first word, the last, and the first after a colon always are. Words already capitalised
 * (names, "3D") are kept as written.
 */
export function titleCase(text: string): string {
  const words = text.split(/(\s+)/);
  const last = words.findLastIndex((w) => /\S/.test(w));
  let start = true;
  return words
    .map((w, i) => {
      if (!/\S/.test(w)) return w;
      const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
      const keep = !start && i !== last && SMALL.has(bare);
      start = /[:—–]$/.test(w);
      return keep ? w.toLowerCase() : w.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join("");
}
