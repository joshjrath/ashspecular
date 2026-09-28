/**
 * Finance's routes. Every page loads the same facts (db/finance loadFacts)
 * and renders a view of them; every form writes to the same tables.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { CHANNELS } from "../../catalog.js";
import {
  addAttachment, addCategory, addCompany, addMethod, addPayModel, addStream, deleteAttachment, deleteExpense, deleteIncome, deletePayModel,
  deleteRecurring, getAttachment, getExpense, getThresholds, listExpenses, listIncome, listPeople, listRecurring, loadFacts, loadLists, markPaid,
  monthGrid, postDueBills, postNextBill, recordsForAttribution, renameItem, saveExpense, saveIncome, saveMonthGrid, savePerson, saveRecurring,
  saveThresholds, setArchived, clearReview, dismissVoiceNote, getVoiceNote, listVoiceNotes, setVoiceEntries, type StoredVoiceEntry, setChannelCompany, setStreamPlatform, type Expense, type ExpenseInput, type Lists,
} from "../../db/finance.js";
import { pool } from "../../db/pool.js";
import { DEFAULT_THRESHOLDS, EXPENSE_TYPE, FLAG, pnl, reportingMonth, type ExpenseType, type FlagId, type Thresholds } from "../../finance/metrics.js";
import { FREQUENCY, addMonths, fmtMoney, isMonth, monthEnd, monthStart, monthsEnding, parseMoney } from "../../finance/money.js";
import { PAY_MODEL, computePay, describePay, modelOn, parseTiers, payChannels, type PayModelId, type PayParams } from "../../finance/pay.js";
import { ORG_TZ, dateIn } from "../../parse/derive.js";
import type { Shell } from "../page.js";
import { renderExpenseForm, renderExpenses, renderFinanceSettings, renderContractors, renderIncome, renderIncomeEntry, renderPerson, renderSubscriptions } from "./forms.js";
import { channelAlerts, renderFinanceChannel, renderFinanceChannels, renderFinanceOverview, renderFinanceReports, reportsCsv } from "./pages.js";
import { readSplits } from "./ui.js";
import { logWork, retryEntry, takeVoiceNote } from "./voice.js";
import { VOICE_TABS, type VoiceEntry, type VoiceTab } from "../../finance/voice.js";

type Body = Record<string, string | string[] | undefined> & { __files?: UploadedFile[] };
interface UploadedFile { field: string; filename: string; mime: string; data: Buffer }

const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "").trim();
const idOf = (v: unknown) => { const n = Number(str(v)); return Number.isInteger(n) && n > 0 ? n : null; };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown) => { const s = str(v).replace(/,/g, ""); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
/** Ticked channels from a multi-select, catalog names only. */
const channelsOf = (v: unknown) => [...new Set((Array.isArray(v) ? v : v ? [v] : []).map(String).filter((c) => CHANNELS.some((ch) => ch.name === c)))];
const channelOf = (v: unknown) => { const s = str(v); return CHANNELS.some((c) => c.name === s) ? s : null; };
/** "#123 · Title" from the video picker → 123. */
const recordOf = (v: unknown) => { const m = /^#(\d+)/.exec(str(v)); return m ? Number(m[1]) : null; };
const back = (reply: FastifyReply, url: string, msg?: string) => reply.redirect(msg ? `${url}${url.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}` : url);

/**
 * multipart/form-data, by hand: fields and files. Enough for a receipt on an
 * expense form without another dependency.
 */
export function parseMultipart(buf: Buffer, contentType: string): Body {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const out: Body = { __files: [] };
  if (!m) return out;
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === "--") break;
    const headEnd = buf.indexOf("\r\n\r\n", start);
    if (headEnd === -1) break;
    const next = buf.indexOf(boundary, headEnd);
    if (next === -1) break;
    const head = buf.slice(start + 2, headEnd).toString("utf8");
    const data = buf.slice(headEnd + 4, next - 2);
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    if (name) {
      if (filename !== undefined) {
        if (filename && data.length) out.__files!.push({ field: name, filename: filename.replace(/[\\/]/g, "_").slice(0, 120), mime: /content-type:\s*([^\r\n;]+)/i.exec(head)?.[1] ?? "application/octet-stream", data });
      } else {
        const v = data.toString("utf8");
        const prev = out[name];
        out[name] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev as string, v];
      }
    }
    pos = next;
  }
  return out;
}

const cents = (d: number | null) => (d === null ? null : Math.round(d * 100));

/** A draft being finished: "noteId:index" from the Fill in link, with what to mark. */
async function draftFrom(ref: unknown): Promise<{ e: VoiceEntry; prefill: { transcript: string; ref: string; flags: { missing: string[]; unsure: string[] } } } | null> {
  const m = /^(\d+):(\d+)$/.exec(str(ref));
  if (!m) return null;
  const note = await getVoiceNote(Number(m[1]));
  const item = note?.entries[Number(m[2])];
  if (!note || !item || item.logged) return null;
  const missing = item.missing.map((x) => (x === "service" ? "payee" : x));
  return { e: item.entry, prefill: { transcript: note.transcript, ref: `${m[1]}:${m[2]}`, flags: { missing, unsure: item.entry.unsure } } };
}

