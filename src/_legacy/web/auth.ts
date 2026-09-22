import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

const COOKIE = "ash_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
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

export function checkPassword(given: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(env.dashboardPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const COOKIE_NAME = COOKIE;
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  // A Secure cookie is dropped over plain http, which would break local dev.
  secure: env.publicUrl.startsWith("https://") || process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_MS / 1000,
};
