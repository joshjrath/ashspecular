/**
 * Finance, worked out. Every Finance page is a view of one set of facts,
 * loaded for a span of months:
 *
 *   income     what came in, per month × channel × stream × company
 *   expenses   what went out, per month × channel × category × type × person,
 *              with cost and cash kept apart
 *   channels   per channel × month: uploads, views, and Ash's own time on it
 *   recurring  the subscriptions and fixed costs running now, as monthly cost
 *
 * Everything here is pure — no database — so it can be tested and reused:
 * a channel's P&L, the network's, rolling 1/3/6/12-month windows, RPM from
 * platform revenue only, per-upload and per-owner-hour figures, the
 * sustainability flags against the thresholds in Finance Settings, break-even
 * views, and projection ranges with what they're based on.
 */
import { addMonths, fmtMoney, fmtPct, monthLabel, monthsEnding } from "./money.js";

export type ExpenseType = "contractor" | "subscription" | "one_off" | "recurring" | "manual";
export const EXPENSE_TYPES: Array<{ id: ExpenseType; label: string; group: "production" | "recurring" | "oneoff" }> = [
  { id: "contractor", label: "Contractor / Production", group: "production" },
  { id: "subscription", label: "Subscription", group: "recurring" },
  { id: "recurring", label: "Other recurring", group: "recurring" },
  { id: "one_off", label: "One-off", group: "oneoff" },
  { id: "manual", label: "Manual / other", group: "oneoff" },
];
export const EXPENSE_TYPE = new Map(EXPENSE_TYPES.map((t) => [t.id, t]));
export const COST_GROUPS = [
  { id: "recurring", label: "Recurring monthly costs" },
  { id: "production", label: "Production / contractors" },
  { id: "oneoff", label: "One-off expenses" },
] as const;

export interface IncomeFact {
  month: string;
  channel: string | null;
  stream: string;
  company: number | null;
  cents: number;
}

export interface ExpenseFact {
  /** The month the cost belongs to (its date). */
  month: string;
  /** The month cash left (paid_on, else its date) — null when no cash left. */
  cashMonth: string | null;
  /** Null: General / network-wide. A split expense is one fact per channel. */
  channel: string | null;
  category: string | null;
  type: ExpenseType;
  company: number | null;
  person: number | null;
  status: "paid" | "unpaid" | "covered";
  advance: boolean;
  cents: number;
}

export interface ChannelMonth {
  channel: string;
  month: string;
  uploads: number;
  views: number | null;
  /** "entered" from YouTube Studio, or "estimated" from the board's own view snapshots. */
  viewsSource: "entered" | "estimated" | null;
  ownerMinutes: number;
}

export interface RecurringFact {
  id: number;
  vendor: string;
  monthly: number;
  category: string | null;
  kind: "subscription" | "recurring";
  person: number | null;
  /** Share of the cost per channel; empty is general. */
  channels: Array<{ channel: string; share: number }>;
}

export interface Facts {
  months: string[];
  income: IncomeFact[];
  expenses: ExpenseFact[];
  channels: ChannelMonth[];
  recurring: RecurringFact[];
  /** Revenue streams an RPM is worked out from (AdSense by default). */
  platformStreams: Set<string>;
  /** Uploads scheduled on the board per channel for the month after the last, for projections. */
  scheduledNext: Map<string, number>;
}

/** What counts toward profit: the cost of the work. An advance isn't a cost — the work it covers is. */
export const costOf = (e: ExpenseFact) => (e.advance ? 0 : e.cents);
/** What left the business as cash. */
export const cashOf = (e: ExpenseFact) => (e.status === "paid" ? e.cents : 0);

/** Whose rows: every channel and general (the network), one channel, or general only. */
export type Scope = { all: true } | { channel: string } | { general: true };
const inScope = (s: Scope, channel: string | null) => ("all" in s ? true : "general" in s ? channel === null : channel === s.channel);

export interface PnL {
  months: string[];
  revenue: number;
  /** Revenue from platform streams (AdSense) — the only revenue an RPM uses. */
  platformRevenue: number;
  byStream: Map<string, number>;
  expenses: number;
  byCategory: Map<string, number>;
  byType: Map<ExpenseType, number>;
  byGroup: Record<"recurring" | "production" | "oneoff", number>;
  cashOut: number;
  unpaid: number;
  profit: number;
  margin: number | null;
  uploads: number;
  views: number | null;
  /** Some months' views are estimates. */
  viewsEstimated: boolean;
  ownerMinutes: number;
}

const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

