/**
 * Tumblr, source provider #1, through its official API (v2) — no scraping.
 *
 * What the API allows, and how this uses it:
 *
 *   /tagged?tag=…     the newest posts with a tag, 20 a call, paged back with
 *                     `before` (a "featured" tag pages by featured_timestamp).
 *                     One tag per call: there is no keyword search in the API,
 *                     so every "search" is a tag.
 *   /blog/{b}/posts?id=…   one post by id (a link pasted in by hand), in NPF.
 *   /blog/{b}/notes?id=…&mode=conversation   likes and reblogs counted apart.
 *
 * Every call needs an API key: the OAuth consumer key of an app registered at
 * tumblr.com/oauth/apps, set as TUMBLR_API_KEY. A key is limited to 1,000
 * calls an hour and 5,000 a day (and a 429 when either is hit), which is why
 * the poller budgets its calls and reads each tag only as often as it posts.
 */
import type { RawSource } from "./types.js";
import { htmlToText, imagesIn } from "./html.js";

type Fetcher = typeof fetch;

export const tumblrBase = () => (process.env.TUMBLR_API_BASE?.trim() || "https://api.tumblr.com/v2").replace(/\/+$/, "");
export const tumblrKey = () => process.env.TUMBLR_API_KEY?.trim() || "";

export class TumblrError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSec: number | null = null) {
    super(message);
  }
}

async function call(path: string, params: Record<string, string>, fetcher: Fetcher): Promise<unknown> {
  const key = tumblrKey();
  if (!key) throw new TumblrError("No Tumblr API key: set TUMBLR_API_KEY.", 401);
  const u = new URL(`${tumblrBase()}${path}`);
  u.search = new URLSearchParams({ ...params, api_key: key }).toString();
  let res: Response;
  try {
    res = await fetcher(u, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
  } catch {
    throw new TumblrError("Couldn't reach Tumblr.", 0);
  }
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    throw new TumblrError("Tumblr's rate limit was reached.", 429, Number.isFinite(after) && after > 0 ? after : null);
  }
  if (res.status === 401 || res.status === 403) throw new TumblrError("Tumblr didn't accept the API key — check TUMBLR_API_KEY.", res.status);
  if (res.status === 404) throw new TumblrError("Tumblr has no post there (deleted, private, or a wrong link).", 404);
  if (!res.ok) throw new TumblrError(`Tumblr answered ${res.status}.`, res.status);
  const data = (await res.json().catch(() => null)) as { response?: unknown } | null;
  if (!data || data.response === undefined) throw new TumblrError("Tumblr sent something unreadable.", res.status);
  return data.response;
}

/** One page of a tag: the newest first, or those before a timestamp. Legacy format. */
export async function fetchTagged(tag: string, before: number | null, fetcher: Fetcher = fetch): Promise<Record<string, unknown>[]> {
  const response = await call("/tagged", { tag, limit: "20", ...(before ? { before: String(before) } : {}) }, fetcher);
  const posts = Array.isArray(response) ? response : ((response as { posts?: unknown[] }).posts ?? []);
  return posts.filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object");
}

/** One post by blog and id, in NPF (every post can be read as NPF). */
export async function fetchPost(blog: string, id: string, fetcher: Fetcher = fetch): Promise<Record<string, unknown> | null> {
  const response = (await call(`/blog/${encodeURIComponent(blog)}/posts`, { id, npf: "true", reblog_info: "true" }, fetcher)) as { posts?: unknown[] };
  const post = response.posts?.[0];
  return post && typeof post === "object" ? (post as Record<string, unknown>) : null;
}

/** Likes and reblogs apart, and replies when the first page holds them all. */
export async function fetchNoteCounts(blog: string, id: string, fetcher: Fetcher = fetch): Promise<{ likes: number | null; reblogs: number | null; replies: number | null }> {
  const r = (await call(`/blog/${encodeURIComponent(blog)}/notes`, { id, mode: "conversation" }, fetcher)) as {
    notes?: Array<{ type?: string }>; total_notes?: number; total_likes?: number; total_reblogs?: number;
  };
  const notes = r.notes ?? [];
  const complete = typeof r.total_notes === "number" && r.total_notes <= notes.length;
  return {
    likes: typeof r.total_likes === "number" ? r.total_likes : null,
    reblogs: typeof r.total_reblogs === "number" ? r.total_reblogs : null,
    replies: complete ? notes.filter((n) => n.type === "reply").length : null,
  };
}

/** Where to page back to from a page of posts: the oldest timestamp on it (featured tags page by featured_timestamp). */
export function oldestStamp(posts: Record<string, unknown>[]): number | null {
  const stamps = posts.map((p) => Number(p.featured_timestamp ?? p.timestamp)).filter((n) => Number.isFinite(n) && n > 0);
  return stamps.length ? Math.min(...stamps) : null;
}

// ── links ──────────────────────────────────────────────────────────────────

