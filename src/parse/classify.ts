import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { ORG_TZ, TEAM_TZ, dateIn } from "./derive.js";
import { ExtractionSchema, type Extraction } from "./schema.js";
import { extractUrls, looksLikeBareRevision, classifyUrl } from "./rules.js";
import { matchChannel } from "../catalog.js";
import { parsePattern } from "./structured.js";
import { readLabelledTimes } from "./when.js";
import { enrichWithFrame } from "./frameio.js";

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/**
 * Stable system prefix — byte-identical across calls so it caches. Anything
 * that varies per message (today's date, the message itself) goes in the user
 * turn below, after the cache breakpoint.
 */
const SYSTEM = [
  "You read messages posted into a YouTube studio's Discord and turn each one into a structured record.",
  "",
  "THE FOUR CATEGORIES",
  ...CATEGORIES.map((c) => `- ${c.id} (${c.label}): ${c.hint}`),
  "- unknown: nothing in the message points to a category. Prefer this over a coin-flip guess, and lower the confidence.",
  "",
  "THE CHANNELS — return `channel` exactly as written here, or null:",
  ...CATEGORIES.map((cat) => {
    const names = CHANNELS.filter((c) => c.category === cat.id).map((c) => c.name);
    return `- ${cat.label}: ${names.join(", ")}`;
  }),
  "",
  "THE ASSIGNMENT POST",
  "The studio's own format leads with a heading of three parts separated by pipes:",
  "  <air date MM-DD-YY> | <code> | <title>",
  "So `10-03-26 | VIDEO-008 | What If Deadpool Was In Jujutsu Kaisen?` means the video AIRS on 2026-10-03, its code is VIDEO-008, and that is the title.",
  "Below the heading it may carry: a Project line, an `@ Tag` line, a stage header such as `SCRIPT` with a Discord mention for the assignee, a Deadline list, a Word Count, and a long Story Brief.",
  "The `@ Tag` line names the channel: `@ Comics` is Specular Comics, `@ FNAF` is Specular FNAF. The channel called just \"Specular\" is only meant when the message names it on its own.",
  "Deadlines are often given twice, once US/ET and once India/IST — these are the SAME instant, so return the ET one and ignore the duplicate.",
  "",
  "RULES",
  "- The heading date is the AIR date, never a deadline. Put it in air_date.",
  "- Never calculate a voiceover deadline. Set vo_due ONLY if the message states a voiceover time in words. Otherwise leave it null; it is derived downstream from the air date.",
  "- A frame.io link means kind = review, and it is a new version of an existing project — pull the version number if one is written.",
  "- A message about a bits channel is kind = bits: those batches already exist and open themselves daily, so it is almost never a new project.",
  "- Copy `code` exactly as written. Never invent one.",
  "- Never invent a date, a channel, a title or a URL that is not in the message. Use null.",
  "- Messages are often terse, lowercase and forwarded out of a DM with no context. That is normal — extract what is there and report honest confidence.",
].join("\n");

export interface ClassifyInput {
  content: string;
  author?: string;
  channelName?: string;
  /** Text lifted out of a Discord forward's original message. */
  forwardedFrom?: string;
  attachments?: string[];
}

export interface ClassifyResult {
  extraction: Extraction;
  parsedBy: "pattern" | "llm" | "rule";
  model: string | null;
  raw: string;
  usage?: { input: number; output: number; cacheRead: number };
}

/**
 * Read a message, then open any Frame.io link in it for what the message left
 * out — the video's name, code, version and channel, from the file name the
 * shared page carries. No API: it reads the page the way a link preview does.
 */
export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const result = await classifyText(input);
  if (result.extraction.links.some((l) => l.kind === "frameio")) {
    result.extraction = await enrichWithFrame(result.extraction);
  }
  return result;
}

async function classifyText(input: ClassifyInput): Promise<ClassifyResult> {
  const raw = renderRaw(input);

  // The studio's own assignment post is rigidly templated, so it is read by
  // pattern first: free, instant, identical every time, and it works with no
  // API key at all. The model is for the messy forwards that follow.
  const patterned = parsePattern(raw);
  if (patterned) return { extraction: patterned, parsedBy: "pattern", model: null, raw };

  // No key is a supported way to run, not a fault: go straight to the rules
  // instead of making a request that can only fail and logging it as an error.
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { extraction: ruleFallback(raw), parsedBy: "rule", model: null, raw };
  }

  try {
    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Today is ${dateIn(ORG_TZ)} in ${ORG_TZ}. The team's second zone is ${TEAM_TZ}.`,
            input.author ? `Posted by: ${input.author}` : "",
            input.channelName ? `Discord channel: #${input.channelName}` : "",
            "",
            "Message:",
            raw,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { extraction: ruleFallback(raw), parsedBy: "rule", model: null, raw };
    }

    return {
      extraction: response.parsed_output,
      parsedBy: "llm",
      model: MODEL,
      raw,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    // A classifier outage must never swallow a message — file it unsorted.
    console.error("[classify] API call failed, falling back to rules:", err);
    return { extraction: ruleFallback(raw), parsedBy: "rule", model: null, raw };
  }
}

function renderRaw(input: ClassifyInput): string {
  const parts = [input.content.trim()];
  if (input.forwardedFrom?.trim()) parts.push(`\n[forwarded]\n${input.forwardedFrom.trim()}`);
  if (input.attachments?.length) parts.push(`\n[attachments] ${input.attachments.join(", ")}`);
  return parts.filter(Boolean).join("\n").trim();
}

/**
 * Deterministic best-effort for when the model is unreachable — or when there
 * is no API key at all, which is a supported way to run this.
 *
 * Deliberately cruder than the pattern passes: it reads what the hostname and
 * a named channel say and nothing more. Naming a channel is good evidence of
 * where a message belongs and poor evidence of what it asks for, so the kind
 * follows the channel and the confidence stays low enough to be reviewed.
 */
function ruleFallback(raw: string): Extraction {
  const urls = extractUrls(raw);
  const hasFrameio = urls.some((u) => classifyUrl(u) === "frameio");
  const channel = matchChannel(raw);
  // A labelled "Deadline:" is readable without a model, so it is read.
  const times = readLabelledTimes(raw.split("\n").map((l) => l.trim()).filter(Boolean));

  const kind: Extraction["kind"] = hasFrameio || looksLikeBareRevision(raw)
    ? "review"
    : channel?.category === "bits"
      ? "bits"
      : channel
        ? "update"
        : "other";

  return {
    kind,
    code: raw.match(/\b([A-Z]{3,6}-\d{2,4})\b/)?.[1] ?? null,
    title: null,
    category: channel?.category ?? "unknown",
    channel: channel?.name ?? null,
    tag: null,
    air_date: null,
    stage: null,
    word_count: null,
    assignee: null,
    script_due: null,
    vo_due: times.voDue,
    deadline: times.deadline,
    version: Number(raw.match(/\bv(\d+)\b/i)?.[1]) || null,
    links: urls.map((url) => ({ url, kind: classifyUrl(url), label: "link" })),
    brief: null,
    note: channel
      ? `Filed by the channel name only — no model was available to read the rest.`
      : "Filed without classification — no model was available.",
    confidence: channel ? 0.4 : 0,
  };
}
