import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../env.js";
import { LANES, UNKNOWN_LANE } from "../lanes.js";
import { localIso } from "../time.js";
import { ExtractionSchema, type Extraction } from "./schema.js";
import { extractUrls, looksLikeBareRevision, reconcileLinks } from "./rules.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

/**
 * Stable system prefix — kept byte-identical across calls so it caches.
 * Anything time-varying belongs in the user turn below.
 */
const SYSTEM = [
  "You sort forwarded messages for a four-part YouTube content business into a work tracker.",
  "",
  "The four lanes:",
  ...LANES.map((l) => `- ${l.id} (${l.label}): ${l.hint}`),
  `- ${UNKNOWN_LANE}: use only when nothing in the message points to a lane. Do not guess between two lanes at low confidence — say unknown and lower the confidence.`,
  "",
  "Rules:",
  "- A frame.io link is a revision to review unless the message says otherwise.",
  "- 'needs VO', 'record the VO', 'voiceover by 3' all mean vo_needed = true. A stated time becomes vo_due_at.",
  "- A time with no date means the next occurrence of that time, today if it has not passed.",
  "- Priority 1 means it blocks an upload happening today. Reserve it. Default to 3.",
  "- title is what the operator should see in a list: the action and the subject, nothing else.",
  "- Never invent a deadline, a project name, or a URL that is not in the message. Use null.",
  "- Messages are often terse, lowercase, and forwarded without context. That is normal — do your best and report honest confidence.",
].join("\n");

export interface ClassifyInput {
  content: string;
  author: string;
  channelName: string;
  /** Text lifted out of a forwarded message's original, if any. */
  forwardedFrom?: string;
  attachments?: string[];
}

export interface ClassifyResult {
  extraction: Extraction;
  parsedBy: "llm" | "rule";
  model: string | null;
}

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const raw = renderRaw(input);

  try {
    const response = await client.messages.parse({
      model: env.anthropicModel,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort: "low",
        format: zodOutputFormat(ExtractionSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            `Current local time: ${localIso()} (${env.timezone}).`,
            `Forwarded by: ${input.author}`,
            `Discord channel: #${input.channelName}`,
            "",
            "Message:",
            raw,
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.warn("[classify] no structured output, falling back to rules", {
        stop_reason: response.stop_reason,
      });
      return { extraction: ruleFallback(input, raw), parsedBy: "rule", model: null };
    }

    const extraction = response.parsed_output;
    extraction.links = reconcileLinks(raw, extraction.links);
    extraction.tags = extraction.tags.slice(0, 5).map((t: string) => t.toLowerCase());
    if (!extraction.title.trim()) extraction.title = fallbackTitle(raw);

    return { extraction, parsedBy: "llm", model: env.anthropicModel };
  } catch (err) {
    // A classifier outage must never swallow an item — file it unsorted instead.
    console.error("[classify] API call failed, falling back to rules", err);
    return { extraction: ruleFallback(input, raw), parsedBy: "rule", model: null };
  }
}

function renderRaw(input: ClassifyInput): string {
  const parts = [input.content.trim()];
  if (input.forwardedFrom?.trim()) {
    parts.push(`\n[forwarded content]\n${input.forwardedFrom.trim()}`);
  }
  if (input.attachments?.length) {
    parts.push(`\n[attachments] ${input.attachments.join(", ")}`);
  }
  return parts.filter(Boolean).join("\n").trim();
}

/** Deterministic best-effort used whenever the model is unavailable. */
function ruleFallback(input: ClassifyInput, raw: string): Extraction {
  const bareRevision = looksLikeBareRevision(raw);
  return {
    lane: UNKNOWN_LANE,
    kind: bareRevision ? "revision" : "note",
    title: fallbackTitle(raw),
    summary: "Filed without classification — the parser was unavailable.",
    project: null,
    priority: 3,
    due_at: null,
    vo_needed: /\bvo\b|voice ?over/i.test(raw),
    vo_due_at: null,
    links: reconcileLinks(raw, []),
    tags: [],
    confidence: 0,
  };
}

function fallbackTitle(raw: string): string {
  const firstLine = raw.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const withoutUrls = firstLine.replace(/https?:\/\/\S+/gi, "").trim();
  const text = withoutUrls || extractUrls(raw)[0] || "Untitled item";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
