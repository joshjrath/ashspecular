import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

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

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("base64");
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
export function checkPassword(given: string): boolean {
  if (stored) {
    const a = Buffer.from(hashPassword(given ?? "", stored.salt));
    const b = Buffer.from(stored.hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const a = createHmac("sha256", config.sessionSecret).update(given ?? "").digest();
  const b = createHmac("sha256", config.sessionSecret).update(config.dashboardPassword).digest();
  return timingSafeEqual(a, b);
}

export const COOKIE_NAME = "specular_session";
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  // A Secure cookie is dropped over plain http, which would break local use.
  secure: config.publicUrl.startsWith("https://"),
  path: "/",
  maxAge: TTL_MS / 1000,
};
