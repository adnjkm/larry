import { z } from "zod";
import { Kit } from "../shared/kit.ts";
import { Lesson } from "../shared/lesson.ts";

/** The JSON Schema Claude is asked to match, without the `$schema` dialect line the Agent SDK does not take. */
const schemaOf = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema);
  return body;
};

export const kitJsonSchema = schemaOf(Kit);
export const lessonJsonSchema = schemaOf(Lesson);
