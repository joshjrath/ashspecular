/**
 * Settings: the menu, API keys, limits, the login password, channels (names,
 * colours, adding), time estimates, days off, and the sidebar and dashboard.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { DEFAULT_ESTIMATES, TYPE_BY_ID, type WorkType, batchType, channelEstimate, estimateOverrides, taskCategoryEstimate, typeEstimate } from "../work.js";
import { RAIL_ITEMS, type Shell, daysOffStrip, fmtMin, layout, pageHeader } from "../page.js";
import type { StoredRecord } from "../../db/records.js";
import { TASK_CATEGORIES } from "../../tasks/parse.js";
import { dayOf } from "../cadence.js";
import { esc } from "../html.js";
import { usDate } from "../../parse/derive.js";

/**
 * Settings: what the sidebar shows, what the dashboard shows, and the days
 * off. Kept in this browser (cookies), like the dashboard's own choices.
 */
export interface ColourRow {
  id: string;
  name: string;
  category: string;
  colour: string;
  source: "hand" | "avatar" | "catalog";
  /** Bits and Reading: the colour comes from the YouTube avatar. */
  sampled: boolean;
  linked: boolean;
  error: string | null;
  /** Names it had before a rename in Settings. */
  previous?: string[];
  /** Added in Settings, rather than one of the catalog's. */
  added?: boolean;
  /** An added channel with nothing filed under it: it can be taken off again. */
  removable?: boolean;
  /** A daily batch's uploads, for a channel that opens one. */
  daily?: number | null;
}

export function renderSettings(
  shell: Shell,
  data: {
    railHide: string[]; dashHide: string[]; daysOff: string[]; shifted: StoredRecord[]; saved: boolean; scripts: boolean;
    colours?: ColourRow[]; coloursSaved?: string; estimatesSaved?: boolean;
    /** A colour no channel wears yet, for the one being added. */
    newColour?: string;
    /** Why a rename or an addition didn't go through. */
    channelError?: string;
    /** The login password: when it was last changed here, and how the last change went; `ended` after Sign out everywhere else. */
    password?: { changedAt: Date | null; saved: boolean; error: string; ended?: boolean };
    /** API keys and daily limits set here instead of on Railway. */
    keys?: KeysView;
    limits?: LimitsView;
  },
): string {
  const off = new Set(data.railHide);
  const dash = new Set(data.dashHide);
  const box = (key: string, label: string, colour = "") =>
    `<label><input type="checkbox" name="show" value="${esc(key)}"${off.has(key) ? "" : " checked"}>${
      colour ? `<i style="--c:${colour}"></i>` : ""
    }${esc(label)}</label>`;
  const groups = (["Pages", "Categories", "Also"] as const)
    .map((g) => {
      const items = RAIL_ITEMS.filter((i) => i.group === g && (i.key !== "scripts" || data.scripts));
      return `<fieldset><legend>${g}</legend>${items
        .map((i) => box(i.key, i.label, i.key.startsWith("cat-") ? CATEGORIES.find((c) => `cat-${c.id}` === i.key)?.color ?? "" : ""))
        .join("")}</fieldset>`;
    })
    .join("");
  return layout(
    "Settings",
    shell,
    `${pageHeader("Settings")}
    ${settingsMenu(data)}
    ${data.keys ? keysSettings(data.keys) : ""}
    ${data.limits ? limitsSettings(data.limits) : ""}
    ${data.password ? passwordSettings(data.password) : ""}
    <form class="settings" id="layout" method="post" action="/settings" style="margin-top:14px">
      <input type="hidden" name="form" value="1">
      <section class="panel setgroup">
        <h2>Sidebar <span class="sub">— untick anything you don't use. Settings always stays at the bottom.</span></h2>
        <div class="setcols">${groups}</div>
      </section>
      <section class="panel setgroup">
        <h2>Dashboard</h2>
        <div class="setrow">
          <label><input type="checkbox" name="dash" value="revisions"${dash.has("revisions") ? "" : " checked"}> Revisions</label>
          <label><input type="checkbox" name="dash" value="unsorted"${dash.has("unsorted") ? "" : " checked"}> Unsorted list</label>
          <label><input type="checkbox" name="dash" value="channels"${dash.has("channels") ? "" : " checked"}> Channels list</label>
        </div>
        <p class="hint">Which categories are columns, and their order, are in the dashboard's <b>Columns</b> menu —
          or drag a column by the ⠿ beside its name.</p>
      </section>
      <div class="setsave"><button class="clear">Save</button>${data.saved ? `<span class="saved" role="status">Saved.</span>` : ""}</div>
    </form>
    <section class="panel setgroup settings" id="daysoff" style="margin-top:14px">
      <h2>Days off <span class="sub">— no work that day: anything due on it is due the working day before</span></h2>
      ${daysOffStrip(data.daysOff, data.shifted)}
    </section>
    ${estimateSettings(data.estimatesSaved ?? false)}
    ${data.colours ? colourSettings(data.colours, data.coloursSaved ?? "", data.channelError ?? "", data.newColour ?? "#8A8A93") : ""}`,
  );
}

