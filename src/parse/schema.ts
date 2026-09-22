import { z } from "zod";
import { CATEGORY_IDS } from "../catalog.js";

/** What kind of message came in. Drives everything downstream. */
export const MESSAGE_KINDS = [
  "assignment", // a full assignment post: air date, code, title, stage, deadline
  "review", // a Frame.io link — a new version of an existing project
  "bits", // something for a daily bits batch
  "update", // a change to something already filed (new date, status, note)
  "other", // anything else worth keeping
] as const;

export const STAGES = ["script", "edit", "colour", "review", "vo", "upload"] as const;

export const LINK_KINDS = [
  "frameio",
  "youtube",
  "drive",
  "docs",
  "notion",
  "dropbox",
  "other",
] as const;

const CATEGORY_ENUM = [...CATEGORY_IDS, "unknown"] as unknown as [string, ...string[]];

/**
 * What the model must return for one incoming message.
 *
 * Every field is required and nullable rather than optional — structured
 * outputs are stricter about optionality than about nulls. Anything the model
 * is not sure of must come back null so `derive.ts` can fill it or the board
 * can ask for it, rather than the model inventing a plausible value.
 */
export const ExtractionSchema = z.object({
  kind: z.enum(MESSAGE_KINDS).describe("What sort of message this is."),

  code: z
    .string()
    .nullable()
    .describe('Project code exactly as written, e.g. "VIDEO-008". Null if absent.'),

  title: z
    .string()
    .nullable()
    .describe("The video title as written. Null if the message has no title."),

  category: z
    .enum(CATEGORY_ENUM)
    .describe("Which side of the business. 'unknown' when nothing points to one."),

  channel: z
    .string()
    .nullable()
    .describe("Channel name exactly as it appears in the channel list, else null."),

  tag: z
    .string()
    .nullable()
    .describe('Topic tag from an "@ Something" line, e.g. "Comics". Null if absent.'),

  air_date: z
    .string()
    .nullable()
    .describe(
      "Date the video airs, as YYYY-MM-DD. Assignment headings lead with it in MM-DD-YY.",
    ),

  stage: z
    .enum(STAGES)
    .nullable()
    .describe("Which pipeline stage this message concerns."),

  word_count: z.number().int().nullable().describe("Script word count if stated."),

  assignee: z
    .string()
    .nullable()
    .describe("Who the work is assigned to — a Discord mention or a name."),

  script_due: z
    .string()
    .nullable()
    .describe(
      "Script deadline as an ISO 8601 timestamp WITH offset. Prefer the US/ET line when both ET and IST are given; they are the same instant.",
    ),

  vo_due: z
    .string()
    .nullable()
    .describe(
      "Voiceover deadline as ISO 8601 with offset, ONLY if the message states one. Never calculate it — leave null and it will be derived from the air date.",
    ),

  deadline: z
    .string()
    .nullable()
    .describe("Any other hard deadline stated, ISO 8601 with offset."),

  version: z
    .number()
    .int()
    .nullable()
    .describe('Review version number if stated, e.g. 4 from "v4". Null otherwise.'),

  links: z
    .array(
      z.object({
        url: z.string(),
        kind: z.enum(LINK_KINDS),
        label: z.string().describe("Short human label."),
      }),
    )
    .describe("Every URL in the message, classified by host."),

  brief: z
    .string()
    .nullable()
    .describe("The story brief body verbatim, if the post carries one."),

  note: z
    .string()
    .nullable()
    .describe("One sentence on what is being asked, when it is not a full assignment."),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How sure you are about kind, category and channel together."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
