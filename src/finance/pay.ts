/**
 * How a person is paid, and what a piece of their work earns under it.
 *
 * The model lives on the person (with a history), not on each expense. Work
 * logged against them is worked out from the model in force on its date, and
 * keeps a snapshot of that model — so changing a rate later never rewrites
 * what was already earned. Any worked-out amount can be overridden.
 *
 * Deliberately not a formula engine: the common arrangements, plus Manual.
 */
import { fmtMoney } from "./money.js";

export const PAY_MODELS = [
  { id: "per_video", label: "Fixed per video", unit: "videos" },
  { id: "per_minute", label: "Per minute of finished video", unit: "minutes" },
  { id: "tiered", label: "Tiered per minute", unit: "minutes" },
  { id: "retainer", label: "Monthly retainer", unit: "none" },
  { id: "salary", label: "Salary / fixed recurring", unit: "none" },
  { id: "revenue_share", label: "Revenue share", unit: "revenue" },
  { id: "prepaid", label: "Prepaid / advance balance", unit: "either" },
  { id: "manual", label: "Manual / custom", unit: "none" },
] as const;
export type PayModelId = (typeof PAY_MODELS)[number]["id"];
export const PAY_MODEL = new Map<string, (typeof PAY_MODELS)[number]>(PAY_MODELS.map((m) => [m.id, m]));

/** Everything a model can carry. Money in cents; a tier's `upTo` in minutes (null = every minute after). */
export interface PayParams {
  /** per_video, per_minute, prepaid: cents per video or per minute. */
  rate?: number;
  /** prepaid: what the rate is per. */
  per?: "video" | "minute";
  /** tiered: a flat amount per video on top of the minutes. */
  base?: number;
  tiers?: Array<{ upTo: number | null; rate: number }>;
  /** retainer, salary: the fixed amount, and how often. */
  amount?: number;
  frequency?: string;
  /** revenue_share: the share (0.1 = 10%) and of which channel's revenue (null = all). */
  pct?: number;
  channel?: string | null;
}

export interface PayModel {
  model: PayModelId;
  params: PayParams;
  effectiveFrom: string;
}

export interface Earned {
  /** Null when the model can't work it out (Manual, a retainer): enter it by hand. */
  cents: number | null;
  /** How it was worked out, in words: "12.5 min × $10/min". */
  explain: string;
}

const perMin = (c: number) => `${fmtMoney(c)}/min`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** The model in words: "$10/min", "First 10 min at $15/min, then $10/min". */
export function describePay(m: Pick<PayModel, "model" | "params"> | null): string {
  if (!m) return "No pay model yet";
  const p = m.params;
  switch (m.model) {
    case "per_video":
      return `${fmtMoney(p.rate ?? 0)} per video`;
    case "per_minute":
      return `${perMin(p.rate ?? 0)} of finished video`;
    case "tiered": {
      let from = 0;
      const parts = (p.tiers ?? []).map((t) => {
        const s = t.upTo === null ? (from ? `then ${perMin(t.rate)}` : perMin(t.rate)) : `${from ? `minutes ${from}–${t.upTo}` : `first ${t.upTo} min`} at ${perMin(t.rate)}`;
        from = t.upTo ?? from;
        return s;
      });
      return `${p.base ? `${fmtMoney(p.base)} per video + ` : ""}${parts.join(", ") || "no tiers set"}`;
    }
    case "retainer":
    case "salary":
      return `${fmtMoney(p.amount ?? 0)} ${p.frequency && p.frequency !== "monthly" ? p.frequency : "a month"}`;
    case "revenue_share":
      return `${num((p.pct ?? 0) * 100)}% of ${p.channel ?? "network"} revenue`;
    case "prepaid":
      return `Prepaid · ${fmtMoney(p.rate ?? 0)} per ${p.per ?? "video"} from the advance`;
    case "manual":
      return "Manual — entered each time";
  }
}

/**
 * What a piece of work earns. `videos` and `minutes` are what was delivered;
 * `revenue` is the channel's revenue, for a revenue share.
 */
