// Prebuilt challenges are written per FUNCTION ("it must…"), not per object, so any object that has
// the function reuses them. A recipe is just which functions an object needs, in what order.
import type { ComponentType } from "react";
import type { GameProps } from "../games/shared.tsx";
import Pick from "../games/Pick.tsx";
import Place from "../games/Place.tsx";
import Seal from "../games/Seal.tsx";
import StandIn from "../games/StandIn.tsx";
import Tune from "../games/Tune.tsx";

export type Module = { id: string; need: string; move: string; Game: ComponentType<GameProps> };

export const MODULES: Record<string, Module> = {
  "write-ink": { id: "write-ink", need: "Give ink only on paper, and never leak", move: "Tune", Game: Tune },
  "hide-tip": { id: "hide-tip", need: "Hide the tip when you're done", move: "Stand in", Game: StandIn },
  "click-hold": { id: "click-hold", need: "Stay out after one press, back in on the next", move: "Pick", Game: Pick },
  "staple-squeeze": { id: "staple-squeeze", need: "Push a staple through 20 sheets", move: "Place", Game: Place },
  "seal-lid": { id: "seal-lid", need: "Stay dry upside down, and still open by hand", move: "Tune", Game: Seal },
};

/** Recipes by what the object is. In the real app Claude would choose these from MODULES; here it's a keyword match. */
const RECIPES: { match: RegExp; modules: string[] }[] = [
  { match: /\b(pen|ballpoint|rollerball)\b/i, modules: ["write-ink", "hide-tip", "click-hold"] },
  { match: /\bstapler\b/i, modules: ["staple-squeeze"] },
  { match: /\b(bottle|flask|jar|thermos|tumbler)\b/i, modules: ["seal-lid"] },
];

export function recipeFor(objectName: string): Module[] {
  const recipe = RECIPES.find((r) => r.match.test(objectName));
  return recipe ? recipe.modules.map((id) => MODULES[id]!) : [];
}
