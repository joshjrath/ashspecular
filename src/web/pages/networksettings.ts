/**
 * Settings → Network & revenue: divisions, each channel's place in Network
 * Overview (division, on or off, order, YouTube link), and the RPM
 * assumptions revenue is estimated from, each from a date on.
 */
import { esc, safeUrl } from "../html.js";
import { layout, pageHeader, type Shell } from "../page.js";
import { CATEGORIES } from "../../catalog.js";
import { usDate } from "../../parse/derive.js";
import { CURRENCIES, RPM_BOUNDS } from "../../db/network.js";
import { rpmOn } from "../../network/compute.js";
import type { Division, NetChannel, RpmRow } from "../../network/types.js";

export interface NetworkSettingsView {
  divisions: Division[];
  channels: NetChannel[];
  rpm: RpmRow[];
  coverage: Map<string, { days: number; first: string; last: string }>;
  links: Map<string, string>;
  today: string;
  saved: string;
  error: string;
}

const money = (n: number | null, c: string) => (n === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: c, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n));

function divisionsPanel(v: NetworkSettingsView): string {
  const counts = (id: string) => v.channels.filter((c) => c.divisionId === id).length;
  const rows = v.divisions.map((d, i) => `<form class="nt-drowform" method="post" action="/settings/network/divisions/${esc(d.id)}">
      <input type="color" name="colour" value="${esc(d.colour.toLowerCase())}" aria-label="${esc(d.name)}'s colour">
      <input name="name" value="${esc(d.name)}" required maxlength="40" aria-label="Division name">
      <span class="nt-dn">${counts(d.id)} channel${counts(d.id) === 1 ? "" : "s"}</span>
      <button class="clear sm">Save</button>
      <button class="linkbtn" formaction="/settings/network/divisions/${esc(d.id)}/move" name="dir" value="up"${i === 0 ? " disabled" : ""} aria-label="Move up">↑</button>
      <button class="linkbtn" formaction="/settings/network/divisions/${esc(d.id)}/move" name="dir" value="down"${i === v.divisions.length - 1 ? " disabled" : ""} aria-label="Move down">↓</button>
      ${counts(d.id) ? "" : `<button class="linkbtn" formaction="/settings/network/divisions/${esc(d.id)}/delete" formnovalidate onclick="return confirm('Delete this division?')">Delete</button>`}
    </form>`).join("");
  return `<section class="panel setgroup" id="divisions" style="margin-top:14px">
    <h2>Divisions <span class="sub">— how Network Overview groups channels. Each channel is in one, so nothing is counted twice. They don't change the board's categories, which the bot and the daily batches use.</span></h2>
    ${rows}
    <form class="nt-drowform" method="post" action="/settings/network/divisions/add">
      <input type="color" name="colour" value="#8a8a96" aria-label="New division's colour">
      <input name="name" required maxlength="40" placeholder="New division" aria-label="New division's name">
      <button class="clear sm">Add division</button>
    </form>
  </section>`;
}

