/**
 * Reading a Finance voice note. What was said ("paid Divas 250 for the Anime
 * edit on the Chase card yesterday") becomes one or more entries: an expense,
 * income, a subscription, a contractor's work, an advance, a payment, or a
 * change to how someone's paid.
 *
 * With ANTHROPIC_API_KEY set, Claude reads it and says which fields it had to
 * guess. Without one (or if the call fails), rules read it — less well, and
 * more of it is marked to check. Either way nothing is made up: what isn't
 * said is left empty, and the board shows it as missing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "../ai/claude.js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CHANNELS } from "../catalog.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import { parseWhen } from "../parse/when.js";

export type VoiceTab = "income" | "expense" | "subscription" | "contractor";
export const VOICE_TABS: VoiceTab[] = ["income", "expense", "subscription", "contractor"];

export const ENTRY_KINDS = ["expense", "income", "subscription", "work", "advance", "payment", "pay_model"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** What each tab's voice box expects by default, and may also accept. */
export const TAB_KINDS: Record<VoiceTab, EntryKind[]> = {
  expense: ["expense"],
  income: ["income"],
  subscription: ["subscription"],
  contractor: ["work", "advance", "payment", "pay_model"],
};

/**
 * Every field is required and nullable: said or not said, never invented.
 * Money is in dollars here; the board converts to cents.
 */
export const EntrySchema = z.object({
  kind: z.enum(ENTRY_KINDS).describe("What this entry is."),
  amount: z.number().nullable().describe("Dollars. For work: the amount only if they said one. For pay_model: null (use rate)."),
  date: z.string().nullable().describe("YYYY-MM-DD the money moved or the work was done, if said or clearly implied ('yesterday'). Null if not said."),
  month: z.string().nullable().describe("Income only: YYYY-MM the revenue is for ('September AdSense'). Null if not said."),
  payee: z.string().nullable().describe("Expense: who was paid / the vendor. Income: the source (sponsor, platform). Subscription: the service."),
  person: z.string().nullable().describe("A contractor, spelled exactly as in the known people list when it's one of them; otherwise the name as said."),
  category: z.string().nullable().describe("Expense or subscription category id from the list given. Null if nothing points to one."),
  expense_type: z.enum(["contractor", "subscription", "one_off", "recurring", "manual"]).nullable(),
  channels: z.array(z.string()).describe("Channel names exactly as in the channel list. Empty if none named (network-wide)."),
  stream: z.string().nullable().describe("Income only: revenue stream id from the list given."),
  status: z.enum(["paid", "unpaid"]).nullable().describe("unpaid if they owe it / haven't paid yet; paid if paid; null if not said."),
  method: z.string().nullable().describe("Payment method as said (card, PayPal…), matched to the list given when possible."),
  frequency: z.enum(["weekly", "monthly", "quarterly", "semiannual", "annual"]).nullable().describe("Subscriptions and pay models: how often."),
  next_bill: z.string().nullable().describe("Subscriptions: YYYY-MM-DD of the next charge, if said."),
  videos: z.number().nullable().describe("Work: number of videos delivered."),
  minutes: z.number().nullable().describe("Work: finished minutes delivered."),
  pay_model: z.enum(["per_video", "per_minute", "prepaid", "retainer", "salary", "revenue_share"]).nullable().describe("pay_model entries only."),
  rate: z.number().nullable().describe("pay_model: dollars per video/minute, the retainer/salary amount, or the share as a percent (10 for 10%)."),
  notes: z.string().nullable().describe("Anything worth keeping that has no field — what it was for."),
  unsure: z.array(z.string()).describe("Names of fields above you filled in by inference rather than from what was clearly said. Be honest: a guessed category or channel belongs here."),
  summary: z.string().describe("The entry in a few words, e.g. 'Paid Divas $250 — Anime edit'."),
});
export type VoiceEntry = z.infer<typeof EntrySchema>;
export const NoteSchema = z.object({ entries: z.array(EntrySchema) });

export interface VoiceContext {
  tab: VoiceTab;
  now?: Date;
  people: string[];
  categories: Array<{ id: string; label: string }>;
  streams: Array<{ id: string; label: string }>;
  methods: string[];
}

