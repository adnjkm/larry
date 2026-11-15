// The known mechanisms: what many everyday objects do the same way, each written and checked once.
// A new entry is one file in entries/ and one line here; library.test.ts fails when a file is left out.
import { ballTip } from "./entries/ball-tip.ts";
import { camClamp } from "./entries/cam-clamp.ts";
import { checkValve } from "./entries/check-valve.ts";
import { clickLatch } from "./entries/click-latch.ts";
import { dispenserPump } from "./entries/dispenser-pump.ts";
import { foldingFrame } from "./entries/folding-frame.ts";
import { formingAnvil } from "./entries/forming-anvil.ts";
import { frictionHold } from "./entries/friction-hold.ts";
import { gearDrive } from "./entries/gear-drive.ts";
import { leverCutter } from "./entries/lever-cutter.ts";
import { leverPress } from "./entries/lever-press.ts";
import { leverPry } from "./entries/lever-pry.ts";
import { pistonPump } from "./entries/piston-pump.ts";
import { ratchetWind } from "./entries/ratchet-wind.ts";
import { screwClosure } from "./entries/screw-closure.ts";
import { shearBlades } from "./entries/shear-blades.ts";
import { snapCatch } from "./entries/snap-catch.ts";
import { springClamp } from "./entries/spring-clamp.ts";
import { springFeed } from "./entries/spring-feed.ts";
import { springReel } from "./entries/spring-reel.ts";
import { sprungLatch } from "./entries/sprung-latch.ts";
import { squeezedSeal } from "./entries/squeezed-seal.ts";
import { twistDrive } from "./entries/twist-drive.ts";
import { zipSlider } from "./entries/zip-slider.ts";
import type { KnownMechanism } from "./types.ts";

export const MECHANISMS: KnownMechanism[] = [
  ballTip,
  camClamp,
  checkValve,
  clickLatch,
  dispenserPump,
  foldingFrame,
  formingAnvil,
  frictionHold,
  gearDrive,
  leverCutter,
  leverPress,
  leverPry,
  pistonPump,
  ratchetWind,
  screwClosure,
  shearBlades,
  snapCatch,
  springClamp,
  springFeed,
  springReel,
  sprungLatch,
  squeezedSeal,
  twistDrive,
  zipSlider,
];

export const KNOWN: ReadonlyMap<string, KnownMechanism> = new Map(MECHANISMS.map((m) => [m.id, m]));
