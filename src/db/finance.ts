/**
 * Finance storage. See migration 035 for the rules the tables follow: money
 * in cents, channel as its own dimension (splits), cost apart from cash,
 * income over a period, pay models with a history.
 *
 * Dates come back as "YYYY-MM-DD" text (to_char), never Date objects, so no
 * time zone can move a day.
 */
import { inTransaction, pool } from "./pool.js";
import type { ExpenseFact, ExpenseType, Facts, IncomeFact, RecurringFact, Thresholds, ChannelMonth } from "../finance/metrics.js";
import { DEFAULT_THRESHOLDS } from "../finance/metrics.js";
import { addMonths, monthEnd, monthStart, monthlyEquivalent, nextBill } from "../finance/money.js";
import { modelOn, type PayModel, type PayModelId, type PayParams } from "../finance/pay.js";
import { channelEstimate, typeEstimate, typeOf } from "../web/work.js";
import type { StoredRecord } from "./records.js";

const D = (col: string, as = col) => `to_char(${col}, 'YYYY-MM-DD') AS ${as}`;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ── reference lists ────────────────────────────────────────────────────────

export interface Company { id: number; name: string; notes: string; archived: boolean }
export interface Category { id: string; label: string; colour: string; archived: boolean }
export interface Stream { id: string; label: string; colour: string; platform: boolean; archived: boolean }
export interface Method { id: number; label: string; archived: boolean }

export interface Lists {
  companies: Company[];
  categories: Category[];
  streams: Stream[];
  methods: Method[];
  people: Array<{ id: number; name: string; role: string; active: boolean }>;
  channelCompany: Map<string, number>;
}

export async function loadLists(): Promise<Lists> {
  const [c, cat, s, m, p, cc] = await Promise.all([
    pool.query("SELECT * FROM fin_companies ORDER BY archived, name"),
    pool.query("SELECT * FROM fin_categories ORDER BY archived, sort, label"),
    pool.query("SELECT * FROM fin_streams ORDER BY archived, sort, label"),
    pool.query("SELECT * FROM fin_methods ORDER BY archived, label"),
    pool.query("SELECT id, name, role, active FROM fin_people ORDER BY NOT active, name"),
    pool.query("SELECT channel, company_id FROM fin_channel_companies WHERE company_id IS NOT NULL"),
  ]);
  return {
    companies: c.rows.map((r) => ({ id: Number(r.id), name: r.name, notes: r.notes, archived: r.archived })),
    categories: cat.rows.map((r) => ({ id: r.id, label: r.label, colour: r.colour, archived: r.archived })),
    streams: s.rows.map((r) => ({ id: r.id, label: r.label, colour: r.colour, platform: r.platform, archived: r.archived })),
    methods: m.rows.map((r) => ({ id: Number(r.id), label: r.label, archived: r.archived })),
    people: p.rows.map((r) => ({ id: Number(r.id), name: r.name, role: r.role, active: r.active })),
    channelCompany: new Map(cc.rows.map((r) => [r.channel as string, Number(r.company_id)])),
  };
}

export async function addCompany(name: string): Promise<void> {
  await pool.query("INSERT INTO fin_companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET archived = false", [name]);
}
export async function setArchived(table: "fin_companies" | "fin_categories" | "fin_streams" | "fin_methods", id: string, archived: boolean): Promise<void> {
  await pool.query(`UPDATE ${table} SET archived = $2 WHERE id::text = $1`, [id, archived]);
}
export async function renameItem(table: "fin_companies" | "fin_categories" | "fin_streams" | "fin_methods", id: string, label: string): Promise<void> {
  const col = table === "fin_companies" ? "name" : "label";
  await pool.query(`UPDATE ${table} SET ${col} = $2 WHERE id::text = $1`, [id, label]);
}
export async function addCategory(label: string, colour: string): Promise<void> {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `cat_${Date.now()}`;
  await pool.query(
    "INSERT INTO fin_categories (id, label, colour, sort) VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort), 0) + 10 FROM fin_categories)) ON CONFLICT (id) DO UPDATE SET archived = false, label = EXCLUDED.label",
    [id, label, colour],
  );
}
export async function addStream(label: string, platform: boolean): Promise<void> {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || `stream_${Date.now()}`;
  await pool.query(
    "INSERT INTO fin_streams (id, label, platform, sort) VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort), 0) + 10 FROM fin_streams)) ON CONFLICT (id) DO UPDATE SET archived = false, label = EXCLUDED.label, platform = EXCLUDED.platform",
    [id, label, platform],
  );
}
export async function setStreamPlatform(id: string, platform: boolean): Promise<void> {
  await pool.query("UPDATE fin_streams SET platform = $2 WHERE id = $1", [id, platform]);
}
export async function addMethod(label: string): Promise<void> {
  await pool.query("INSERT INTO fin_methods (label) VALUES ($1) ON CONFLICT (label) DO UPDATE SET archived = false", [label]);
}
export async function setChannelCompany(channel: string, companyId: number | null): Promise<void> {
  if (companyId === null) await pool.query("DELETE FROM fin_channel_companies WHERE channel = $1", [channel]);
  else await pool.query("INSERT INTO fin_channel_companies (channel, company_id) VALUES ($1, $2) ON CONFLICT (channel) DO UPDATE SET company_id = EXCLUDED.company_id", [channel, companyId]);
}

