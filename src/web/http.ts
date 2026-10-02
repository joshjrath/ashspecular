/**
 * What every route shares about requests and responses: where a redirect
 * may send someone, and how a failure is answered.
 *
 * Redirect targets come from the request (a form's `back` field, the Referer
 * header), so they are never trusted as they are: only a path on this site
 * is kept. "//other.site" and "/\other.site" are paths to a browser's eye
 * but send it to another site, so they are refused like any full URL.
 */

/** A path on this site, or the fallback. */
export function localPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // Control characters (a CR/LF among them) never belong in a Location header.
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}

/** The page someone came from — its path and query only, never its host — or the fallback. */
export function refererPath(referer: string | undefined, fallback: string): string {
  if (!referer) return fallback;
  try {
    const url = new URL(referer, "http://internal");
    return localPath(url.pathname + url.search, fallback);
  } catch {
    return fallback;
  }
}

/**
 * A Content-Disposition header for a file someone uploaded. Header values
 * must be Latin-1, so the plain `filename` is reduced to ASCII and the real
 * name rides along encoded (RFC 6266), which every current browser prefers.
 */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "").trim() || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