export interface KeysView {
  services: Array<{
    id: string; label: string; what: string; where: string; many: boolean;
    source: "settings" | "railway" | "none";
    /** Masked: the start and end of each key, never the whole thing. */
    keys: Array<{ masked: string; resting?: boolean; test?: { ok: boolean; note: string } }>;
    unreadable: boolean;
  }>;
  /** What the last save, test or removal did, and to which service. */
  flash?: { id: string; text: string; error?: boolean };
}

export interface LimitsView {
  rows: Array<{ group: string; name: string; label: string; value: number; min: number; max: number; today: number | null; note?: string }>;
  saved: boolean;
}

/** The top of Settings, like a phone's: every section, with how it stands, one tap away. */
function settingsMenu(data: { keys?: KeysView; limits?: LimitsView; password?: { changedAt: Date | null }; colours?: ColourRow[]; daysOff: string[] }): string {
  const keysSet = data.keys ? data.keys.services.filter((s) => s.source !== "none").length : 0;
  const tile = (href: string, icon: string, label: string, sub: string) =>
    `<a class="setmenu-i" href="#${href}"><span class="ic" aria-hidden="true">${icon}</span><span><b>${esc(label)}</b><em>${esc(sub)}</em></span></a>`;
  return `<nav class="setmenu" aria-label="Settings sections">
    ${data.keys ? tile("keys", "🔑", "Connections & API keys", `${keysSet} of ${data.keys.services.length} connected`) : ""}
    ${data.limits ? tile("limits", "💸", "Limits & spending", "Daily caps on Claude, YouTube and Tumblr") : ""}
    ${data.password ? tile("password", "🔒", "Login password", data.password.changedAt ? `Changed ${usDate(dayOf(data.password.changedAt))}` : "Set on Railway") : ""}
    ${data.colours ? tile("colours", "📺", "Channels", `${data.colours.length} channels · names, colours, add`) : ""}
    ${tile("estimates", "⏱", "Time estimates", "How long each kind of work takes")}
    ${tile("daysoff", "🌴", "Days off", data.daysOff.length ? `${data.daysOff.length} set` : "None set")}
    ${tile("layout", "🧭", "Sidebar & dashboard", "What shows, and where")}
  </nav>`;
}

/**
 * Connections & API keys: each service's key set, replaced, tested or removed
 * right here, taking effect straight away. Keys are stored encrypted and only
 * ever shown masked; a key set here wins over Railway's, and removing it goes
 * back to Railway's.
 */
