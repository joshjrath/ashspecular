/**
 * The Idea Score: a ranking, never a forecast. 94 means "near the top of what
 * the feed has to show you", not "94% likely to do well".
 *
 * The AI rates a source on eight parts (0–1 each); the score is their weighted
 * mean on 0–100, then adjusted — in code, where every point can be shown:
 *
 *   engagement     notes against the post's age: a small nudge either way
 *                  (−3 to +6), one signal among many
 *   similarity     how close it is to a Bit already made, planned or turned
 *                  down, weighted by how recent that was: up to −40
 *   used source    the same post (or its original) already became an idea: −50
 *   canon          a canon claim the AI isn't sure of: −4, and flagged
 *   meta           fourth-wall / fandom concepts are easy to overuse: −3
 *
 * Every part and adjustment comes back with the score, so the card can say
 * why it ranked where it did.
 */

import { usDate } from "../parse/derive.js";

export const SCORE_PARTS = [
  { key: "franchise_specificity", label: "Franchise specificity", weight: 0.18, high: "Extremely franchise-specific", low: "Could be any franchise" },
  { key: "comedy_potential", label: "Comedy / scenario potential", weight: 0.18, high: "Strong comedic scenario", low: "Weak joke or scenario" },
  { key: "visual_potential", label: "Visual potential", weight: 0.15, high: "Strong visual escalation", low: "Hard to show — mostly explanation" },
  { key: "originality", label: "Originality", weight: 0.14, high: "Fresh angle", low: "Familiar premise" },
  { key: "context_efficiency", label: "Context efficiency", weight: 0.12, high: "Understood in seconds", low: "Needs a lot of set-up" },
  { key: "source_specificity", label: "Source specificity", weight: 0.09, high: "Built on one specific detail", low: "Vague source" },
  { key: "character_recognition", label: "Character recognition", weight: 0.07, high: "Instantly recognisable characters", low: "Obscure characters" },
  { key: "audience_fit", label: "Audience fit", weight: 0.07, high: "Right for the channel's audience", low: "Weak fit for the channel" },
] as const;
export type PartKey = (typeof SCORE_PARTS)[number]["key"];

export interface SimilarMatch {
  /** What it resembled: a published Bit, an approved idea, or a rejected source. */
  kind: "bit" | "idea" | "rejected";
  ref: string;
  title: string;
  channel: string | null;
  /** YYYY-MM-DD: published, approved or rejected. Null for an idea not yet made. */
  date: string | null;
  similarity: number;
  sameMechanism: boolean;
  reason: string;
  /** How much its age matters (1 = this week), and similarity × that. */
  recency: number;
  effective: number;
  href?: string;
}

export interface ScoreBreakdown {
  score: number;
  base: number;
  parts: Array<{ key: string; label: string; value: number; weight: number }>;
  adjustments: Array<{ label: string; points: number }>;
  why: string[];
  problems: string[];
  /** Recency-weighted similarity to the history, 0–1; null when it couldn't be checked. */
  similarity: number | null;
  engagement: number | null;
}

const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * How much a similar Bit's age matters: something like a Short from this week
 * is a real problem, one from last year mostly worth knowing.
 */
export function recencyWeight(kind: SimilarMatch["kind"], date: string | null, today: string): number {
  if (kind === "idea" && !date) return 1; // approved but not made yet: it's in the pipeline now
  if (!date) return 0.35;
  const days = Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000));
  const w = days <= 7 ? 1 : days <= 30 ? 0.85 : days <= 90 ? 0.6 : days <= 365 ? 0.35 : 0.2;
  return kind === "rejected" ? w * 0.5 : w;
}

/**
 * Engagement relative to age, 0–1: 100 notes in half an hour reads far
 * higher than 200 over three years. Notes are read when the post is found.
 */
export function engagementSignal(notes: number | null, postedAt: Date | null, readAt: Date): number | null {
  if (notes === null || !postedAt) return null;
  const hours = Math.max(0, (readAt.getTime() - postedAt.getTime()) / 3_600_000);
  const velocity = notes / Math.pow(hours + 2, 0.8);
  return Math.max(0, Math.min(1, Math.log10(1 + velocity * 10) / 3));
}

