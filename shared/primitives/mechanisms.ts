// The nine mechanisms: two or three elements combined to do one new job none of them does alone.
// Each lives in its own file under models/, so models can be worked on one at a time.
import { cam } from "./models/cam.ts";
import { catchLatch } from "./models/catch.ts";
import { gear } from "./models/gear.ts";
import { linkage } from "./models/linkage.ts";
import { piston } from "./models/piston.ts";
import { pulley } from "./models/pulley.ts";
import { ratchet } from "./models/ratchet.ts";
import { thread } from "./models/thread.ts";
import { valve } from "./models/valve.ts";
import type { Primitive } from "./types.ts";

export const MECHANISMS: Primitive[] = [gear, pulley, thread, cam, linkage, ratchet, catchLatch, valve, piston];
