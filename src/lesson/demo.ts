import { type Kit, parseKit } from "../../shared/kit.ts";
import { type Lesson, parseLesson } from "../../shared/lesson.ts";
import { CATALOG } from "../../shared/primitives/catalog.ts";

const kitFixtures = import.meta.glob<unknown>("../../fixtures/kits/*.json", { import: "default" });
const lessonFixtures = import.meta.glob<unknown>("../../fixtures/lessons/*.json", { import: "default" });

const fixtureAt = <T>(fixtures: Record<string, () => Promise<T>>, dir: string, name: string) => fixtures[`../../fixtures/${dir}/${name}.json`];

/** A kit and, unless `live` or none is checked in, its lesson. A fixture that exists but is invalid throws; a missing lesson is left to the server. */
export async function loadDemo(name: string, live: boolean): Promise<{ kit: Kit; lesson: Lesson | undefined }> {
  const kitFixture = fixtureAt(kitFixtures, "kits", name);
  if (!kitFixture) throw new Error(`No demo called "${name}"`);
  const kit = parseKit(await kitFixture());
  const lessonFixture = live ? undefined : fixtureAt(lessonFixtures, "lessons", name);
  return { kit, lesson: lessonFixture ? parseLesson(await lessonFixture(), kit, CATALOG) : undefined };
}
