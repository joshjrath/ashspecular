import { localPath } from "./http.js";

/**
 * Putting text into HTML safely. Every page is a template string, so these
 * are the only ways anything from outside — a Discord message, a
 * YouTube title, a pasted link, a header — goes into one:
 *
 *   esc(text)            any text, in an element or a quoted attribute
 *   safeUrl(url)         a link from outside, for href/src: http(s) or nothing
 *   safeHref(url)        a link that may also be a path on this site
 *   jsonForScript(value) a value inside an inline <script>
 */

/** Text for HTML: element content or a quoted attribute (either quote). */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A link from outside the board, or "" when it isn't http(s). Escaping alone
 * doesn't stop `javascript:` in an href; this does. Use it as
 * `href="${esc(safeUrl(url))}"` (and leave the link out when it's empty).
 */
export function safeUrl(url: unknown): string {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : "";
}

/** A link that may be from outside (http(s)) or a path on this site; "" when it's neither. */
export function safeHref(url: unknown): string {
  return safeUrl(url) || localPath(url, "");
}

/**
 * A value as JSON that can sit inside an inline <script>: JSON.stringify
 * leaves "</script>" alone, which would end the script early.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
