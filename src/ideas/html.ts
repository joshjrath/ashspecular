/**
 * Post HTML as plain text, and the images in it. Tumblr's legacy format
 * returns bodies and captions as HTML — paragraphs, quotes, inline images —
 * and the words and pictures are what matter, not the markup.
 */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Paragraphs and line breaks kept, every tag gone, entities decoded. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|blockquote|figure|ul|ol|pre|tr)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|blockquote|figure|ul|ol|pre|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Every image in some HTML: its src, in order, once each. */
export function imagesIn(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = decodeEntities(m[1]!);
    if (/^https?:\/\//i.test(src) && !out.includes(src)) out.push(src);
  }
  return out;
}

/** Text as a comparable fingerprint: lowercase words only, so the same post reposted reads the same. */
export function normaliseText(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
