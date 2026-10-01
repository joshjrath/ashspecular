/**
 * A Movie's editor package, written by Claude from the sources themselves:
 * it reads every source's script, checks the title covers all
 * of them, picks the order they play in, and writes one short intro and a
 * transition into each source after the first — tying how one story actually
 * ends to how the next begins, in the channel's own plain voice.
 *
 * Never from titles alone: every source needs its text first.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "../ai/claude.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export interface PackageSource {
  id: string;
  title: string;
  text: string;
}

export interface EditorPackage {
  /** Video ids, in the order they play. */
  order: string[];
  intro: string;
  /** One per source after the first, in play order: into order[i + 1]. */
  transitions: string[];
  /** Whether the title fits every source, and a better one when it doesn't. */
  titleFits: boolean;
  titleNote: string;
  betterTitle: string | null;
}

const PackageSchema = z.object({
  title_fits: z.boolean().describe("True only if every source genuinely fits the compilation title as written."),
  title_note: z.string().describe("One or two sentences: why it fits, or which source doesn't and why."),
  better_title: z.string().nullable().describe("Only when the title doesn't fit: an accurate title in the same style. Otherwise null."),
  order: z.array(z.string()).describe("Every source id exactly once, in the order they should play."),
  intro: z.string().describe("The custom intro, spoken before the first story. Two to four short sentences."),
  transitions: z
    .array(z.object({ into: z.string().describe("The id of the source this leads into."), text: z.string().describe("One to three short sentences.") }))
    .describe("One transition into each source after the first, in play order."),
});

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

/** Stable so it caches: the sources, the title and the voice samples go in the user turn. */
const SYSTEM = `You put together the editor package for a "Full Movie" compilation on Specular, a YouTube channel of narrated what-if stories about anime, comic and game characters. A Movie joins four or five of the channel's own videos, back to back, under one umbrella title.

You're given the title, every source video's full script, and a few openings from the channel's other scripts to show its voice.

Do this:
1. Read every source in full.
2. Check the title is accurate: every source must genuinely fit it. Never stretch one to make it fit. If one doesn't, say which and give an accurate title in the same style.
3. Choose the play order that makes the best whole: escalation, a natural build, the strongest story last or first — whatever these particular stories support.
4. Write one short intro, spoken before the first story: what this movie is, and the first premise. Two to four sentences.
5. Write a short transition into each story after the first. Each one connects how the previous story ACTUALLY ENDS (its last events, as written) to the premise of the next. Causal and specific: "With Sukuna finally gone, ..." rather than "But that's not all."

Voice: the same plain narration as the scripts — concise, plainspoken, specific, natural. Second person or third person the way the scripts use it. No trailer language, no hype, no "buckle up", "little did they know", "brace yourself", "in a world where", "epic", "journey", "unleash", rhetorical questions stacked up, or anything that sounds written by an AI. Don't summarize whole stories; a sentence of ending, a sentence of what comes next.

Use the source ids exactly as given.`;

/** Long sources keep their opening and ending — the parts transitions hang on. */
function clip(text: string, max = 36_000): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n\n[… middle of the story left out …]\n\n${text.slice(-half)}`;
}

export const canWritePackages = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export async function writePackage(title: string, sources: PackageSource[], voice: string[]): Promise<EditorPackage> {
  if (!canWritePackages()) throw new Error("Writing the intro and transitions needs ANTHROPIC_API_KEY set on the server.");
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8192,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: zodOutputFormat(PackageSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Compilation title: ${title}`,
          "",
          "How the channel's scripts open (for voice only — not sources):",
          ...voice.map((v, i) => `<voice n="${i + 1}">\n${v}\n</voice>`),
          "",
          "The sources:",
          ...sources.map((s) => `<source id="${s.id}" title="${s.title.replace(/"/g, "'")}">\n${clip(s.text)}\n</source>`),
        ].join("\n"),
      },
    ],
  });
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || !out) throw new Error("Claude didn't return a package — try again.");
  return tidyPackage(out, sources.map((s) => s.id));
}

/**
 * Hold the answer to the sources it was given: every id once (any left out
 * go at the end), and exactly one transition into each source after the first.
 */
export function tidyPackage(out: z.infer<typeof PackageSchema>, ids: string[]): EditorPackage {
  const order = [...new Set(out.order.filter((id) => ids.includes(id)))];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const into = new Map(out.transitions.map((t) => [t.into, t.text.trim()]));
  const inOrder = out.transitions.map((t) => t.text.trim());
  const transitions = order.slice(1).map((id, i) => into.get(id) ?? inOrder[i] ?? "");
  return {
    order,
    intro: out.intro.trim(),
    transitions,
    titleFits: out.title_fits,
    titleNote: out.title_note.trim(),
    betterTitle: out.title_fits ? null : out.better_title?.trim() || null,
  };
}