/**
 * A pasted Tumblr link → its blog and post id. Every shape Tumblr uses:
 * tumblr.com/{blog}/{id}/slug, {blog}.tumblr.com/post/{id}/slug,
 * tumblr.com/blog/view/{blog}/{id}, and a custom domain's /post/{id}.
 */
export function parseTumblrUrl(raw: string): { blog: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const isId = (s: string | undefined) => Boolean(s && /^\d{5,}$/.test(s));
  if (host === "tumblr.com") {
    if (parts[0] === "blog" && parts[1] === "view" && parts[2] && isId(parts[3])) return { blog: parts[2], id: parts[3]! };
    if (parts[0] && parts[0] !== "tagged" && parts[0] !== "search" && isId(parts[1])) return { blog: parts[0], id: parts[1]! };
    return null;
  }
  if (host.endsWith(".tumblr.com")) {
    const blog = host.slice(0, -".tumblr.com".length);
    if (parts[0] === "post" && isId(parts[1])) return { blog, id: parts[1]! };
    if (isId(parts[0])) return { blog, id: parts[0]! };
    return null;
  }
  // A blog on its own domain still uses /post/{id}.
  if (parts[0] === "post" && isId(parts[1])) return { blog: host, id: parts[1]! };
  return null;
}

export const tumblrPostUrl = (blog: string, id: string) => `https://www.tumblr.com/${blog}/${id}`;

// ── reading posts ──────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => Boolean(x) && typeof x === "object") : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** The image size nearest 640 wide (large enough to read, small enough to load), else the largest. */
function pickSize(sizes: Obj[]): { url: string; width?: number; height?: number } | null {
  const ok = sizes.filter((s) => str(s.url));
  if (!ok.length) return null;
  const ranked = [...ok].sort((a, b) => Math.abs((num(a.width) ?? 640) - 640) - Math.abs((num(b.width) ?? 640) - 640));
  const s = ranked.find((x) => (num(x.width) ?? 640) >= 400) ?? ranked[0]!;
  return { url: str(s.url), width: num(s.width) ?? undefined, height: num(s.height) ?? undefined };
}

