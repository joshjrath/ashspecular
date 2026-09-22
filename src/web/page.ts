import { LANES } from "../lanes.js";

const STYLES = `
  :root {
    --bg: #0e1014; --panel: #161a21; --panel-2: #1c212a; --line: #262d38;
    --text: #e6e9ef; --muted: #8c94a3; --accent: #4c8df6; --danger: #f0603c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  a { color: inherit; }
  header {
    position: sticky; top: 0; z-index: 10; background: rgba(14,16,20,.92);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--line);
    padding: 14px 20px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
  }
  header h1 { font-size: 16px; margin: 0; letter-spacing: .2px; }
  header .spacer { flex: 1; }
  .chip {
    border: 1px solid var(--line); background: var(--panel); color: var(--muted);
    padding: 6px 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
  }
  .chip[aria-pressed="true"] { color: var(--text); border-color: var(--accent); background: var(--panel-2); }
  input[type="search"], input[type="password"] {
    background: var(--panel); border: 1px solid var(--line); color: var(--text);
    padding: 8px 12px; border-radius: 8px; font-size: 14px; min-width: 220px;
  }
  main { padding: 20px; }
  .board { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items: start; }
  .lane { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .lane > h2 {
    margin: 0; padding: 12px 14px; font-size: 14px; display: flex; gap: 8px; align-items: center;
    border-top: 3px solid var(--laneColor); background: var(--panel-2);
  }
  .lane > h2 .count { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 13px; }
  .cards { padding: 10px; display: flex; flex-direction: column; gap: 10px; min-height: 40px; }
  .empty { color: var(--muted); font-size: 13px; padding: 8px 4px; }
  .card {
    background: var(--panel-2); border: 1px solid var(--line); border-left: 3px solid var(--laneColor);
    border-radius: 9px; padding: 11px 12px; scroll-margin-top: 90px;
  }
  .card:target { outline: 2px solid var(--accent); }
  .card .top { display: flex; gap: 8px; align-items: baseline; }
  .card .title { font-weight: 600; font-size: 14px; flex: 1; }
  .card .id { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .card .summary { color: var(--muted); font-size: 13px; margin-top: 5px; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .badge {
    font-size: 11px; padding: 2px 8px; border-radius: 6px;
    background: #23293480; border: 1px solid var(--line); color: var(--muted);
  }
  .badge.p1 { color: #ffd2c6; border-color: #7a3322; background: #3a1a12; }
  .badge.p2 { color: #ffe4c0; border-color: #6e4a1e; background: #33240f; }
  .badge.vo { color: #cfe0ff; border-color: #2f4a80; background: #16233c; }
  .badge.late { color: #ffc9c9; border-color: #7a2525; background: #3a1313; }
  .links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .links a {
    font-size: 12px; text-decoration: none; padding: 3px 9px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--panel); color: var(--text);
  }
  .links a.frameio { border-color: #3f5fa8; }
  .actions { display: flex; gap: 6px; margin-top: 10px; align-items: center; }
  .actions button, .actions select {
    background: var(--panel); border: 1px solid var(--line); color: var(--muted);
    border-radius: 6px; padding: 4px 9px; font-size: 12px; cursor: pointer;
  }
  .actions button:hover { color: var(--text); border-color: var(--accent); }
  .actions .done:hover { border-color: #3fbf7f; color: #9de9c2; }
  .actions .grow { flex: 1; }
  .login { max-width: 320px; margin: 18vh auto; text-align: center; }
  .login form { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
  .login button { background: var(--accent); border: 0; color: #fff; padding: 9px; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .err { color: var(--danger); font-size: 13px; }
  @media (max-width: 640px) { main { padding: 12px; } header { padding: 12px; } }
`;