/** Profit and loss over some months, for a scope. */
export function pnl(f: Facts, months: string[], scope: Scope): PnL {
  const set = new Set(months);
  const byStream = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byType = new Map<ExpenseType, number>();
  const byGroup = { recurring: 0, production: 0, oneoff: 0 };
  let revenue = 0, platformRevenue = 0, expenses = 0, cashOut = 0, unpaid = 0;
  for (const i of f.income) {
    if (!set.has(i.month) || !inScope(scope, i.channel)) continue;
    revenue += i.cents;
    add(byStream, i.stream, i.cents);
    if (f.platformStreams.has(i.stream)) platformRevenue += i.cents;
  }
  for (const e of f.expenses) {
    if (!inScope(scope, e.channel)) continue;
    if (set.has(e.month)) {
      const c = costOf(e);
      expenses += c;
      if (c) {
        add(byCategory, e.category ?? "other", c);
        add(byType, e.type, c);
        byGroup[EXPENSE_TYPE.get(e.type)?.group ?? "oneoff"] += c;
      }
      if (e.status === "unpaid") unpaid += e.cents;
    }
    if (e.cashMonth && set.has(e.cashMonth)) cashOut += cashOf(e);
  }
  let uploads = 0, views: number | null = null, viewsEstimated = false, ownerMinutes = 0;
  for (const c of f.channels) {
    if (!set.has(c.month) || !inScope(scope, c.channel)) continue;
    uploads += c.uploads;
    ownerMinutes += c.ownerMinutes;
    if (c.views !== null) {
      views = (views ?? 0) + c.views;
      if (c.viewsSource === "estimated") viewsEstimated = true;
    }
  }
  const profit = revenue - expenses;
  return {
    months, revenue, platformRevenue, byStream, expenses, byCategory, byType, byGroup, cashOut, unpaid, profit,
    margin: revenue > 0 ? profit / revenue : null, uploads, views, viewsEstimated, ownerMinutes,
  };
}

/** The figures derived from a P&L: RPM (platform revenue only), per upload, per owner hour. */
export interface Derived {
  rpm: number | null;
  revenuePerUpload: number | null;
  costPerUpload: number | null;
  profitPerUpload: number | null;
  ownerHours: number;
  profitPerHour: number | null;
}
export function derived(p: PnL): Derived {
  const ownerHours = p.ownerMinutes / 60;
  return {
    // AdSense ÷ views × 1,000. A sponsorship never inflates it.
    rpm: p.views && p.views > 0 && p.platformRevenue > 0 ? (p.platformRevenue / p.views) * 1000 : null,
    revenuePerUpload: p.uploads ? p.revenue / p.uploads : null,
    costPerUpload: p.uploads ? p.expenses / p.uploads : null,
    profitPerUpload: p.uploads ? p.profit / p.uploads : null,
    ownerHours,
    profitPerHour: ownerHours >= 0.25 ? p.profit / ownerHours : null,
  };
}

export const WINDOWS = [1, 3, 6, 12] as const;

/** The same scope over the last 1, 3, 6 and 12 months to `last`, each as a monthly average too. */
export function rolling(f: Facts, last: string, scope: Scope): Array<{ n: number; pnl: PnL; d: Derived; avgRevenue: number; avgExpenses: number; avgProfit: number }> {
  return WINDOWS.map((n) => {
    const p = pnl(f, monthsEnding(last, n), scope);
    return { n, pnl: p, d: derived(p), avgRevenue: p.revenue / n, avgExpenses: p.expenses / n, avgProfit: p.profit / n };
  });
}

/** One P&L per month, oldest first. */
export const series = (f: Facts, months: string[], scope: Scope) => months.map((m) => pnl(f, [m], scope));

// ── sustainability ─────────────────────────────────────────────────────────

export interface Thresholds {
  /** Below this margin a profitable channel is Low Margin. */
  minMargin: number;
  /** At or above this margin (and nothing else wrong) it's Healthy. */
  healthyMargin: number;
  /** Profit per owner hour below this (cents) is Low Return on Time. */
  minProfitPerHour: number;
  /** This many months in a row of loss is Persistent Loss. */
  lossMonths: number;
  /** Revenue or views falling this many months in a row is Declining. */
  declineMonths: number;
  /** Which flags also show on the main dashboard. */
  dashboard: FlagId[];
}
export const DEFAULT_THRESHOLDS: Thresholds = {
  minMargin: 0.25,
  healthyMargin: 0.4,
  minProfitPerHour: 5000,
  lossMonths: 3,
  declineMonths: 3,
  dashboard: ["persistent_loss", "loss", "low_time", "declining"],
};

export const FLAGS = [
  { id: "healthy", label: "Healthy", tone: "ok" },
  { id: "low_margin", label: "Low Margin", tone: "warn" },
  { id: "declining", label: "Declining", tone: "warn" },
  { id: "loss", label: "Loss-Making", tone: "late" },
  { id: "persistent_loss", label: "Persistent Loss", tone: "late" },
  { id: "low_time", label: "Low Return on Time", tone: "warn" },
  { id: "no_data", label: "No data yet", tone: "dim" },
] as const;
export type FlagId = (typeof FLAGS)[number]["id"];
export const FLAG = new Map<string, (typeof FLAGS)[number]>(FLAGS.map((x) => [x.id, x]));

