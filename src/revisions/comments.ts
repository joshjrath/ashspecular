/**
 * Frame.io comments, two ways in.
 *
 *   Pasted     Frame.io's own export (Comments panel → ⋯ → Export → CSV or
 *              plain text), or comments copied off the page. Read as CSV when
 *              it has a Comment column, otherwise note by note.
 *   The API    with FRAMEIO_TOKEN set (a Frame.io developer token): the
 *              comments on the link's file, every version in its stack.
 *              Legacy review links (app.frame.io/reviews/…), players
 *              (…/player/<id>) and f.io short links that lead to them.
 */
import { inspectFrameLink } from "../parse/frameio.js";
import type { RevComment } from "./score.js";

const TIMECODE = /^\s*(?:#\s*\d+\s*[.:)-]?\s*)?\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[:;.]\d{2})?)\]?\s*[-–—:|]?\s*/;

/** One CSV line into its cells, quotes and all. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Split CSV text into records, keeping newlines inside quotes. */
function csvRows(text: string): string[][] {
  const rows: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    if (ch === "\n" && !q) { rows.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) rows.push(cur);
  return rows.filter((r) => r.trim()).map(cells);
}

/** Pasted comments into notes. */
export function parsePasted(text: string): RevComment[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  const first = clean.split("\n")[0]!;
  if (/,/.test(first) && /\bcomment\b/i.test(first)) {
    const [head, ...rows] = csvRows(clean);
    const col = (re: RegExp) => head!.findIndex((h) => re.test(h));
    const ci = col(/^(comment|comment text|text|body)$/i) >= 0 ? col(/^(comment|comment text|text|body)$/i) : col(/comment/i);
    const ai = col(/commenter|author|name|user/i);
    const ti = col(/timecode|timestamp|time/i);
    const vi = col(/version/i);
    return rows
      .map((r) => ({
        text: (r[ci] ?? "").trim(),
        author: ai >= 0 ? r[ai] || null : null,
        timecode: ti >= 0 ? r[ti] || null : null,
        version: vi >= 0 ? Number(String(r[vi]).replace(/\D/g, "")) || null : null,
        source: "pasted" as const,
      }))
      .filter((c) => c.text);
  }
  // Blank lines between notes: a note is a block. Otherwise a note is a line.
  const blocks = /\n\s*\n/.test(clean) ? clean.split(/\n\s*\n/) : clean.split("\n");
  const out: RevComment[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let timecode: string | null = null;
    let author: string | null = null;
    const body: string[] = [];
    for (const line of lines) {
      const m = TIMECODE.exec(line);
      let rest = line;
      if (m && !timecode) {
        timecode = m[1]!;
        rest = line.slice(m[0].length).trim();
        // "00:01:23  Josh" — a header line: the name, then the note below it.
        if (rest && lines.length > 1 && rest.split(/\s+/).length <= 3 && !/[.!?]/.test(rest)) {
          author = rest;
          continue;
        }
      }
      rest = rest.replace(/^#\s*\d+\s*[.:)-]?\s*/, "").replace(/^[-•*]\s+/, "");
      if (rest) body.push(rest);
    }
    const note = body.join(" ").trim();
    if (note.length >= 2) out.push({ text: note, author, timecode, source: "pasted" });
  }
  return out;
}

/** Split your own summary into notes of its own: a sentence or a line each. */
export function ownNotes(summary: string): RevComment[] {
  return summary
    .replace(/\r\n?/g, "\n")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[-•*]\s+/, "").trim())
    .filter((s) => s.length >= 4)
    .map((text) => ({ text, source: "you" as const }));
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type ApiRead = { ok: true; comments: RevComment[]; versions: number } | { ok: false; error: string };

/**
 * The comments behind a Frame.io link, through the API. Every version in the
 * file's stack counts: v1's notes are part of what the video needed.
 */
export async function commentsFromFrameio(url: string, token = process.env.FRAMEIO_TOKEN?.trim(), fetcher: Fetcher = fetch): Promise<ApiRead> {
  if (!token) return { ok: false, error: "No Frame.io token is set (FRAMEIO_TOKEN), so the comments can't be read from Frame.io. Paste them instead." };
  const api = async (path: string) => {
    const res = await fetcher(`https://api.frame.io/v2${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error("Frame.io refused the token for this link.");
    if (res.status === 404) throw new Error("Frame.io says that link or file doesn't exist.");
    if (!res.ok) throw new Error(`Frame.io answered ${res.status}.`);
    return res.json() as Promise<unknown>;
  };
  try {
    // A short link first becomes the page it points to.
    const final = /(^|\.)f\.io$/i.test(new URL(url).hostname) ? (await inspectFrameLink(url, fetcher as never))?.finalUrl ?? url : url;
    const path = new URL(final).pathname;
    let assetIds: string[] = [];
    const review = /\/reviews\/([0-9a-f-]{8,})/i.exec(path);
    const player = /\/player\/([0-9a-f-]{36})/i.exec(path);
    if (review) {
      const items = (await api(`/review_links/${review[1]}/items`)) as Array<{ asset_id?: string; asset?: { id: string } }>;
      assetIds = items.map((i) => i.asset_id ?? i.asset?.id).filter((x): x is string => Boolean(x));
    } else if (player) {
      assetIds = [player[1]!];
    } else {
      return { ok: false, error: "That kind of Frame.io link can't be read through the API yet. Paste the comments instead." };
    }
    if (!assetIds.length) return { ok: false, error: "The link has no files in it." };
    const comments: RevComment[] = [];
    let versions = 1;
    for (const id of assetIds.slice(0, 5)) {
      const asset = (await api(`/assets/${id}`)) as { type?: string; name?: string };
      // A version stack: every version's comments, oldest first.
      let files: Array<{ id: string; name?: string }> = [{ id, name: asset.name }];
      if (asset.type === "version_stack") {
        files = (await api(`/assets/${id}/children`)) as Array<{ id: string; name?: string }>;
        versions = Math.max(versions, files.length);
      }
      for (const [i, f] of files.entries()) {
        const list = (await api(`/assets/${f.id}/comments?include_replies=true`)) as Array<{
          text?: string; timestamp?: number | null; owner?: { name?: string }; replies?: Array<{ text?: string }>;
        }>;
        for (const c of list) {
          if (!c.text?.trim()) continue;
          const t = typeof c.timestamp === "number" ? c.timestamp : null;
          comments.push({
            text: c.text.trim(),
            author: c.owner?.name ?? null,
            timecode: t === null ? null : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`,
            version: files.length > 1 ? i + 1 : null,
            source: "frameio",
          });
        }
      }
    }
    return { ok: true, comments, versions };
  } catch (err) {
    return { ok: false, error: `${err instanceof Error ? err.message : "Frame.io couldn't be read."} Paste the comments instead.` };
  }
}
