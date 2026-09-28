/**
 * A Finance voice note, logged: read it (finance/voice.ts), then log each
 * entry that has what it needs, keep the rest as drafts, and mark every
 * guessed field on the row it made so the board can show it until checked.
 */
import {
  addPayModel, addVoiceNote, getVoiceNote, listExpenses, listPeople, loadLists, markPaid, postDueBills, saveExpense, saveIncome,
  saveRecurring, setVoiceEntries, type ExpenseInput, type Lists, type Person, type StoredVoiceEntry,
} from "../../db/finance.js";
import { monthEnd, monthStart, addMonths, fmtMoney } from "../../finance/money.js";
import { computePay, modelOn, payChannels, type PayModelId, type PayParams } from "../../finance/pay.js";
import { missingFor, readVoiceNote, type VoiceEntry, type VoiceTab } from "../../finance/voice.js";
import { ORG_TZ, dateIn } from "../../parse/derive.js";

const cents = (dollars: number | null) => (dollars === null ? null : Math.round(dollars * 100));

export interface WorkInput {
  date: string;
  channels: string[];
  videos: number | null;
  minutes: number | null;
  /** An amount typed or said — overrides what the model works out. */
  amount: number | null;
  categoryId: string | null;
  notes: string;
  recordId: number | null;
  review?: string[];
  voiceId?: number | null;
}

/**
 * Log a piece of a person's work, worked out from the pay model in force on
 * its date: covered by a retainer, drawn from an advance while there's any
 * left (anything past it owed), otherwise owed. Returns what it did, or why
 * it couldn't.
 */
export async function logWork(person: Person, w: WorkInput, lists: Lists): Promise<{ ok: true; ids: number[]; explain: string } | { ok: false; why: string }> {
  const model = modelOn(person.models, w.date);
  const earned = computePay(model, { videos: w.videos, minutes: w.minutes });
  const amount = w.amount ?? earned.cents;
  if (amount === null) return { ok: false, why: earned.explain };
  const channels = w.channels.length ? w.channels : payChannels(model?.params);
  const base: ExpenseInput = {
    amount, date: w.date, payee: person.name, personId: person.id, type: "contractor", categoryId: w.categoryId,
    companyId: channels.length === 1 ? lists.channelCompany.get(channels[0]!) ?? null : null, methodId: null, recordId: w.recordId,
    status: "unpaid", paidOn: null, isAdvance: false, unitsVideos: w.videos, unitsMinutes: w.minutes, calculated: earned.cents,
    paySnapshot: model ? { model: model.model, params: model.params, effectiveFrom: model.effectiveFrom, explain: earned.explain } : null,
    receiptUrl: null, notes: w.notes.slice(0, 500), splits: channels.map((c) => ({ channel: c, weight: 1 })), review: w.review, voiceId: w.voiceId,
  };
  const ids: number[] = [];
  if (model?.model === "retainer" || model?.model === "salary") {
    // Covered by the fixed pay: logged as work, no extra cost.
    ids.push(await saveExpense({ ...base, status: "paid", paidOn: w.date }));
  } else if (person.advanceBalance > 0 && amount > 0) {
    // Drawn from the advance first — no new cash — and anything past it owed.
    const covered = Math.min(amount, person.advanceBalance);
    ids.push(await saveExpense({ ...base, amount: covered, status: "covered" }));
    if (amount > covered) ids.push(await saveExpense({ ...base, amount: amount - covered, calculated: null, notes: `${base.notes ? `${base.notes} · ` : ""}past the advance` }));
  } else {
    ids.push(await saveExpense(base));
  }
  const overridden = w.amount !== null && w.amount !== earned.cents;
  return { ok: true, ids, explain: `${earned.explain}${overridden ? ` → ${fmtMoney(amount)} (overridden)` : ""}` };
}

const methodId = (lists: Lists, said: string | null) => {
  if (!said) return null;
  const s = said.toLowerCase();
  return lists.methods.find((m) => m.label.toLowerCase().includes(s) || s.includes(m.label.toLowerCase().split(" ")[0]!))?.id ?? null;
};

/**
 * Log one entry. Needs nothing missing (see missingFor). `review` is what
 * the row carries until checked: the reader's guesses plus anything the
 * board had to assume.
 */
