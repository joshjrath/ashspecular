/**
 * One way to ask Claude for structured JSON, shared by the Idea Feed and
 * Story Lab: the system prompt cached, the answer parsed against a schema,
 * every failure turned into a plain reason and whether trying again later
 * could help. Refusal fallback is on for the models that support it: if the
 * model declines, another answers in the same call.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const canUseClaude = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

let client: Anthropic | null = null;

export interface Usage { input: number; output: number; cacheRead: number }

/** Why a call failed, and whether trying again later could help. */
export class ClaudeError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export async function askClaude<T>(opts: {
  model: string;
  system: string;
  schema: z.ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  content: Anthropic.Beta.BetaContentBlockParam[];
  /** What's being asked, for the reasons ("analyse this post", "write ideas for this channel"). */
  what?: string;
}): Promise<{ parsed: T; model: string; usage: Usage }> {
  if (!canUseClaude()) throw new ClaudeError("ANTHROPIC_API_KEY isn't set.", false);
  client ??= new Anthropic();
  const model = opts.model;
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens,
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) throw new ClaudeError(`Claude couldn't take this request: ${err.message}`, false);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new ClaudeError("Claude didn't accept ANTHROPIC_API_KEY.", false);
    if (err instanceof Anthropic.RateLimitError) throw new ClaudeError("Claude's rate limit — trying again shortly.", true);
    if (err instanceof Anthropic.APIConnectionError) throw new ClaudeError("Couldn't reach Claude — trying again shortly.", true);
    if (err instanceof Anthropic.APIError) throw new ClaudeError(`Claude answered ${err.status ?? "an error"} — trying again shortly.`, (err.status ?? 500) >= 500);
    throw new ClaudeError(err instanceof Error ? err.message : String(err), true);
  }
  const usage: Usage = {
    input: response.usage.input_tokens ?? 0,
    output: response.usage.output_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  };
  if (response.stop_reason === "refusal") throw new ClaudeError(`Claude declined to ${opts.what ?? "answer"}.`, false);
  if (response.stop_reason === "max_tokens") throw new ClaudeError("The answer ran too long and was cut off.", true);
  if (!response.parsed_output) throw new ClaudeError("Claude's answer couldn't be read.", true);
  return { parsed: response.parsed_output as T, model: response.model ?? model, usage };
}
