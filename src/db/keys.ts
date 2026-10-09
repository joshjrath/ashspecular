/**
 * API keys and limits set in Settings instead of on Railway. A value set here
 * takes over from the server variable of the same name (each feature reads
 * its key when it runs, so a change applies straight away); clearing it goes
 * back to the variable. Keys are encrypted at rest (AES-256-GCM, keyed from
 * SESSION_SECRET) and only ever shown masked.
 *
 * YouTube takes several keys: when one's daily quota runs out, the next is
 * used until midnight Pacific.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "./pool.js";
import { config } from "../config.js";

export interface KeyDef {
  id: string;
  env: string;
  label: string;
  what: string;
  where: string;
  many?: boolean;
}

export const KEY_DEFS: KeyDef[] = [
  { id: "anthropic", env: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)", what: "Reading Discord messages, Story Lab ideas, the Idea Feed, Competitors' concepts, revision summaries, compilations, finance voice notes.", where: "console.anthropic.com → API keys" },
  { id: "youtube", env: "YOUTUBE_API_KEY", label: "YouTube Data API", what: "Uploads' full history and views, runtimes, avatars, and Competitors.", where: "console.cloud.google.com → APIs & Services → Credentials (enable YouTube Data API v3)", many: true },
  { id: "tumblr", env: "TUMBLR_API_KEY", label: "Tumblr", what: "The Idea Feed reading tags.", where: "tumblr.com/oauth/apps → your app's OAuth consumer key (not the secret)" },
];

/** Daily limits set here, applied as the variables the features read. */
export const LIMIT_DEFS = [{ id: "storylab", env: "STORYLAB_AI_DAILY", label: "Story Lab: Claude calls a day", min: 0, max: 500, fallback: 30 }];

/** The server's own values, before anything set here took over. */
const ORIGINAL = new Map<string, string | undefined>([...KEY_DEFS, ...LIMIT_DEFS].map((d) => [d.env, process.env[d.env]]));

