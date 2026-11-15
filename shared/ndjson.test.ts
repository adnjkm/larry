import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { readEvents } from "./ndjson.ts";

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("part"), n: z.number() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("failed"), message: z.string() }),
]);

const streamOf = (...chunks: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
  );

async function collect(response: Response) {
  const events = [];
  for await (const event of readEvents(response, (raw) => Event.parse(raw))) events.push(event);
  return events;
}

describe("ndjson reader", () => {
  it("reassembles lines that arrive split across chunks", async () => {
    const events = await collect(streamOf('{"type":"part","n":1}\n{"type":"pa', 'rt","n":2}\n', '{"type":"done"}'));
    assert.deepEqual(events, [{ type: "part", n: 1 }, { type: "part", n: 2 }, { type: "done" }]);
  });

  it("throws when the stream ends before done or failed", async () => {
    await assert.rejects(collect(streamOf('{"type":"part","n":1}\n')), /stopped before finishing/);
  });

  it("throws on a line that doesn't match the schema", async () => {
    await assert.rejects(collect(streamOf('{"type":"nope"}\n')), /doesn't add up/);
  });

  it("without a parser, accepts any object with a type and rejects anything else", async () => {
    const events = [];
    for await (const event of readEvents(streamOf('{"type":"part","n":1}\n{"type":"done"}\n'))) events.push(event);
    assert.deepEqual(events, [{ type: "part", n: 1 }, { type: "done" }]);
    const bad = async () => {
      for await (const _ of readEvents(streamOf('[1,2]\n{"type":"done"}\n')));
    };
    await assert.rejects(bad, /doesn't add up/);
  });

  it("surfaces the server's error text for a rejected request", async () => {
    const rejected = new Response(JSON.stringify({ error: "Send the kit" }), { status: 400 });
    await assert.rejects(collect(rejected), /Send the kit/);
  });
});