export interface Flag {
  id: FlagId;
  /** One line on why. */
  why: string;
  /** The figures behind it, as label → value. */
  figures: Array<[string, string]>;
}

/**
 * Where a channel stands in a month, against the thresholds. It only ever
 * informs: nothing on the board changes because of a flag.
 */
export function sustainability(f: Facts, month: string, channel: string, t: Thresholds): Flag[] {
  const cur = pnl(f, [month], { channel });
  const d = derived(cur);
  if (cur.revenue === 0 && cur.expenses === 0) return [{ id: "no_data", why: `Nothing entered for ${monthLabel(month)} yet`, figures: [] }];
  const out: Flag[] = [];

  const lossRun = monthsEnding(month, t.lossMonths).map((m) => pnl(f, [m], { channel }));
  if (lossRun.every((p) => p.profit < 0 && (p.revenue > 0 || p.expenses > 0))) {
    const rev = lossRun.reduce((n, p) => n + p.revenue, 0);
    const exp = lossRun.reduce((n, p) => n + p.expenses, 0);
    out.push({
      id: "persistent_loss",
      why: `Negative profit for ${t.lossMonths} consecutive months`,
      figures: [[`${t.lossMonths}-month revenue`, fmtMoney(rev)], [`${t.lossMonths}-month expenses`, fmtMoney(exp)], ["Net", fmtMoney(rev - exp, { sign: true })]],
    });
  } else if (cur.profit < 0) {
    out.push({ id: "loss", why: `Expenses exceeded revenue in ${monthLabel(month)}`, figures: [["Revenue", fmtMoney(cur.revenue)], ["Expenses", fmtMoney(cur.expenses)], ["Net", fmtMoney(cur.profit, { sign: true })]] });
  }

  if (cur.profit > 0 && cur.margin !== null && cur.margin < t.minMargin) {
    out.push({ id: "low_margin", why: `Profitable, but under your ${fmtPct(t.minMargin, 0)} margin`, figures: [["Profit", fmtMoney(cur.profit, { sign: true })], ["Margin", fmtPct(cur.margin)]] });
  }

  if (cur.profit > 0 && d.profitPerHour !== null && d.profitPerHour < t.minProfitPerHour) {
    out.push({
      id: "low_time",
      why: `Profitable, but under your ${fmtMoney(t.minProfitPerHour)} per hour of your time`,
      figures: [["Profit this month", fmtMoney(cur.profit, { sign: true })], ["Your time", `${d.ownerHours.toFixed(1)} hours`], ["Profit per owner hour", fmtMoney(Math.round(d.profitPerHour), { exact: true })]],
    });
  }

  // Declining: revenue, or views, lower each month than the one before, for the set run.
  const run = monthsEnding(month, t.declineMonths + 1).map((m) => pnl(f, [m], { channel }));
  const falling = (vals: Array<number | null>) => vals.every((v) => v !== null) && vals.slice(1).every((v, i) => v! < vals[i]!) && (vals[0] ?? 0) > 0;
  const revFall = falling(run.map((p) => p.revenue));
  const viewFall = falling(run.map((p) => p.views));
  if (revFall || viewFall) {
    const first = run[0]!, last = run[run.length - 1]!;
    out.push({
      id: "declining",
      why: `${revFall ? "Revenue" : "Views"} down ${t.declineMonths} months in a row`,
      figures: revFall
        ? [[monthLabel(first.months[0]!, "short"), fmtMoney(first.revenue)], [monthLabel(month, "short"), fmtMoney(last.revenue)], ["Change", fmtPct(first.revenue ? (last.revenue - first.revenue) / first.revenue : null)]]
        : [[monthLabel(first.months[0]!, "short"), (first.views ?? 0).toLocaleString("en-US")], [monthLabel(month, "short"), (last.views ?? 0).toLocaleString("en-US")]],
    });
  }

  if (!out.length && cur.margin !== null && cur.margin >= t.healthyMargin) {
    out.push({ id: "healthy", why: `${fmtPct(cur.margin)} margin, comfortably above your thresholds`, figures: [["Profit", fmtMoney(cur.profit, { sign: true })]] });
  }
  return out;
}

/**
 * The month reports should speak for: the latest with any income entered
 * (revenue arrives after a month ends), else the one before `today`'s.
 */
export function reportingMonth(f: Facts, current: string): string {
  const withIncome = f.income.filter((i) => i.cents !== 0 && i.month <= current).map((i) => i.month).sort();
  return withIncome[withIncome.length - 1] ?? addMonths(current, -1);
}