/** A draft's form was saved: the note shows it logged and checked. */
async function finishDraft(ref: unknown, logged: NonNullable<StoredVoiceEntry["logged"]>): Promise<void> {
  const m = /^(\d+):(\d+)$/.exec(str(ref));
  if (!m) return;
  const note = await getVoiceNote(Number(m[1]));
  const item = note?.entries[Number(m[2])];
  if (!note || !item) return;
  note.entries[Number(m[2])] = { ...item, missing: [], logged, checked: true };
  await setVoiceEntries(note.id, note.entries);
}

/** Sustainability alerts for the sidebar and the dashboard, kept five minutes. */
let alertCache: { at: number; value: Array<{ channel: string; flag: import("../../finance/metrics.js").Flag; month: string }> } | null = null;
export function invalidateFinance(): void {
  alertCache = null;
}
export async function financeAlerts(): Promise<Array<{ channel: string; flag: import("../../finance/metrics.js").Flag; month: string }>> {
  if (alertCache && Date.now() - alertCache.at < 300_000) return alertCache.value;
  const today = dateIn(ORG_TZ);
  const { rows } = await pool.query("SELECT to_char(MAX(period_start), 'YYYY-MM') AS m FROM fin_income WHERE period_start <= $1 AND amount_cents <> 0", [today]);
  const month = rows[0]?.m as string | null;
  let value: Array<{ channel: string; flag: import("../../finance/metrics.js").Flag; month: string }> = [];
  if (month) {
    const t = await getThresholds();
    const facts = await loadFacts(monthsEnding(month, Math.max(13, t.lossMonths, t.declineMonths + 1)), ORG_TZ);
    value = channelAlerts(facts, month, t, t.dashboard).map((a) => ({ ...a, month }));
  }
  alertCache = { at: Date.now(), value };
  return value;
}

