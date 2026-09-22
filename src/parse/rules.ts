import type { Extraction } from "./schema.js";

const URL_RE = /https?:\/\/[^\s<>()\[\]"']+/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  // Strip trailing punctuation that commonly rides along in chat messages.
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

export function classifyUrl(url: string): Extraction["links"][number]["kind"] {
  const host = safeHost(url);
  if (host.includes("frame.io")) return "frameio";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("drive.google.com")) return "drive";
  if (host.includes("docs.google.com")) return "docs";
  if (host.includes("notion.so") || host.includes("notion.site")) return "notion";
  if (host.includes("dropbox.com")) return "dropbox";
  return "other";
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Deterministic floor under the classifier: every URL present in the raw text
 * ends up on the item even if the model omitted one, and links keep the kind
 * the hostname actually implies rather than the model's guess.
 */
export function reconcileLinks(
  raw: string,
  modelLinks: Extraction["links"],
): Extraction["links"] {
  const byUrl = new Map<string, Extraction["links"][number]>();

  for (const link of modelLinks) {
    if (!/^https?:\/\//i.test(link.url)) continue;
    byUrl.set(link.url, { ...link, kind: classifyUrl(link.url) });
  }
  for (const url of extractUrls(raw)) {
    if (!byUrl.has(url)) {
      byUrl.set(url, { url, kind: classifyUrl(url), label: "link" });
    }
  }
  return [...byUrl.values()];
}

/** A bare Frame.io link with no other words is always a revision to look at. */
export function looksLikeBareRevision(raw: string): boolean {
  const urls = extractUrls(raw);
  if (urls.length === 0) return false;
  const withoutUrls = raw.replace(URL_RE, "").trim();
  return urls.some((u) => classifyUrl(u) === "frameio") && withoutUrls.length < 12;
}