async function logEntry(e: VoiceEntry, voiceId: number, lists: Lists, people: Person[], today: string): Promise<StoredVoiceEntry["logged"]> {
  const person = e.person ? people.find((p) => p.name.toLowerCase() === e.person!.toLowerCase()) ?? null : null;
  const review = new Set(e.unsure);
  const date = e.date ?? today;
  const company = e.channels.length === 1 ? lists.channelCompany.get(e.channels[0]!) ?? null : null;
  switch (e.kind) {
    case "expense": {
      if (!e.category) review.add("category");
      const id = await saveExpense({
        amount: cents(e.amount)!, date, payee: (e.payee ?? person?.name ?? "").slice(0, 160), personId: person?.id ?? null,
        type: e.expense_type ?? (person ? "contractor" : "one_off"), categoryId: e.category, companyId: company, methodId: methodId(lists, e.method),
        recordId: null, status: e.status ?? "paid", paidOn: (e.status ?? "paid") === "paid" ? date : null, isAdvance: false,
        unitsVideos: e.videos, unitsMinutes: e.minutes, calculated: null, paySnapshot: null, receiptUrl: null, notes: e.notes ?? "",
        splits: e.channels.map((c) => ({ channel: c, weight: 1 })), review: [...review], voiceId,
      });
      return { type: "expense", id, label: `${fmtMoney(cents(e.amount)!)} · ${e.payee ?? person?.name ?? e.summary}` };
    }
    case "income": {
      // Revenue is usually last month's when it isn't said.
      const month = e.month ?? addMonths(today.slice(0, 7), -1);
      if (!e.month) review.add("month");
      if (!e.stream) review.add("stream");
      const channels = e.channels.length ? e.channels : [null];
      if (channels.length > 1) review.add("amount");
      let first = 0;
      for (const ch of channels) {
        const id = await saveIncome({
          amount: Math.round(cents(e.amount)! / channels.length), periodStart: monthStart(month), periodEnd: monthEnd(month), granularity: "month",
          receivedOn: e.date, streamId: e.stream ?? "other", source: (e.payee ?? "").slice(0, 120), channel: ch,
          companyId: ch ? lists.channelCompany.get(ch) ?? null : null, notes: e.notes ?? "", review: [...review], voiceId,
        });
        first ||= id;
      }
      return { type: "income", id: first, label: `${fmtMoney(cents(e.amount)!)} · ${lists.streams.find((s) => s.id === e.stream)?.label ?? "income"}${channels.length > 1 ? ` split ${channels.length} ways` : ""}` };
    }
    case "subscription": {
      if (!e.frequency) review.add("frequency");
      if (!e.next_bill) review.add("next_bill");
      if (!e.category) review.add("category");
      const id = await saveRecurring({
        kind: "subscription", vendor: e.payee!.slice(0, 120), personId: null, amount: cents(e.amount)!, frequency: e.frequency ?? "monthly",
        nextBill: e.next_bill, categoryId: e.category, companyId: company, methodId: methodId(lists, e.method), autoPost: true, postStatus: "paid",
        active: true, notes: e.notes ?? "", splits: e.channels.map((c) => ({ channel: c, weight: 1 })), review: [...review], voiceId,
      });
      await postDueBills(today);
      return { type: "recurring", id, label: `${e.payee} · ${fmtMoney(cents(e.amount)!)} ${e.frequency ?? "monthly"}` };
    }
    case "work": {
      const r = await logWork(person!, {
        date, channels: e.channels, videos: e.videos, minutes: e.minutes, amount: cents(e.amount), categoryId: e.category, notes: e.notes ?? "",
        recordId: null, review: [...review], voiceId,
      }, lists);
      if (!r.ok) throw new Error(r.why);
      return { type: "expense", id: r.ids[0]!, label: `${person!.name} · ${r.explain}` };
    }
    case "advance": {
      const id = await saveExpense({
        amount: cents(e.amount)!, date, payee: person!.name, personId: person!.id, type: "contractor", categoryId: null, companyId: null,
        methodId: methodId(lists, e.method), recordId: null, status: "paid", paidOn: date, isAdvance: true, unitsVideos: null, unitsMinutes: null,
        calculated: null, paySnapshot: null, receiptUrl: null, notes: e.notes ?? "Advance", splits: [], review: [...review], voiceId,
      });
      return { type: "expense", id, label: `Advance · ${person!.name} · ${fmtMoney(cents(e.amount)!)}` };
    }
    case "payment": {
      // Everything owed, or as much of it, oldest first, as the amount covers.
      const owed = (await listExpenses({ person: person!.id, status: "unpaid" }, 2000)).sort((a, b) => a.date.localeCompare(b.date));
      const limit = cents(e.amount);
      const pay: number[] = [];
      let total = 0;
      for (const x of owed) {
        if (limit !== null && total + x.amount > limit) break;
        pay.push(x.id);
        total += x.amount;
      }
      await markPaid(pay, date);
      return { type: "person", id: person!.id, label: pay.length ? `Paid ${person!.name} ${fmtMoney(total)} (${pay.length} item${pay.length === 1 ? "" : "s"})` : `Nothing owed to ${person!.name}` };
    }
    case "pay_model": {
      const params: PayParams = { channels: e.channels.length ? e.channels : payChannels(person!.current?.params) };
      const model = e.pay_model as PayModelId;
      if (model === "per_video" || model === "per_minute" || model === "prepaid") params.rate = cents(e.rate)!;
      if (model === "prepaid") params.per = e.minutes !== null || /minute/i.test(e.notes ?? "") ? "minute" : "video";
      if (model === "retainer" || model === "salary") { params.amount = cents(e.rate)!; params.frequency = e.frequency ?? "monthly"; }
      if (model === "revenue_share") params.pct = e.rate! / 100;
      await addPayModel(person!.id, model, params, date, "From a voice note");
      return { type: "person", id: person!.id, label: `${person!.name}'s pay changed from ${date}` };
    }
  }
}

