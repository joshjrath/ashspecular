import { createHmac, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config.js";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** A password changed in Settings (db/password.ts): it takes over from DASHBOARD_PASSWORD. */
export interface StoredPassword {
  hash: string;
  salt: string;
  /** New with every change, and part of every sign-in's signature: a change signs everyone else out. */
  generation: string;
  changedAt: Date;
}
let stored: StoredPassword | null = null;
export function setStoredPassword(p: StoredPassword | null): void {
  stored = p;
}
export const passwordChangedAt = () => stored?.changedAt ?? null;

/** Off the event loop: scrypt takes tens of milliseconds, and the bot and every page share this process. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  return (await scryptAsync(password, salt, 64)).toString("base64");
}

function sign(payload: string): string {
  // Until a password is set in Settings, sign-ins are signed exactly as before (nobody is signed out by this).
  return createHmac("sha256", config.sessionSecret).update(stored ? `${payload}|${stored.generation}` : payload).digest("base64url");
}

export function issueToken(): string {
  const payload = String(Date.now() + TTL_MS);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  return Number(payload) > Date.now();
}

/** The one set in Settings if there is one, else DASHBOARD_PASSWORD; compared in constant time. */
export async function checkPassword(given: string): Promise<boolean> {
  if (stored) {
    const a = Buffer.from(await hashPassword(given ?? "", stored.salt));
    const b = Buffer.from(stored.hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const a = createHmac("sha256", config.sessionSecret).update(given ?? "").digest();
  const b = createHmac("sha256", config.sessionSecret).update(config.dashboardPassword).digest();
  return timingSafeEqual(a, b);
}

export const COOKIE_NAME = "specular_session";
/**
 * The sign-in cookie. Secure whenever the board is reached over https —
 * PUBLIC_URL says so, or the request itself came in on https (Railway's
 * proxy says which) — and only left off for plain http, which local use needs.
 */
export function cookieOptions(https: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https || config.publicUrl.startsWith("https://"),
    path: "/",
    maxAge: TTL_MS / 1000,
  };
}

// ── sign-in attempts ─────────────────────────────────────────────────────────

/**
 * Wrong passwords per address. One shared password guards the whole board,
 * so guessing is slowed down: ten wrong in fifteen minutes and that address
 * waits until the oldest of them is fifteen minutes old. A right password
 * clears its address's count.
 *
 * The address comes from X-Forwarded-For (Railway's proxy), which a client
 * can also write, so there's a ceiling across every address too: two hundred
 * wrong in fifteen minutes and sign-ins wait for everyone. Anyone already
 * signed in carries on (a sign-in lasts thirty days).
 */
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 10;
const MAX_FAILS_ALL = 200;
const failures = new Map<string, number[]>();
let allFailures: number[] = [];

function recentFailures(ip: string, now: number): number[] {
  const list = (failures.get(ip) ?? []).filter((at) => now - at < FAIL_WINDOW_MS);
  if (list.length) failures.set(ip, list);
  else failures.delete(ip);
  return list;
}

/** Seconds this address must wait before trying again; 0 when it may try now. */
export function loginWait(ip: string, now = Date.now()): number {
  allFailures = allFailures.filter((at) => now - at < FAIL_WINDOW_MS);
  const list = recentFailures(ip, now);
  const mine = list.length < MAX_FAILS ? 0 : list[0]! + FAIL_WINDOW_MS - now;
  const everyone = allFailures.length < MAX_FAILS_ALL ? 0 : allFailures[0]! + FAIL_WINDOW_MS - now;
  return Math.ceil(Math.max(mine, everyone, 0) / 1000);
}

export function noteLoginFailure(ip: string, now = Date.now()): void {
  // Many addresses at once can't grow this without bound: the oldest go first.
  if (failures.size > 5000) for (const key of [...failures.keys()].slice(0, 1000)) failures.delete(key);
  failures.set(ip, [...recentFailures(ip, now), now]);
  allFailures = [...allFailures.filter((at) => now - at < FAIL_WINDOW_MS), now].slice(-MAX_FAILS_ALL);
}

export function clearLoginFailures(ip: string): void {
  failures.delete(ip);
}