const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";

/** Stable so it caches: everything that varies (lists, today, the note) goes in the user turn. */
const SYSTEM = `You turn a voice note from the owner of a YouTube studio into bookkeeping entries for their finance board.

The note was spoken, then transcribed by a phone — expect filler, self-corrections ("250, no, 300" means 300), numbers as words ("two fifty" is 250, "2k" is 2000), and names spelled by sound. Channel names are "Specular <Name>"; people say just "<Name>" ("the Anime channel" is Specular Anime).

Rules:
- One entry per distinct thing: "paid Divas 250 and Adobe renewed at 90" is two entries.
- Never invent a value. Anything not said or clearly implied is null (or an empty list). The board shows missing fields to fill in.
- List in "unsure" every field you inferred rather than heard plainly — a category guessed from the vendor, a channel implied by context, a date from "last week", a person matched from an unclear spelling.
- Use the ids from the lists you're given for category and stream, and exact names for channels and known people.
- The tab the note was recorded in says what kind of entry is expected; follow what was said if it's clearly something else.
- Contractor notes: "did two edits, 12 and 14 minutes" is work (videos 2, minutes 26); "gave Vyasa a 5k advance" is an advance; "paid Divas everything I owe" is a payment (amount null); "Divas is 12 a minute now" is a pay_model (per_minute, rate 12).
- An expense paid to a known contractor is type contractor with that person.`;

/** Read a note with Claude, or with rules when there's no key or the call fails. */
export async function readVoiceNote(text: string, ctx: VoiceContext): Promise<{ entries: VoiceEntry[]; parsedBy: "claude" | "rules" }> {
  const clean = text.trim();
  if (!clean) return { entries: [], parsedBy: "rules" };
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return { entries: readByRules(clean, ctx), parsedBy: "rules" };
  try {
    const today = dateIn(ORG_TZ, ctx.now ?? new Date());
    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(NoteSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Today is ${today} (${ORG_TZ}). Recorded in the ${ctx.tab} tab — expected kinds: ${TAB_KINDS[ctx.tab].join(", ")}.`,
            `Known people: ${ctx.people.join(", ") || "none yet"}`,
            `Channels: ${CHANNELS.map((c) => c.name).join(", ")}`,
            `Expense categories (id: label): ${ctx.categories.map((c) => `${c.id}: ${c.label}`).join("; ")}`,
            `Revenue streams (id: label): ${ctx.streams.map((s) => `${s.id}: ${s.label}`).join("; ")}`,
            `Payment methods: ${ctx.methods.join(", ") || "none set up"}`,
            "",
            "Voice note:",
            clean,
          ].join("\n"),
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { entries: readByRules(clean, ctx), parsedBy: "rules" };
    return { entries: response.parsed_output.entries.map((e) => tidy(e, ctx)), parsedBy: "claude" };
  } catch (err) {
    console.error("[finance voice] Claude couldn't read the note, using rules:", err);
    return { entries: readByRules(clean, ctx), parsedBy: "rules" };
  }
}

/** Whatever read it, keep only what the board knows: real channels, list ids, real dates. */
function tidy(e: VoiceEntry, ctx: VoiceContext): VoiceEntry {
  const unsure = new Set(e.unsure);
  const channels = e.channels.map((c) => CHANNELS.find((ch) => ch.name.toLowerCase() === c.toLowerCase())?.name).filter((c): c is string => Boolean(c));
  if (channels.length !== e.channels.length) unsure.add("channels");
  const category = e.category && ctx.categories.some((c) => c.id === e.category) ? e.category : null;
  if (e.category && !category) unsure.add("category");
  const stream = e.stream && ctx.streams.some((s) => s.id === e.stream) ? e.stream : null;
  if (e.stream && !stream) unsure.add("stream");
  const person = e.person ? ctx.people.find((p) => p.toLowerCase() === e.person!.toLowerCase()) ?? e.person : null;
  const date = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
  const month = e.month && /^\d{4}-\d{2}$/.test(e.month) ? e.month : null;
  const nextBill = e.next_bill && /^\d{4}-\d{2}-\d{2}$/.test(e.next_bill) ? e.next_bill : null;
  return { ...e, channels, category, stream, person, date, month, next_bill: nextBill, unsure: [...unsure] };
}

// ── rules, for no key ──────────────────────────────────────────────────────

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };

/** "$1,250", "250 dollars", "2.5k", "two hundred" → dollars. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\$\s?\d[\d,]*(?:\.\d+)?\s?k?|\b\d[\d,]*(?:\.\d+)?\s?(?:k\b|grand\b|dollars?\b|bucks\b|usd\b))/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!.toLowerCase().replace(/[$,\s]/g, "");
    const k = /k$|grand$/.test(raw);
    const n = Number(raw.replace(/k$|grand$|dollars?$|bucks$|usd$/, ""));
    if (Number.isFinite(n)) out.push(k ? n * 1000 : n);
  }
  if (!out.length) {
    // A bare number that isn't minutes, a count, a percent, a date or a time: "paid Divas 250".
    const re2 = /(?<![\d/:.-])(\d[\d,]*(?:\.\d+)?)(?![\d/:]|\s*(?:min|minute|video|edit|episode|thumbnail|%|percent|st\b|nd\b|rd\b|th\b|am\b|pm\b|and\s+\d+\s*min))/gi;
    for (const m of text.matchAll(re2)) {
      const n = Number(m[1]!.replace(/,/g, ""));
      const before = text.slice(Math.max(0, m.index! - 12), m.index!).toLowerCase();
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*$/.test(before)) continue;
      if (Number.isFinite(n) && n > 0 && !(n >= 1900 && n <= 2100)) out.push(n);
    }
  }
  return out;
}

/** Every channel named: "the Anime channel", "FNAF and Anime", "DC". Longest names first so "FNAF Bits" beats "FNAF". */
export function channelsIn(text: string): string[] {
  let hay = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  const names = CHANNELS.flatMap((c) => [c.name.toLowerCase(), ...(c.exactOnly ? [] : [c.name.replace(/^Specular /, "").toLowerCase()]), ...(c.aliases ?? [])].map((n) => ({ n, c: c.name })))
    .filter((x) => x.n.length >= 2)
    .sort((a, b) => b.n.length - a.n.length);
  for (const { n, c } of names) {
    const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`, "i");
    if (re.test(hay)) {
      if (!found.includes(c)) found.push(c);
      hay = hay.replace(re, "$1 ");
    }
  }
  return found;
}

