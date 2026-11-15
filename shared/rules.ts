/** Word budgets for the text a reader sees. `aim` is what the prompt asks for; `max` is the hard limit, well above it so a draft that runs a little long is kept and only a rambling one is sent back. */
export const WORDS = {
  story: { aim: 35, max: 75 },
  payoff: { aim: 40, max: 60 },
  hook: { aim: 50, max: 75 },
  closing: { aim: 40, max: 60 },
} as const;

/** The shape of a lesson and a kit, stated once for the prompts, the schema descriptions and the checks. */
export const RULES = {
  options: { min: 2, max: 3 },
  modules: { min: 2, max: 3 },
  steps: { min: 6, max: 8 },
  parts: { min: 3, max: 8 },
  stepTitleWords: { min: 3, max: 6 },
  runActionWords: { min: 2, max: 4 },
  /** The same problem type may not appear more than this many times in a row. */
  problemRun: 2,
} as const;