export function registerFinance(app: FastifyInstance, shell: (active: string) => Promise<Shell>): void {
  app.addContentTypeParser("multipart/form-data", { parseAs: "buffer", bodyLimit: 12 * 1024 * 1024 }, (request, body, done) => {
    try {
      done(null, parseMultipart(body as Buffer, String(request.headers["content-type"] ?? "")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  // Every write can change what the alerts say.
  app.addHook("onResponse", async (request) => {
    if (request.method === "POST" && request.url.startsWith("/finance")) invalidateFinance();
  });

  const today = () => dateIn(ORG_TZ);
  const thisMonth = () => today().slice(0, 7);
  const load = async (last: string, t?: Thresholds) => loadFacts(monthsEnding(last, Math.max(13, t?.lossMonths ?? 3, (t?.declineMonths ?? 3) + 1)), ORG_TZ);
  /** Subscriptions due are posted before any page reads the numbers. */
  const catchUp = () => postDueBills(today()).catch((err) => console.error("[finance] couldn't post due bills:", err));
  const fshell = () => shell("finance");
  const html = (reply: FastifyReply, s: string) => reply.type("text/html").send(s);

  /** The month a page opens on: the one asked for, else the latest with revenue in, else last month. */
  async function monthFor(q: unknown): Promise<string> {
    const m = str(q);
    if (isMonth(m)) return m;
    const facts = await loadFacts(monthsEnding(thisMonth(), 3), ORG_TZ);
    return reportingMonth(facts, thisMonth());
  }

  // ── overview, channels, reports ──────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance", async (request, reply) => {
    await catchUp();
    const [s, lists, t, anyData] = await Promise.all([fshell(), loadLists(), getThresholds(), pool.query("SELECT (SELECT COUNT(*) FROM fin_income) + (SELECT COUNT(*) FROM fin_expenses) AS n")]);
    const month = await monthFor(request.query.m);
    const [facts, rec] = await Promise.all([load(month, t), listRecurring()]);
    return html(reply, renderFinanceOverview(s, { month, facts, lists, thresholds: t, runRate: rec.filter((r) => r.active).reduce((a, r) => a + r.monthly, 0), empty: Number(anyData.rows[0].n) === 0 }));
  });

  app.get<{ Querystring: Record<string, string> }>("/finance/channels", async (request, reply) => {
    await catchUp();
    const [s, t] = await Promise.all([fshell(), getThresholds()]);
    const month = await monthFor(request.query.m);
    const w = [1, 3, 6, 12].includes(Number(request.query.w)) ? Number(request.query.w) : 1;
    return html(reply, renderFinanceChannels(s, { month, window: w, facts: await load(month, t), thresholds: t, showAll: request.query.all === "1" }));
  });

  app.get<{ Params: { name: string }; Querystring: Record<string, string> }>("/finance/channels/:name", async (request, reply) => {
    const channel = channelOf(request.params.name);
    if (!channel) return reply.redirect("/finance/channels");
    await catchUp();
    const [s, t, lists] = await Promise.all([fshell(), getThresholds(), loadLists()]);
    const month = await monthFor(request.query.m);
    return html(reply, renderFinanceChannel(s, { channel, month, facts: await load(month, t), lists, thresholds: t, companyId: lists.channelCompany.get(channel) ?? null }));
  });
  app.post<{ Params: { name: string }; Body: Body }>("/finance/channels/:name/company", async (request, reply) => {
    const channel = channelOf(request.params.name);
    if (channel) await setChannelCompany(channel, idOf(request.body?.company));
    return reply.redirect(`/finance/channels/${encodeURIComponent(request.params.name)}`);
  });

  const reportArgs = async (q: Record<string, string>) => {
    const to = isMonth(q.to) ? q.to : await monthFor("");
    const n = [3, 6, 12, 24].includes(Number(q.n)) ? Number(q.n) : 12;
    return { to, n, facts: await loadFacts(monthsEnding(to, n), ORG_TZ), lists: await loadLists() };
  };
  app.get<{ Querystring: Record<string, string> }>("/finance/reports", async (request, reply) => {
    await catchUp();
    const [s, args] = await Promise.all([fshell(), reportArgs(request.query)]);
    return html(reply, renderFinanceReports(s, args));
  });
  app.get<{ Querystring: Record<string, string> }>("/finance/reports.csv", async (request, reply) => {
    const args = await reportArgs(request.query);
    const kind = request.query.kind ?? "pnl";
    let csv: string;
    if (kind === "expenses" || kind === "income") csv = await rawCsv(kind, monthStart(monthsEnding(args.to, args.n)[0]!), monthEnd(args.to), args.lists);
    else csv = reportsCsv(kind, args);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="specular-${kind}-${args.to}.csv"`)
      .send(csv);
  });

  // ── income ───────────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance/income", async (request, reply) => {
    const q = request.query;
    const month = isMonth(q.m) ? q.m : await monthFor("");
    const channel = q.channel === "general" ? "general" : channelOf(q.channel) ?? undefined;
    const [s, lists, list, voice, draft] = await Promise.all([
      fshell(), loadLists(), listIncome({ from: monthStart(month), to: monthEnd(month), stream: q.stream || undefined, channel }), listVoiceNotes("income"), draftFrom(q.voice),
    ]);
    const prefill = draft
      ? {
          i: {
            amount: cents(draft.e.amount) ?? undefined, streamId: draft.e.stream ?? undefined, source: draft.e.payee ?? "", channel: draft.e.channels[0] ?? null,
            periodStart: draft.e.month ? monthStart(draft.e.month) : undefined, receivedOn: draft.e.date, notes: draft.e.notes ?? "",
          },
          voice: draft.prefill,
        }
      : undefined;
    return html(reply, renderIncome(s, { month, list, lists, filter: { stream: q.stream || undefined, channel }, msg: q.msg ?? "", voice, prefill }));
  });

  const incomeFrom = (b: Body, lists: Lists) => {
    const amount = parseMoney(str(b.amount));
    const stream = lists.streams.some((s) => s.id === str(b.stream)) ? str(b.stream) : "other";
    const channel = channelOf(b.channel);
    const from = str(b.from), to = str(b.to);
    const custom = isDate(from) && isDate(to) && to >= from;
    const month = isMonth(str(b.month)) ? str(b.month) : thisMonth();
    const days = custom ? (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 : 0;
    return amount === null
      ? null
      : {
          amount,
          periodStart: custom ? from : monthStart(month),
          periodEnd: custom ? to : monthEnd(month),
          granularity: (custom ? (days === 7 ? "week" : days === 1 ? "day" : "custom") : "month") as "month" | "week" | "day" | "custom",
          receivedOn: isDate(str(b.received)) ? str(b.received) : null,
          streamId: stream,
          source: str(b.source).slice(0, 120),
          channel,
          companyId: idOf(b.company) ?? (channel ? lists.channelCompany.get(channel) ?? null : null),
          notes: str(b.notes).slice(0, 500),
        };
  };
  app.post<{ Body: Body }>("/finance/income", async (request, reply) => {
    const i = incomeFrom(request.body ?? {}, await loadLists());
    if (!i) return back(reply, "/finance/income", "Enter an amount.");
    const newId = await saveIncome(i);
    await finishDraft(request.body?.voice, { type: "income", id: newId, label: `${fmtMoney(i.amount)} income` });
    return back(reply, `/finance/income?m=${i.periodStart.slice(0, 7)}`, "Income added.");
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/income/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const i = incomeFrom(request.body ?? {}, await loadLists());
    if (id && i) await saveIncome(i, id);
    return back(reply, `/finance/income?m=${i?.periodStart.slice(0, 7) ?? ""}`, "Saved.");
  });
  app.post<{ Params: { id: string } }>("/finance/income/:id/delete", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await deleteIncome(id);
    return back(reply, "/finance/income", "Deleted.");
  });

  app.get<{ Querystring: Record<string, string> }>("/finance/income/entry", async (request, reply) => {
    const q = request.query;
    const month = isMonth(q.m) ? q.m : addMonths(thisMonth(), -1);
    const lists = await loadLists();
    const stream = lists.streams.some((s) => s.id === q.stream) ? q.stream! : "adsense";
    const [s, grid, last, facts] = await Promise.all([fshell(), monthGrid(month, stream), monthGrid(addMonths(month, -1), stream), loadFacts([month], ORG_TZ)]);
    const estimated = new Map(facts.channels.filter((c) => c.viewsSource === "estimated" && c.views).map((c) => [c.channel, c.views!]));
    return html(reply, renderIncomeEntry(s, { month, stream, lists, amounts: grid.amounts, views: grid.views, estimated, last: last.amounts, general: grid.general, msg: q.msg ?? "" }));
  });
  app.post<{ Body: Body }>("/finance/income/entry", async (request, reply) => {
    const b = request.body ?? {};
    const month = str(b.m);
    const lists = await loadLists();
    const stream = str(b.stream);
    if (!isMonth(month) || !lists.streams.some((s) => s.id === stream)) return reply.redirect("/finance/income/entry");
    const rows = CHANNELS.map((c) => {
      const v = num(b[`v:${c.name}`]);
      return { channel: c.name as string | null, amount: parseMoney(str(b[`a:${c.name}`])), views: v === null ? null : Math.max(0, Math.round(v)), companyId: lists.channelCompany.get(c.name) ?? null };
    });
    rows.push({ channel: null, amount: parseMoney(str(b["a:__general"])), views: null, companyId: null });
    // Views belong to the channel, not the stream: only the grid for the platform stream writes them.
    const platform = lists.streams.find((s) => s.id === stream)?.platform;
    await saveMonthGrid(month, stream, rows.map((r) => (platform ? r : { ...r, views: undefined })));
    return back(reply, `/finance/income/entry?m=${month}&stream=${stream}`, "Saved — every report has it now.");
  });

  // ── expenses ─────────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance/expenses", async (request, reply) => {
    const q = request.query;
    const all = q.all === "1";
    const month = all ? null : isMonth(q.m) ? q.m : thisMonth();
    const filter: Record<string, string> = {};
    for (const k of ["type", "category", "channel", "person", "status", "company", "q"]) if (q[k]) filter[k] = q[k]!;
    const [s, lists, voice, list] = await Promise.all([
      fshell(),
      loadLists(),
      listVoiceNotes("expense"),
      listExpenses({
        from: month ? monthStart(month) : undefined, to: month ? monthEnd(month) : undefined, type: filter.type, category: filter.category, channel: filter.channel,
        person: idOf(filter.person) ?? undefined, status: filter.status, company: idOf(filter.company) ?? undefined, q: filter.q,
      }),
    ]);
    return html(reply, renderExpenses(s, { month, list, lists, filter, msg: q.msg ?? "", voice }));
  });

  const modelsByPerson = async () => {
    const people = await listPeople(today());
    return { people, models: new Map(people.map((p) => [p.id, p.current ? describePay(p.current) : ""])) };
  };
  app.get<{ Querystring: Record<string, string> }>("/finance/expenses/new", async (request, reply) => {
    const [s, lists, records, { models }] = await Promise.all([fshell(), loadLists(), recordsForAttribution(""), modelsByPerson()]);
    const person = idOf(request.query.person);
    const draft = await draftFrom(request.query.voice);
    if (draft) {
      const e = draft.e;
      const who = e.person ? lists.people.find((p) => p.name.toLowerCase() === e.person!.toLowerCase()) : undefined;
      return html(reply, renderExpenseForm(s, {
        e: {
          amount: cents(e.amount) ?? undefined, date: e.date ?? undefined, payee: e.payee ?? who?.name ?? "", personId: who?.id ?? null,
          type: e.expense_type ?? (who ? "contractor" : "one_off"), categoryId: e.category, status: e.status ?? "paid", unitsVideos: e.videos, unitsMinutes: e.minutes,
          notes: e.notes ?? "", splits: e.channels.map((c) => ({ channel: c, weight: 1 })),
          methodId: e.method ? lists.methods.find((m) => m.label.toLowerCase().includes(e.method!.toLowerCase()))?.id ?? null : null,
        },
        lists, records, models, msg: request.query.msg ?? "", voice: draft.prefill,
      }));
    }
    return html(reply, renderExpenseForm(s, { e: { personId: person, type: person ? "contractor" : "one_off" }, lists, records, models, msg: request.query.msg ?? "" }));
  });
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>("/finance/expenses/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const e = id ? await getExpense(id) : null;
    if (!e) return reply.redirect("/finance/expenses");
    const [s, lists, records, { models }] = await Promise.all([fshell(), loadLists(), recordsForAttribution(""), modelsByPerson()]);
    return html(reply, renderExpenseForm(s, { e, lists, records, models, msg: request.query.msg ?? "" }));
  });

  /** An expense from its form: a person's pay model works the amount out when it's left blank. */
  async function expenseFrom(b: Body, lists: Lists, existing?: Expense): Promise<ExpenseInput | string> {
    const date = isDate(str(b.date)) ? str(b.date) : today();
    const personId = idOf(b.person);
    const videos = num(b.videos), minutes = num(b.minutes);
    let amount = parseMoney(str(b.amount));
    let calculated: number | null = existing?.calculated ?? null;
    let snapshot: unknown = existing?.paySnapshot ?? null;
    if (personId) {
      const person = (await listPeople(today())).find((p) => p.id === personId);
      const model = person ? modelOn(person.models, date) : null;
      const unitsChanged = !existing || existing.personId !== personId || existing.unitsVideos !== videos || existing.unitsMinutes !== minutes || existing.date !== date;
      if (model && (unitsChanged || amount === null)) {
        const earned = computePay(model, { videos, minutes });
        calculated = earned.cents;
        snapshot = { model: model.model, params: model.params, effectiveFrom: model.effectiveFrom, explain: earned.explain };
      }
    }
    if (amount === null) amount = calculated;
    if (amount === null) return "Enter an amount — nothing to work it out from.";
    const splits = readSplits(b);
    const type = (EXPENSE_TYPE.has(str(b.type) as ExpenseType) ? str(b.type) : "one_off") as ExpenseType;
    const status = (["paid", "unpaid", "covered"].includes(str(b.status)) ? str(b.status) : "paid") as ExpenseInput["status"];
    const url = str(b.receipt_url);
    return {
      amount, date, payee: str(b.payee).slice(0, 160) || (personId ? lists.people.find((p) => p.id === personId)?.name ?? "" : ""),
      personId, type, categoryId: lists.categories.some((c) => c.id === str(b.category)) ? str(b.category) : null,
      companyId: idOf(b.company) ?? (splits.length === 1 ? lists.channelCompany.get(splits[0]!.channel) ?? null : null),
      methodId: idOf(b.method), recordId: recordOf(b.record), recurringId: existing?.recurringId ?? null,
      status, paidOn: isDate(str(b.paid_on)) ? str(b.paid_on) : null, isAdvance: str(b.advance) === "1",
      unitsVideos: videos, unitsMinutes: minutes, calculated, paySnapshot: snapshot,
      receiptUrl: /^https?:\/\//i.test(url) ? url.slice(0, 500) : null, notes: str(b.notes).slice(0, 2000), splits,
    };
  }
  const attach = async (id: number, b: Body) => {
    for (const f of b.__files ?? []) if (f.field === "receipt" && f.data.length <= 10 * 1024 * 1024) await addAttachment(id, f);
  };
  app.post<{ Body: Body }>("/finance/expenses", async (request, reply) => {
    const b = request.body ?? {};
    const e = await expenseFrom(b, await loadLists());
    if (typeof e === "string") return back(reply, `/finance/expenses/new${str(b.voice) ? `?voice=${encodeURIComponent(str(b.voice))}` : ""}`, e);
    const id = await saveExpense(e);
    await attach(id, b);
    await finishDraft(b.voice, { type: "expense", id, label: `${fmtMoney(e.amount)} · ${e.payee || "expense"}` });
    return back(reply, `/finance/expenses?m=${e.date.slice(0, 7)}`, "Expense added.");
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/expenses/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const existing = id ? await getExpense(id) : null;
    if (!id || !existing) return reply.redirect("/finance/expenses");
    const b = request.body ?? {};
    const e = await expenseFrom(b, await loadLists(), existing);
    if (typeof e === "string") return back(reply, `/finance/expenses/${id}`, e);
    await saveExpense(e, id);
    await attach(id, b);
    return back(reply, `/finance/expenses?m=${e.date.slice(0, 7)}`, "Saved.");
  });
  app.post<{ Params: { id: string } }>("/finance/expenses/:id/delete", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await deleteExpense(id);
    return back(reply, "/finance/expenses", "Deleted.");
  });
  app.post<{ Params: { id: string } }>("/finance/expenses/:id/paid", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await markPaid([id], today());
    return reply.redirect(String(request.headers.referer ?? "/finance/expenses").replace(/^https?:\/\/[^/]+/, "") || "/finance/expenses");
  });
  app.get<{ Params: { id: string } }>("/finance/attachments/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const a = id ? await getAttachment(id) : null;
    if (!a) return reply.code(404).send("Not found");
    const inline = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(a.mime);
    return reply
      .header("Content-Type", inline ? a.mime : "application/octet-stream")
      .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${a.filename.replace(/"/g, "")}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'")
      .send(a.data);
  });
  app.post<{ Params: { id: string } }>("/finance/attachments/:id/delete", async (request, reply) => {
    const id = idOf(request.params.id);
    const { rows } = await pool.query("SELECT expense_id FROM fin_attachments WHERE id = $1", [id]);
    if (id) await deleteAttachment(id);
    return reply.redirect(rows[0] ? `/finance/expenses/${rows[0].expense_id}` : "/finance/expenses");
  });

  // ── subscriptions ────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance/subscriptions", async (request, reply) => {
    await catchUp();
    const [s, list, lists, voice, draft] = await Promise.all([fshell(), listRecurring(), loadLists(), listVoiceNotes("subscription"), draftFrom(request.query.voice)]);
    const prefill = draft
      ? {
          r: {
            vendor: draft.e.payee ?? "", amount: cents(draft.e.amount) ?? undefined, frequency: draft.e.frequency ?? "monthly", nextBill: draft.e.next_bill,
            categoryId: draft.e.category, splits: draft.e.channels.map((c) => ({ channel: c, weight: 1 })), notes: draft.e.notes ?? "",
          },
          voice: draft.prefill,
        }
      : undefined;
    return html(reply, renderSubscriptions(s, { list, lists, msg: request.query.msg ?? "", editing: idOf(request.query.edit), voice, prefill }));
  });
  const recurringFrom = (b: Body) => {
    const amount = parseMoney(str(b.amount));
    if (amount === null || !str(b.vendor)) return null;
    return {
      kind: (str(b.kind) === "recurring" ? "recurring" : "subscription") as "subscription" | "recurring",
      vendor: str(b.vendor).slice(0, 120), personId: idOf(b.person), amount,
      frequency: FREQUENCY.has(str(b.frequency)) ? str(b.frequency) : "monthly",
      nextBill: isDate(str(b.next_bill)) ? str(b.next_bill) : null,
      categoryId: str(b.category) || null, companyId: idOf(b.company), methodId: idOf(b.method),
      autoPost: str(b.auto) === "1", postStatus: (str(b.post_status) === "unpaid" ? "unpaid" : "paid") as "paid" | "unpaid",
      active: str(b.active) === "1", notes: str(b.notes).slice(0, 500), splits: readSplits(b),
    };
  };
  app.post<{ Body: Body }>("/finance/subscriptions", async (request, reply) => {
    const r = recurringFrom(request.body ?? {});
    if (!r) return back(reply, "/finance/subscriptions", "Enter a name and a cost.");
    const rid = await saveRecurring(r);
    await finishDraft(request.body?.voice, { type: "recurring", id: rid, label: `${r.vendor} · ${fmtMoney(r.amount)}` });
    await catchUp();
    return back(reply, "/finance/subscriptions", `${r.vendor} added.`);
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/subscriptions/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const r = recurringFrom(request.body ?? {});
    if (id && r) await saveRecurring(r, id);
    await catchUp();
    return back(reply, "/finance/subscriptions", "Saved.");
  });
  app.post<{ Params: { id: string } }>("/finance/subscriptions/:id/bill", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await postNextBill(id, today());
    return back(reply, "/finance/subscriptions", "Bill posted as an expense.");
  });
  app.post<{ Params: { id: string } }>("/finance/subscriptions/:id/toggle", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await pool.query("UPDATE fin_recurring SET active = NOT active, updated_at = now() WHERE id = $1", [id]);
    return reply.redirect("/finance/subscriptions");
  });
  app.post<{ Params: { id: string } }>("/finance/subscriptions/:id/delete", async (request, reply) => {
    const id = idOf(request.params.id);
    if (id) await deleteRecurring(id);
    return back(reply, "/finance/subscriptions", "Deleted. Bills already posted stay as expenses.");
  });

  // ── contractors ──────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance/contractors", async (request, reply) => {
    await catchUp();
    const [s, people, voice] = await Promise.all([fshell(), listPeople(today()), listVoiceNotes("contractor")]);
    return html(reply, renderContractors(s, { people, msg: request.query.msg ?? "", voice }));
  });
  app.post<{ Body: Body }>("/finance/contractors", async (request, reply) => {
    const name = str(request.body?.name).slice(0, 80);
    if (!name) return reply.redirect("/finance/contractors");
    const id = await savePerson({ name, role: str(request.body?.role).slice(0, 80), notes: "", active: true });
    return reply.redirect(`/finance/contractors/${id}`);
  });
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>("/finance/contractors/:id", async (request, reply) => {
    const id = idOf(request.params.id);
    const person = (await listPeople(today())).find((p) => p.id === id);
    if (!person) return reply.redirect("/finance/contractors");
    const [s, work, lists, records, voice] = await Promise.all([fshell(), listExpenses({ person: person.id }, 200), loadLists(), recordsForAttribution(""), listVoiceNotes("contractor", 20)]);
    return html(reply, renderPerson(s, { person, work, lists, records, msg: request.query.msg ?? "", today: today(), voice }));
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/profile", async (request, reply) => {
    const id = idOf(request.params.id);
    const b = request.body ?? {};
    if (id && str(b.name)) await savePerson({ id, name: str(b.name).slice(0, 80), role: str(b.role).slice(0, 80), notes: str(b.notes).slice(0, 500), active: str(b.active) === "1" });
    return back(reply, `/finance/contractors/${id}`, "Saved.");
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/model", async (request, reply) => {
    const id = idOf(request.params.id);
    const b = request.body ?? {};
    const model = str(b.model) as PayModelId;
    if (!id || !PAY_MODEL.has(model)) return reply.redirect(`/finance/contractors/${id}`);
    const params: PayParams = {};
    const cents = (k: string) => parseMoney(str(b[k])) ?? undefined;
    if (["per_video", "per_minute", "prepaid"].includes(model)) params.rate = cents("rate") ?? 0;
    if (model === "prepaid") params.per = str(b.per) === "minute" ? "minute" : "video";
    if (model === "tiered") { params.base = cents("base"); params.tiers = parseTiers(str(b.tiers)); }
    if (model === "retainer" || model === "salary") { params.amount = cents("amount") ?? 0; params.frequency = FREQUENCY.has(str(b.frequency)) ? str(b.frequency) : "monthly"; }
    if (model === "revenue_share") params.pct = (num(b.pct) ?? 0) / 100;
    params.channels = channelsOf(b.channels);
    const from = isDate(str(b.from)) ? str(b.from) : today();
    await addPayModel(id, model, params, from, str(b.note).slice(0, 200));
    // A retainer or salary is money on a schedule: set it up as a recurring cost too.
    if ((model === "retainer" || model === "salary") && str(b.recurring) === "1" && params.amount) {
      const person = (await listPeople(today())).find((p) => p.id === id);
      await saveRecurring({
        kind: "recurring", vendor: `${person?.name ?? "Person"} — ${model === "salary" ? "salary" : "retainer"}`, personId: id, amount: params.amount,
        frequency: params.frequency ?? "monthly", nextBill: from, categoryId: null, companyId: null, methodId: null, autoPost: true, postStatus: "unpaid",
        active: true, notes: "Set up from their pay model", splits: [],
      });
    }
    return back(reply, `/finance/contractors/${id}`, "Pay model saved. Earlier work keeps the rate it was worked out with.");
  });
  app.post<{ Params: { id: string; mid: string } }>("/finance/contractors/:id/model/:mid/delete", async (request, reply) => {
    const mid = idOf(request.params.mid);
    if (mid) await deletePayModel(mid);
    return reply.redirect(`/finance/contractors/${request.params.id}`);
  });

  /** Log a piece of work: worked out from the model in force, drawn from any advance first. */
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/work", async (request, reply) => {
    const id = idOf(request.params.id);
    const b = request.body ?? {};
    const person = (await listPeople(today())).find((p) => p.id === id);
    if (!person) return reply.redirect("/finance/contractors");
    const r = await logWork(person, {
      date: isDate(str(b.date)) ? str(b.date) : today(), channels: channelsOf(b.ch), videos: num(b.videos), minutes: num(b.minutes),
      amount: parseMoney(str(b.amount)), categoryId: str(b.category) || null, notes: str(b.notes), recordId: recordOf(b.record),
    }, await loadLists());
    return back(reply, `/finance/contractors/${id}`, r.ok ? `Logged: ${r.explain}.` : `Enter an amount — ${r.why}.`);
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/share", async (request, reply) => {
    const id = idOf(request.params.id);
    const person = (await listPeople(today())).find((p) => p.id === id);
    const date = isDate(str(request.body?.date)) ? str(request.body?.date) : today();
    const model = person ? modelOn(person.models, date) : null;
    if (!person || model?.model !== "revenue_share") return reply.redirect(`/finance/contractors/${id}`);
    const month = date.slice(0, 7);
    const facts = await loadFacts([month], ORG_TZ);
    const shareChannels = payChannels(model.params);
    const revenue = shareChannels.length
      ? shareChannels.reduce((a, c) => a + pnl(facts, [month], { channel: c }).revenue, 0)
      : pnl(facts, [month], { all: true }).revenue;
    const earned = computePay(model, { revenue });
    await saveExpense({
      amount: earned.cents ?? 0, date: monthEnd(month), payee: person.name, personId: person.id, type: "contractor", categoryId: null, companyId: null, methodId: null,
      recordId: null, status: "unpaid", paidOn: null, isAdvance: false, unitsVideos: null, unitsMinutes: null, calculated: earned.cents,
      paySnapshot: { model: model.model, params: model.params, effectiveFrom: model.effectiveFrom, explain: earned.explain }, receiptUrl: null,
      notes: `Revenue share for ${month}`, splits: shareChannels.map((c) => ({ channel: c, weight: 1 })),
    });
    return back(reply, `/finance/contractors/${id}`, `Share worked out: ${earned.explain}.`);
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/advance", async (request, reply) => {
    const id = idOf(request.params.id);
    const b = request.body ?? {};
    const amount = parseMoney(str(b.amount));
    const person = (await listPeople(today())).find((p) => p.id === id);
    if (!person || !amount) return reply.redirect(`/finance/contractors/${id}`);
    const date = isDate(str(b.date)) ? str(b.date) : today();
    await saveExpense({
      amount, date, payee: person.name, personId: person.id, type: "contractor", categoryId: null, companyId: null, methodId: idOf(b.method), recordId: null,
      status: "paid", paidOn: date, isAdvance: true, unitsVideos: null, unitsMinutes: null, calculated: null, paySnapshot: null, receiptUrl: null,
      notes: "Advance", splits: [],
    });
    return back(reply, `/finance/contractors/${id}`, "Advance recorded — work logged from now is drawn from it.");
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/contractors/:id/pay", async (request, reply) => {
    const id = idOf(request.params.id);
    if (!id) return reply.redirect("/finance/contractors");
    const owed = await listExpenses({ person: id, status: "unpaid" }, 2000);
    await markPaid(owed.map((e) => e.id), isDate(str(request.body?.on)) ? str(request.body?.on) : today());
    return back(reply, `/finance/contractors/${id}`, "Paid.");
  });

  // ── voice notes ──────────────────────────────────────────────────────
  const voiceBack = (b: Body, fallback: string) => {
    const v = str(b.back);
    return /^\/finance[a-z0-9/_?=&#.-]*$/i.test(v) ? v : fallback;
  };
  app.post<{ Body: Body }>("/finance/voice", async (request, reply) => {
    const b = request.body ?? {};
    const tab = (VOICE_TABS as string[]).includes(str(b.tab)) ? (str(b.tab) as VoiceTab) : "expense";
    const text = str(b.text);
    const to = voiceBack(b, "/finance");
    if (!text) return reply.redirect(to);
    const { summary } = await takeVoiceNote(tab, text);
    return back(reply, to, summary);
  });
  // "Looks right": the row it logged stops being marked.
  app.post<{ Params: { id: string; i: string }; Body: Body }>("/finance/voice/:id/:i/ok", async (request, reply) => {
    const note = await getVoiceNote(Number(request.params.id));
    const item = note?.entries[Number(request.params.i)];
    if (note && item?.logged) {
      if (item.logged.type !== "person") await clearReview(item.logged.type, item.logged.id);
      item.checked = true;
      await setVoiceEntries(note.id, note.entries);
    }
    return reply.redirect(voiceBack(request.body ?? {}, "/finance"));
  });
  // A contractor the board didn't know yet: add them, then log what was said.
  app.post<{ Params: { id: string; i: string }; Body: Body }>("/finance/voice/:id/:i/person", async (request, reply) => {
    const note = await getVoiceNote(Number(request.params.id));
    const item = note?.entries[Number(request.params.i)];
    const to = voiceBack(request.body ?? {}, "/finance/contractors");
    if (!note || !item?.entry.person) return reply.redirect(to);
    await savePerson({ name: item.entry.person.slice(0, 80), role: "", notes: "Added from a voice note", active: true });
    return back(reply, to, await retryEntry(note.id, Number(request.params.i)));
  });
  app.post<{ Params: { id: string }; Body: Body }>("/finance/voice/:id/dismiss", async (request, reply) => {
    await dismissVoiceNote(Number(request.params.id));
    return reply.redirect(voiceBack(request.body ?? {}, "/finance"));
  });

  // ── settings ─────────────────────────────────────────────────────────
  app.get<{ Querystring: Record<string, string> }>("/finance/settings", async (request, reply) => {
    const [s, lists, thresholds] = await Promise.all([fshell(), loadLists(), getThresholds()]);
    return html(reply, renderFinanceSettings(s, { lists, thresholds, msg: request.query.msg ?? "" }));
  });
  app.post<{ Body: Body }>("/finance/settings/thresholds", async (request, reply) => {
    const b = request.body ?? {};
    const pctOf = (k: string, d: number) => { const v = num(b[k]); return v === null ? d : Math.max(0, Math.min(1, v / 100)); };
    const intOf = (k: string, d: number) => { const v = num(b[k]); return v === null ? d : Math.max(1, Math.min(24, Math.round(v))); };
    const dash = (Array.isArray(b.dash) ? b.dash : b.dash ? [b.dash] : []).filter((x): x is FlagId => FLAG.has(String(x))) as FlagId[];
    await saveThresholds({
      healthyMargin: pctOf("healthy", DEFAULT_THRESHOLDS.healthyMargin),
      minMargin: pctOf("min_margin", DEFAULT_THRESHOLDS.minMargin),
      minProfitPerHour: parseMoney(str(b.per_hour)) ?? DEFAULT_THRESHOLDS.minProfitPerHour,
      lossMonths: intOf("loss_months", DEFAULT_THRESHOLDS.lossMonths),
      declineMonths: intOf("decline_months", DEFAULT_THRESHOLDS.declineMonths),
      dashboard: dash,
    });
    return back(reply, "/finance/settings", "Thresholds saved.");
  });
  app.post<{ Body: Body }>("/finance/settings/company", async (request, reply) => {
    if (str(request.body?.name)) await addCompany(str(request.body?.name).slice(0, 120));
    return back(reply, "/finance/settings", "Company added.");
  });
  app.post<{ Body: Body }>("/finance/settings/category", async (request, reply) => {
    const colour = /^#[0-9a-f]{6}$/i.test(str(request.body?.colour)) ? str(request.body?.colour) : "#8f8fa0";
    if (str(request.body?.label)) await addCategory(str(request.body?.label).slice(0, 60), colour);
    return back(reply, "/finance/settings", "Category added.");
  });
  app.post<{ Body: Body }>("/finance/settings/stream", async (request, reply) => {
    if (str(request.body?.label)) await addStream(str(request.body?.label).slice(0, 60), str(request.body?.platform) === "1");
    return back(reply, "/finance/settings", "Stream added.");
  });
  app.post<{ Body: Body }>("/finance/settings/method", async (request, reply) => {
    if (str(request.body?.label)) await addMethod(str(request.body?.label).slice(0, 80));
    return back(reply, "/finance/settings", "Payment method added.");
  });
  app.post<{ Body: Body }>("/finance/settings/list", async (request, reply) => {
    const b = request.body ?? {};
    const table = str(b.table);
    if (!["fin_companies", "fin_categories", "fin_streams", "fin_methods"].includes(table)) return reply.redirect("/finance/settings");
    const t = table as "fin_companies" | "fin_categories" | "fin_streams" | "fin_methods";
    const id = str(b.id);
    const act = str(b.do);
    if (act === "archive" || act === "restore") await setArchived(t, id, act === "archive");
    else if (str(b.label)) await renameItem(t, id, str(b.label).slice(0, 120));
    if (t === "fin_streams" && act === "rename") await setStreamPlatform(id, str(b.platform) === "1");
    return back(reply, "/finance/settings", "Saved.");
  });
  app.post<{ Body: Body }>("/finance/settings/channels", async (request, reply) => {
    const b = request.body ?? {};
    for (const c of CHANNELS) await setChannelCompany(c.name, idOf(b[`c:${c.name}`]));
    return back(reply, "/finance/settings", "Channels saved.");
  });
}

/** Every expense or income row in a span, as CSV. */
async function rawCsv(kind: "expenses" | "income", from: string, to: string, lists: Lists): Promise<string> {
  const q = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const $ = (c: number) => (c / 100).toFixed(2);
  const company = (id: number | null) => lists.companies.find((c) => c.id === id)?.name ?? "";
  const lines: unknown[][] = [];
  if (kind === "expenses") {
    lines.push(["date", "amount", "payee", "person", "type", "category", "channels", "video", "company", "status", "paid_on", "advance", "notes"]);
    for (const e of await listExpenses({ from, to }, 2000)) {
      lines.push([e.date, $(e.amount), e.payee, e.personName ?? "", EXPENSE_TYPE.get(e.type)?.label ?? e.type, lists.categories.find((c) => c.id === e.categoryId)?.label ?? "",
        e.splits.map((s) => s.channel).join("; ") || "General", e.recordTitle ?? "", company(e.companyId), e.status, e.paidOn ?? "", e.isAdvance ? "yes" : "", e.notes]);
    }
  } else {
    lines.push(["period_start", "period_end", "amount", "stream", "source", "channel", "company", "received_on", "notes"]);
    for (const i of await listIncome({ from, to }, 2000)) {
      lines.push([i.periodStart, i.periodEnd, $(i.amount), lists.streams.find((s) => s.id === i.streamId)?.label ?? i.streamId, i.source, i.channel ?? "General", company(i.companyId), i.receivedOn ?? "", i.notes]);
    }
  }
  return lines.map((l) => l.map(q).join(",")).join("\n") + "\n";
}
