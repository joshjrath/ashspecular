/**
 * Reading a task out of whatever was forwarded into #tasks — by rules, so it
 * costs nothing and never drifts. It finds:
 *
 *   title      your own words if you wrote any, else the forwarded message's first line
 *   category   Payment, Response, Team, Production, Channel, Business, Priority, General
 *   priority   URGENT / HIGH / NORMAL / LOW — separate from the category
 *   person     who it's about: an @mention, a known name, or the name after
 *              "pay", "respond to", "follow up with", …
 *   due        any date or time the message gives
 *
 * Everything it finds can be changed on the site.
 */
import { parseWhen } from "../parse/when.js";

export const TASK_CATEGORIES = [
  { id: "payment", label: "Payment", emoji: "💰", colour: "#3CCB84", est: 2 },
  { id: "response", label: "Response", emoji: "💬", colour: "#5B9BF0", est: 5 },
  { id: "team", label: "Team", emoji: "👥", colour: "#C08CF0", est: 10 },
  { id: "production", label: "Production", emoji: "🎬", colour: "#F2A79C", est: 15 },
  { id: "channel", label: "Channel", emoji: "📺", colour: "#E5534B", est: 10 },
  { id: "business", label: "Business", emoji: "🤝", colour: "#E8C547", est: 15 },
  { id: "priority", label: "Priority", emoji: "⚠️", colour: "#EE9A55", est: 10 },
  { id: "general", label: "General", emoji: "📌", colour: "#94949E", est: 5 },
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number]["id"];
export const TASK_CATEGORY = new Map<string, (typeof TASK_CATEGORIES)[number]>(TASK_CATEGORIES.map((c) => [c.id, c]));

export const PRIORITIES = [
  { id: "urgent", label: "URGENT", dot: "🔴", colour: "#F2685E" },
  { id: "high", label: "HIGH", dot: "🟠", colour: "#EE9A55" },
  { id: "normal", label: "NORMAL", dot: "⚪", colour: "#BDBDC6" },
  { id: "low", label: "LOW", dot: "⚫", colour: "#82828C" },
] as const;
export type Priority = (typeof PRIORITIES)[number]["id"];
export const PRIORITY = new Map<string, (typeof PRIORITIES)[number]>(PRIORITIES.map((p) => [p.id, p]));

export interface ParsedTask {
  title: string;
  category: TaskCategory;
  priority: Priority;
  person: string | null;
  due: string | null;
  /** Everything that came in, for context. */
  body: string;
}

/** Words that give a category away. A leading verb counts triple: "Respond to the sponsor thread" is a Response. */
// Production first: it wins a tie ("Check editor revision thread" is Production work).
const RULES: Array<{ id: TaskCategory; lead?: RegExp; words: RegExp }> = [
  {
    id: "production",
    lead: /^(edit|write|record|render|make (?:a |the )?thumbnail|script|re-?cut|fix the (?:edit|video))\b/i,
    words: /\b(video|script\w*|edit|edits|editing|thumbnail\w*|vo|voice ?over|footage|render|frame\.io|b-?roll|cut|intro|outro|music|sfx|draft|revision\w*|re-?upload)\b/gi,
  },
  {
    id: "response",
    lead: /^(respond|reply|answer|get back|follow[\s-]?up|check (?:the |on )?(?:thread|dm|message|reply)|message|dm|text|email|call|ping|tell|ask|let \w+ know)\b/i,
    words: /\b(respond|reply|replied|get back to|follow[\s-]?up|answer|thread|dm'?s?|message back|let (?:him|her|them) know|reach out|email back|ping)\b/gi,
  },
  {
    id: "payment",
    lead: /^(pay|send (?:the )?(?:money|payment)|invoice|reimburse|transfer)\b/i,
    words: /\b(pay|paid|payment|payout|invoice|reimburse\w*|revenue split|split|paypal|wise|venmo|cash ?app|owe[sd]?|wire|bank transfer|salary|rate|fee)\b|\$\s?\d/gi,
  },
  {
    id: "business",
    lead: /^(sign|draft|review the contract|file)\b/i,
    words: /\b(sponsor\w*|brand deal|partner\w*|llc|contract|agreement|tax\w*|legal|lawyer|accountant|bank|admin|trademark|business|deal|nda|w-?9|1099|ein)\b/gi,
  },
  {
    id: "team",
    lead: /^(hire|fire|onboard|interview|assign|recruit|train)\b/i,
    words: /\b(hire|hiring|fire|onboard\w*|interview\w*|recruit\w*|staff|team|editor|writer|va|voice actor|performance|role|trial|applicant|candidate|assign\w*|warning|feedback for)\b/gi,
  },
  {
    id: "channel",
    lead: /^(upload|change the (?:title|thumbnail)|update (?:the )?channel|schedule the)\b/i,
    words: /\b(youtube|channel|monetiz\w*|adsense|studio|upload\w*|settings|community post|shorts|analytics|playlist|subscribers?|claim|copyright|strike|banner|handle|verification)\b/gi,
  },
];

const URGENT = /\b(urgent\w*|asap|a\.s\.a\.p|immediately|right now|right away|emergency|critical|overdue|now!)\b|!!/i;
const HIGH = /\b(important|high priority|priority|soon|today|tonight|this morning|this afternoon|end of day|eod|by tomorrow)\b/i;
const LOW = /\b(whenever|someday|low priority|no rush|eventually|at some point|not urgent|when you can|later this month|backlog)\b/i;

/** Urgency and timing tacked onto the end of a title. */
const TRAILING = /(?:[\s,;:–—-]+|^)(?:urgent(?:ly)?|asap|a\.s\.a\.p|!+|important|high priority|low priority|no rush|whenever|eventually|at some point|not urgent|today|tonight|tomorrow|this (?:morning|afternoon|evening|week)|eod|end of day|next week|(?:by|before|on|due) (?:the )?(?:\w+day|tomorrow|tonight|eod|end of (?:day|week)|\d{1,2}(?:\/\d{1,2})?(?:st|nd|rd|th)?|\w{3,9} \d{1,2}(?:st|nd|rd|th)?)(?: (?:at )?\d{1,2}(?::\d{2})? ?(?:am|pm)?)?)[!.]*$/i;

/** Names after these words are who a task is about: "Pay Divas", "Follow up with Vyasa". */
const PERSON_AFTER = /\b(?:pay|paid|respond to|reply to|follow[\s-]?up with|message|dm|text|email|call|ping|tell|ask|remind|check (?:in )?with|get back to|send|invoice|reimburse|thank|talk to|meet with|hire|fire|onboard)\s+(@?[\w'’.-]{2,25}(?:\s[\w'’-]{2,25})?)/i;
const NOT_NAMES = new Set("The A An This That Them Him Her It Everyone Someone Me Us You YouTube Discord Frame Google Monday Tuesday Wednesday Thursday Friday Saturday Sunday Today Tomorrow Tonight".split(" "));

