/**
 * A revision's summary: the notes in a few sentences, each note's type and
 * size. Written by Claude when ANTHROPIC_API_KEY is set (the board already
 * uses it to read messages); by rules otherwise. Either way the score itself
 * is worked out in score.ts, so it's the same sum every time.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { THEMES, ruleSummary, scoreRevision, type PastVideo, type RevComment, type ScoreBreakdown } from "./score.js";

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

const Output = z.object({
  summary: z.string().describe("Three or four plain sentences: what the notes ask for, the biggest problems first, and anything the editor was told on earlier videos."),
  notes: z.array(
    z.object({
      i: z.number().int().describe("The note's number, as given"),
      severity: z.enum(["minor", "moderate", "major"]).describe("minor: a small local bug (a typo, a frame, one clip); moderate: a real fix in one place; major: an issue with the whole video (structure, audio throughout, the wrong footage everywhere, a rework)"),
      theme: z.enum(["other", ...THEMES.map((t) => t.id)] as [string, ...string[]]),
    }),
  ),
});

export interface Summary {
  text: string;
  by: "claude" | "rules";
  comments: RevComment[];
  breakdown: ScoreBreakdown;
}

export async function summarize(opts: {
  title: string;
  channel: string | null;
  comments: RevComment[];
  versions: number;
  past: PastVideo[];
  own: number | null;
}): Promise<Summary> {
  let comments = opts.comments;
  let text: string | null = null;
  let by: Summary["by"] = "rules";
  if (process.env.ANTHROPIC_API_KEY?.trim() && comments.length) {
    try {
      const res = await new Anthropic().messages.parse({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: "low", format: zodOutputFormat(Output) },
        messages: [
          {
            role: "user",
            content: [
              `The review notes on an editor's cut of "${opts.title}"${opts.channel ? ` for ${opts.channel}` : ""}, ${opts.versions} version${opts.versions === 1 ? "" : "s"} so far.`,
              opts.past.length ? `Notes this channel's editor got on earlier videos:\n${opts.past.slice(0, 4).map((p) => `- ${p.title}: ${p.comments.slice(0, 8).join(" / ")}`).join("\n")}` : "",
              "",
              "The notes (\"you\" marks the channel owner's own summary):",
              ...comments.map((c, i) => `${i + 1}. ${c.source === "you" ? "[you] " : ""}${c.timecode ? `[${c.timecode}] ` : ""}${c.text}`),
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      });
      if (res.parsed_output) {
        const out = res.parsed_output;
        comments = comments.map((c, i) => {
          const n = out.notes.find((x) => x.i === i + 1);
          return n ? { ...c, severity: n.severity, theme: n.theme } : c;
        });
        text = out.summary.trim();
        by = "claude";
      }
    } catch (err) {
      console.error("[revisions] summary by model failed, using rules:", err);
    }
  }
  const breakdown = scoreRevision(comments, opts.versions, opts.past, opts.own);
  return { text: text ?? ruleSummary(comments, breakdown), by, comments, breakdown };
}
