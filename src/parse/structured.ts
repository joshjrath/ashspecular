/**
 * Pattern parser for the studio's own assignment post.
 *
 * The template is rigid — `date | CODE | title`, a labelled deadline, a
 * labelled word count — so it needs no model at all. This runs first, and
 * when it recognises a post the message never reaches the API: free, instant
 * and identical every time.
 *
 * It deliberately refuses anything it isn't sure about. A half-read post is
 * worse than handing the message to the model, so every unrecognised shape
 * returns null and falls through.
 */
import type { Extraction } from "./schema.js";
import { classifyUrl, extractUrls } from "./rules.js";
import { CHANNELS, matchChannel } from "../catalog.js";
import { parseWhen, readLabelledTimes, to24, toIso, withOffset } from "./when.js";

/** Strip Discord markdown so patterns don't have to care about ** and __. */
function plain(s: string): string {
  return s.replace(/\*\*|__|\*|`/g, "").trim();
}

/** "9/19/2026 @ 11:59 PM ET" → ISO with the right offset. */
function parseStamp(date: string, time: string, meridiem: string, zone: string): string | null {
  const m = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!m) return null;

  const [, mm, dd, yy] = m;
  const year = yy!.length === 2 ? 2000 + Number(yy) : Number(yy);
  const [hhRaw, minute] = time.split(":");
  const hour = to24(Number(hhRaw), meridiem);

  return withOffset(toIso(year, Number(mm), Number(dd), hour, Number(minute ?? 0)), zone) || null;
}

const STAGES: Record<string, Extraction["stage"]> = {
  SCRIPT: "script",
  EDIT: "edit",
  COLOUR: "colour",
  COLOR: "colour",
  REVIEW: "review",
  VO: "vo",
  VOICEOVER: "vo",
  UPLOAD: "upload",
};

/**
 * Returns a full extraction when the message is one of the studio's assignment
 * posts, or null when it is anything else.
 */
export function parseAssignment(raw: string): Extraction | null {
  const text = raw.replace(/\r\n/g, "\n");

  // The heading is the signature of the format: `### MM-DD-YY | CODE | Title`.
  // Without it this is not an assignment post, and we do not guess.
  const heading = text
    .split("\n")
    .map((l) => l.replace(/^#{1,6}\s*/, "").trim())
    .find((l) => /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*\|/.test(plain(l)));

  if (!heading) return null;

  const parts = plain(heading).split("|").map((p) => p.trim());
  if (parts.length < 3) return null;

  const [datePart, codePart, ...titleParts] = parts;
  const title = titleParts.join(" | ").trim();
  if (!title) return null;

  const dm = datePart!.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (!dm) return null;
  const [, mm, dd, yy] = dm;
  const year = yy!.length === 2 ? 2000 + Number(yy) : Number(yy);
  const airDate = `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;

  const code = /^[A-Z]+-\d+$/i.test(codePart!.trim()) ? codePart!.trim().toUpperCase() : null;

  // `@ Comics` on its own line — not a Discord mention, which starts `<@`.
  const tag =
    text
      .split("\n")
      .map((l) => plain(l))
      .find((l) => /^@\s*[A-Za-z][\w &-]*$/.test(l) && !l.startsWith("@everyone"))
      ?.replace(/^@\s*/, "")
      .trim() ?? null;

  // `📝 **SCRIPT** <@1234>` — stage name, then the assignee mention.
  let stage: Extraction["stage"] = null;
  let assignee: string | null = null;
  for (const line of text.split("\n")) {
    const bare = plain(line);
    const stageMatch = bare.match(/^[^\w]*\b([A-Z]{2,10})\b/);
    const candidate = stageMatch?.[1] ? STAGES[stageMatch[1]] : undefined;
    if (candidate) {
      stage = candidate;
      assignee = line.match(/<@!?(\d+)>/)?.[0] ?? null;
      break;
    }
  }

  // Deadlines: take the US/ET line. The IST line is the same instant restated.
  let scriptDue: string | null = null;
  const stampRe = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*@?\s*(\d{1,2}:\d{2})\s*([AaPp][Mm])\s*([A-Z]{2,4})/;
  for (const line of text.split("\n")) {
    const hit = plain(line).match(stampRe);
    if (!hit) continue;
    const zone = hit[4]!;
    if (/IST/i.test(zone) && scriptDue) continue;
    const parsed = parseStamp(hit[1]!, hit[2]!, hit[3]!, zone);
    if (parsed && (!scriptDue || !/IST/i.test(zone))) scriptDue = parsed;
    if (!/IST/i.test(zone)) break;
  }

  // A post that talks about the voiceover in prose is the one thing this
  // format does NOT standardise. Read the time if it is written plainly;
  // hand the whole message to the model if it isn't, rather than letting the
  // six-day default quietly overwrite a stated time.
  let voDue: string | null = null;
  const voLine = text
    .split("\n")
    // A stage header is the word alone, perhaps with a mention. Anything that
    // goes on to say something is prose about the voiceover.
    .find((l) => /\b(vo|voice.?over)\b/i.test(plain(l)) && !/^[^\w]*(VO|VOICEOVER)\s*(<@!?\d+>)?\s*$/.test(plain(l)));
  if (voLine) {
    // Anchored to the air date, so "Oct 5" is read in the video's own cycle
    // rather than whichever year it happens to be parsed in.
    voDue = parseWhen(plain(voLine), new Date(`${airDate}T12:00:00Z`));
    if (!voDue) return null;
  }

  // The "@ Comics" line is the channel tag: "@ Comics" is Specular Comics,
  // "@ YOU" is Specular YOU. Matched by exact name only — a tag that names no
  // channel files the post with none, rather than a guess.
  const channelFromTag = tag
    ? CHANNELS.find((c) => {
        const t = tag.toLowerCase();
        return c.name.toLowerCase() === t || c.name.toLowerCase() === `specular ${t}`;
      })
    : undefined;

  const wordCount = Number(
    plain(text).match(/Word\s*Count:?\s*([\d,]+)/i)?.[1]?.replace(/,/g, "") ?? "",
  );

  // Everything from the Story Brief marker to the end is the brief.
  const briefIndex = text.search(/\*\*Story Brief\*\*|Story Brief/i);
  const brief =
    briefIndex !== -1
      ? text
          .slice(briefIndex)
          .replace(/^\*{0,2}Story Brief\*{0,2}/i, "")
          .replace(/<@!?\d+>/g, "")
          .trim() || null
      : null;

  return {
    kind: "assignment",
    code,
    title,
    category: channelFromTag?.category ?? "stories",
    channel: channelFromTag?.name ?? null,
    tag,
    air_date: airDate,
    stage,
    word_count: Number.isFinite(wordCount) && wordCount > 0 ? wordCount : null,
    assignee,
    script_due: scriptDue,
    // Only ever a time the post actually states. The air-date-minus-buffer
    // default is derive()'s, so the rule lives in exactly one place.
    vo_due: voDue,
    deadline: null,
    version: null,
    links: extractUrls(text).map((url) => ({ url, kind: classifyUrl(url), label: "link" })),
    brief,
    note: null,
    // Pattern-matched, not guessed: if the shape matched, the fields are right.
    confidence: 1,
  };
}

/**
 * A forwarded revision: a Frame.io link with a line of context around it.
 *
 * There is no template here, but there doesn't need to be one — the host says
 * it is a review, `v3` says which version, and the channel is whatever channel
 * name the sentence mentions. None of that needs a model.
 */
export function parseReview(raw: string, now: Date = new Date()): Extraction | null {
  const links = extractUrls(raw).map((url) => ({
    url,
    kind: classifyUrl(url),
    label: classifyUrl(url) === "frameio" ? "Frame.io review" : "link",
  }));
  if (!links.some((l) => l.kind === "frameio")) return null;

  // Line by line, not flattened: a message is usually a title, a link and a
  // labelled deadline on separate lines, and flattening them is what turned
  // "Deadline: 6 am friday" into part of the title.
  const lines = raw
    .split("\n")
    .map((l) => plain(l.replace(/https?:\/\/\S+/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const times = readLabelledTimes(lines, now);

  // A voiceover time is the one thing never guessed: labelled but unreadable,
  // or mentioned in prose without a label, it goes to the model instead.
  if (times.unreadVo) return null;
  const words = times.rest.join(" ");
  if (/\b(vo|voice.?over)\b/i.test(words)) return null;

  // A paragraph with a link buried in it is a conversation, not a forward.
  if (words.length > 200) return null;

  const version = Number(words.match(/\bv(?:er|ersion)?\.?\s*(\d{1,2})\b/i)?.[1]) || null;
  const code = words.match(/\b([A-Z]{3,6}-\d{2,4})\b/)?.[1]?.toUpperCase() ?? null;
  const channel = matchChannel(words);

  // The title is the first line of the message's own words, minus the version
  // phrase that is already a field and the "is up" that is only chatter.
  const title =
    (times.rest[0] ?? "")
      .replace(/\bv(?:er|ersion)?\.?\s*\d{1,2}\b\s*(of\s+)?/i, "")
      .replace(/\s+(is up|is ready|is here|up now)\b.*$/i, "")
      .replace(/[\s,;|·—–-]+$/, "")
      .trim() || null;

  const notes: string[] = [];
  if (words) notes.push(words);
  else notes.push("Frame.io review — which project is this? Set the channel below.");
  if (times.unreadDeadline) {
    notes.push(`Deadline written as “${times.unreadDeadline}” — couldn't read it as a date.`);
  }

  return {
    kind: "review",
    code,
    title: title && title.length >= 3 && title.length <= 120 ? title : null,
    category: channel?.category ?? "unknown",
    channel: channel?.name ?? null,
    tag: null,
    air_date: null,
    stage: "review",
    word_count: null,
    assignee: null,
    script_due: null,
    vo_due: times.voDue,
    deadline: times.deadline,
    version,
    links,
    brief: null,
    note: notes.join(" "),
    // Honest: the link and version are certain, the project only when the
    // message names it. A bare link nobody labelled is a coin flip, and the
    // model would be guessing at it too.
    confidence: channel || code ? 0.9 : 0.5,
  };
}

/** Every pattern pass, cheapest first. Null means "this one needs the model". */
export function parsePattern(raw: string, now: Date = new Date()): Extraction | null {
  return parseAssignment(raw) ?? parseReview(raw, now);
}