const CATEGORY_WORDS: Array<[string, RegExp]> = [
  ["editing", /\bedit(s|ing|or|ors)?\b|\bcut\b/i],
  ["scripts", /\bscript|\bwrit(er|ing)\b/i],
  ["voiceover", /\bvo\b|voice ?over|voice actor|narrat|read(ing|er)\b/i],
  ["thumbnails", /\bthumb(nail)?s?\b/i],
  ["animation", /\banimat(ion|or)/i],
  ["music", /\bmusic|\bsfx\b|sound effect|epidemic|artlist/i],
  ["software", /\badobe|premiere|after effects|software|subscription|canva|chatgpt|claude|notion|frame\.?io|capcut|google workspace/i],
  ["equipment", /\bmic\b|microphone|camera|\bpc\b|computer|laptop|monitor|equipment|gpu|headphones/i],
  ["marketing", /\bads?\b|marketing|promo/i],
  ["admin", /\blawyer|legal|accountant|llc|filing|admin/i],
  ["fees", /\bfees?\b|\btax(es)?\b/i],
];

const STREAM_WORDS: Array<[string, RegExp]> = [
  ["sponsorship", /sponsor|brand deal|\bdeal\b|integration/i],
  ["affiliate", /affiliate|commission|referral/i],
  ["streaming", /stream(ing)?|twitch|super ?chat|donation/i],
  ["platform", /facebook|tiktok|snapchat|patreon|membership|shorts fund/i],
  ["adsense", /adsense|ad ?revenue|\bads\b|youtube/i],
];

