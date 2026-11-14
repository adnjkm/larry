// The 8 elements: one piece, one job, one number, and it can't be made from the others.
// Each lives in its own file under models/, so models can be worked on one at a time.
import { cord } from "./models/cord.ts";
import { grip } from "./models/grip.ts";
import { lever } from "./models/lever.ts";
import { seal } from "./models/seal.ts";
import { spring } from "./models/spring.ts";
import { wedge } from "./models/wedge.ts";
import { weight } from "./models/weight.ts";
import { wheel } from "./models/wheel.ts";
import type { Primitive } from "./types.ts";

export const ELEMENTS: Primitive[] = [lever, wheel, wedge, cord, spring, weight, grip, seal];
