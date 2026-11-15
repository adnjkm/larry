import { type Tuning, TUNING } from "../camera/look.ts";

export type Pace = "demo" | "real";

/** What the mockup's dials set. */
export type MockSettings = { object: string; pace: Pace; tab: boolean; showUsable: boolean; tuning: Tuning };

export const defaultSettings = (object: string): MockSettings => ({ object, pace: "demo", tab: false, showUsable: true, tuning: TUNING });