/** Split a note into pieces that each carry an amount (or, for contractors, a person). */
function pieces(text: string): string[] {
  const parts = text.split(/(?:[.;!?\n]+|\s+and then\s+|\s+also\s+|,\s*and\s+|\s+and\s+(?=(?:i\s+)?(?:paid|pay|spent|bought|got|renewed|the\s|\w+\s+(?:did|made|is|was))))/i).map((p) => p.trim()).filter((p) => p.length > 2);
  const withMoney = parts.filter((p) => amountsIn(p).length || /\b(minutes?|videos?|edits?|advance|paid .* (everything|all)|owe)\b/i.test(p));
  return withMoney.length ? withMoney : [text];
}

export function readByRules(text: string, ctx: VoiceContext): VoiceEntry[] {
  const now = ctx.now ?? new Date();
  const today = dateIn(ORG_TZ, now);
  return pieces(text).map((piece) => {
    const unsure = new Set<string>();
    const amount = amountsIn(piece)[0] ?? null;
    const when = parseWhen(piece, now);
    const date = when ? dateIn(ORG_TZ, new Date(when)) : /\byesterday\b/i.test(piece) ? dateIn(ORG_TZ, new Date(now.getTime() - 86_400_000)) : null;
    const channels = channelsIn(piece);
    const person = ctx.people.find((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(piece)) ?? null;
    const category = CATEGORY_WORDS.find(([id, re]) => re.test(piece) && ctx.categories.some((c) => c.id === id))?.[0] ?? null;
    if (category) unsure.add("category");
    const method = ctx.methods.find((m) => piece.toLowerCase().includes(m.toLowerCase().split(" ")[0]!)) ?? null;
    const status = /\b(owe|owed|haven'?t paid|not paid|unpaid|need to pay|due)\b/i.test(piece) ? "unpaid" : /\bpaid\b/i.test(piece) ? "paid" : null;
    // "12 and 14 minutes" is 26: every number in the run before "minutes".
    const minRun = /((?:\d+(?:\.\d+)?\s*(?:,|and|\+|&)\s*)*\d+(?:\.\d+)?)\s*(?:min|minute)/i.exec(piece)?.[1];
    const minutes = minRun ? minRun.match(/\d+(?:\.\d+)?/g)!.reduce((a, x) => a + Number(x), 0) : NaN;
    const videosN = /\b(\d+|an?|one|two|three|four|five|six)\s+(?:[A-Za-z]+\s+)?(?:videos?|edits?|episodes?|vos?|thumbnails?)\b/i.exec(piece)?.[1];
    const videos = videosN ? (WORDS[videosN.toLowerCase()] ?? Number(videosN)) : null;
    const frequency = /\b(year|annual|yearly)\b/i.test(piece) ? "annual" : /\bquarter/i.test(piece) ? "quarterly" : /\bweek/i.test(piece) ? "weekly" : /\bmonth/i.test(piece) ? "monthly" : null;
    const base = {
      amount, date, month: null as string | null, payee: null as string | null, person, category, expense_type: null as VoiceEntry["expense_type"], channels,
      stream: null as string | null, status: status as VoiceEntry["status"], method, frequency: frequency as VoiceEntry["frequency"], next_bill: null as string | null,
      videos, minutes: Number.isFinite(minutes) ? minutes : null, pay_model: null as VoiceEntry["pay_model"], rate: null as number | null, notes: piece,
    };
    let kind: EntryKind = TAB_KINDS[ctx.tab][0]!;
    if (ctx.tab === "contractor") {
      kind = /\badvance|prepa(y|id)/i.test(piece) ? "advance"
        : /\b(a|per)\s+(minute|video)\b|\bnow\s+(gets|is|at)\b|\brate\b|\bretainer|\bsalary|\bshare\b|%/i.test(piece) ? "pay_model"
        : /\bpaid\b.*\b(everything|all|off|back)\b|\bpay(ing)? off\b/i.test(piece) ? "payment" : "work";
      if (kind === "pay_model") {
        base.pay_model = /%|share/i.test(piece) ? "revenue_share" : /retainer/i.test(piece) ? "retainer" : /salary/i.test(piece) ? "salary" : /minute/i.test(piece) ? "per_minute" : "per_video";
        base.rate = Number(/(\d+(?:\.\d+)?)\s*(?:%|percent|(?:dollars?|bucks)?\s*(?:a|per)\s+(?:minute|video))/i.exec(piece)?.[1] ?? amount ?? NaN);
        if (!Number.isFinite(base.rate)) base.rate = null;
        base.amount = null;
        unsure.add("pay_model");
      }
      if (kind === "payment") base.amount = null;
      if (!person) {
        // A name the board doesn't know yet: the capitalised word after the verb.
        const m = /\b(?:[Pp]aid|[Pp]ay|[Gg]ave|[Gg]ive|[Ss]ent|to|for)\s+([A-Z][a-z]+)/.exec(piece) ?? /^([A-Z][a-z]+)\s+(?:did|made|is|was|finished|delivered)/.exec(piece);
        if (m && !CHANNELS.some((c) => c.name.toLowerCase().includes(m[1]!.toLowerCase()))) { base.person = m[1]!; unsure.add("person"); }
      }
    } else if (ctx.tab === "income") {
      base.stream = STREAM_WORDS.find(([id, re]) => re.test(piece) && ctx.streams.some((s) => s.id === id))?.[0] ?? null;
      if (!base.stream) { base.stream = "adsense"; unsure.add("stream"); }
      const monthName = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(piece)?.[1];
      if (monthName) {
        const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthName.toLowerCase());
        const y = Number(today.slice(0, 4)) - (idx + 1 > Number(today.slice(5, 7)) ? 1 : 0);
        base.month = `${y}-${String(idx + 1).padStart(2, "0")}`;
      } else if (/last month/i.test(piece)) {
        const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 1);
        base.month = d.toISOString().slice(0, 7);
      }
      base.payee = /\bfrom\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)/.exec(piece)?.[1] ?? null;
      base.category = null;
    } else if (ctx.tab === "subscription") {
      base.payee = /\b(?:for|to|renewed|subscribed to|signed up for)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)/.exec(piece)?.[1] ?? /^([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)/.exec(piece)?.[1] ?? null;
      if (!base.frequency) { base.frequency = "monthly"; unsure.add("frequency"); }
    } else {
      base.payee = person ?? /\b(?:paid|to|at|from)\s+(?:the\s+)?([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*)*)/.exec(piece)?.[1]
        ?? /\bbought\s+(?:a\s+|an\s+|the\s+|some\s+)?(?:new\s+)?([a-z][\w' -]{1,30}?)(?=\s+(?:for|at|from|on)\b|[,.]|$)/i.exec(piece)?.[1] ?? null;
      base.expense_type = person ? "contractor" : /subscription|monthly/i.test(piece) ? "subscription" : "one_off";
      if (base.payee && !person) unsure.add("payee");
    }
    if (channels.length) unsure.add("channels");
    return { kind, ...base, unsure: [...unsure], summary: piece.length > 80 ? `${piece.slice(0, 77)}…` : piece };
  });
}

/**
 * What an entry still needs before it can be logged. Anything here keeps it
 * as a draft; `unsure` fields log but stay marked until checked.
 */
export function missingFor(e: VoiceEntry, knownPerson: boolean): string[] {
  const m: string[] = [];
  const need = (ok: unknown, field: string) => { if (!ok) m.push(field); };
  switch (e.kind) {
    case "expense": need(e.amount, "amount"); break;
    case "income": need(e.amount, "amount"); break;
    case "subscription": need(e.payee, "service"); need(e.amount, "amount"); break;
    case "work": need(knownPerson, "person"); need(e.amount !== null || e.videos !== null || e.minutes !== null, "what was done"); break;
    case "advance": need(knownPerson, "person"); need(e.amount, "amount"); break;
    case "payment": need(knownPerson, "person"); break;
    case "pay_model": need(knownPerson, "person"); need(e.pay_model, "pay model"); need(e.rate, "rate"); break;
  }
  return m;
}
