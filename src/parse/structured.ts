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
  let hour = Number(hhRaw);
  if (/pm/i.test(meridiem) && hour < 12) hour += 12;
  if (/am/i.test(meridiem) && hour === 12) hour = 0;

  const iso = `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute ?? "00"}:00`;

  // ET shifts with DST; IST never does. Resolve ET by asking what offset New
  // York is actually on at that moment rather than assuming -04:00.
  if (/IST/i.test(zone)) return `${iso}+05:30`;

  const probe = new Date(`${iso}Z`);
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = name?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "-05:00";
  return `${iso}${offset}`;
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
    // The template never names a channel, so we never invent one here.
    category: "long_form",
    channel: null,
    tag,
    air_date: airDate,
    stage,
    word_count: Number.isFinite(wordCount) && wordCount > 0 ? wordCount : null,
    assignee,
    script_due: scriptDue,
    // Never derived here — derive() owns the air-date-minus-buffer rule.
    vo_due: null,
    deadline: null,
    version: null,
    links: extractUrls(text).map((url) => ({ url, kind: classifyUrl(url), label: "link" })),
    brief,
    note: null,
    // Pattern-matched, not guessed: if the shape matched, the fields are right.
    confidence: 1,
  };
}