export async function getThresholds(): Promise<Thresholds> {
  const { rows } = await pool.query("SELECT value FROM fin_settings WHERE key = 'thresholds'");
  return { ...DEFAULT_THRESHOLDS, ...((rows[0]?.value as Partial<Thresholds> | undefined) ?? {}) };
}
export async function saveThresholds(t: Thresholds): Promise<void> {
  await pool.query("INSERT INTO fin_settings (key, value) VALUES ('thresholds', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(t)]);
}

// ── people and pay ─────────────────────────────────────────────────────────

export interface StoredPayModel extends PayModel { id: number; note: string }

export interface Person {
  id: number;
  name: string;
  role: string;
  notes: string;
  active: boolean;
  models: StoredPayModel[];
  current: StoredPayModel | null;
  /** Work cost, lifetime: what their work was worth, covered or not. */
  earned: number;
  /** Cash that actually left, lifetime — advances included. */
  cashPaid: number;
  cashThisMonth: number;
  outstanding: number;
  advancePaid: number;
  covered: number;
  /** What's left of their advances: paid in advance less work drawn from it. */
  advanceBalance: number;
  lastWork: string | null;
}

export async function listPeople(today: string): Promise<Person[]> {
  const month = today.slice(0, 7);
  const [people, models, stats] = await Promise.all([
    pool.query("SELECT * FROM fin_people ORDER BY NOT active, name"),
    pool.query(`SELECT id, person_id, model, params, ${D("effective_from")}, note FROM fin_pay_models ORDER BY effective_from DESC, id DESC`),
    pool.query(
      `SELECT person_id,
         SUM(amount_cents) FILTER (WHERE NOT is_advance) AS earned,
         SUM(amount_cents) FILTER (WHERE status = 'paid') AS cash,
         SUM(amount_cents) FILTER (WHERE status = 'paid' AND to_char(COALESCE(paid_on, date), 'YYYY-MM') = $1) AS cash_month,
         SUM(amount_cents) FILTER (WHERE status = 'unpaid') AS outstanding,
         SUM(amount_cents) FILTER (WHERE is_advance AND status = 'paid') AS advance,
         SUM(amount_cents) FILTER (WHERE status = 'covered') AS covered,
         ${D("MAX(date) FILTER (WHERE NOT is_advance)", "last_work")}
       FROM fin_expenses WHERE person_id IS NOT NULL GROUP BY person_id`,
      [month],
    ),
  ]);
  const byPerson = new Map<number, StoredPayModel[]>();
  for (const r of models.rows) {
    const list = byPerson.get(Number(r.person_id)) ?? [];
    list.push({ id: Number(r.id), model: r.model as PayModelId, params: r.params as PayParams, effectiveFrom: r.effective_from, note: r.note });
    byPerson.set(Number(r.person_id), list);
  }
  const st = new Map(stats.rows.map((r) => [Number(r.person_id), r]));
  return people.rows.map((r) => {
    const id = Number(r.id);
    const s = st.get(id);
    const ms = byPerson.get(id) ?? [];
    const advancePaid = Number(s?.advance ?? 0);
    const covered = Number(s?.covered ?? 0);
    return {
      id, name: r.name, role: r.role, notes: r.notes, active: r.active, models: ms, current: modelOn(ms, today),
      earned: Number(s?.earned ?? 0), cashPaid: Number(s?.cash ?? 0), cashThisMonth: Number(s?.cash_month ?? 0),
      outstanding: Number(s?.outstanding ?? 0), advancePaid, covered, advanceBalance: advancePaid - covered, lastWork: s?.last_work ?? null,
    };
  });
}

export async function savePerson(p: { id?: number; name: string; role: string; notes: string; active: boolean }): Promise<number> {
  if (p.id) {
    await pool.query("UPDATE fin_people SET name = $2, role = $3, notes = $4, active = $5 WHERE id = $1", [p.id, p.name, p.role, p.notes, p.active]);
    return p.id;
  }
  const { rows } = await pool.query("INSERT INTO fin_people (name, role, notes, active) VALUES ($1, $2, $3, $4) RETURNING id", [p.name, p.role, p.notes, p.active]);
  return Number(rows[0].id);
}

/** A new pay model from a date. Earlier work keeps the model it was worked out with. */
export async function addPayModel(personId: number, model: PayModelId, params: PayParams, effectiveFrom: string, note: string): Promise<void> {
  await pool.query("INSERT INTO fin_pay_models (person_id, model, params, effective_from, note) VALUES ($1, $2, $3, $4, $5)", [personId, model, JSON.stringify(params), effectiveFrom, note]);
}
export async function deletePayModel(id: number): Promise<void> {
  await pool.query("DELETE FROM fin_pay_models WHERE id = $1", [id]);
}

// ── expenses ───────────────────────────────────────────────────────────────

export interface Split { channel: string; weight: number }

export interface Expense {
  id: number;
  amount: number;
  date: string;
  payee: string;
  personId: number | null;
  personName: string | null;
  type: ExpenseType;
  categoryId: string | null;
  companyId: number | null;
  methodId: number | null;
  recordId: number | null;
  recordTitle: string | null;
  recurringId: number | null;
  status: "paid" | "unpaid" | "covered";
  paidOn: string | null;
  isAdvance: boolean;
  unitsVideos: number | null;
  unitsMinutes: number | null;
  calculated: number | null;
  paySnapshot: (PayModel & { explain?: string }) | null;
  receiptUrl: string | null;
  notes: string;
  splits: Split[];
  attachments: Array<{ id: number; filename: string; size: number }>;
  /** Fields a voice note guessed at, until checked. */
  review: string[];
  voiceId: number | null;
}

export interface ExpenseFilter {
  from?: string;
  to?: string;
  type?: string;
  category?: string;
  /** A channel name, or "general" for network-wide. */
  channel?: string;
  person?: number;
  status?: string;
  company?: number;
  q?: string;
}

const EXPENSE_SELECT = `SELECT e.*, ${D("e.date", "date_s")}, ${D("e.paid_on", "paid_on_s")}, p.name AS person_name,
    COALESCE(r.title, r.code) AS record_title,
    COALESCE((SELECT json_agg(json_build_object('channel', s.channel, 'weight', s.weight) ORDER BY s.channel) FROM fin_expense_splits s WHERE s.expense_id = e.id), '[]') AS splits,
    COALESCE((SELECT json_agg(json_build_object('id', a.id, 'filename', a.filename, 'size', a.size) ORDER BY a.id) FROM fin_attachments a WHERE a.expense_id = e.id), '[]') AS attachments
  FROM fin_expenses e
  LEFT JOIN fin_people p ON p.id = e.person_id
  LEFT JOIN records r ON r.id = e.record_id`;

function expenseRow(r: Record<string, unknown>): Expense {
  return {
    id: Number(r.id),
    amount: Number(r.amount_cents),
    date: r.date_s as string,
    payee: r.payee as string,
    personId: n(r.person_id),
    personName: (r.person_name as string | null) ?? null,
    type: r.type as ExpenseType,
    categoryId: (r.category_id as string | null) ?? null,
    companyId: n(r.company_id),
    methodId: n(r.method_id),
    recordId: n(r.record_id),
    recordTitle: (r.record_title as string | null) ?? null,
    recurringId: n(r.recurring_id),
    status: r.status as Expense["status"],
    paidOn: (r.paid_on_s as string | null) ?? null,
    isAdvance: Boolean(r.is_advance),
    unitsVideos: n(r.units_videos),
    unitsMinutes: n(r.units_minutes),
    calculated: n(r.calculated_cents),
    paySnapshot: (r.pay_snapshot as Expense["paySnapshot"]) ?? null,
    receiptUrl: (r.receipt_url as string | null) ?? null,
    notes: r.notes as string,
    splits: (r.splits as Array<{ channel: string; weight: string | number }>).map((s) => ({ channel: s.channel, weight: Number(s.weight) })),
    attachments: (r.attachments as Expense["attachments"]).map((a) => ({ ...a, id: Number(a.id) })),
    review: (r.review as string[] | null) ?? [],
    voiceId: n(r.voice_id),
  };
}

export async function listExpenses(f: ExpenseFilter, limit = 500): Promise<Expense[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => (args.push(v), `$${args.length}`);
  if (f.from) where.push(`e.date >= ${arg(f.from)}`);
  if (f.to) where.push(`e.date <= ${arg(f.to)}`);
  if (f.type) where.push(`e.type = ${arg(f.type)}`);
  if (f.category) where.push(`e.category_id = ${arg(f.category)}`);
  if (f.person) where.push(`e.person_id = ${arg(f.person)}`);
  if (f.status) where.push(f.status === "advance" ? "e.is_advance" : `e.status = ${arg(f.status)}`);
  if (f.company) where.push(`e.company_id = ${arg(f.company)}`);
  if (f.channel === "general") where.push("NOT EXISTS (SELECT 1 FROM fin_expense_splits s WHERE s.expense_id = e.id)");
  else if (f.channel) where.push(`EXISTS (SELECT 1 FROM fin_expense_splits s WHERE s.expense_id = e.id AND s.channel = ${arg(f.channel)})`);
  if (f.q) where.push(`(e.payee ILIKE ${arg(`%${f.q}%`)} OR e.notes ILIKE $${args.length} OR p.name ILIKE $${args.length})`);
  const { rows } = await pool.query(
    `${EXPENSE_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.date DESC, e.id DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`,
    args,
  );
  return rows.map(expenseRow);
}

export async function getExpense(id: number): Promise<Expense | null> {
  const { rows } = await pool.query(`${EXPENSE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] ? expenseRow(rows[0]) : null;
}

export interface ExpenseInput {
  amount: number;
  date: string;
  payee: string;
  personId: number | null;
  type: ExpenseType;
  categoryId: string | null;
  companyId: number | null;
  methodId: number | null;
  recordId: number | null;
  recurringId?: number | null;
  status: "paid" | "unpaid" | "covered";
  paidOn: string | null;
  isAdvance: boolean;
  unitsVideos: number | null;
  unitsMinutes: number | null;
  calculated: number | null;
  paySnapshot: unknown;
  receiptUrl: string | null;
  notes: string;
  splits: Split[];
  /** What a voice note guessed at. Left out, a save clears it — saving by hand is checking it. */
  review?: string[] | null;
  voiceId?: number | null;
}

export async function saveExpense(e: ExpenseInput, id?: number): Promise<number> {
  return inTransaction(async (client) => {
    const vals = [
      e.amount, e.date, e.payee, e.personId, e.type, e.categoryId, e.companyId, e.methodId, e.recordId, e.recurringId ?? null,
      e.status, e.status === "paid" ? (e.paidOn ?? e.date) : null, e.isAdvance, e.unitsVideos, e.unitsMinutes, e.calculated,
      e.paySnapshot === null || e.paySnapshot === undefined ? null : JSON.stringify(e.paySnapshot), e.receiptUrl, e.notes,
      e.review?.length ? e.review : null,
    ];
    let expenseId = id;
    if (id) {
      await client.query(
        `UPDATE fin_expenses SET amount_cents = $2, date = $3, payee = $4, person_id = $5, type = $6, category_id = $7, company_id = $8,
           method_id = $9, record_id = $10, recurring_id = $11, status = $12, paid_on = $13, is_advance = $14, units_videos = $15,
           units_minutes = $16, calculated_cents = $17, pay_snapshot = $18, receipt_url = $19, notes = $20, review = $21, updated_at = now()
         WHERE id = $1`,
        [id, ...vals],
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO fin_expenses (amount_cents, date, payee, person_id, type, category_id, company_id, method_id, record_id, recurring_id,
           status, paid_on, is_advance, units_videos, units_minutes, calculated_cents, pay_snapshot, receipt_url, notes, review, voice_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
        [...vals, e.voiceId ?? null],
      );
      expenseId = Number(rows[0].id);
    }
    await client.query("DELETE FROM fin_expense_splits WHERE expense_id = $1", [expenseId]);
    for (const s of e.splits) {
      await client.query("INSERT INTO fin_expense_splits (expense_id, channel, weight) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [expenseId, s.channel, s.weight]);
    }
    return expenseId!;
  });
}

export async function deleteExpense(id: number): Promise<void> {
  await pool.query("DELETE FROM fin_expenses WHERE id = $1", [id]);
}

/** Pay what's owed: unpaid becomes paid on a date. */
export async function markPaid(ids: number[], on: string): Promise<void> {
  if (!ids.length) return;
  await pool.query("UPDATE fin_expenses SET status = 'paid', paid_on = $2, updated_at = now() WHERE id = ANY($1::bigint[]) AND status = 'unpaid'", [ids, on]);
}

export async function addAttachment(expenseId: number, file: { filename: string; mime: string; data: Buffer }): Promise<void> {
  await pool.query("INSERT INTO fin_attachments (expense_id, filename, mime, size, data) VALUES ($1, $2, $3, $4, $5)", [expenseId, file.filename, file.mime, file.data.length, file.data]);
}
export async function getAttachment(id: number): Promise<{ filename: string; mime: string; data: Buffer } | null> {
  const { rows } = await pool.query("SELECT filename, mime, data FROM fin_attachments WHERE id = $1", [id]);
  return rows[0] ? { filename: rows[0].filename, mime: rows[0].mime, data: rows[0].data } : null;
}
export async function deleteAttachment(id: number): Promise<void> {
  await pool.query("DELETE FROM fin_attachments WHERE id = $1", [id]);
}

// ── subscriptions and recurring costs ──────────────────────────────────────

export interface Recurring {
  id: number;
  kind: "subscription" | "recurring";
  vendor: string;
  personId: number | null;
  personName: string | null;
  amount: number;
  frequency: string;
  monthly: number;
  nextBill: string | null;
  categoryId: string | null;
  companyId: number | null;
  methodId: number | null;
  autoPost: boolean;
  postStatus: "paid" | "unpaid";
  active: boolean;
  notes: string;
  splits: Split[];
  lastPosted: string | null;
  review: string[];
}

export async function listRecurring(): Promise<Recurring[]> {
  const { rows } = await pool.query(
    `SELECT r.*, ${D("r.next_bill", "next_bill_s")}, p.name AS person_name,
       COALESCE((SELECT json_agg(json_build_object('channel', s.channel, 'weight', s.weight) ORDER BY s.channel) FROM fin_recurring_splits s WHERE s.recurring_id = r.id), '[]') AS splits,
       (SELECT to_char(MAX(e.date), 'YYYY-MM-DD') FROM fin_expenses e WHERE e.recurring_id = r.id) AS last_posted
     FROM fin_recurring r LEFT JOIN fin_people p ON p.id = r.person_id
     ORDER BY NOT r.active, r.kind, r.vendor`,
  );
  return rows.map((r) => ({
    id: Number(r.id), kind: r.kind, vendor: r.vendor, personId: n(r.person_id), personName: r.person_name ?? null,
    amount: Number(r.amount_cents), frequency: r.frequency, monthly: monthlyEquivalent(Number(r.amount_cents), r.frequency),
    nextBill: r.next_bill_s ?? null, categoryId: r.category_id ?? null, companyId: n(r.company_id), methodId: n(r.method_id),
    autoPost: r.auto_post, postStatus: r.post_status, active: r.active, notes: r.notes,
    splits: (r.splits as Array<{ channel: string; weight: string }>).map((s) => ({ channel: s.channel, weight: Number(s.weight) })),
    lastPosted: r.last_posted ?? null,
    review: r.review ?? [],
  }));
}

export interface RecurringInput {
  kind: "subscription" | "recurring";
  vendor: string;
  personId: number | null;
  amount: number;
  frequency: string;
  nextBill: string | null;
  categoryId: string | null;
  companyId: number | null;
  methodId: number | null;
  autoPost: boolean;
  postStatus: "paid" | "unpaid";
  active: boolean;
  notes: string;
  splits: Split[];
  review?: string[] | null;
  voiceId?: number | null;
}

export async function saveRecurring(r: RecurringInput, id?: number): Promise<number> {
  const vals = [r.kind, r.vendor, r.personId, r.amount, r.frequency, r.nextBill, r.categoryId, r.companyId, r.methodId, r.autoPost, r.postStatus, r.active, r.notes, r.review?.length ? r.review : null];
  let rid = id;
  if (id) {
    await pool.query(
      `UPDATE fin_recurring SET kind = $2, vendor = $3, person_id = $4, amount_cents = $5, frequency = $6, next_bill = $7, category_id = $8,
         company_id = $9, method_id = $10, auto_post = $11, post_status = $12, active = $13, notes = $14, review = $15, updated_at = now() WHERE id = $1`,
      [id, ...vals],
    );
  } else {
    const { rows } = await pool.query(
      `INSERT INTO fin_recurring (kind, vendor, person_id, amount_cents, frequency, next_bill, category_id, company_id, method_id, auto_post, post_status, active, notes, review, voice_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [...vals, r.voiceId ?? null],
    );
    rid = Number(rows[0].id);
  }
  await pool.query("DELETE FROM fin_recurring_splits WHERE recurring_id = $1", [rid]);
  for (const s of r.splits) await pool.query("INSERT INTO fin_recurring_splits (recurring_id, channel, weight) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [rid, s.channel, s.weight]);
  return rid!;
}

export async function deleteRecurring(id: number): Promise<void> {
  await pool.query("DELETE FROM fin_recurring WHERE id = $1", [id]);
}

/** Post one bill of a recurring cost as an expense on `date`, then move its next bill on. */
async function postBill(r: Recurring, date: string): Promise<boolean> {
  const { rows } = await pool.query(
    `INSERT INTO fin_expenses (amount_cents, date, payee, person_id, type, category_id, company_id, method_id, recurring_id, status, paid_on, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (recurring_id, date) DO NOTHING RETURNING id`,
    [r.amount, date, r.vendor, r.personId, r.kind === "subscription" ? "subscription" : "recurring", r.categoryId, r.companyId, r.methodId, r.id,
      r.postStatus, r.postStatus === "paid" ? date : null, "Posted from its recurring schedule"],
  );
  const id = rows[0]?.id;
  if (id) for (const s of r.splits) await pool.query("INSERT INTO fin_expense_splits (expense_id, channel, weight) VALUES ($1, $2, $3)", [id, s.channel, s.weight]);
  await pool.query("UPDATE fin_recurring SET next_bill = $2 WHERE id = $1", [r.id, nextBill(date, r.frequency)]);
  return Boolean(id);
}

/**
 * Every bill that has fallen due, posted as an expense — so subscriptions
 * count in the months they were charged without being entered by hand.
 * Safe to run any number of times: one bill per recurring cost per date.
 */
export async function postDueBills(today: string): Promise<number> {
  let posted = 0;
  for (const r of await listRecurring()) {
    if (!r.active || !r.autoPost || !r.nextBill) continue;
    let bill: string | null = r.nextBill;
    for (let i = 0; bill && bill <= today && i < 60; i++) {
      if (await postBill(r, bill)) posted++;
      bill = nextBill(bill, r.frequency);
    }
  }
  return posted;
}

/** "Billed now": post the next bill by hand, whatever its date. */
export async function postNextBill(id: number, today: string): Promise<void> {
  const r = (await listRecurring()).find((x) => x.id === id);
  if (r) await postBill(r, r.nextBill && r.nextBill <= today ? r.nextBill : today);
}

// ── income ─────────────────────────────────────────────────────────────────

export interface Income {
  id: number;
  amount: number;
  periodStart: string;
  periodEnd: string;
  granularity: "month" | "week" | "day" | "custom";
  receivedOn: string | null;
  streamId: string;
  source: string;
  channel: string | null;
  companyId: number | null;
  notes: string;
  review?: string[];
  voiceId?: number | null;
}

export async function listIncome(f: { from?: string; to?: string; stream?: string; channel?: string }, limit = 500): Promise<Income[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => (args.push(v), `$${args.length}`);
  if (f.from) where.push(`period_end >= ${arg(f.from)}`);
  if (f.to) where.push(`period_start <= ${arg(f.to)}`);
  if (f.stream) where.push(`stream_id = ${arg(f.stream)}`);
  if (f.channel === "general") where.push("channel IS NULL");
  else if (f.channel) where.push(`channel = ${arg(f.channel)}`);
  const { rows } = await pool.query(
    `SELECT *, ${D("period_start", "ps")}, ${D("period_end", "pe")}, ${D("received_on", "ro")} FROM fin_income
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY period_start DESC, amount_cents DESC LIMIT ${Math.max(1, Math.min(2000, limit))}`,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id), amount: Number(r.amount_cents), periodStart: r.ps, periodEnd: r.pe, granularity: r.granularity, receivedOn: r.ro ?? null,
    streamId: r.stream_id, source: r.source, channel: r.channel ?? null, companyId: n(r.company_id), notes: r.notes,
    review: r.review ?? [], voiceId: n(r.voice_id),
  }));
}

