/**
 * Story Lab, stored: each Stories channel's focus when it's set by hand, the
 * ideas Claude has written for each channel, and each time it was asked.
 * Keyed by channel id, so a rename in Settings loses nothing.
 */
import { pool } from "./pool.js";
import { dateIn, ORG_TZ } from "../parse/derive.js";
import type { FocusKind, SetFocus } from "../web/stories/domain.js";

const KINDS: Array<FocusKind | "any"> = ["lead", "hero", "franchise", "format", "genre", "any"];

/** Every channel's focus set by hand, by channel id. */
export async function listFocus(): Promise<Map<string, SetFocus>> {
  const { rows } = await pool.query("SELECT channel_id, kind, value, note FROM story_focus");
  return new Map(
    rows.map((r) => [
      String(r.channel_id),
      { kind: KINDS.includes(r.kind) ? (r.kind as SetFocus["kind"]) : null, value: (r.value as string) ?? null, note: (r.note as string) ?? null },
    ]),
  );
}

/** Set a channel's focus (null: read it from its videos again) and its note. */
export async function setFocus(channelId: string, focus: { kind: FocusKind | "any"; value: string | null } | null, note: string | null): Promise<void> {
  const kind = focus && KINDS.includes(focus.kind) ? focus.kind : null;
  const value = kind && kind !== "any" ? (focus!.value ?? "").slice(0, 80) || null : null;
  const cleanNote = note?.replace(/\s+/g, " ").trim().slice(0, 600) || null;
  if (!kind && !cleanNote) {
    await pool.query("DELETE FROM story_focus WHERE channel_id = $1", [channelId]);
    return;
  }
  await pool.query(
    `INSERT INTO story_focus (channel_id, kind, value, note, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (channel_id) DO UPDATE SET kind = $2, value = $3, note = $4, updated_at = now()`,
    [channelId, kind === "any" || value ? kind : null, value, cleanNote],
  );
}

// ── Claude's ideas ──────────────────────────────────────────────────────────

export interface AiIdeaRow {
  id: number;
  channelId: string;
  title: string;
  premise: string;
  beats: string[];
  why: string;
  modelledOn: string[];
  model: string | null;
  createdAt: Date;
}

const ideaOf = (r: Record<string, unknown>): AiIdeaRow => ({
  id: Number(r.id),
  channelId: String(r.channel_id),
  title: String(r.title),
  premise: String(r.premise ?? ""),
  beats: Array.isArray(r.beats) ? (r.beats as unknown[]).map(String) : [],
  why: String(r.why ?? ""),
  modelledOn: Array.isArray(r.modelled_on) ? (r.modelled_on as unknown[]).map(String) : [],
  model: (r.model as string) ?? null,
  createdAt: r.created_at as Date,
});

/** Claude's ideas still in play: not dropped, written in the last 90 days. */
export async function listAiIdeas(): Promise<AiIdeaRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM lab_ai_ideas WHERE dropped_at IS NULL AND created_at > now() - interval '90 days' ORDER BY created_at DESC, id DESC",
  );
  return rows.map(ideaOf);
}

export async function addAiIdeas(
  channelId: string,
  ideas: Array<{ title: string; premise: string; beats: string[]; why: string; modelledOn: string[] }>,
  model: string | null,
): Promise<number[]> {
  const ids: number[] = [];
  for (const i of ideas) {
    const { rows } = await pool.query(
      `INSERT INTO lab_ai_ideas (channel_id, title, premise, beats, why, modelled_on, model) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [channelId, i.title, i.premise, JSON.stringify(i.beats), i.why, JSON.stringify(i.modelledOn), model],
    );
    ids.push(Number(rows[0].id));
  }
  return ids;
}

/** Out of play for good: it turned out to repeat a video, or no longer fits the channel. */
export async function dropAiIdea(id: number, reason: string): Promise<void> {
  await pool.query("UPDATE lab_ai_ideas SET dropped_at = now(), drop_reason = $2 WHERE id = $1 AND dropped_at IS NULL", [id, reason.slice(0, 300)]);
}

/** Set aside every idea still in play for a channel (its focus changed): returns how many. */
export async function dropChannelIdeas(channelId: string, reason: string): Promise<number> {
  const { rowCount } = await pool.query("UPDATE lab_ai_ideas SET dropped_at = now(), drop_reason = $2 WHERE channel_id = $1 AND dropped_at IS NULL", [channelId, reason]);
  return rowCount ?? 0;
}

export async function recordAiRun(r: { channelId: string; ok: boolean; error?: string; kept: number; dropped: number; input: number; output: number; cacheRead: number }): Promise<void> {
  await pool.query(
    `INSERT INTO lab_ai_runs (channel_id, ok, error, kept, dropped, input_tokens, output_tokens, cache_read) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r.channelId, r.ok, r.error?.slice(0, 500) ?? null, r.kept, r.dropped, r.input, r.output, r.cacheRead],
  );
}

export interface AiRunSummary {
  /** Today's calls (ET), the ideas kept from them, and the tokens. */
  calls: number;
  kept: number;
  input: number;
  output: number;
  cacheRead: number;
  /** Each channel's last call: when, and why it failed if it did. */
  last: Map<string, { at: Date; ok: boolean; error: string | null; kept: number }>;
}

export async function aiRunSummary(): Promise<AiRunSummary> {
  const today = dateIn(ORG_TZ);
  const [day, last] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(kept), 0) AS kept, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output, COALESCE(SUM(cache_read), 0) AS cache
         FROM lab_ai_runs WHERE (at AT TIME ZONE $1)::date = $2::date`,
      [ORG_TZ, today],
    ),
    pool.query("SELECT DISTINCT ON (channel_id) channel_id, at, ok, error, kept FROM lab_ai_runs ORDER BY channel_id, at DESC"),
  ]);
  const d = day.rows[0] ?? {};
  return {
    calls: Number(d.calls ?? 0),
    kept: Number(d.kept ?? 0),
    input: Number(d.input ?? 0),
    output: Number(d.output ?? 0),
    cacheRead: Number(d.cache ?? 0),
    last: new Map(last.rows.map((r) => [String(r.channel_id), { at: r.at as Date, ok: Boolean(r.ok), error: (r.error as string) ?? null, kept: Number(r.kept ?? 0) }])),
  };
}