export interface ScoreInput {
  scores: Partial<Record<PartKey, number>>;
  whyItWorks: string[];
  warnings: string[];
  classification: string;
  canonConfidence: number;
  canonCheckRequired: boolean;
  canonChecks: string[];
  engines: string[];
  notes: number | null;
  postedAt: Date | null;
  readAt: Date;
  matches: SimilarMatch[] | null; // null: the check couldn't run
  similarityNote?: string;
  usedSource: string | null; // the idea this same post already became
}

export function scoreIdea(input: ScoreInput): ScoreBreakdown {
  const parts = SCORE_PARTS.map((p) => ({ key: p.key, label: p.label, value: Math.round(clamp01(input.scores[p.key]) * 100), weight: p.weight }));
  const base = parts.reduce((n, p) => n + p.value * p.weight, 0);
  const adjustments: ScoreBreakdown["adjustments"] = [];
  const why: string[] = [];
  const problems: string[] = [];

  // The three strongest parts (0.85+) and every weak one (0.45 or under), strongest and weakest first.
  const rated = SCORE_PARTS.map((p) => ({ p, v: clamp01(input.scores[p.key]) }));
  for (const { p } of rated.filter((x) => x.v >= 0.85).sort((a, b) => b.v - a.v).slice(0, 3)) why.push(p.high);
  for (const { p } of rated.filter((x) => x.v <= 0.45).sort((a, b) => a.v - b.v)) problems.push(p.low);

  const engagement = engagementSignal(input.notes, input.postedAt, input.readAt);
  if (engagement !== null) {
    const pts = Math.max(-3, Math.min(6, Math.round((engagement - 0.35) * 10)));
    if (pts) adjustments.push({ label: pts > 0 ? "Engagement for its age" : "Little engagement for its age", points: pts });
    if (engagement >= 0.75) why.push("Unusually high engagement velocity");
  }

  let similarity: number | null = null;
  if (input.matches === null) {
    problems.push(`Similarity check unavailable${input.similarityNote ? ` — ${input.similarityNote}` : ""}`);
  } else {
    const top = [...input.matches].sort((a, b) => b.effective - a.effective)[0];
    similarity = top ? top.effective : 0;
    const exact = input.matches.find((m) => m.similarity >= 0.85 && m.sameMechanism);
    let penalty = Math.round(40 * similarity * similarity);
    if (exact) penalty = Math.max(penalty, 20);
    if (penalty > 0) adjustments.push({ label: exact ? "Same premise as an existing Bit" : "Similar to existing work", points: -penalty });
    if (exact) problems.push(`Same premise as “${exact.title}”${exact.date ? ` (${usDate(exact.date)})` : ""}`);
    else if (top && top.effective >= 0.4) problems.push(`${Math.round(top.similarity * 100)}% similar to “${top.title}”`);
    if (!top || top.effective < 0.2) why.push("No recent premise collision");
    const rejected = input.matches.find((m) => m.kind === "rejected" && m.similarity >= 0.6);
    if (rejected) problems.push(`Close to an idea rejected before: “${rejected.title}”`);
  }

  if (input.usedSource) {
    adjustments.push({ label: "This post already became an idea", points: -50 });
    problems.push(`This post (or its original) already became “${input.usedSource}”`);
  }

  const canonish = input.classification === "CANON" || input.classification === "CANON_INSPIRED";
  if (input.canonCheckRequired || (canonish && input.canonConfidence < 0.6)) {
    if (canonish) adjustments.push({ label: "Canon claim not certain", points: -4 });
    problems.push(input.canonChecks.length ? `Canon check: ${input.canonChecks[0]}` : "A lore assumption needs verifying");
  }
  if (!canonish) problems.push(`Based on fan interpretation (${input.classification.replace(/_/g, " ").toLowerCase()})`);
  if (input.engines.includes("fourth_wall_meta")) adjustments.push({ label: "Meta concepts are easy to overuse", points: -3 });

  for (const w of input.whyItWorks.slice(0, 3)) if (!why.includes(w)) why.push(w);
  for (const w of input.warnings.slice(0, 3)) if (!problems.includes(w)) problems.push(w);

  const score = Math.max(0, Math.min(100, Math.round(base + adjustments.reduce((n, a) => n + a.points, 0))));
  return { score, base: Math.round(base), parts, adjustments, why: why.slice(0, 7), problems: problems.slice(0, 7), similarity, engagement };
}

/** A post that only had the quick look: 0–35, so every fully analysed idea ranks above it. */
export function triageScore(potential: number): number {
  return Math.round(clamp01(potential) * 35);
}