export type IncomeInput = Omit<Income, "id">;

export async function saveIncome(i: IncomeInput, id?: number): Promise<number> {
  const vals = [i.amount, i.periodStart, i.periodEnd, i.granularity, i.receivedOn, i.streamId, i.source, i.channel, i.companyId, i.notes, i.review?.length ? i.review : null];
  if (id) {
    await pool.query(
      `UPDATE fin_income SET amount_cents = $2, period_start = $3, period_end = $4, granularity = $5, received_on = $6, stream_id = $7,
         source = $8, channel = $9, company_id = $10, notes = $11, review = $12, updated_at = now() WHERE id = $1`,
      [id, ...vals],
    );
    return id;
  }
  const { rows } = await pool.query(
    `INSERT INTO fin_income (amount_cents, period_start, period_end, granularity, received_on, stream_id, source, channel, company_id, notes, review, voice_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [...vals, i.voiceId ?? null],
  );
  return Number(rows[0].id);
}

export async function deleteIncome(id: number): Promise<void> {
  await pool.query("DELETE FROM fin_income WHERE id = $1", [id]);
}

/** One stream's month, per channel, plus each channel's entered views — for the monthly entry grid. */
export async function monthGrid(month: string, stream: string): Promise<{ amounts: Map<string, number>; views: Map<string, number>; general: number | null }> {
  const [inc, v] = await Promise.all([
    pool.query(
      "SELECT channel, SUM(amount_cents) AS c FROM fin_income WHERE stream_id = $1 AND granularity = 'month' AND period_start = $2 AND period_end = $3 AND source = '' GROUP BY channel",
      [stream, monthStart(month), monthEnd(month)],
    ),
    pool.query("SELECT channel, views FROM fin_channel_periods WHERE period_start = $1 AND period_end = $2 AND views IS NOT NULL", [monthStart(month), monthEnd(month)]),
  ]);
  const amounts = new Map<string, number>();
  let general: number | null = null;
  for (const r of inc.rows) {
    if (r.channel === null) general = Number(r.c);
    else amounts.set(r.channel, Number(r.c));
  }
  return { amounts, views: new Map(v.rows.map((r) => [r.channel as string, Number(r.views)])), general };
}

/**
 * Save a month from the grid: each channel's amount for the stream (blank
 * removes it) and its views. One row per channel × stream × month, so saving
 * again corrects rather than adds.
 */
export async function saveMonthGrid(
  month: string,
  stream: string,
  rows: Array<{ channel: string | null; amount: number | null; views?: number | null; companyId: number | null }>,
): Promise<void> {
  const ps = monthStart(month), pe = monthEnd(month);
  await inTransaction(async (client) => {
    for (const r of rows) {
      await client.query(
        "DELETE FROM fin_income WHERE stream_id = $1 AND granularity = 'month' AND period_start = $2 AND period_end = $3 AND source = '' AND channel IS NOT DISTINCT FROM $4",
        [stream, ps, pe, r.channel],
      );
      if (r.amount !== null) {
        await client.query(
          "INSERT INTO fin_income (amount_cents, period_start, period_end, granularity, stream_id, channel, company_id) VALUES ($1, $2, $3, 'month', $4, $5, $6)",
          [r.amount, ps, pe, stream, r.channel, r.companyId],
        );
      }
      if (r.channel && r.views !== undefined) {
        if (r.views === null) await client.query("DELETE FROM fin_channel_periods WHERE channel = $1 AND period_start = $2 AND period_end = $3", [r.channel, ps, pe]);
        else
          await client.query(
            `INSERT INTO fin_channel_periods (channel, period_start, period_end, granularity, views) VALUES ($1, $2, $3, 'month', $4)
             ON CONFLICT (channel, period_start, period_end) DO UPDATE SET views = EXCLUDED.views, updated_at = now()`,
            [r.channel, ps, pe, r.views],
          );
      }
    }
  });
}

// ── the facts every page is a view of ──────────────────────────────────────

/**
 * Views gained per channel in a month, from the board's own hourly snapshots:
 * each tracked video's views at the month's end less at its start. A video
 * already out before the month but first seen during it is left out (its
 * start is unknown), so this errs low — and it's labelled an estimate.
 */
async function estimatedViews(month: string, tz: string): Promise<Map<string, number>> {
  const { rows } = await pool.query(
    `WITH bounds AS (
       SELECT ($1::date::timestamp AT TIME ZONE $3) AS s, (($2::date + 1)::timestamp AT TIME ZONE $3) AS e
     ), b AS (
       SELECT DISTINCT ON (v.video_id) v.video_id, v.views FROM video_views v, bounds WHERE v.at < bounds.s ORDER BY v.video_id, v.at DESC
     ), e AS (
       SELECT DISTINCT ON (v.video_id) v.video_id, v.views FROM video_views v, bounds WHERE v.at < bounds.e ORDER BY v.video_id, v.at DESC
     )
     SELECT u.channel, SUM(e.views - COALESCE(b.views, 0)) AS gained
       FROM e JOIN uploads u ON u.video_id = e.video_id LEFT JOIN b ON b.video_id = e.video_id, bounds
      WHERE u.board AND (b.video_id IS NOT NULL OR u.published_at >= bounds.s)
      GROUP BY u.channel`,
    [monthStart(month), monthEnd(month), tz],
  );
  return new Map(rows.map((r) => [r.channel as string, Math.max(0, Number(r.gained))]));
}

let viewCache: { key: string; at: number; value: Map<string, Map<string, number>> } | null = null;

/**
 * Load everything Finance works from for these months (ascending). Ash's time
 * per channel comes from the work she finished that month: the time she
 * tracked on each piece, or its estimate from Settings when she didn't.
 */
export async function loadFacts(months: string[], tz: string): Promise<Facts> {
  const from = monthStart(months[0]!);
  const to = monthEnd(months[months.length - 1]!);
  const next = addMonths(months[months.length - 1]!, 1);
  const [inc, exp, ups, entered, done, rec, streams, sched] = await Promise.all([
    pool.query(
      `WITH m AS (SELECT generate_series($1::date, $2::date, interval '1 month')::date AS s)
       SELECT to_char(m.s, 'YYYY-MM') AS month, i.channel, i.stream_id, i.company_id,
              SUM(i.amount_cents * (LEAST(i.period_end, (m.s + interval '1 month - 1 day')::date) - GREATEST(i.period_start, m.s) + 1)::numeric
                  / (i.period_end - i.period_start + 1)) AS cents
         FROM fin_income i JOIN m ON i.period_start <= (m.s + interval '1 month - 1 day')::date AND i.period_end >= m.s
        GROUP BY 1, 2, 3, 4`,
      [from, monthStart(months[months.length - 1]!)],
    ),
    pool.query(
      `SELECT to_char(e.date, 'YYYY-MM') AS month,
              CASE WHEN e.status = 'paid' THEN to_char(COALESCE(e.paid_on, e.date), 'YYYY-MM') END AS cash_month,
              s.channel, e.category_id, e.type, e.company_id, e.person_id, e.status, e.is_advance,
              SUM(e.amount_cents * COALESCE(s.weight / t.total, 1)) AS cents
         FROM fin_expenses e
         LEFT JOIN fin_expense_splits s ON s.expense_id = e.id
         LEFT JOIN (SELECT expense_id, SUM(weight) AS total FROM fin_expense_splits GROUP BY expense_id) t ON t.expense_id = e.id
        WHERE (e.date BETWEEN $1 AND $2) OR (e.status = 'paid' AND COALESCE(e.paid_on, e.date) BETWEEN $1 AND $2)
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9`,
      [from, to],
    ),
    pool.query(
      `SELECT channel, to_char(published_at AT TIME ZONE $3, 'YYYY-MM') AS month, COUNT(*) AS n FROM uploads
        WHERE board AND published_at >= ($1::date::timestamp AT TIME ZONE $3) AND published_at < (($2::date + 1)::timestamp AT TIME ZONE $3) GROUP BY 1, 2`,
      [from, to, tz],
    ),
    pool.query(
      `SELECT channel, to_char(period_start, 'YYYY-MM') AS month, views FROM fin_channel_periods
        WHERE granularity = 'month' AND period_start >= $1 AND period_start <= $2 AND views IS NOT NULL`,
      [from, to],
    ),
    pool.query(
      `SELECT r.id, r.channel, r.category, r.kind, r.batch_no, to_char(r.done_at AT TIME ZONE $3, 'YYYY-MM') AS month, COALESCE(t.secs, 0) AS secs
         FROM records r
         LEFT JOIN (SELECT record_id, SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) AS secs FROM time_entries WHERE record_id IS NOT NULL GROUP BY record_id) t
           ON t.record_id = r.id
        WHERE r.status = 'done' AND r.channel IS NOT NULL
          AND r.done_at >= ($1::date::timestamp AT TIME ZONE $3) AND r.done_at < (($2::date + 1)::timestamp AT TIME ZONE $3)`,
      [from, to, tz],
    ),
    listRecurring(),
    pool.query("SELECT id FROM fin_streams WHERE platform"),
    pool.query(
      `SELECT channel, COUNT(*) AS n FROM records
        WHERE channel IS NOT NULL AND batch_no IS NULL AND kind <> 'review' AND status <> 'removed'
          AND air_date BETWEEN $1 AND $2 GROUP BY channel`,
      [monthStart(next), monthEnd(next)],
    ),
  ]);

  const income: IncomeFact[] = inc.rows.map((r) => ({ month: r.month, channel: r.channel ?? null, stream: r.stream_id, company: n(r.company_id), cents: Math.round(Number(r.cents)) }));
  const expenses: ExpenseFact[] = exp.rows.map((r) => ({
    month: r.month, cashMonth: r.cash_month ?? null, channel: r.channel ?? null, category: r.category_id ?? null, type: r.type, company: n(r.company_id),
    person: n(r.person_id), status: r.status, advance: r.is_advance, cents: Math.round(Number(r.cents)),
  }));

  // Estimated views, cached for ten minutes: the snapshot scan isn't free.
  const key = `${months.join(",")}|${tz}`;
  if (!viewCache || viewCache.key !== key || Date.now() - viewCache.at > 600_000) {
    const est = await Promise.all(months.map((m) => estimatedViews(m, tz).catch(() => new Map<string, number>())));
    viewCache = { key, at: Date.now(), value: new Map(months.map((m, i) => [m, est[i]!])) };
  }

  const cm = new Map<string, ChannelMonth>();
  const cell = (channel: string, month: string) => {
    const k = `${channel}|${month}`;
    let c = cm.get(k);
    if (!c) cm.set(k, (c = { channel, month, uploads: 0, views: null, viewsSource: null, ownerMinutes: 0 }));
    return c;
  };
  for (const r of ups.rows) cell(r.channel, r.month).uploads += Number(r.n);
  for (const [month, byChannel] of viewCache.value) for (const [channel, v] of byChannel) if (v > 0) Object.assign(cell(channel, month), { views: v, viewsSource: "estimated" });
  for (const r of entered.rows) Object.assign(cell(r.channel, r.month), { views: Number(r.views), viewsSource: "entered" });
  for (const r of done.rows) {
    const type = typeOf({ kind: r.kind, batchNo: r.batch_no, channel: r.channel, category: r.category } as StoredRecord);
    if (!type) continue;
    const tracked = Number(r.secs) / 60;
    const est = r.batch_no ? channelEstimate(r.channel) : typeEstimate(type);
    cell(r.channel, r.month).ownerMinutes += tracked >= 1 ? tracked : est;
  }

  const recurring: RecurringFact[] = rec
    .filter((r) => r.active)
    .map((r) => {
      const total = r.splits.reduce((a, s) => a + s.weight, 0);
      return {
        id: r.id, vendor: r.vendor, monthly: r.monthly, category: r.categoryId, kind: r.kind, person: r.personId,
        channels: r.splits.map((s) => ({ channel: s.channel, share: s.weight / total })),
      };
    });

  return {
    months,
    income,
    expenses,
    channels: [...cm.values()],
    recurring,
    platformStreams: new Set(streams.rows.map((r) => r.id as string)),
    scheduledNext: new Map(sched.rows.map((r) => [r.channel as string, Number(r.n)])),
  };
}

/** Open records for a channel, newest first — to attribute an expense to a video. */
export async function recordsForAttribution(q: string, limit = 40): Promise<Array<{ id: number; label: string; channel: string | null }>> {
  const { rows } = await pool.query(
    `SELECT id, COALESCE(title, code) AS t, code, channel FROM records
      WHERE batch_no IS NULL AND kind <> 'review' AND status <> 'removed' AND ($1 = '' OR title ILIKE $2 OR code ILIKE $2)
      ORDER BY COALESCE(air_date, created_at::date) DESC LIMIT $3`,
    [q, `%${q}%`, limit],
  );
  return rows.map((r) => ({ id: Number(r.id), label: `${r.t ?? "(untitled)"}${r.code && r.t !== r.code ? ` · ${r.code}` : ""}`, channel: r.channel ?? null }));
}

// ── voice notes ────────────────────────────────────────────────────────────

/** An entry read from a note, and what became of it. */
export interface StoredVoiceEntry {
  entry: import("../finance/voice.js").VoiceEntry;
  /** Needed before it can be logged; non-empty means it's a draft. */
  missing: string[];
  /** Where it was logged, when it was. */
  logged: { type: "expense" | "income" | "recurring" | "person"; id: number; label: string } | null;
  /** Checked by hand — "Looks right", or filled in and saved. */
  checked: boolean;
}

export interface VoiceNote {
  id: number;
  tab: import("../finance/voice.js").VoiceTab;
  transcript: string;
  entries: StoredVoiceEntry[];
  parsedBy: string;
  createdAt: Date;
}

const voiceRow = (r: Record<string, unknown>): VoiceNote => ({
  id: Number(r.id), tab: r.tab as VoiceNote["tab"], transcript: r.transcript as string, entries: r.entries as StoredVoiceEntry[],
  parsedBy: r.parsed_by as string, createdAt: r.created_at as Date,
});

export async function addVoiceNote(tab: string, transcript: string, parsedBy: string): Promise<number> {
  const { rows } = await pool.query("INSERT INTO fin_voice_notes (tab, transcript, parsed_by) VALUES ($1, $2, $3) RETURNING id", [tab, transcript, parsedBy]);
  return Number(rows[0].id);
}
export async function setVoiceEntries(id: number, entries: StoredVoiceEntry[]): Promise<void> {
  await pool.query("UPDATE fin_voice_notes SET entries = $2 WHERE id = $1", [id, JSON.stringify(entries)]);
}
export async function getVoiceNote(id: number): Promise<VoiceNote | null> {
  const { rows } = await pool.query("SELECT * FROM fin_voice_notes WHERE id = $1", [id]);
  return rows[0] ? voiceRow(rows[0]) : null;
}
/** A tab's recent notes still worth showing: the last two weeks, not dismissed. */
export async function listVoiceNotes(tab: string, limit = 8): Promise<VoiceNote[]> {
  const { rows } = await pool.query(
    "SELECT * FROM fin_voice_notes WHERE tab = $1 AND NOT dismissed AND created_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT $2",
    [tab, limit],
  );
  return rows.map(voiceRow);
}
export async function dismissVoiceNote(id: number): Promise<void> {
  await pool.query("UPDATE fin_voice_notes SET dismissed = true WHERE id = $1", [id]);
}
/** "Looks right": the rows it logged stop being marked. */
export async function clearReview(type: "expense" | "income" | "recurring", id: number): Promise<void> {
  const table = type === "expense" ? "fin_expenses" : type === "income" ? "fin_income" : "fin_recurring";
  await pool.query(`UPDATE ${table} SET review = NULL WHERE id = $1`, [id]);
}
