/**
 * Money and months, the two units everything in Finance is counted in.
 * Money is whole cents; a month is "2026-09".
 */

/** 800000 → "$8,000"; with `sign`, "+$8,000" / "−$1,620"; `compact` → "$8.2K". */
export function fmtMoney(cents: number, opts: { sign?: boolean; compact?: boolean; exact?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  let body: string;
  if (opts.compact && abs >= 1000) {
    const [n, unit] = abs >= 1_000_000 ? [abs / 1_000_000, "M"] : [abs / 1000, "K"];
    body = `$${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}${unit}`;
  } else {
    const whole = (opts.compact && abs >= 100) || (!opts.exact && Math.abs(abs - Math.round(abs)) < 0.005);
    body = `$${(whole ? Math.round(abs) : abs).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
  }
  if (neg) return `−${body}`;
  return opts.sign && cents > 0 ? `+${body}` : body;
}

/** "1,234.50", "$12k", "250" → cents; anything else → null. */
export function parseMoney(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const s = String(input).trim().replace(/[$,\s]/g, "").replace(/^−/, "-");
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)(k|m)?$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** 0.6634 → "66.3%"; null → "—". */
export const fmtPct = (x: number | null, digits = 1) => (x === null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)}%`);

// ── months ─────────────────────────────────────────────────────────────────

/** "2026-09", in years the board can count through (the same span as a day's, parse/derive isRealDate). */
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^(19[7-9]\d|2[01]\d\d)-(0[1-9]|1[0-2])$/.test(s);

/** "2026-09" → "2026-09-01". */
export const monthStart = (m: string) => `${m}-01`;

/** "2026-09" → "2026-09-30". */
export function monthEnd(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${m}-${String(last).padStart(2, "0")}`;
}

export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The n months ending with `last`, oldest first. */
export const monthsEnding = (last: string, n: number) => Array.from({ length: n }, (_, i) => addMonths(last, i - n + 1));

/** "2026-09" → "September 2026"; short → "Sep". */
export function monthLabel(m: string, style: "long" | "short" | "shortYear" = "long"): string {
  const d = new Date(`${m}-15T12:00:00Z`);
  if (style === "short") return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  if (style === "shortYear") return d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", " '");
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "2026-09-14" → "9/14/2026". */
export function usDay(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

// ── billing frequency ──────────────────────────────────────────────────────

export const FREQUENCIES = [
  { id: "weekly", label: "Weekly", perMonth: 52 / 12, months: 0 },
  { id: "monthly", label: "Monthly", perMonth: 1, months: 1 },
  { id: "quarterly", label: "Quarterly", perMonth: 1 / 3, months: 3 },
  { id: "semiannual", label: "Every 6 months", perMonth: 1 / 6, months: 6 },
  { id: "annual", label: "Annual", perMonth: 1 / 12, months: 12 },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["id"];
export const FREQUENCY = new Map<string, (typeof FREQUENCIES)[number]>(FREQUENCIES.map((f) => [f.id, f]));

/** A bill's true monthly cost: $120 a year is $10 a month. */
export function monthlyEquivalent(cents: number, frequency: string): number {
  return Math.round(cents * (FREQUENCY.get(frequency)?.perMonth ?? 1));
}

/** The bill after this one. Month-end dates stay at month end (Jan 31 → Feb 28 → Mar 31). */
export function nextBill(date: string, frequency: string): string {
  const f = FREQUENCY.get(frequency) ?? FREQUENCY.get("monthly")!;
  const d = new Date(`${date}T12:00:00Z`);
  if (f.months === 0) {
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const day = Number(date.slice(8, 10));
  const wasLast = date === monthEnd(date.slice(0, 7));
  const m = addMonths(date.slice(0, 7), f.months);
  const end = monthEnd(m);
  const lastDay = Number(end.slice(8, 10));
  return wasLast ? end : `${m}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