const clean = (s: string) => s.replace(/<@!?&?\d+>/g, "").replace(/<#\d+>/g, "").replace(/https?:\/\/\S+/g, "").replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();

/** Read a task. `comment` is what you wrote, `forwarded` what you forwarded; `people` the names already known. */
export function parseTask(input: { comment?: string; forwarded?: string; mentions?: string[]; people?: string[]; now?: Date }): ParsedTask {
  const now = input.now ?? new Date();
  const comment = (input.comment ?? "").trim();
  const forwarded = (input.forwarded ?? "").trim();
  const body = [comment, forwarded].filter(Boolean).join("\n\n");
  const text = clean(body);

  // The title: your own words first, else the forwarded message's first real line.
  const firstLine = (s: string) => clean(s.split("\n").map((l) => l.trim()).find((l) => clean(l).length >= 3) ?? "");
  // A comment that only says how urgent it is ("urgent!!", "asap") isn't a title.
  const onlyUrgency = (s: string) => clean(s).replace(/\b(urgent\w*|asap|important|high priority|priority|low priority|no rush|fyi|todo|to do|task)\b|[!?.:\-–—]/gi, "").trim().length < 3;
  let title = (onlyUrgency(comment) ? "" : firstLine(comment)) || firstLine(forwarded) || firstLine(comment) || "Task";
  // How urgent and when are read into their own fields, so a title that ends
  // with them ("Pay Divas urgent", "… by Friday") drops them.
  for (let before = ""; before !== title; ) {
    before = title;
    title = title.replace(TRAILING, "").trim() || before;
  }
  if (title.length > 110) title = `${title.slice(0, 107).replace(/\s+\S*$/, "")}…`;
  title = title.charAt(0).toUpperCase() + title.slice(1);

  // Category: the leading verb weighs most, then every word that points somewhere.
  const lead = clean(comment || forwarded);
  let best: { id: TaskCategory; score: number } = { id: "general", score: 0 };
  for (const r of RULES) {
    const score = (r.lead?.test(lead) ? 3 : 0) + (text.match(r.words)?.length ?? 0);
    if (score > best.score) best = { id: r.id, score };
  }

  const due = parseWhen(text, now);
  const hoursToDue = due ? (Date.parse(due) - now.getTime()) / 3_600_000 : null;
  let priority: Priority = URGENT.test(text) ? "urgent" : LOW.test(text) ? "low" : HIGH.test(text) ? "high" : "normal";
  // A due time decides it too: past or within the day is urgent, within two days high.
  if (hoursToDue !== null && hoursToDue < 12 && priority !== "urgent") priority = "urgent";
  else if (hoursToDue !== null && hoursToDue < 48 && (priority === "normal" || priority === "low")) priority = "high";
  // Urgent with nowhere else to go is the Priority category.
  if (best.score === 0 && priority === "urgent") best = { id: "priority", score: 1 };

  // Who: an @mention, else a name already known, else the name after the verb.
  let person: string | null = input.mentions?.[0] ?? null;
  if (!person) {
    const known = (input.people ?? []).find((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    if (known) person = known;
  }
  if (!person) {
    // The verb in any case, the name capitalised: "pay Divas", "Follow up with Vyasa Rao".
    const m = PERSON_AFTER.exec(text);
    const words = (m?.[1] ?? "").replace(/^@/, "").split(" ").filter((w) => /^[A-Z]/.test(w) && !NOT_NAMES.has(w));
    const name = words.length && /^[A-Z]/.test((m?.[1] ?? "").replace(/^@/, "")) ? words.join(" ").replace(/['’]s$/, "").replace(/[.,]$/, "") : "";
    if (name) person = name;
  }

  return { title, category: best.id, priority, person, due, body };
}
