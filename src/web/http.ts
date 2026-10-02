import type { FastifyRequest } from "fastify";
import type { CalendarMode } from "../db/records.js";
import { config } from "../config.js";

/**
 * What every route shares about requests and responses: where a redirect
 * may send someone, what a request asked for, and checking what it sent.
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

/** Whether a request asked for JSON back (the board's own fetches) rather than a page. */
export function wantsJson(request: FastifyRequest): boolean {
  return (request.headers.accept ?? "").includes("application/json") || request.headers["x-fetch"] === "1";
}

/**
 * Whether an Origin header names this board: the host the request came in
 * on, or PUBLIC_URL's. A default port (:80, :443) is the same host either way —
 * a browser leaves it out of Origin, a proxy may leave it in Host.
 */
export function originIsThisBoard(origin: string, request: FastifyRequest): boolean {
  const bare = (h: string) => h.trim().toLowerCase().replace(/:(80|443)$/, "");
  let host: string;
  try {
    host = bare(new URL(origin).host);
  } catch {
    return false;
  }
  const own = [request.headers.host, request.headers["x-forwarded-host"], config.publicUrl ? new URL(config.publicUrl).host : ""]
    .flatMap((h) => String(h ?? "").split(","))
    .map(bare)
    .filter(Boolean);
  return own.includes(host);
}

/** This board's own address: PUBLIC_URL, or what the request came in on. */
export function baseUrlOf(request: FastifyRequest): string {
  if (config.publicUrl) return config.publicUrl;
  const proto = String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0]!.trim();
  const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0]!.trim();
  return host ? `${proto}://${host}` : "";
}

/** A real YYYY-MM-DD from the address or a form, or null — so a bad URL can't 500. */
export function safeDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : value;
}

/** The calendar's mode from the address: deadlines, or posting (air dates) for anything else. */
export function safeMode(value: unknown): CalendarMode {
  return value === "deadlines" ? "deadlines" : "posting";
}
