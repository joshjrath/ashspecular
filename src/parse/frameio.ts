/**
 * Reading a Frame.io link without the Frame.io API.
 *
 * A shared Frame.io link is a public web page, and like any page that unfurls
 * in Slack or iMessage it carries its own name in the page itself: the
 * Open Graph title, the <title>, and the file names in the data the page is
 * built from. That is the one thing a forwarded link usually lacks — "which
 * video is this?" — and the file name answers it: "VIDEO-012_Walter_White_v3.mp4"
 * is a code, a title and a version.
 *
 * So the bot opens the link the way a link preview does, follows the f.io
 * short link to wherever it goes, and reads:
 *
 *   - where it ends up, and what kind of link that is
 *   - the asset's name, from the page's preview tags or the file names in it
 *   - whether it is private (a login wall), expired, or password protected
 *
 * Everything here is best effort and bounded: Frame.io hosts only, at most
 * five redirects, six seconds, the first 1.5 MB. Nothing it finds overrides
 * what the message itself says — it only fills what the message left out.
 */
import { CATEGORIES, matchChannel } from "../catalog.js";
import type { Extraction } from "./schema.js";

export interface FrameInfo {
  /** Where the link ended up after the short link's redirects. */
  finalUrl: string;
  /** Review link, share, presentation, player… from the path. */
  linkType: string | null;
  /** The asset's own name as the page gives it — usually the file name. */
  name: string | null;
  /** Every distinct media file name found in the page, first one first. */
  files: string[];
  /** The preview description, when the page has one. */
  description: string | null;
  status: "ok" | "private" | "expired" | "password" | "unreadable";
}

export interface FrameFacts {
  code: string | null;
  version: number | null;
  title: string | null;
  channel: string | null;
  category: string | null;
}

const MEDIA = "mp4|mov|m4v|mxf|webm|avi|mkv|wav|mp3|aif|aiff|m4a|pdf|png|jpe?g|gif|psd|tiff?|srt|vtt|prproj|aep";
const FILE_RE = new RegExp(`[\\w][\\w .,'&()+\\-]{0,140}?\\.(?:${MEDIA})\\b`, "gi");

function isFrameHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["frame.io", "f.io"].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** The kind of link, from the shape of its path. */
export function frameLinkType(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (path.startsWith("/reviews/") || path.startsWith("/r/")) return "review link";
  if (path.startsWith("/share/")) return "share link";
  if (path.startsWith("/presentations/")) return "presentation";
  if (path.startsWith("/player/")) return "player link";
  if (path.startsWith("/projects/")) return "project link";
  return null;
}