export function computePay(m: Pick<PayModel, "model" | "params"> | null, units: { videos?: number | null; minutes?: number | null; revenue?: number | null }): Earned {
  if (!m) return { cents: null, explain: "no pay model — enter the amount" };
  const p = m.params;
  const videos = units.videos ?? 0;
  const minutes = units.minutes ?? 0;
  switch (m.model) {
    case "per_video": {
      const n = videos || 1;
      return { cents: Math.round(n * (p.rate ?? 0)), explain: `${num(n)} video${n === 1 ? "" : "s"} × ${fmtMoney(p.rate ?? 0)}` };
    }
    case "per_minute":
      if (!minutes) return { cents: null, explain: "enter the finished minutes" };
      return { cents: Math.round(minutes * (p.rate ?? 0)), explain: `${num(minutes)} min × ${perMin(p.rate ?? 0)}` };
    case "tiered": {
      if (!minutes && !p.base) return { cents: null, explain: "enter the finished minutes" };
      const n = videos || 1;
      let cents = (p.base ?? 0) * n;
      const bits: string[] = p.base ? [`${num(n)} × ${fmtMoney(p.base)} base`] : [];
      let from = 0;
      for (const t of p.tiers ?? []) {
        const upper = t.upTo === null ? minutes : Math.min(minutes, t.upTo);
        const inTier = Math.max(0, upper - from);
        if (inTier > 0) {
          cents += inTier * t.rate;
          bits.push(`${num(inTier)} min × ${perMin(t.rate)}`);
        }
        if (t.upTo === null || minutes <= t.upTo) break;
        from = t.upTo;
      }
      return { cents: Math.round(cents), explain: bits.join(" + ") || "nothing in any tier" };
    }
    case "revenue_share":
      if (units.revenue === null || units.revenue === undefined) return { cents: null, explain: "no revenue entered for that month yet" };
      return { cents: Math.round(units.revenue * (p.pct ?? 0)), explain: `${num((p.pct ?? 0) * 100)}% × ${fmtMoney(units.revenue)} revenue` };
    case "prepaid": {
      const per = p.per ?? "video";
      const n = per === "minute" ? minutes : videos || 1;
      if (per === "minute" && !minutes) return { cents: null, explain: "enter the finished minutes" };
      return { cents: Math.round(n * (p.rate ?? 0)), explain: `${num(n)} ${per}${n === 1 ? "" : "s"} × ${fmtMoney(p.rate ?? 0)} at the prepaid rate` };
    }
    case "retainer":
    case "salary":
      return { cents: 0, explain: "covered by the fixed pay — nothing extra" };
    case "manual":
      return { cents: null, explain: "manual — enter the amount" };
  }
}

/** The model in force on a date: the latest that started on or before it. `models` in any order. */
export function modelOn<T extends { effectiveFrom: string }>(models: T[], date: string): T | null {
  return [...models].filter((m) => m.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/**
 * Tiers from the form: "10:1500, :1000" or lines "10 = 15" / "rest = 10" in
 * dollars. Returns cents per minute.
 */
export function parseTiers(input: string): Array<{ upTo: number | null; rate: number }> {
  const out: Array<{ upTo: number | null; rate: number }> = [];
  for (const raw of input.split(/[\n,;]+/)) {
    const m = /^\s*(\d+(?:\.\d+)?|rest|after|then|\*)?\s*(?:min(?:utes)?)?\s*[:=@]\s*\$?(\d+(?:\.\d+)?)\s*$/i.exec(raw);
    if (!m) continue;
    const upTo = m[1] && /^\d/.test(m[1]) ? Number(m[1]) : null;
    out.push({ upTo, rate: Math.round(Number(m[2]) * 100) });
  }
  // Ascending, with "the rest" last.
  return out.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
}

/** Tiers back into the form's words: "10 = 15\nrest = 10". */
export const tiersText = (tiers: PayParams["tiers"]) =>
  (tiers ?? []).map((t) => `${t.upTo === null ? "rest" : t.upTo} = ${num(t.rate / 100)}`).join("\n");
