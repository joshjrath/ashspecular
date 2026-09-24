import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
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

/** Compared in constant time, and only after padding to equal length. */
export function checkPassword(given: string): boolean {
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