/** HTML entities and JSON escapes, enough to read names out of a page. */
function unescape(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function meta(html: string, key: string): string | null {
  // Attribute order varies: property before content, or after.
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const hit = html.match(a)?.[1] ?? html.match(b)?.[1];
  return hit ? unescape(hit).trim() || null : null;
}

/** "Frame.io | VIDEO-012 v3.mp4" and friends → just the asset's name. */
function stripBrand(s: string | null): string | null {
  if (!s) return null;
  const out = s
    .replace(/\s*[|\-–—:]\s*frame\.io\s*$/i, "")
    .replace(/^\s*frame\.io\s*[|\-–—:]\s*/i, "")
    .trim();
  if (!out || /^frame\.io$/i.test(out) || /^(review|presentation|share)$/i.test(out)) return null;
  if (/^(log ?in|sign ?in|welcome)/i.test(out)) return null;
  return out;
}

/**
 * Read a page that has already been fetched. Separate from the fetch so it
 * can be tested against saved pages.
 */
export function readFramePage(html: string, finalUrl: string): FrameInfo {
  const text = unescape(html);
  const lower = text.toLowerCase();
  const linkType = frameLinkType(finalUrl);

  const loginWall =
    /accounts\.frame\.io|\/login\b|\/sign[-_]?in\b/i.test(finalUrl) ||
    /<title>[^<]*(log ?in|sign ?in)[^<]*<\/title>/i.test(html);
  const expired = /(link|review|share)[^.<]{0,40}(has )?expired|no longer (available|active)/i.test(lower);
  const password = /password[- ]protected|enter (the )?password|requires a password/i.test(lower);

  const ogTitle = stripBrand(meta(html, "og:title") ?? meta(html, "twitter:title"));
  const pageTitle = stripBrand(unescape(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || null);
  const description = meta(html, "og:description") ?? meta(html, "description");

  const files: string[] = [];
  for (const m of text.matchAll(FILE_RE)) {
    const f = m[0].trim().replace(/^[\s"'>(]+/, "");
    // A bare "image.png" or an asset path of the page's own is not a video.
    if (f.length < 5 || /^(favicon|logo|icon|og-image|apple-touch|sprite|thumbnail|poster)\b/i.test(f)) continue;
    if (/[/\\]/.test(f)) continue;
    if (!files.includes(f)) files.push(f);
    if (files.length >= 10) break;
  }

  const name = ogTitle ?? pageTitle ?? files[0] ?? null;
  const status: FrameInfo["status"] = expired
    ? "expired"
    : password
      ? "password"
      : loginWall && !name
        ? "private"
        : name || files.length
          ? "ok"
          : "unreadable";

  return { finalUrl, linkType, name: status === "private" ? null : name, files, description, status };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Open a Frame.io link and read it. Null when it isn't Frame.io or can't be reached. */
export async function inspectFrameLink(
  url: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 6000,
): Promise<FrameInfo | null> {
  if (!isFrameHost(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= 5; hop += 1) {
      const res = await fetcher(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Pages serve their preview tags to link unfurlers; ask as one.
          "User-Agent": "Mozilla/5.0 (compatible; SpecularBoard/1.0; +link-preview) facebookexternalhit/1.1 Slackbot-LinkExpanding",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) {
        const target = new URL(next, current).toString();
        // Only ever follow Frame.io to Frame.io.
        if (!isFrameHost(target)) {
          return { finalUrl: target, linkType: null, name: null, files: [], description: null, status: "unreadable" };
        }
        current = target;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        return { finalUrl: current, linkType: frameLinkType(current), name: null, files: [], description: null, status: "private" };
      }
      if (res.status === 404 || res.status === 410) {
        return { finalUrl: current, linkType: frameLinkType(current), name: null, files: [], description: null, status: "expired" };
      }
      if (!res.ok) return null;
      return readFramePage(await readCapped(res, 1_500_000), current);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, limit: number): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const CODE_PREFIXES = CATEGORIES.map((c) => c.codePrefix);
const STAGE_WORDS =
  /\b(final|draft|rough(\s*cut)?|fine\s*cut|export(ed)?|render(ed)?|master|edit|cut|revision|rev|review|wip|colou?r(\s*graded)?|graded|mix|upload|h264|h265|prores|1080p?|2160p?|4k|720p?)\b/gi;

/**
 * What a file name says: "VIDEO-012_Walter_White_Build_Compound_V_v3_FINAL.mp4"
 * → VIDEO-012, version 3, "Walter White Build Compound V". The code is only
 * taken when its prefix is one the studio uses, so "MP4-2024" is not a code.
 */
export function factsFromName(name: string): FrameFacts {
  let s = name.replace(new RegExp(`\\.(?:${MEDIA})$`, "i"), "");
  s = s.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  const codeRe = new RegExp(`\\b(${CODE_PREFIXES.join("|")})[\\s._-]?(\\d{2,4})\\b`, "i");
  const codeHit = s.match(codeRe);
  const code = codeHit ? `${codeHit[1]!.toUpperCase()}-${codeHit[2]}` : null;
  if (codeHit) s = s.replace(codeHit[0], " ");

  const versionRe = /\b(?:v|ver|version|rev|r)\s?\.?\s?0*(\d{1,2})\b/i;
  const versionHit = s.match(versionRe);
  const version = versionHit ? Number(versionHit[1]) : null;
  if (versionHit) s = s.replace(versionHit[0], " ");

  const channel = matchChannel(s);

  // The channel is its own field; it needn't lead the title too.
  const withoutChannel = channel
    ? s.replace(new RegExp(channel.name.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&"), "i"), " ")
    : s;
  const title = withoutChannel
    .replace(STAGE_WORDS, " ")
    .replace(/\b\d{1,2}[-.]\d{1,2}[-.]\d{2,4}\b/g, " ") // a date stamp
    .replace(/[-–—|·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    code,
    version,
    title: title.length >= 3 ? title : null,
    channel: channel?.name ?? null,
    category: channel?.category ?? null,
  };
}

/**
 * Fold what the link said into what the message said. The message wins: a
 * field is only filled when the message left it empty. The link's label
 * becomes the asset's name, and the note says what was read and from where.
 */
export function mergeFrame(extraction: Extraction, url: string, info: FrameInfo): Extraction {
  const out: Extraction = { ...extraction, links: extraction.links.map((l) => ({ ...l })) };
  const link = out.links.find((l) => l.url === url);
  const notes: string[] = [];

  if (info.status === "private") notes.push("Frame.io link is private (needs a login), so its name couldn't be read.");
  if (info.status === "expired") notes.push("Frame.io link looks expired or removed.");
  if (info.status === "password") notes.push("Frame.io link is password protected.");

  const name = info.name ?? info.files[0] ?? null;
  if (name) {
    const facts = factsFromName(name);
    if (link) link.label = name.length > 80 ? `${name.slice(0, 78)}…` : name;
    if (!out.code && facts.code) out.code = facts.code;
    if (!out.version && facts.version) out.version = facts.version;
    if (!out.title && facts.title) out.title = facts.title;
    if (!out.channel && facts.channel) {
      out.channel = facts.channel;
      if (out.category === "unknown" && facts.category) out.category = facts.category as Extraction["category"];
    }
    notes.push(`Frame.io: “${name}”${info.linkType ? ` (${info.linkType})` : ""}.`);
    // A name the studio's own way — code or channel in it — is as good as a
    // message that says so.
    if (facts.code || facts.channel) out.confidence = Math.max(out.confidence, 0.85);
  }

  if (notes.length) {
    // The "which project is this?" prompt is answered now that the link has named it.
    const kept = (out.note ?? "").replace(/Frame\.io review — which project is this\? Set the channel below\.\s*/i, "").trim();
    out.note = [kept, ...notes].filter(Boolean).join(" ");
  }
  return out;
}

/**
 * Read every Frame.io link in an extraction and fold in what they say.
 * FRAMEIO_LOOKUP=off turns it off, for running somewhere without internet.
 */
export async function enrichWithFrame(extraction: Extraction, fetcher?: Fetcher): Promise<Extraction> {
  if (process.env.FRAMEIO_LOOKUP?.trim().toLowerCase() === "off") return extraction;
  const urls = extraction.links.filter((l) => l.kind === "frameio").map((l) => l.url).slice(0, 3);
  let out = extraction;
  for (const url of urls) {
    const info = await inspectFrameLink(url, fetcher);
    if (info) out = mergeFrame(out, url, info);
  }
  return out;
}