// ── break-even and projections ─────────────────────────────────────────────

export interface BreakEven {
  monthlyExpenses: number;
  otherRevenue: number;
  /** What platform revenue has to cover once other revenue is counted. */
  remaining: number;
  rpm: number;
  viewsNeeded: number;
  currentViews: number;
  covered: boolean;
}

/**
 * Views a month the channel needs for AdSense to cover what sponsorships and
 * other revenue don't — from its last 3 months' averages. Null without an RPM.
 */
export function breakEven(f: Facts, last: string, channel: string): BreakEven | null {
  const months = monthsEnding(last, 3);
  const p = pnl(f, months, { channel });
  const rpm = derived(p).rpm;
  if (rpm === null || !p.views) return null;
  const n = months.length;
  const monthlyExpenses = p.expenses / n;
  const otherRevenue = (p.revenue - p.platformRevenue) / n;
  const remaining = Math.max(0, monthlyExpenses - otherRevenue);
  const viewsNeeded = Math.round((remaining / rpm) * 1000);
  const currentViews = Math.round(p.views / n);
  return { monthlyExpenses, otherRevenue, remaining, rpm, viewsNeeded, currentViews, covered: currentViews >= viewsNeeded };
}

export interface Projection {
  month: string;
  revenue: [number, number];
  expenses: number;
  profit: [number, number];
  /** What it's based on, a line each. */
  basis: string[];
  /** Too little history to say anything. */
  thin: boolean;
}

/**
 * Next month, as ranges: revenue from the trailing 3 months (their spread
 * sets the range), costs from what's known — recurring costs running now,
 * and contractor costs per upload × uploads scheduled on the board.
 */
export function project(f: Facts, last: string, scope: Scope): Projection {
  const next = addMonths(last, 1);
  const months = monthsEnding(last, 3);
  const per = series(f, months, scope).filter((p) => p.revenue > 0 || p.expenses > 0);
  const basis: string[] = [];
  if (!per.length) return { month: next, revenue: [0, 0], expenses: 0, profit: [0, 0], basis: ["No history yet — enter a month of revenue and expenses."], thin: true };

  const revs = per.map((p) => p.revenue);
  const mean = revs.reduce((a, b) => a + b, 0) / revs.length;
  const sd = Math.sqrt(revs.reduce((a, b) => a + (b - mean) ** 2, 0) / revs.length);
  const spread = Math.max(sd, mean * 0.08);
  const revenue: [number, number] = [Math.max(0, Math.round(mean - spread)), Math.round(mean + spread)];
  basis.push(`Revenue: trailing ${per.length}-month average ${fmtMoney(Math.round(mean), { compact: true })}, ± its month-to-month spread`);

  // Recurring costs running now, at their monthly cost, in scope.
  let recurring = 0;
  for (const r of f.recurring) {
    if ("all" in scope) recurring += r.monthly;
    else if ("general" in scope) recurring += r.channels.length ? 0 : r.monthly;
    else recurring += r.monthly * (r.channels.find((c) => c.channel === scope.channel)?.share ?? 0);
  }
  if (recurring) basis.push(`Known recurring costs: ${fmtMoney(Math.round(recurring), { compact: true })} a month`);

  // Production: the trailing average, scaled for one channel by how many
  // videos the board has scheduled next month against its recent pace.
  const total = pnl(f, months, scope);
  let productionNext = total.byGroup.production / months.length;
  if (productionNext) basis.push(`Contractor costs: trailing 3-month average ${fmtMoney(Math.round(productionNext), { compact: true })}`);
  if ("channel" in scope && productionNext) {
    const scheduled = f.scheduledNext.get(scope.channel) ?? 0;
    const avgUploads = total.uploads / months.length;
    if (scheduled > 0 && avgUploads > 0) {
      const factor = Math.max(0.5, Math.min(2, scheduled / avgUploads));
      if (Math.abs(factor - 1) >= 0.1) {
        productionNext *= factor;
        basis.push(`Upload cadence: ${scheduled} scheduled on the board vs ${avgUploads.toFixed(1)} a month lately — contractor costs × ${factor.toFixed(2)}`);
      } else basis.push(`Upload cadence: ${scheduled} scheduled, in line with recent months`);
    }
  }
  const oneoff = total.byGroup.oneoff / months.length;
  if (oneoff) basis.push(`One-off costs aren't projected (${fmtMoney(Math.round(oneoff), { compact: true })} a month lately)`);

  const expenses = Math.round(recurring + productionNext);
  return { month: next, revenue, expenses, profit: [revenue[0] - expenses, revenue[1] - expenses], basis, thin: per.length < 2 };
}
