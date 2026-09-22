import { z } from "zod";
import { LANE_IDS, UNKNOWN_LANE } from "../lanes.js";

const LANE_CHOICES = [...LANE_IDS, UNKNOWN_LANE] as unknown as [string, ...string[]];

export const KINDS = [
  "revision", // a Frame.io / review link that needs eyes
  "vo", // voiceover needs recording
  "deadline", // a hard date with no other work attached
  "task", // generic to-do
  "asset", // thumbnail, graphic, music, b-roll to source
  "note", // context worth keeping, no action
] as const;

export const LINK_KINDS = [
  "frameio",
  "youtube",
  "drive",
  "docs",
  "notion",
  "dropbox",
  "other",
] as const;

/**
 * What the classifier must return for a single forwarded message.
 * Every field is required and nullable rather than optional — structured
 * outputs are stricter about optionality than about nulls.
 */
export const ExtractionSchema = z.object({
  lane: z
    .enum(LANE_CHOICES)
    .describe("Which side of the business this belongs to."),
  kind: z.enum(KINDS).describe("What kind of work this is."),
  title: z
    .string()
    .describe("Short imperative headline, max ~80 chars, no trailing period."),
  summary: z
    .string()
    .describe("One or two sentences of context. Empty string if the title says it all."),
  project: z
    .string()
    .nullable()
    .describe("Channel, series, or video name this belongs to, if stated."),
  priority: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("1 = drop everything, 3 = normal, 5 = whenever."),
  due_at: z
    .string()
    .nullable()
    .describe("ISO 8601 with offset when a deadline is stated or implied, else null."),
  vo_needed: z
    .boolean()
    .describe("True if a voiceover still has to be recorded for this."),
  vo_due_at: z
    .string()
    .nullable()
    .describe("ISO 8601 with offset for when the VO must be delivered by, else null."),
  links: z
    .array(
      z.object({
        url: z.string(),
        kind: z.enum(LINK_KINDS),
        label: z.string().describe("Short human label, e.g. 'v3 review'."),
      }),
    )
    .describe("Every URL in the message, classified."),
  tags: z.array(z.string()).describe("Lowercase keywords, max 5."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How sure you are about lane and kind together."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
