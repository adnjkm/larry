import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { createArrayScanner, type ScannedEvent } from "./jsonStream.ts";

export type Model = "claude-opus-5-5" | "claude-sonnet-5-5";
export type Effort = "low" | "medium" | "high";
export type Brain = { model: Model; effort: Effort };

type StructuredRequest = {
  system: string;
  schema: Record<string, unknown>;
  brain: Brain;
  content: SDKUserMessage["message"]["content"];
  /** The top-level array whose elements are reported as soon as each one is written. */
  streamKey: string;
};

type StructuredEvent = ScannedEvent | { type: "result"; output: unknown; costUsd: number };

/**
 * Asks Claude for JSON matching `schema`, through the Claude Agent SDK (the user's Claude Code login).
 * The header and each array item are yielded once, in order, even when a schema retry writes the output again.
 */
export async function* streamStructured(request: StructuredRequest): AsyncGenerator<StructuredEvent> {
  let scanner = createArrayScanner(request.streamKey);
  let sentHeader = false;
  let sentItems = 0;
  let itemsThisTry = 0;

  for await (const message of query({
    prompt: oneMessage(request.content),
    options: {
      model: request.brain.model,
      effort: request.brain.effort,
      systemPrompt: request.system,
      outputFormat: { type: "json_schema", schema: request.schema },
      includePartialMessages: true,
      // Without this the API holds back a whole top-level value until it is complete, so arrays would arrive in one burst at the end.
      env: { ...process.env, CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING: "1" },
      tools: [],
      settingSources: [],
      persistSession: false,
      // The SDK spends a turn on each retry when the output fails the schema.
      maxTurns: 5,
    },
  })) {
    if (message.type === "stream_event") {
      const { event } = message;
      // A retry after a schema failure writes the output again from the start.
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        scanner = createArrayScanner(request.streamKey);
        itemsThisTry = 0;
      }
      if (event.type !== "content_block_delta" || event.delta.type !== "input_json_delta") continue;
      for (const scanned of scanner.push(event.delta.partial_json)) {
        if (scanned.type === "header" ? sentHeader : itemsThisTry++ < sentItems) continue;
        if (scanned.type === "header") sentHeader = true;
        else sentItems++;
        yield scanned;
      }
      continue;
    }
    if (message.type !== "result") continue;
    if (message.subtype !== "success") throw new Error(`Claude stopped: ${message.subtype}`);
    yield { type: "result", output: message.structured_output, costUsd: message.total_cost_usd };
  }
}

async function* oneMessage(content: SDKUserMessage["message"]["content"]): AsyncGenerator<SDKUserMessage> {
  yield { type: "user", parent_tool_use_id: null, message: { role: "user", content } };
}