function keysSettings(k: KeysView): string {
  const badge = (s: KeysView["services"][number]) =>
    s.source === "settings" ? `<span class="keysrc here">Set here</span>` : s.source === "railway" ? `<span class="keysrc rail">From Railway</span>` : `<span class="keysrc none">Not set</span>`;
  const cards = k.services
    .map((s) => {
      const flash = k.flash?.id === s.id ? `<p class="keyres${k.flash.error ? " bad" : ""}" role="status">${esc(k.flash.text)}</p>` : "";
      const list = s.keys.length
        ? `<ul class="keylist">${s.keys
            .map(
              (x, i) => `<li><code>${esc(x.masked)}</code>${s.many && s.keys.length > 1 ? `<span class="n">${i === 0 ? "first" : `#${i + 1}`}</span>` : ""}${
                x.resting ? `<span class="rest">out of quota until midnight Pacific</span>` : ""
              }${x.test ? `<span class="${x.test.ok ? "ok" : "bad"}">${x.test.ok ? "✓" : "✗"} ${esc(x.test.note)}</span>` : ""}</li>`,
            )
            .join("")}</ul>`
        : "";
      const input = s.many
        ? `<textarea name="value" rows="3" spellcheck="false" autocomplete="off" placeholder="One key per line (or comma-separated). Saving replaces the list." aria-label="${esc(s.label)} keys"></textarea>`
        : `<input type="password" name="value" autocomplete="off" spellcheck="false" placeholder="${s.source === "none" ? "Paste the key" : "Paste a new key to replace it"}" aria-label="${esc(s.label)} key">`;
      return `<form class="keycard" id="key-${esc(s.id)}" method="post" action="/settings/keys">
        <input type="hidden" name="id" value="${esc(s.id)}">
        <div class="keyhead"><h3>${esc(s.label)}</h3>${badge(s)}</div>
        <p class="keywhat">${esc(s.what)}</p>
        ${s.unreadable ? `<p class="keyres bad">The key saved here can't be read any more (SESSION_SECRET changed) — paste it again.</p>` : ""}
        ${list}${flash}
        <div class="keyform">${input}
          <div class="keybtns">
            <button class="clear" name="do" value="save">Save</button>
            ${s.keys.length ? `<button class="ghost" name="do" value="test" formnovalidate>Test</button>` : ""}
            ${s.source === "settings" ? `<button class="ghost danger" name="do" value="clear" formnovalidate>Remove</button>` : ""}
          </div>
        </div>
        ${s.many ? `<p class="hint">Several keys (from different Google Cloud projects) multiply the daily quota: when one runs out, the next takes over until midnight Pacific.</p>` : ""}
        <p class="hint">Get one: ${esc(s.where)}</p>
      </form>`;
    })
    .join("");
  return `<section class="panel setgroup settings" id="keys" style="margin-top:14px">
    <h2>Connections &amp; API keys <span class="sub">— set or change a key here and it works straight away, no redeploy.
      Keys are stored encrypted and only shown by their first and last characters. One set here wins over Railway's; Remove goes back to Railway's.</span></h2>
    <div class="keygrid">${cards}</div>
    <p class="hint">The Discord bot token and the database stay on Railway: the board needs them to start.</p>
  </section>`;
}

/** Limits & spending: every daily cap on paid or quota'd calls, in one place. */
function limitsSettings(l: LimitsView): string {
  const groups = [...new Set(l.rows.map((r) => r.group))];
  return `<form class="panel setgroup settings limset" id="limits" method="post" action="/settings/limits" style="margin-top:14px">
    <h2>Limits &amp; spending <span class="sub">— the most each feature may use a day. Claude is billed per call, so these cap the spend;
      0 turns that use off. Counts reset at midnight.</span></h2>
    <div class="limgrid">${groups
      .map(
        (g) => `<div class="limbox" role="group" aria-label="${esc(g)}"><h3>${esc(g)}</h3>${l.rows
          .filter((r) => r.group === g)
          .map(
            (r) => `<label class="limrow"><span class="nm">${esc(r.label)}${r.note ? `<em>${esc(r.note)}</em>` : ""}</span>
              <input type="number" name="${esc(r.name)}" min="${r.min}" max="${r.max}" inputmode="numeric" value="${r.value}" aria-label="${esc(`${g}: ${r.label}`)}">
              <span class="src">${r.today === null ? "" : `${r.today.toLocaleString("en-US")} today`}</span></label>`,
          )
          .join("")}</div>`,
      )
      .join("")}</div>
    <p class="hint">For a hard monthly ceiling on Claude across everything, also set a spend limit at console.anthropic.com → Settings → Limits.</p>
    <div class="setsave"><button class="clear">Save limits</button>${l.saved ? `<span class="saved" role="status">Saved.</span>` : ""}</div>
  </form>`;
}

/**
 * The login password, changed right here: the current one, then the new one
 * twice. Everyone else is signed out; DASHBOARD_PASSWORD_RESET on the server
 * goes back to DASHBOARD_PASSWORD if it's forgotten.
 */
function passwordSettings(p: { changedAt: Date | null; saved: boolean; error: string; ended?: boolean }): string {
  return `<form class="panel setgroup settings pwset" id="password" method="post" action="/settings/password" style="margin-top:14px">
    <h2>Login password <span class="sub">— ${
      p.changedAt ? `last changed here ${esc(usDate(dayOf(p.changedAt)))}` : "still the one set on Railway (DASHBOARD_PASSWORD)"
    }. Changing it signs out every other browser and phone; this one stays signed in.</span></h2>
    <div class="chaddrow">
      <label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
      <label>New password<input type="password" name="next" required minlength="8" maxlength="200" autocomplete="new-password"></label>
      <label>New password again<input type="password" name="again" required minlength="8" maxlength="200" autocomplete="new-password"></label>
      <button class="clear">Change password</button>
    </div>
    <p class="hint">At least 8 characters. Forgotten it? On Railway, set <code>DASHBOARD_PASSWORD_RESET</code> to <code>true</code> and redeploy:
      the password goes back to <code>DASHBOARD_PASSWORD</code>. Then remove that variable.</p>
    ${p.saved ? `<p class="saved" role="status">Password changed. Every other sign-in has ended.</p>` : ""}
    ${p.error ? `<p class="seterr" role="alert">${esc(p.error)}</p>` : ""}
  </form>
  <section class="panel setgroup" id="signout" style="margin-top:14px">
    <h2>Signed in <span class="sub">— a sign-in lasts 30 days on each browser or phone.</span></h2>
    <div class="signacts">
      <form method="post" action="/logout"><button class="clear secondary">Sign out</button></form>
      <form method="post" action="/settings/sessions/end"><button class="clear secondary">Sign out everywhere else</button></form>
    </div>
    <p class="hint">Lost a phone, or signed in on a computer that isn't yours? Sign out everywhere else ends every other sign-in and keeps this one. The password stays the same.</p>
    ${p.ended ? `<p class="saved" role="status">Every other sign-in has ended.</p>` : ""}
  </section>`;
}

/**
 * Time estimates: how long each kind of work takes, the one place every page
 * counts time from. Blank is the default; a recurring channel left blank takes
 * its kind's (Reading, Bits), and a task without its own takes its category's.
 */
function estimateSettings(saved: boolean): string {
  const set = estimateOverrides();
  const field = (key: string, label: string, value: number, fallback: number, colour: string, note = "") =>
    `<label class="estrow" style="--c:${colour}"><i></i><span class="nm">${esc(label)}</span>
      <span class="estin"><input type="number" name="e:${esc(key)}" min="1" max="600" inputmode="numeric" value="${set.has(key) ? value : ""}" placeholder="${fallback}" aria-label="${esc(label)}, minutes"><em>min</em></span>
      <span class="src">${set.has(key) ? `set · default ${fallback}` : esc(note || "default")}</span></label>`;
  const core: WorkType[] = ["vo", "moviesvo", "gaming", "reading", "bits", "revision"];
  const coreRows = core
    .map((id) => { const t = TYPE_BY_ID.get(id)!; return field(`type:${id}`, t.label, typeEstimate(id), DEFAULT_ESTIMATES[id], t.colour); })
    .join("");
  const recurring = CHANNELS.filter((c) => c.recurring);
  const recRows = CATEGORIES.map((cat) => {
    const list = recurring.filter((c) => c.category === cat.id);
    if (!list.length) return "";
    return `<div class="estsub">${esc(cat.label)}</div>${list
      .map((c) => {
        const kind = batchType(c);
        const fallback = kind === "longform" ? typeEstimate("longform") : typeEstimate(kind);
        return field(`channel:${c.name}`, c.name.replace(/^Specular (?=.)/, "") || c.name, channelEstimate(c.name), fallback, c.color, kind === "longform" ? "long-form default" : `${TYPE_BY_ID.get(kind)!.label}`);
      })
      .join("")}`;
  }).join("");
  const taskRows = TASK_CATEGORIES.map((c) => field(`task:${c.id}`, `${c.emoji} ${c.label}`, taskCategoryEstimate(c.id), c.est, c.colour)).join("");
  const dailyBatches = recurring.reduce((n, c) => n + channelEstimate(c.name), 0);
  return `<form class="panel setgroup settings estset" id="estimates" method="post" action="/settings/estimates" style="margin-top:14px">
    <h2>Time estimates <span class="sub">— how long each kind of work takes you. My Day, Focus, the VO Queue, the week's load and Tasks all count from these, so a change applies everywhere straight away. Leave one blank for its default.</span></h2>
    <div class="estgrid">
      <fieldset><legend>Work</legend>${coreRows}</fieldset>
      <fieldset><legend>Recurring <span class="sub">— each channel's daily batch · ${esc(fmtMin(dailyBatches))} a day in all</span></legend>${recRows}</fieldset>
      <fieldset><legend>Tasks <span class="sub">— by category; a task can have its own on the Tasks page</span></legend>${taskRows}</fieldset>
    </div>
    <div class="setsave">
      <button class="clear">Save estimates</button>
      <button class="clear secondary" name="reset" value="1" formnovalidate>Back to defaults</button>
      ${saved ? `<span class="saved" role="status">Saved — everything's recalculated.</span>` : ""}
    </div>
  </form>`;
}

/**
 * Every channel: its name, which can be changed (everywhere at once), its
 * colour and where that comes from, with a picker to set one by hand — Bits
 * and Reading take theirs from their YouTube avatars. Below, a channel can be
 * added to any category.
 */
function colourSettings(rows: ColourRow[], saved: string, error: string, newColour: string): string {
  const why = (r: ColourRow) =>
    r.source === "hand"
      ? `set by hand <button class="linkbtn" name="reset" value="${esc(r.id)}">Reset</button>`
      : r.source === "avatar"
        ? "from its YouTube avatar"
        : r.sampled
          ? r.error
            ? `<span class="warn" title="${esc(r.error)}">avatar not read yet</span>`
            : r.linked
              ? "avatar not read yet"
              : `no YouTube link yet — <a href="/uploads?cat=${esc(r.category)}">add it</a>`
          : r.category === "stories"
            ? "its avatar colour"
            : "the board's own";
  const groups = CATEGORIES.map((c) => {
    const list = rows.filter((r) => r.category === c.id);
    if (!list.length) return "";
    return `<fieldset style="--c:${c.color}"><legend><i></i>${esc(c.label)}</legend>${list
      .map(
        (r) => `<div class="colrow">
          <input type="color" name="c_${esc(r.id)}" value="${esc(r.colour.toLowerCase())}" aria-label="${esc(r.name)}'s colour">
          <input class="chname" name="n_${esc(r.id)}" value="${esc(r.name)}" required maxlength="60" spellcheck="false" autocomplete="off" aria-label="${esc(r.name)}'s name">
          <span class="src">${why(r)}${r.added ? ` · added here${r.daily ? ` · ${r.daily} a day` : ""}` : ""}${
            r.previous?.length ? ` · <span title="A Discord message that uses an earlier name still finds it">was ${esc(r.previous.join(", "))}</span>` : ""
          }${r.removable ? ` <button class="linkbtn" formaction="/settings/channels/remove" name="remove" value="${esc(r.id)}" formnovalidate onclick="return confirm('Take ${esc(r.name).replace(/'/g, "")} off the board?')">Take off</button>` : ""}</span>
        </div>`,
      )
      .join("")}</fieldset>`;
  }).join("");
  const categoryOptions = CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  return `<form class="panel setgroup settings colourset" id="colours" method="post" action="/settings/colours" style="margin-top:14px">
    <h2>Channels <span class="sub">— rename or recolour any channel: click a name to change it. A new name is used everywhere on the board straight away,
      past videos included, and a Discord message that still uses the old one finds it. It doesn't have to match the
      YouTube channel's own name. Bits and Reading wear their YouTube avatars' colours unless you pick one.</span></h2>
    <div class="colgrid">${groups}</div>
    <div class="setsave">
      <button class="clear">Save channels</button>
      <button class="clear secondary" name="sample" value="1" formnovalidate title="Read every Bits and Reading avatar again now">Read the avatars again</button>
      ${saved ? `<span class="saved" role="status">${esc(saved)}</span>` : ""}
      ${error ? `<span class="seterr" role="alert">${esc(error)}</span>` : ""}
    </div>
  </form>
  <form class="panel setgroup settings chadd" id="addchannel" method="post" action="/settings/channels/add" style="margin-top:14px">
    <h2>Add a channel <span class="sub">— it's on every page straight away: the dashboard, the calendar, Uploads (link its YouTube
      channel there), the bot files messages that name it, and a Bits or Reading channel opens its daily batch.</span></h2>
    <div class="chaddrow">
      <label class="chcol"><input type="color" name="colour" value="${esc(newColour.toLowerCase())}" aria-label="Its colour"></label>
      <label>Name<input name="name" required maxlength="60" placeholder="Specular …" autocomplete="off"></label>
      <label>Category<select name="category" id="chcat">${categoryOptions}</select></label>
      <label class="chunits" hidden>Uploads a day<input type="number" name="units" min="0" max="50" value="5" inputmode="numeric"></label>
      <button class="clear">Add channel</button>
    </div>
    <script>
    (function () {
      var cat = document.getElementById("chcat"), units = document.querySelector("#addchannel .chunits");
      function sync() { units.hidden = !(cat.value === "bits" || cat.value === "reading"); }
      cat.addEventListener("change", sync); sync();
    })();
    </script>
  </form>`;
}