const APP_JS = `
const LANES = window.__LANES__;
const state = { filter: 'open', q: '', items: [] };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function isLate(iso) { return iso && new Date(iso).getTime() < Date.now(); }

function badges(item) {
  const out = [];
  out.push('<span class="badge p' + item.priority + '">P' + item.priority + '</span>');
  out.push('<span class="badge">' + esc(item.kind) + '</span>');
  if (item.project) out.push('<span class="badge">' + esc(item.project) + '</span>');
  if (item.vo_needed) {
    out.push('<span class="badge vo">VO' + (item.vo_due_at ? ' by ' + esc(fmt(item.vo_due_at)) : ' needed') + '</span>');
  }
  if (item.due_at) {
    out.push('<span class="badge ' + (isLate(item.due_at) ? 'late' : '') + '">due ' + esc(fmt(item.due_at)) + '</span>');
  }
  if (item.status === 'blocked') out.push('<span class="badge late">blocked</span>');
  return out.join('');
}

function links(item) {
  const parts = (item.links || []).map(function (l) {
    return '<a class="' + esc(l.kind) + '" target="_blank" rel="noopener" href="' + esc(l.url) + '">' + esc(l.label || l.kind) + '</a>';
  });
  if (item.source_url) {
    parts.push('<a target="_blank" rel="noopener" href="' + esc(item.source_url) + '">discord</a>');
  }
  return parts.length ? '<div class="links">' + parts.join('') + '</div>' : '';
}

function laneOptions(current) {
  return LANES.concat([{ id: 'unknown', label: 'Unsorted' }]).map(function (l) {
    return '<option value="' + l.id + '"' + (l.id === current ? ' selected' : '') + '>' + esc(l.label) + '</option>';
  }).join('');
}

function card(item) {
  return '<article class="card" id="item-' + item.id + '">' +
    '<div class="top"><span class="title">' + esc(item.title) + '</span><span class="id">#' + item.id + '</span></div>' +
    (item.summary ? '<div class="summary">' + esc(item.summary) + '</div>' : '') +
    '<div class="badges">' + badges(item) + '</div>' +
    links(item) +
    '<div class="actions">' +
      '<button class="done" data-act="done" data-id="' + item.id + '">Done</button>' +
      '<button data-act="up" data-id="' + item.id + '">&uarr;</button>' +
      '<button data-act="down" data-id="' + item.id + '">&darr;</button>' +
      '<span class="grow"></span>' +
      '<select data-act="lane" data-id="' + item.id + '">' + laneOptions(item.lane) + '</select>' +
    '</div>' +
  '</article>';
}

function render() {
  const board = document.getElementById('board');
  const groups = LANES.concat([{ id: 'unknown', label: 'Unsorted', color: '#8b8b8b' }]);
  const q = state.q.toLowerCase();

  board.innerHTML = groups.map(function (l) {
    const items = state.items.filter(function (i) {
      if (i.lane !== l.id) return false;
      if (!q) return true;
      return (i.title + ' ' + (i.summary || '') + ' ' + (i.project || '')).toLowerCase().indexOf(q) !== -1;
    });
    if (l.id === 'unknown' && items.length === 0) return '';
    return '<section class="lane" style="--laneColor:' + l.color + '">' +
      '<h2>' + esc(l.label) + '<span class="count">' + items.length + '</span></h2>' +
      '<div class="cards">' + (items.length ? items.map(card).join('') : '<div class="empty">Clear.</div>') + '</div>' +
    '</section>';
  }).join('');

  if (location.hash) {
    const el = document.querySelector(location.hash);
    if (el) el.scrollIntoView({ block: 'center' });
  }
}

async function load() {
  const params = new URLSearchParams();
  if (state.filter === 'today') params.set('today', '1');
  if (state.filter === 'vo') params.set('vo', '1');
  const res = await fetch('/api/items?' + params.toString());
  if (res.status === 401) { location.href = '/login'; return; }
  state.items = await res.json();
  render();
}

async function patch(id, body) {
  const res = await fetch('/api/items/' + id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { alert('Update failed'); return; }
  await load();
}

document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const id = el.dataset.id;
  const item = state.items.find(function (i) { return String(i.id) === String(id); });
  if (!item) return;
  if (el.dataset.act === 'done') patch(id, { status: 'done' });
  if (el.dataset.act === 'up') patch(id, { priority: Math.max(1, item.priority - 1) });
  if (el.dataset.act === 'down') patch(id, { priority: Math.min(5, item.priority + 1) });
});

document.addEventListener('change', function (e) {
  const el = e.target.closest('select[data-act="lane"]');
  if (el) patch(el.dataset.id, { lane: el.value });
});

document.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
  chip.addEventListener('click', function () {
    state.filter = chip.dataset.filter;
    document.querySelectorAll('.chip[data-filter]').forEach(function (c) {
      c.setAttribute('aria-pressed', String(c === chip));
    });
    load();
  });
});

document.getElementById('q').addEventListener('input', function (e) {
  state.q = e.target.value;
  render();
});

load();
setInterval(load, 20000);
`;

export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ash Specular — Board</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <h1>Ash Specular</h1>
  <button class="chip" data-filter="open" aria-pressed="true">All open</button>
  <button class="chip" data-filter="today" aria-pressed="false">Due today</button>
  <button class="chip" data-filter="vo" aria-pressed="false">VO needed</button>
  <input id="q" type="search" placeholder="Search titles, projects…" autocomplete="off">
  <span class="spacer"></span>
  <a class="chip" href="/logout">Sign out</a>
</header>
<main><div class="board" id="board"></div></main>
<script>window.__LANES__ = ${JSON.stringify(LANES.map(({ id, label, color }) => ({ id, label, color })))};</script>
<script>${APP_JS}</script>
</body>
</html>`;
}

export function renderLogin(error?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — Ash Specular</title>
<style>${STYLES}</style>
</head>
<body>
<div class="login">
  <h1>Ash Specular</h1>
  <p class="err">${error ? error : ""}</p>
  <form method="post" action="/login">
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Sign in</button>
  </form>
</div>
</body>
</html>`;
}