function channelsPanel(v: NetworkSettingsView): string {
  const divOptions = (c: NetChannel) =>
    `<option value=""${c.divisionId ? "" : " selected"}>No division</option>${v.divisions.map((d) => `<option value="${esc(d.id)}"${c.divisionId === d.id ? " selected" : ""}>${esc(d.name)}</option>`).join("")}`;
  const rows = v.channels.map((c, i) => {
    const cov = v.coverage.get(c.name);
    const status = !c.youtubeId
      ? `<span class="nt-pill warn">not linked</span>`
      : c.error
        ? `<span class="nt-pill warn" title="${esc(c.error)}">last read failed</span>`
        : `<span class="nt-pill">${c.checkedAt ? esc(`read ${usDate(c.checkedAt.toISOString().slice(0, 10))}`) : "not read yet"}</span>`;
    const avatar = safeUrl(c.avatarUrl);
    return `<tr>
      <td class="l"><span class="nt-ch">${avatar ? `<img class="nt-av" src="${esc(avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nt-av" style="background:${esc(c.colour)}"></span>`}<span>${esc(c.name)}<small>${esc(c.youtubeId ?? "no channel id yet")}${c.title && c.title !== c.name ? ` · ${esc(c.title)}` : ""}</small></span></span></td>
      <td class="l"><select name="div_${esc(c.id)}" aria-label="${esc(c.name)}'s division">${divOptions(c)}</select></td>
      <td><input type="checkbox" name="on_${esc(c.id)}" value="1"${c.active ? " checked" : ""} aria-label="Show ${esc(c.name)} in Network Overview"></td>
      <td class="l"><input class="nt-link" name="link_${esc(c.id)}" value="${esc(v.links.get(c.name) ?? "")}" placeholder="youtube.com/@…" aria-label="${esc(c.name)}'s YouTube link"></td>
      <td class="l">${status}<small class="nt-cov">${cov ? esc(`${cov.days} day${cov.days === 1 ? "" : "s"} of totals since ${usDate(cov.first)}`) : "no daily totals yet"}</small></td>
      <td class="l nt-order"><button class="linkbtn" formaction="/settings/network/channels/${esc(c.id)}/move" name="dir" value="up"${i === 0 ? " disabled" : ""} aria-label="Move ${esc(c.name)} up">↑</button><button class="linkbtn" formaction="/settings/network/channels/${esc(c.id)}/move" name="dir" value="down"${i === v.channels.length - 1 ? " disabled" : ""} aria-label="Move ${esc(c.name)} down">↓</button></td>
    </tr>`;
  }).join("");
  const categoryOptions = CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  const divisionOptions = v.divisions.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
  return `<form class="panel setgroup" id="channels" method="post" action="/settings/network/channels" style="margin-top:14px">
    <h2>Channels <span class="sub">— each channel's division, whether it's counted in Network Overview, its YouTube link and order. Changing a link starts that channel's history again. Untick to leave a channel out without removing it from the board.</span></h2>
    <div class="nt-scroll"><table class="nt-table"><thead><tr><th class="l">Channel</th><th class="l">Division</th><th>In Network</th><th class="l">YouTube link</th><th class="l">Data</th><th class="l">Order</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="setsave"><button class="clear">Save channels</button><a class="clear secondary" href="/settings#colours">Rename or take channels off the board</a></div>
  </form>
  <form class="panel setgroup" id="addnet" method="post" action="/settings/network/channels/add" style="margin-top:14px">
    <h2>Add a channel <span class="sub">— added to the whole board, in Network Overview straight away. Its category is what the board does with it (a Bits or Reading channel opens a daily batch); its division is how Network Overview groups it.</span></h2>
    <div class="chaddrow">
      <label>Name<input name="name" required maxlength="60" placeholder="Specular …" autocomplete="off"></label>
      <label>YouTube link<input name="link" placeholder="youtube.com/@…" autocomplete="off"></label>
      <label>Category<select name="category">${categoryOptions}</select></label>
      <label>Division<select name="division">${divisionOptions}</select></label>
      <button class="clear">Add channel</button>
    </div>
  </form>`;
}