/** Read a note, log what it can, keep the rest as drafts. Returns the note and a one-line summary. */
export async function takeVoiceNote(tab: VoiceTab, text: string): Promise<{ id: number; summary: string }> {
  const today = dateIn(ORG_TZ);
  const [lists, people] = await Promise.all([loadLists(), listPeople(today)]);
  const read = await readVoiceNote(text, {
    tab, people: people.map((p) => p.name), categories: lists.categories.filter((c) => !c.archived), streams: lists.streams.filter((s) => !s.archived),
    methods: lists.methods.filter((m) => !m.archived).map((m) => m.label),
  });
  const id = await addVoiceNote(tab, text.slice(0, 4000), read.parsedBy);
  const stored: StoredVoiceEntry[] = [];
  for (const entry of read.entries) stored.push(await settle(entry, id, lists, people, today));
  await setVoiceEntries(id, stored);
  const logged = stored.filter((s) => s.logged).length;
  const drafts = stored.filter((s) => s.missing.length).length;
  const checks = stored.filter((s) => s.logged && s.entry.unsure.length).length;
  const summary = !stored.length
    ? "Couldn't find anything to log in that — try saying an amount and what it was for."
    : [logged ? `Logged ${logged}` : "", checks ? `${checks} to check` : "", drafts ? `${drafts} need${drafts === 1 ? "s" : ""} more detail` : ""].filter(Boolean).join(" · ");
  return { id, summary };
}

/** Log an entry when it has what it needs; otherwise say what's missing. */
async function settle(entry: VoiceEntry, voiceId: number, lists: Lists, people: Person[], today: string): Promise<StoredVoiceEntry> {
  const known = Boolean(entry.person && people.some((p) => p.name.toLowerCase() === entry.person!.toLowerCase()));
  const missing = missingFor(entry, known);
  if (missing.length) return { entry, missing, logged: null, checked: false };
  try {
    return { entry, missing: [], logged: await logEntry(entry, voiceId, lists, people, today), checked: false };
  } catch (err) {
    return { entry, missing: [(err as Error).message || "couldn't log it"], logged: null, checked: false };
  }
}

/** Try a draft again — after adding the person it named, say. */
export async function retryEntry(noteId: number, index: number): Promise<string> {
  const note = await getVoiceNote(noteId);
  const item = note?.entries[index];
  if (!note || !item || item.logged) return "Nothing to retry.";
  const today = dateIn(ORG_TZ);
  const [lists, people] = await Promise.all([loadLists(), listPeople(today)]);
  note.entries[index] = await settle(item.entry, noteId, lists, people, today);
  await setVoiceEntries(noteId, note.entries);
  return note.entries[index]!.logged ? `Logged: ${note.entries[index]!.logged!.label}.` : `Still needs: ${note.entries[index]!.missing.join(", ")}.`;
}
