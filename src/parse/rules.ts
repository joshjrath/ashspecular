import type { Extraction } from "./schema.js";

const URL_RE = /https?:\/\/[^\s<>()\[\]"']+/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  // Strip trailing punctuation that commonly rides along in chat messages.
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

/**
 * The domain itself or any subdomain of it — never a lookalike. A substring
 * check would accept "notframe.io"; this does not.
 */
function hostIs(host: string, ...domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function classifyUrl(url: string): Extraction["links"][number]["kind"] {
  const host = safeHost(url);
  // f.io is Frame.io's share-link shortener — the form links usually arrive in
  // when someone hits "copy link". next.frame.io and app.frame.io are covered
  // as subdomains.
  if (hostIs(host, "frame.io", "f.io")) return "frameio";
  if (hostIs(host, "youtube.com", "youtu.be")) return "youtube";
  if (hostIs(host, "drive.google.com")) return "drive";
  if (hostIs(host, "docs.google.com")) return "docs";
  if (hostIs(host, "notion.so", "notion.site")) return "notion";
  if (hostIs(host, "dropbox.com")) return "dropbox";
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
