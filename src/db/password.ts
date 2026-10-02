/**
 * The board's login password set in Settings, kept as a salted scrypt hash.
 * Without one, DASHBOARD_PASSWORD (on the server) is the password.
 */
import { pool } from "./pool.js";
import { hashPassword, setStoredPassword, type StoredPassword } from "../web/auth.js";
import { randomBytes } from "node:crypto";

/** Read the stored password into the login check. DASHBOARD_PASSWORD_RESET=true clears it first. */
export async function loadBoardPassword(): Promise<void> {
  if (/^(1|true|yes)$/i.test(process.env.DASHBOARD_PASSWORD_RESET?.trim() ?? "")) {
    await pool.query("DELETE FROM board_password");
    console.log("[auth] DASHBOARD_PASSWORD_RESET is set: back to DASHBOARD_PASSWORD. Remove the variable once you're in.");
  }
  const { rows } = await pool.query("SELECT hash, salt, generation, changed_at FROM board_password WHERE id = 1");
  setStoredPassword(rows[0] ? { hash: String(rows[0].hash), salt: String(rows[0].salt), generation: String(rows[0].generation), changedAt: rows[0].changed_at as Date } : null);
}

/** Save a new password; every other sign-in ends. */
export async function saveBoardPassword(password: string): Promise<StoredPassword> {
  const salt = randomBytes(16).toString("base64");
  const stored: StoredPassword = { hash: await hashPassword(password, salt), salt, generation: randomBytes(12).toString("base64url"), changedAt: new Date() };
  await pool.query(
    `INSERT INTO board_password (id, hash, salt, generation, changed_at) VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET hash = $1, salt = $2, generation = $3, changed_at = now()`,
    [stored.hash, stored.salt, stored.generation],
  );
  setStoredPassword(stored);
  return stored;
}