const cipherKey = () => createHash("sha256").update(`specular-keys|${config.sessionSecret}`).digest();
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}
export function unseal(sealed: string): string | null {
  try {
    const b = Buffer.from(sealed, "base64");
    const d = createDecipheriv("aes-256-gcm", cipherKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** "AIzaSyB…3kFq" — enough to tell keys apart, never enough to use one. */
export const mask = (k: string) => (k.length <= 10 ? "••••" : `${k.slice(0, 6)}…${k.slice(-4)}`);
export const splitKeys = (raw: string) => [...new Set(raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];

let stored = new Map<string, string>();
let unreadable = new Set<string>();
const exhausted = new Map<string, number>();

/** Midnight Pacific, when YouTube resets quotas. */
function nextPacificMidnight(now = new Date()): number {
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const offset = now.getTime() - pt.getTime();
  const mid = new Date(pt);
  mid.setHours(24, 0, 0, 0);
  return mid.getTime() + offset;
}

/** The YouTube keys in order: set here, else the variable (which may hold several, comma-separated). */
export function youtubeKeys(): string[] {
  return splitKeys(stored.get("youtube") ?? ORIGINAL.get("YOUTUBE_API_KEY") ?? "");
}

/** The first key not resting after running out of quota; the first of all when every one is. */
export function liveKey(keys: string[], resting: Map<string, number>, now = Date.now()): string | undefined {
  return keys.find((k) => (resting.get(k) ?? 0) <= now) ?? keys[0];
}

/** Midnight Pacific after a moment, for tests. */
export const quotaResetAfter = (d: Date) => nextPacificMidnight(d);

/** Put the right values into the environment the features read. */
export function applyKeys(): void {
  for (const d of KEY_DEFS) {
    if (d.id === "youtube") continue;
    const v = stored.get(d.id) ?? ORIGINAL.get(d.env);
    if (v) process.env[d.env] = v;
    else delete process.env[d.env];
  }
  const live = liveKey(youtubeKeys(), exhausted);
  if (live) process.env.YOUTUBE_API_KEY = live;
  else delete process.env.YOUTUBE_API_KEY;
  for (const l of LIMIT_DEFS) {
    const v = stored.get(`limit:${l.id}`) ?? ORIGINAL.get(l.env);
    if (v) process.env[l.env] = v;
    else delete process.env[l.env];
  }
}

/** A YouTube key ran out of quota: the next one takes over until midnight Pacific. Returns whether there's another. */
export function youtubeQuotaHit(key: string): boolean {
  exhausted.set(key, nextPacificMidnight());
  applyKeys();
  const next = process.env.YOUTUBE_API_KEY;
  return Boolean(next && next !== key && (exhausted.get(next) ?? 0) <= Date.now());
}

export const youtubeStatus = () => youtubeKeys().map((k) => ({ masked: mask(k), resting: (exhausted.get(k) ?? 0) > Date.now() }));

export async function loadKeys(): Promise<void> {
  const { rows } = await pool.query("SELECT key, value, secret FROM app_settings");
  const next = new Map<string, string>();
  const bad = new Set<string>();
  for (const r of rows) {
    const v = r.secret ? unseal(String(r.value)) : String(r.value);
    if (v === null) bad.add(String(r.key));
    else next.set(String(r.key), v);
  }
  stored = next;
  unreadable = bad;
  applyKeys();
}

export async function setKey(id: string, value: string | null): Promise<void> {
  const def = KEY_DEFS.find((d) => d.id === id);
  if (!def) return;
  const clean = value === null ? null : def.many ? splitKeys(value).join("\n") : value.trim();
  if (!clean) await pool.query("DELETE FROM app_settings WHERE key = $1", [id]);
  else await pool.query("INSERT INTO app_settings (key, value, secret, updated_at) VALUES ($1, $2, true, now()) ON CONFLICT (key) DO UPDATE SET value = $2, secret = true, updated_at = now()", [id, seal(clean)]);
  await loadKeys();
}

export async function setLimit(id: string, value: number | null): Promise<void> {
  const def = LIMIT_DEFS.find((d) => d.id === id);
  if (!def) return;
  if (value === null) await pool.query("DELETE FROM app_settings WHERE key = $1", [`limit:${id}`]);
  else await pool.query("INSERT INTO app_settings (key, value, secret, updated_at) VALUES ($1, $2, false, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()", [`limit:${id}`, String(Math.max(def.min, Math.min(def.max, Math.round(value))))]);
  await loadKeys();
}

export interface KeyState {
  def: KeyDef;
  source: "settings" | "railway" | "none";
  masked: string[];
  /** Set here, but it can't be read any more (SESSION_SECRET changed): enter it again. */
  unreadable: boolean;
}

export function keyStates(): KeyState[] {
  return KEY_DEFS.map((def) => {
    const here = stored.get(def.id);
    const env = ORIGINAL.get(def.env)?.trim();
    const value = here ?? env ?? "";
    return {
      def,
      source: here ? "settings" : env ? "railway" : "none",
      masked: (def.many ? splitKeys(value) : value ? [value] : []).map(mask),
      unreadable: unreadable.has(def.id),
    };
  });
}

export const limitValue = (id: string) => {
  const d = LIMIT_DEFS.find((l) => l.id === id)!;
  const v = Number(stored.get(`limit:${id}`) ?? ORIGINAL.get(d.env));
  return Number.isFinite(v) && (stored.has(`limit:${id}`) || ORIGINAL.get(d.env)) ? v : d.fallback;
};

/**
 * The Google sign-in client YouTube Analytics connects with: set in Settings
 * → Network & revenue, else GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (read when
 * used). Both are sealed like the keys; the secret is never shown again.
 */
export function googleClient(): { id: string; secret: string; source: "settings" | "railway" | "none" } {
  const id = stored.get("google:client_id")?.trim();
  const secret = stored.get("google:client_secret")?.trim();
  if (id && secret) return { id, secret, source: "settings" };
  const envId = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) return { id: envId, secret: envSecret, source: "railway" };
  return { id: "", secret: "", source: "none" };
}

/** Save the client (null clears it, so the Railway variables apply again). */
export async function setGoogleClient(value: { id: string; secret: string } | null): Promise<void> {
  if (!value) await pool.query("DELETE FROM app_settings WHERE key IN ('google:client_id', 'google:client_secret')");
  else {
    for (const [key, v] of [["google:client_id", value.id.trim()], ["google:client_secret", value.secret.trim()]] as const) {
      await pool.query("INSERT INTO app_settings (key, value, secret, updated_at) VALUES ($1, $2, true, now()) ON CONFLICT (key) DO UPDATE SET value = $2, secret = true, updated_at = now()", [key, seal(v)]);
    }
  }
  await loadKeys();
}

/** Keep a second process (the bot on its own) in step: reread once a minute. */
let syncing = false;
export function startKeySync(): void {
  if (syncing) return;
  syncing = true;
  setInterval(() => void loadKeys().catch((err) => console.error("[keys] sync failed:", err instanceof Error ? err.message : err)), 60_000).unref();
}

// ── checking a key ──────────────────────────────────────────────────────────

/** One cheap call with the key, to say whether it works. */
export async function testKey(id: string, key: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; note: string }> {
  try {
    if (id === "anthropic") {
      const base = (process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com").replace(/\/+$/, "");
      const res = await fetcher(`${base}/v1/models?limit=1`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15_000) });
      return res.ok ? { ok: true, note: "works" } : { ok: false, note: res.status === 401 ? "not accepted" : `answered ${res.status}` };
    }
    if (id === "youtube") {
      const base = (process.env.YOUTUBE_API_BASE?.trim() || "https://www.googleapis.com/youtube/v3").replace(/\/+$/, "");
      const res = await fetcher(`${base}/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return { ok: true, note: "works" };
      const body = await res.text().catch(() => "");
      return { ok: false, note: /quota/i.test(body) ? "out of quota today" : /disabled|not been used|blocked/i.test(body) ? "YouTube Data API v3 isn't enabled for it" : res.status === 400 ? "not a valid key" : `answered ${res.status}` };
    }
    if (id === "tumblr") {
      const base = (process.env.TUMBLR_API_BASE?.trim() || "https://api.tumblr.com/v2").replace(/\/+$/, "");
      const res = await fetcher(`${base}/tagged?tag=pokemon&limit=1&api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
      return res.ok ? { ok: true, note: "works" } : { ok: false, note: res.status === 401 || res.status === 403 ? "not accepted — use the OAuth consumer key, not the secret" : `answered ${res.status}` };
    }
    return { ok: false, note: "unknown key" };
  } catch {
    return { ok: false, note: "couldn't reach the service" };
  }
}

/** Every key in effect for a service, for testing. */
export function keysInEffect(id: string): string[] {
  if (id === "youtube") return youtubeKeys();
  const def = KEY_DEFS.find((d) => d.id === id);
  const v = stored.get(id) ?? (def ? ORIGINAL.get(def.env) : undefined);
  return v ? [v] : [];
}
