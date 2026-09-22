import { matchChannel, type CategoryId } from "../catalog.js";
import { classifyUrl, extractUrls } from "./rules.js";
import type { Extraction } from "./schema.js";

/** Canonical zone for deadlines. Everything is stored UTC and shown in these. */
export const ORG_TZ = process.env.ORG_TZ?.trim() || "America/New_York";
/** Second zone shown alongside, for the team that isn't in ORG_TZ. */
export const TEAM_TZ = process.env.TEAM_TZ?.trim() || "Asia/Kolkata";

/** Days before the air date that voiceover must be delivered, when not stated. */
export const VO_BUFFER_DAYS = Number(process.env.VO_BUFFER_DAYS ?? 6);
/** Time of day a derived deadline lands on, matching the 11:59 PM ET convention. */
export const DEADLINE_TIME = process.env.DEADLINE_TIME?.trim() || "23:59";

// ── timezone helpers ──────────────────────────────────────────────────────

/** UTC offset in effect in `zone` at `at`, e.g. "-04:00". */
export function offsetFor(zone: string, at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m?.[1] ?? "+00:00";
}

/**
 * Turn a wall-clock date and time in `zone` into a real instant.
 * Resolved twice because the offset itself depends on the instant — the first
 * pass can land on the wrong side of a DST change.
 */
export function instantIn(dateISO: string, hhmm: string, zone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const guess = new Date(`${dateISO}T${hhmm}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;

  let result = new Date(`${dateISO}T${hhmm}:00${offsetFor(zone, guess)}`);
  result = new Date(`${dateISO}T${hhmm}:00${offsetFor(zone, result)}`);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Renders the way the assignment posts write it: "9/27/2026 @ 11:59 PM ET". */
export function renderIn(at: Date, zone: string, label: string): string {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(at);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  const meridiem = get("dayPeriod").toUpperCase();
  return `${get("month")}/${get("day")}/${get("year")} @ ${get("hour")}:${get("minute")} ${meridiem} ${label}`.trim();
}

/** Both zones, the way the assignment posts write them. */
export function renderBothZones(at: Date): { org: string; team: string } {
  return {
    org: renderIn(at, ORG_TZ, zoneLabel(ORG_TZ, at)),
    team: renderIn(at, TEAM_TZ, zoneLabel(TEAM_TZ, at)),
  };
}

function zoneLabel(zone: string, at: Date): string {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  if (!short) return "";
  // en-US renders India as "GMT+5:30"; the team writes it IST.
  if (zone === "Asia/Kolkata") return "IST";
  return short;
}

/** Local calendar date in a zone, as YYYY-MM-DD. */
export function dateIn(zone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Shift a YYYY-MM-DD by whole days without touching clock time. */
export function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parse a model timestamp, rejecting anything outside a plausible window. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const now = new Date().getUTCFullYear();
  return year < now - 1 || year > now + 5 ? null : d;
}

// ── the derived record ────────────────────────────────────────────────────

export type VoSource = "stated" | "calculated" | "none";

export interface DerivedRecord {
  kind: Extraction["kind"];
  code: string | null;
  title: string | null;
  category: CategoryId | "unknown";
  channel: string | null;
  tag: string | null;
  stage: Extraction["stage"];
  wordCount: number | null;
  assignee: string | null;
  airDate: string | null;
  scriptDue: Date | null;
  voDue: Date | null;
  voSource: VoSource;
  deadline: Date | null;
  version: number | null;
  links: Extraction["links"];
  brief: string | null;
  note: string | null;
  confidence: number;
  /** Anything the operator should know about how this was filled in. */
  warnings: string[];
}

/**
 * Applies the rules that are ours, not the model's: channel matching, category
 * inference, the VO buffer, and link reconciliation. Keeping these here rather
 * than in the prompt means they are testable and never hallucinated.
 */
export function derive(extraction: Extraction, raw: string): DerivedRecord {
  const warnings: string[] = [];

  // Channel drives category — a named channel is more trustworthy than the
  // model's own category guess.
  const matched = matchChannel(extraction.channel) ?? matchChannel(raw);
  let category: CategoryId | "unknown" =
    (extraction.category as CategoryId | "unknown") ?? "unknown";

  if (matched) {
    if (category !== "unknown" && category !== matched.category) {
      warnings.push(
        `category "${category}" overridden to "${matched.category}" by channel ${matched.name}`,
      );
    }
    category = matched.category;
  } else if (extraction.channel) {
    warnings.push(`channel "${extraction.channel}" is not in the catalog`);
  }

  const airDate = normaliseDate(extraction.air_date);
  if (extraction.air_date && !airDate) {
    warnings.push(`could not read air date "${extraction.air_date}"`);
  }

  const scriptDue = parseTimestamp(extraction.script_due);
  const statedVo = parseTimestamp(extraction.vo_due);

  let voDue = statedVo;
  let voSource: VoSource = statedVo ? "stated" : "none";

  if (!voDue && airDate) {
    voDue = instantIn(shiftDate(airDate, -VO_BUFFER_DAYS), DEADLINE_TIME, ORG_TZ);
    if (voDue) voSource = "calculated";
  }

  if (voDue && voSource === "calculated" && voDue.getTime() < Date.now()) {
    warnings.push("calculated VO deadline is already in the past");
  }

  return {
    kind: extraction.kind,
    code: extraction.code?.trim().toUpperCase() ?? null,
    title: extraction.title?.trim() || null,
    category,
    channel: matched?.name ?? null,
    tag: extraction.tag?.trim() || null,
    stage: extraction.stage,
    wordCount: extraction.word_count,
    assignee: extraction.assignee?.trim() || null,
    airDate,
    scriptDue,
    voDue,
    voSource,
    deadline: parseTimestamp(extraction.deadline),
    version: extraction.version,
    links: reconcileLinks(raw, extraction.links),
    brief: extraction.brief?.trim() || null,
    note: extraction.note?.trim() || null,
    confidence: extraction.confidence,
    warnings,
  };
}

/**
 * Accepts the shapes that actually turn up: ISO, and the MM-DD-YY the
 * assignment headings lead with.
 */
export function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashed = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (slashed) {
    const [, mm, dd, yy] = slashed;
    const year = yy!.length === 2 ? 2000 + Number(yy) : Number(yy);
    const iso = `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
    return Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime()) ? null : iso;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Every URL in the raw text ends up on the record, with the host's own kind. */
export function reconcileLinks(raw: string, modelLinks: Extraction["links"]): Extraction["links"] {
  const byUrl = new Map<string, Extraction["links"][number]>();

  for (const link of modelLinks ?? []) {
    if (!/^https?:\/\//i.test(link.url)) continue;
    byUrl.set(link.url, { ...link, kind: classifyUrl(link.url) });
  }
  for (const url of extractUrls(raw)) {
    if (!byUrl.has(url)) byUrl.set(url, { url, kind: classifyUrl(url), label: "link" });
  }
  return [...byUrl.values()];
}
