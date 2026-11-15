import assert from "node:assert/strict";
import { test } from "node:test";
import type { query } from "@anthropic-ai/claude-agent-sdk";
import { streamStructured } from "./claude.ts";

const start = { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use" } } };
const delta = (partial_json: string) => ({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json } } });
const result = { type: "result", subtype: "success", structured_output: { ok: true }, total_cost_usd: 0.01 };

const fake = (messages: object[], seen?: { abortController?: AbortController }) =>
  ((params: { options?: { abortController?: AbortController } }) => {
    if (seen) seen.abortController = params.options?.abortController;
    return (async function* () {
      yield* messages;
    })();
  }) as unknown as typeof query;

const request = { system: "", schema: {}, brain: { model: "claude-opus-5-5", effort: "low" }, content: "x", streamKey: "items" } as const;

test("a schema retry that writes the output again does not repeat the header or items already sent", async () => {
  const messages = [start, delta('{"name":"a","items":[{"n":1},{"n":2},'), start, delta('{"name":"a","items":[{"n":1},{"n":2},{"n":3}]}'), result];
  const events = [];
  for await (const event of streamStructured(request, fake(messages))) events.push(event);
  assert.deepEqual(
    events.map((e) => (e.type === "item" ? (e.value as { n: number }).n : e.type)),
    ["header", 1, 2, 3, "result"],
  );
});

test("aborting the request aborts the Agent SDK query", async () => {
  const seen: { abortController?: AbortController } = {};
  const caller = new AbortController();
  const events = streamStructured({ ...request, signal: caller.signal }, fake([start, delta('{"name":"a","items":['), result], seen));
  await events.next();
  caller.abort();
  assert.equal(seen.abortController?.signal.aborted, true);
  await events.return(undefined);
});
