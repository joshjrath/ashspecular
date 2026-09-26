/**
 * Reading a script straight from its Google Doc: the doc's plain-text export,
 * which needs no key as long as the doc is shared as "anyone with the link
 * can view". A private doc sends Google's sign-in page instead, and that's
 * said plainly rather than kept as the script.
 */

/** The document id in a Google Docs link, or null when it isn't one. */
export function docId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.hostname !== "docs.google.com") return null;
  const m = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(u.pathname);
  return m ? m[1]! : null;
}

export type DocRead = { ok: true; text: string } | { ok: false; error: string };

export async function readDoc(url: string, fetcher: typeof fetch = fetch): Promise<DocRead> {
  const id = docId(url);
  if (!id) return { ok: false, error: "That isn't a Google Docs link (docs.google.com/document/d/…)." };
  let res: Response;
  try {
    res = await fetcher(`https://docs.google.com/document/d/${id}/export?format=txt`, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, error: "Google Docs didn't answer. Try again, or paste the script instead." };
  }
  const type = res.headers.get("content-type") ?? "";
  if (res.status === 404) return { ok: false, error: "Google says that doc doesn't exist." };
  if (!res.ok || !type.startsWith("text/plain")) {
    return {
      ok: false,
      error: "The doc is private. Share it as “Anyone with the link can view”, or paste the script instead.",
    };
  }
  const text = (await res.text()).replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: false, error: "The doc is empty." };
  return { ok: true, text: text.slice(0, 200_000) };
}