function addMedia(out: RawSource["media"], m: { url: string; width?: number; height?: number; alt?: string } | null): void {
  if (m && /^https?:\/\//i.test(m.url) && !out.some((x) => x.url === m.url) && out.length < 10) out.push(m);
}

/** A post from /tagged (legacy format) as a RawSource. */
export function fromLegacy(p: Obj): RawSource | null {
  const id = str(p.id_string) || str(p.id);
  if (!id) return null;
  const blog = str(p.blog_name) || str((p.blog as Obj | undefined)?.name);
  const type = str(p.type) || "text";
  const media: RawSource["media"] = [];
  const html: string[] = [];

  // The post's own content, by type.
  let own = "";
  switch (type) {
    case "photo":
      own = htmlToText(str(p.caption));
      html.push(str(p.caption));
      for (const ph of arr(p.photos)) {
        addMedia(media, pickSize([...(ph.original_size ? [ph.original_size as Obj] : []), ...arr(ph.alt_sizes)]));
      }
      break;
    case "quote":
      own = `“${htmlToText(str(p.text))}”${str(p.source) ? ` — ${htmlToText(str(p.source))}` : ""}`;
      break;
    case "link":
      own = [str(p.title), str(p.url), htmlToText(str(p.description))].filter(Boolean).join("\n");
      html.push(str(p.description));
      break;
    case "chat": {
      const lines = arr(p.dialogue).map((d) => `${str(d.name) || str(d.label)} ${str(d.phrase)}`.trim()).filter(Boolean);
      own = lines.length ? lines.join("\n") : htmlToText(str(p.body));
      break;
    }
    case "answer":
      own = `${str(p.asking_name) || "Anonymous"} asked: ${htmlToText(str(p.question))}\n\n${htmlToText(str(p.answer))}`;
      html.push(str(p.question), str(p.answer));
      break;
    case "video":
    case "audio":
      own = [htmlToText(str(p.caption)), str(p.track_name), str(p.artist)].filter(Boolean).join("\n");
      html.push(str(p.caption));
      if (str(p.thumbnail_url)) addMedia(media, { url: str(p.thumbnail_url) });
      break;
    default:
      own = [str(p.title), htmlToText(str(p.body))].filter(Boolean).join("\n\n");
      html.push(str(p.body));
  }

  // A reblog's trail: each voice in order, oldest first — the chain is often the joke.
  const trail = arr(p.trail);
  const voices = trail
    .map((t) => ({
      blog: str((t.blog as Obj | undefined)?.name) || "someone",
      id: str((t.post as Obj | undefined)?.id),
      text: htmlToText(str(t.content_raw) || str(t.content)),
      html: str(t.content_raw) || str(t.content),
      root: t.is_root_item === true,
      current: t.is_current_item === true,
    }))
    .filter((v) => v.text || v.html);
  for (const v of voices) for (const src of imagesIn(v.html)) addMedia(media, { url: src });
  for (const h of html) for (const src of imagesIn(h)) addMedia(media, { url: src });

  const rootVoice = voices.find((v) => v.root) ?? null;
  const rootId = str(p.reblogged_root_id) || rootVoice?.id || id;
  const isReblog = rootId !== id || Boolean(str(p.parent_post_url)) || Boolean(str(p.reblogged_from_id));
  const current = voices.find((v) => v.current && !v.root);
  const addedText = isReblog ? (current?.text || htmlToText(str((p.reblog as Obj | undefined)?.comment)) || null) : null;

  let body = own;
  if (voices.length) {
    const chain = voices.map((v) => `${v.blog}: ${v.text}`).join("\n\n");
    // An ask or a quote keeps its own lead-in; the trail carries the rest.
    body = type === "answer" ? `${str(p.asking_name) || "Anonymous"} asked: ${htmlToText(str(p.question))}\n\n${chain}` : chain;
  }

  return {
    provider: "tumblr",
    externalId: id,
    url: str(p.post_url) || tumblrPostUrl(blog, id),
    author: blog || null,
    authorUrl: blog ? `https://www.tumblr.com/${blog}` : null,
    postedAt: num(p.timestamp) ? new Date(num(p.timestamp)! * 1000) : null,
    postType: type,
    title: str(p.title) || null,
    body: body.trim(),
    media,
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(str).filter(Boolean).slice(0, 60) : [],
    notes: num(p.note_count),
    rootKey: `tumblr:${rootId}`,
    isReblog,
    addedText: addedText?.trim() || null,
    raw: p,
  };
}

/** NPF content blocks as text and images, with an ask's asker named. */
function npfText(content: Obj[], layout: Obj[], media: RawSource["media"]): string {
  const askBlocks = new Map<number, string>();
  for (const l of layout) {
    if (str(l.type) !== "ask") continue;
    const who = str(((l.attribution as Obj | undefined)?.blog as Obj | undefined)?.name) || "Anonymous";
    for (const i of Array.isArray(l.blocks) ? (l.blocks as unknown[]) : []) if (typeof i === "number") askBlocks.set(i, who);
  }
  const lines: string[] = [];
  let asked = false;
  content.forEach((b, i) => {
    const type = str(b.type);
    let line = "";
    if (type === "text") line = str(b.subtype) === "quote" ? `“${str(b.text)}”` : str(b.text);
    else if (type === "image") {
      addMedia(media, pickSize(arr(b.media)) ? { ...pickSize(arr(b.media))!, alt: str(b.alt_text) || undefined } : null);
      if (str(b.alt_text)) line = `[image: ${str(b.alt_text)}]`;
    } else if (type === "link") line = [str(b.title), str(b.url), str(b.description)].filter(Boolean).join(" — ");
    else if (type === "video") {
      const poster = pickSize(arr(b.poster));
      if (poster) addMedia(media, poster);
      line = str(b.url) ? `[video: ${str(b.url)}]` : "[video]";
    } else if (type === "audio") line = `[audio: ${[str(b.title), str(b.artist)].filter(Boolean).join(" — ")}]`;
    if (!line) return;
    const who = askBlocks.get(i);
    if (who && !asked) {
      lines.push(`${who} asked: ${line}`);
      asked = true;
    } else lines.push(line);
  });
  return lines.join("\n");
}

/** A post from /posts?npf=true as a RawSource. */
export function fromNpf(p: Obj): RawSource | null {
  const id = str(p.id_string) || str(p.id);
  if (!id) return null;
  const blog = str(p.blog_name) || str((p.blog as Obj | undefined)?.name);
  const media: RawSource["media"] = [];
  const trail = arr(p.trail).map((t) => ({
    blog: str((t.blog as Obj | undefined)?.name) || str(t.broken_blog_name) || "someone",
    id: str((t.post as Obj | undefined)?.id),
    text: npfText(arr(t.content), arr(t.layout), media),
  }));
  const own = npfText(arr(p.content), arr(p.layout), media);
  const voices = [...trail.filter((t) => t.text), ...(own ? [{ blog: blog || "someone", id, text: own }] : [])];
  const rootId = trail[0]?.id || id;
  const isReblog = trail.length > 0 || Boolean(str(p.parent_post_id));
  return {
    provider: "tumblr",
    externalId: id,
    url: str(p.post_url) || tumblrPostUrl(blog, id),
    author: blog || null,
    authorUrl: blog ? `https://www.tumblr.com/${blog}` : null,
    postedAt: num(p.timestamp) ? new Date(num(p.timestamp)! * 1000) : null,
    postType: str(p.original_type) || (media.length && !own ? "photo" : "text"),
    title: null,
    body: (voices.length > 1 || isReblog ? voices.map((v) => `${v.blog}: ${v.text}`).join("\n\n") : own).trim(),
    media,
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(str).filter(Boolean).slice(0, 60) : [],
    notes: num(p.note_count),
    rootKey: `tumblr:${rootId}`,
    isReblog,
    addedText: isReblog && own ? own : null,
    raw: p,
  };
}
