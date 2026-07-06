import type { Env } from "./env.js";
import { llmCostUsd } from "./cost.js";

/**
 * Minimal Anthropic Messages API client for the Cloudflare Worker via `fetch`.
 *
 * We deliberately do NOT use the `@anthropic-ai/sdk` at runtime here: the
 * Worker's generation and grading calls each need exactly one shape —
 * "return JSON matching this schema" — and hand-rolling `fetch` keeps the
 * bundle tiny and the control flow explicit. Structured output is obtained
 * via **tool use with a forced `tool_choice`**: we define a single tool whose
 * `input_schema` is the JSON Schema we want back, force the model to call it,
 * and read the validated `input` object off the `tool_use` block.
 *
 * Model IDs (see docs / claude-api skill):
 *   generation → claude-sonnet-4-6   ($3 / $15 per MTok)
 *   grading    → claude-haiku-4-5     ($1 / $5  per MTok)
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface StructuredResult<T> {
  data: T;
  usd: number;
  inputTokens: number;
  outputTokens: number;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface ContentBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}

interface MessagesResponse {
  content?: ContentBlock[];
  stop_reason?: string;
  usage?: AnthropicUsage;
}

/**
 * Call the Messages API and force a single tool call whose input matches
 * `schema`, returning the parsed `input` as `T`. This is the recommended way
 * to get guaranteed-shape JSON out of the model from a raw-`fetch` client.
 */
export async function generateStructured<T>(
  env: Env,
  opts: {
    model: string;
    system?: string;
    prompt: string;
    toolName: string;
    toolDescription: string;
    schema: JsonSchema;
    maxTokens?: number;
  },
): Promise<StructuredResult<T>> {
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.system ? { system: opts.system } : {}),
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.schema,
      },
    ],
    // Force the tool so the model must return schema-shaped JSON.
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.prompt }],
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 500)}`);
  }

  const json = (await res.json()) as MessagesResponse;
  const usage = json.usage ?? { input_tokens: 0, output_tokens: 0 };
  const usd = llmCostUsd(opts.model, usage.input_tokens, usage.output_tokens);

  const toolBlock = json.content?.find(
    (b) => b.type === "tool_use" && b.name === opts.toolName,
  );
  if (!toolBlock || toolBlock.input === undefined) {
    throw new Error(
      `Anthropic returned no ${opts.toolName} tool call (stop_reason=${json.stop_reason})`,
    );
  }

  return {
    data: toolBlock.input as T,
    usd,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}