function rpmPanel(v: NetworkSettingsView): string {
  const blocks = v.channels.map((c) => {
    const rows = v.rpm.filter((r) => r.channel === c.name);
    const now = rpmOn(rows, v.today);
    const summary = now
      ? `${esc(money(now.long, now.currency))} long · ${esc(money(now.short, now.currency))} Shorts${now.blended !== null ? ` · ${esc(money(now.blended, now.currency))} blended` : ""}`
      : `<span class="nt-pill warn">needs an RPM</span>`;
    const last = rows.length ? rows.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;
    const history = rows.length
      ? `<table class="nt-table"><thead><tr><th class="l">From</th><th>Long-form</th><th>Shorts</th><th>Blended</th><th class="l">Notes</th><th></th></tr></thead><tbody>${[...rows].reverse().map((r) => `<tr>
          <td class="l">${esc(usDate(r.from))}</td><td>${esc(money(r.long, r.currency))}</td><td>${esc(money(r.short, r.currency))}</td><td>${esc(money(r.blended, r.currency))}</td>
          <td class="l">${esc(r.notes)}</td>
          <td><form method="post" action="/settings/network/rpm/${r.id}/delete"><button class="linkbtn" onclick="return confirm('Delete this RPM entry? Estimates from its date use the one before it.')">Delete</button></form></td></tr>`).join("")}</tbody></table>`
      : "";
    return `<details class="nt-rpm" id="rpm-${esc(c.id)}"${now ? "" : " open"}><summary><b>${esc(c.name)}</b> <span>${summary}</span>${last ? `<small>changed ${esc(usDate(last.createdAt.toISOString().slice(0, 10)))}</small>` : ""}</summary>
      ${history}
      <form class="chaddrow nt-rpmform" method="post" action="/settings/network/rpm">
        <input type="hidden" name="channel" value="${esc(c.id)}">
        <label>From<input type="date" name="from" value="${esc(v.today)}" required></label>
        <label>Long-form RPM<input name="long" inputmode="decimal" placeholder="e.g. 5.00" value="${now?.long ?? ""}"></label>
        <label>Shorts RPM<input name="short" inputmode="decimal" placeholder="e.g. 0.12" value="${now?.short ?? ""}"></label>
        <label>Blended RPM <small>optional</small><input name="blended" inputmode="decimal" placeholder="fallback" value="${now?.blended ?? ""}"></label>
        <label>Currency<select name="currency">${CURRENCIES.map((x) => `<option${(now?.currency ?? "USD") === x ? " selected" : ""}>${x}</option>`).join("")}</select></label>
        <label class="wide">Notes<input name="notes" maxlength="300" value=""></label>
        <button class="clear sm">Save from this date</button>
      </form>
    </details>`;
  }).join("");
  return `<section class="panel setgroup" id="rpm" style="margin-top:14px">
    <h2>Revenue estimates / RPM settings <span class="sub">— per channel, revenue per 1,000 views, from a date on. Long-form views use the long-form RPM, Shorts the Shorts RPM, and views that can't be told apart (or a format with no RPM of its own) the blended one. A new entry starts on its date and leaves earlier estimates as they were. Between ${RPM_BOUNDS.min} and ${RPM_BOUNDS.max}. These are your assumptions, not YouTube's figures.</span></h2>
    <p class="hint">Not sure what to put? Each channel's real RPM is in YouTube Studio → Analytics → Revenue (switch to the channel first; the Content tab splits long-form and Shorts). Use the last 28 or 90 days. Until a channel has one, its revenue is left out, never counted as $0; views and subscribers show either way.</p>
    ${blocks}
  </section>`;
}

export function renderNetworkSettings(shell: Shell, v: NetworkSettingsView): string {
  return layout(
    "Network & revenue · Settings",
    shell,
    `${pageHeader("Network & revenue", `<a class="clear secondary" href="/settings">← Settings</a><a class="clear secondary" href="/network">Network Overview</a>`)}
    ${v.saved ? `<p class="saved" role="status">${esc(v.saved)}</p>` : ""}${v.error ? `<p class="seterr" role="alert">${esc(v.error)}</p>` : ""}
    <nav class="setmenu" aria-label="Sections">
      <a class="setmenu-i" href="#divisions"><span class="ic" aria-hidden="true">🗂</span><span><b>Divisions</b><em>${v.divisions.length} divisions</em></span></a>
      <a class="setmenu-i" href="#channels"><span class="ic" aria-hidden="true">📺</span><span><b>Channels</b><em>${v.channels.filter((c) => c.active).length} of ${v.channels.length} in Network</em></span></a>
      <a class="setmenu-i" href="#rpm"><span class="ic" aria-hidden="true">💵</span><span><b>RPM settings</b><em>${v.channels.filter((c) => !rpmOn(v.rpm.filter((r) => r.channel === c.name), v.today)).length} need one</em></span></a>
    </nav>
    ${divisionsPanel(v)}${channelsPanel(v)}${rpmPanel(v)}`,
  );
}
