/**
 * The board's stylesheet: one block of CSS every page carries in its <head>
 * (layout() puts it there). Colours are the CSS variables at the top; a
 * feature's own styles sit together under a comment naming it.
 */


export const CSS = `
/* ──────────────────────────────────────────────────────────────────────────
   A dark shell holding blocks of flat colour.

   Each card is a solid field with a big radius, and the loud ones — salmon,
   yellow — carry black text, which is what keeps a bright block from turning
   into decoration. Everything else is dark: charcoal cards on a near-black
   shell, light text, and every colour checked for contrast against them.

   Bricolage Grotesque states the facts: the title, the counts, the names of
   things. Archivo does the working text under it.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  color-scheme: dark;
  --shell: #0B0B0D; --rail: #151518; --card: #18181C; --dark: #222228;
  --sunk: #222227; --raised: #2C2C33; --line: #34343B;
  --ink: #F3F3F5; --ink2: #BDBDC6; --ink3: #94949E; --dim: #82828C;
  /* A pale ring keeps a dark channel dot (Verse's navy) visible on dark. */
  --ring: rgba(255,255,255,.3);
  --salmon: #F2A79C; --yellow: #F3E96C; --late: #F2685E; --warn: #EE9A55; --ok: #56C990;
  --lf: #4A5CD4; --rd: #CE7118; --gm: #35986A; --bt: #AC63C8;
  --r: 26px;
  --display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --ui: "Archivo", ui-sans-serif, -apple-system, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--shell); color: #fff;
  font: 400 14px/1.55 var(--ui);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: var(--display); }

/* ── shell ─────────────────────────────────────────────────────────────── */
/* minmax(0,…), not 1fr: a grid item defaults to min-width:auto, so a wide
   scrolling row inside would size its own column and push the page sideways. */
.shell { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh; }
.shell > * { min-width: 0; }
aside { padding: 28px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
aside .inner { background: var(--rail); border-radius: var(--r); padding: 26px 14px; min-height: 100%; }
aside .mark {
  font-family: var(--display); font-size: 25px; font-weight: 800; letter-spacing: -0.045em;
  display: block; padding: 0 12px 30px; line-height: 1; color: #fff;
}
aside nav a {
  display: flex; align-items: center; gap: 11px; padding: 12px 14px; border-radius: 16px;
  color: #9A9AA3; font-size: 14.5px; font-weight: 500; letter-spacing: -0.012em; margin-bottom: 3px;
}
aside nav a:hover { background: #222225; color: #fff; }
aside nav a.on { background: var(--salmon); color: #101012; font-weight: 700; }
aside nav a .n {
  margin-left: auto; font-family: var(--display); font-size: 13px; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
aside h3 {
  font-family: var(--ui); font-size: 10px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: #7E7E88; margin: 30px 0 10px; padding: 0 14px;
}
aside .cat {
  display: flex; align-items: center; gap: 11px; padding: 10px 14px; border-radius: 16px;
  font-size: 14px; color: #9A9AA3; letter-spacing: -0.012em;
}
aside .cat:hover { background: #222225; color: #fff; }
aside .cat .dot { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
aside .cat .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 13px;
  font-variant-numeric: tabular-nums;
}
aside .live {
  margin-top: 28px; padding: 13px 14px; border-radius: 18px; background: #222225;
  font-size: 12px; color: #9A9AA3; display: flex; align-items: center; gap: 9px;
}
aside .removed-link {
  display: block; margin-top: 10px; padding: 8px 14px; border-radius: 14px;
  font-size: 12px; color: var(--dim);
}
aside .removed-link:hover, aside .removed-link.on { color: #fff; background: #222225; }
aside .settings-link { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 14px; border-radius: 14px;
  font-size: 12.5px; color: #9A9AA3; }
aside .settings-link svg { width: 15px; height: 15px; flex: none; }
aside .settings-link:hover, aside .settings-link.on { color: #fff; background: #222225; }
.settings { display: grid; gap: 14px; max-width: 980px; }
.setgroup h2 { margin: 0 0 4px; }
.setgroup .sub { color: var(--dim); font-weight: 500; font-size: 13px; font-family: var(--ui); letter-spacing: 0; }
.setgroup p.hint { margin: 10px 0 0; }
.setcols { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 18px; margin-top: 12px; }
.setcols fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.setcols legend { padding: 0 10px 6px; color: var(--ink3); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.setcols label, .setrow label { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px;
  color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; }
.setcols label:hover, .setrow label:hover { background: var(--sunk); }
.setcols input, .setrow input { width: 17px; height: 17px; margin: 0; accent-color: var(--yellow); flex: none; }
.setcols i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); flex: none; }
.setrow { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; }
.setsave { display: flex; align-items: center; gap: 14px; }
.setsave .saved { color: #7EE2B8; font-weight: 700; font-size: 13.5px; }
.settings .offstrip { margin: 12px 0 0; padding: 0; background: none; }
.settings .offstrip .lbl { display: none; }
.colgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px 22px; margin: 12px 0 16px; }
.colgrid fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.colgrid legend { display: flex; align-items: center; gap: 8px; padding: 0 6px 6px; color: var(--ink3); font-size: 11px;
  font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.colgrid legend i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.colrow { display: grid; grid-template-columns: 34px minmax(0, 1fr); column-gap: 10px; align-items: center; padding: 6px;
  border-radius: 10px; }
.colrow:hover { background: var(--sunk); }
.colrow input[type=color] { grid-row: span 2; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%;
  background: none; cursor: pointer; }
.colrow input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
.colrow input[type=color]::-webkit-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.colrow input[type=color]::-moz-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.colrow .nm { font-weight: 700; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.colrow .src { color: var(--ink3); font-size: 12px; }
.colrow .src a { color: #9FDDF4; }
.colrow .chname { min-width: 0; width: 100%; padding: 4px 8px; margin: 0 0 2px -8px; border: 1px solid transparent; border-radius: 8px;
  border-bottom: 1px dashed #4A4A55; background: transparent; color: var(--ink); font: inherit; font-weight: 700; font-size: 13.5px; }
.colrow .chname:hover { border-color: var(--line); }
.colrow .chname:focus { border-color: var(--yellow); background: var(--sunk); outline: none; }
.setmenu { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 8px; margin: 0 0 4px; }
.setmenu-i { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-radius: var(--r); background: var(--card);
  color: var(--ink); text-decoration: none; border: 1px solid transparent; min-width: 0; }
.setmenu-i:hover { border-color: var(--line); background: var(--sunk); }
.setmenu-i .ic { font-size: 20px; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--sunk); flex: none; }
.setmenu-i b { display: block; font-size: 14px; }
.setmenu-i em { display: block; font-style: normal; color: var(--ink3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.setmenu-i > span:last-child { min-width: 0; }
.keygrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 12px; margin-top: 12px; }
.keycard { background: var(--sunk); border-radius: var(--r); padding: 14px; min-width: 0; }
.keyhead { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.keyhead h3 { margin: 0; font-size: 15px; }
.keysrc { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.keysrc.here { background: rgba(126,226,184,.15); color: #7EE2B8; }
.keysrc.rail { background: rgba(159,221,244,.13); color: #9FDDF4; }
.keysrc.none { background: rgba(255,138,128,.13); color: #FF8A80; }
.keywhat { color: var(--ink2); font-size: 13px; margin: 6px 0 8px; }
.keylist { list-style: none; padding: 0; margin: 0 0 8px; display: grid; gap: 4px; }
.keylist li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12.5px; }
.keylist code { font-size: 12.5px; }
.keylist .n { color: var(--ink3); }
.keylist .rest { color: var(--yellow); }
.keylist .ok, .keyres { color: #7EE2B8; font-weight: 700; }
.keylist .bad, .keyres.bad { color: #FF8A80; font-weight: 700; }
.keyres { font-size: 13px; margin: 4px 0 8px; }
.keyform { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.keyform input, .keyform textarea { flex: 1 1 200px; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--card); color: var(--ink); font-size: 13px; font-family: ui-monospace, monospace; }
.keyform textarea { resize: vertical; }
.keybtns { display: flex; gap: 6px; flex-wrap: wrap; }
.keybtns .ghost { background: transparent; border: 1px solid var(--line); color: var(--ink2); border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.keybtns .ghost:hover { color: var(--ink); border-color: var(--ink3); }
.keybtns .ghost.danger:hover { color: #FF8A80; border-color: #FF8A80; }
.limgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 12px; margin-top: 10px; align-items: start; }
.limbox { padding: 12px; background: var(--sunk); border-radius: var(--r); min-width: 0; }
.limbox h3 { margin: 0 0 6px; font-size: 13px; color: var(--ink2); }
.limrow { display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 2px 10px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.limrow .nm { font-size: 13px; font-weight: 600; color: var(--ink); }
.limrow .nm em { display: block; font-style: normal; color: var(--ink3); font-size: 11.5px; font-weight: 500; }
.limrow input { width: 92px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; }
.limrow .src { grid-column: 1 / -1; color: var(--ink3); font-size: 12px; }
.limrow .src:empty { display: none; }
.limset, #keys { grid-template-columns: minmax(0, 1fr); }
.limset .saved { color: #7EE2B8; font-weight: 700; font-size: 13.5px; }
.setsave .seterr, .pwset .seterr { color: #FF8A80; font-weight: 700; font-size: 13.5px; }
.pwset .saved { color: #7EE2B8; font-weight: 700; font-size: 13.5px; }
.chaddrow input[type=password] { width: min(220px, 70vw); }
.chaddrow { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 14px; margin-top: 12px; }
.chaddrow label { display: flex; flex-direction: column; gap: 4px; color: var(--ink3); font-size: 12px; font-weight: 600; }
.chaddrow input:not([type=color]), .chaddrow select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--sunk);
  color: var(--ink); font: inherit; font-size: 14px; }
.chaddrow input[name=name] { width: min(260px, 70vw); }
.chaddrow input[name=units] { width: 90px; }
.chaddrow .chcol input { width: 38px; height: 38px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer; }
.chaddrow .chcol input::-webkit-color-swatch-wrapper { padding: 0; }
.chaddrow .chcol input::-webkit-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.chaddrow .chcol input::-moz-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.linkbtn { border: 0; background: none; padding: 0; margin-left: 4px; color: #9FDDF4; font: inherit; cursor: pointer; text-decoration: underline; }
.dicebar { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin: 10px 0 14px; }
.dgroups { display: flex; gap: 6px; flex-wrap: wrap; }
.dgroups a, .dgroups .none { padding: 7px 12px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 12.5px; font-weight: 600; }
.dgroups a:hover { color: #fff; background: #26262C; }
.dgroups a.on { background: var(--yellow); color: #101012; }
.dgroups small { color: var(--ink3); font-weight: 700; margin-left: 3px; }
.dgroups a.on small { color: #3A3A20; }
.dgroups .none { opacity: .55; }
.dicecard { background: var(--sunk); border-radius: 16px; padding: 16px 18px 18px; margin-bottom: 12px; }
.dchead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.dchead h3 { margin: 0; font-family: var(--display); font-size: 24px; letter-spacing: -0.03em; }
.dcgroup { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #F8E27A; }
.dcfrom { color: var(--ink3); font-size: 13px; }
.dcfacts { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 6px 14px; margin: 0 0 12px; font-size: 13px; }
.dcfacts dt { color: var(--ink3); font-weight: 700; }
.dcfacts dd { margin: 0; color: var(--ink2); line-height: 1.5; }
.dicecard h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin: 6px 0 8px; }
.dcopens { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dcopens a { display: flex; gap: 10px; align-items: baseline; padding: 6px 8px; border-radius: 8px; font-weight: 700; font-size: 14px; }
.dcopens a:hover { background: #26262C; }
.dcopens .ikind { min-width: 150px; }
.dcacts { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dcacts form { margin: 0; }
.dcsaved { margin: 0 0 8px; }
.dcadded h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin: 14px 0 8px; }
.dcadded { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dcadded h4 { flex-basis: 100%; }
.dcchip { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 4px 4px 4px 12px; border-radius: 999px; background: var(--sunk); font-size: 13px; font-weight: 600; }
.dcchip small { color: var(--ink3); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; margin-right: 2px; }
.dcchip button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink3); cursor: pointer; font-size: 15px; }
.dcchip button:hover { background: #2E2E35; color: #fff; }
@media (max-width: 760px) {
  .dcfacts { grid-template-columns: minmax(0, 1fr); }
  .dcfacts dt { margin-top: 4px; }
  .dcopens a { flex-direction: column; gap: 2px; }
}
aside .live .pulse {
  width: 7px; height: 7px; border-radius: 50%; background: #35D399; flex: none;
  box-shadow: 0 0 0 3px rgba(53,211,153,.16);
}

main { padding: 28px 28px 80px 8px; }

/* The rail can be put away for the whole width — the calendar especially.
   The class is set on <html> before the page paints, so it never flashes. */
@media (min-width: 761px) {
  html.rail-closed .shell { grid-template-columns: minmax(0, 1fr); }
  html.rail-closed .shell > aside { display: none; }
  html.rail-closed main { padding-left: 28px; }
}
.railtoggle {
  width: 40px; height: 40px; border-radius: 12px; border: 0; cursor: pointer; flex: none;
  background: var(--rail); color: #9A9AA3; display: grid; place-items: center;
  align-self: center; margin-right: 4px;
}
.railtoggle:hover { background: #26262A; color: #fff; }
.railtoggle svg { width: 20px; height: 20px; }
header.page { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 22px; padding: 6px 4px 0; }
header.page h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.042em; margin: 0; line-height: 1; }
header.page .when { color: var(--dim); font-size: 13px; margin-left: auto; padding-bottom: 4px; }

aside .search { margin-bottom: 14px; }
aside .search input {
  width: 100%; padding: 11px 13px; border-radius: 14px; background: #222225;
  border: 1px solid transparent; color: #fff; font: inherit; font-size: 13.5px;
}
aside .search input::placeholder { color: var(--dim); }
aside .search input:focus { outline: 0; border-color: var(--salmon); background: #26262A; }

/* ── the blocks ────────────────────────────────────────────────────────── */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.stat { border-radius: var(--r); padding: 22px 24px 24px; background: var(--card); color: var(--ink); }
.stat:nth-child(1) { background: var(--salmon); color: #101012; }
.stat:nth-child(2) { background: var(--yellow); color: #101012; }
.stat:nth-child(4) { background: var(--dark); color: #fff; }
.stat .n {
  font-family: var(--display); font-size: 46px; font-weight: 800; letter-spacing: -0.05em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.stat .l {
  font-size: 11px; margin-top: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  font-weight: 700; opacity: .8;
}
.stat.zero .n { opacity: .4; }

.split { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; margin-bottom: 14px; }
.split > * { min-width: 0; }
.panel { background: var(--card); color: var(--ink); border-radius: var(--r); padding: 24px 26px 26px; }
.panel.today { background: var(--dark); color: #fff; }
.panel > h2, .group > .head .name, .section-title {
  font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.032em; margin: 0 0 18px;
}
.panel > h2 { margin-bottom: 14px; }

/* ── the chart ─────────────────────────────────────────────────────────────
   A hero number, then columns that keep their slot whether or not anything is
   due. No y-axis: each bar carries its own count, and a tick scale would only
   ask you to read one number off another.
   ────────────────────────────────────────────────────────────────────────── */
.chart-head { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 2px; flex-wrap: wrap; }
.chart-head .hero .n {
  font-family: var(--display); font-size: 40px; font-weight: 800; letter-spacing: -0.05em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.chart-head .hero .l { color: var(--ink3); font-size: 12.5px; margin-top: 3px; }
.chart-head .hero .l b { color: var(--late); font-weight: 700; }
.chart-head .legend { margin: 6px 0 0 auto; gap: 14px; }

.chartscroll { overflow-x: auto; min-width: 0; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.chartscroll::-webkit-scrollbar { display: none; }
.chartscroll svg { display: block; }

.chart .col { cursor: pointer; }
.chart .col .track { transition: fill .12s ease; }
.chart .col:hover .track { fill: #34343B; }
.chart .col:hover text.lab.dn, .chart .col:hover text.lab.wd { fill: var(--ink); }
.chart .col:focus-visible { outline: none; }
.chart .col:focus-visible .track { stroke: var(--ink); stroke-width: 2; }
/* Rises into the pill on load, each column a beat after the last. */
.chart .liquid { animation: rise 1.1s cubic-bezier(.2,.8,.2,1) var(--d, 0ms) both; }
@keyframes rise { from { transform: translateY(var(--rise)); } to { transform: none; } }
.chart text.total { animation: fadein .5s ease calc(var(--d, 0ms) + .55s) both; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
/* The surface drifts one wavelength at a time: seamless, never done. */
.chart .wave { animation: drift 2.6s linear infinite; }
.chart .wave.back { animation: driftback 3.4s linear infinite; }
@keyframes drift { from { transform: translateX(0); } to { transform: translateX(var(--lambda)); } }
@keyframes driftback { from { transform: translateX(var(--lambda)); } to { transform: translateX(0); } }
.chart .col:hover .wave { animation-duration: 1.2s; }
.chart .col:hover .wave.back { animation-duration: 1.6s; }
@media (prefers-reduced-motion: reduce) {
  .chart .liquid, .chart text.total, .chart .wave { animation: none; }
}
.chart text.total {
  font-family: var(--display); font-size: 13px; font-weight: 700; fill: var(--ink);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.chart text.lab { font-family: var(--ui); font-size: 11px; fill: var(--ink3); }
.chart text.lab.wd { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.chart text.lab.wd.weekend { fill: #8A8A94; }
.chart text.lab.dn {
  font-family: var(--display); font-size: 14px; font-weight: 700; fill: var(--ink2);
  font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
}
.chart text.lab.on { fill: var(--ink); font-weight: 700; }
.chart text.lab.late {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; fill: var(--late);
}
.legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 16px; font-size: 12px; color: var(--ink2); }
.legend span { display: flex; align-items: center; gap: 7px; }
.legend i { width: 10px; height: 10px; border-radius: 4px; background: var(--c); display: block; }

.today .date { font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.032em; }
.today .due { color: #9A9AA3; font-size: 12.5px; margin-bottom: 16px; }
.today .line {
  display: flex; align-items: center; gap: 11px; padding: 13px 14px; font-size: 14px;
  color: #C9C9D0; letter-spacing: -0.012em; background: var(--raised); border-radius: 16px; margin-bottom: 8px;
}
.today .line .dot { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
.today .line .n {
  margin-left: auto; font-family: var(--display); font-variant-numeric: tabular-nums;
  font-weight: 700; font-size: 18px; color: #fff;
}

/* ── lists ─────────────────────────────────────────────────────────────── */
.group { margin-bottom: 14px; }
.group > .head { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 12px; padding: 0 8px; color: #fff; }
.group > .head .dot { width: 11px; height: 11px; border-radius: 4px; background: var(--c); }
.group > .head .sub { color: var(--dim); font-size: 12.5px; }
.group > .head .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 15px;
  color: var(--dim); font-variant-numeric: tabular-nums;
}
.rows { background: var(--card); border-radius: var(--r); padding: 6px; display: flex; flex-direction: column; gap: 2px; }
/* Two tight lines and a pill: title over whose-and-when, deadline at the right. */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center;
  gap: 4px 14px; padding: 10px 12px 10px 14px; border-radius: 14px; color: var(--ink);
}
.row:hover { background: var(--sunk); }
.row .title {
  grid-column: 1; font-family: var(--display); font-weight: 600; font-size: 15px; letter-spacing: -0.022em;
  display: flex; align-items: center; gap: 9px; min-width: 0; line-height: 1.3;
}
.row .title a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .title a:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.row .title .swatch { width: 10px; height: 10px; border-radius: 3px; background: var(--c); flex: none; }
.row .meta {
  grid-column: 1; color: var(--ink3); font-size: 12px; display: flex; gap: 4px 12px;
  flex-wrap: wrap; align-items: center; padding-left: 19px; min-width: 0;
}
.row .meta .code { color: var(--ink2); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.row .meta .chan { color: var(--ink, var(--ch)); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
/* Every dot is the channel's exact colour. The hairline ring keeps a pale one
   (FNAF's yellow) visible and a dark one (Verse's navy) against the dark. */
.row .meta .chan i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); display: block;
  box-shadow: 0 0 0 1px var(--ring); }
.row .meta .lnk {
  padding: 1px 8px; border-radius: 6px; background: var(--sunk); color: var(--ink2); font-weight: 600;
  font-size: 11.5px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row:hover .meta .lnk { background: var(--raised); }
.row .meta .lnk.frameio { background: rgba(91,108,240,.2); color: #B5BEF7; }
.row .meta .lnk:hover { color: var(--ink); }
.row .due {
  grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: baseline; gap: 6px;
  padding: 6px 11px; border-radius: 10px; background: var(--sunk); color: var(--ink2);
  font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.row:hover .due { background: var(--raised); }
.row .due b { color: var(--ink); font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
.row .due .tm { color: var(--ink3); }
.row .due em { font-style: normal; font-weight: 700; }
.row .due.late { background: rgba(242,104,94,.13); color: #F6B1AB; }
.row .due.late b, .row .due.late em { color: #FF8F86; }
.row .due.late .tm { color: #D99D98; }
.row .due.soon { background: rgba(238,154,85,.13); color: #F4C9A4; }
.row .due.soon b, .row .due.soon em { color: #F8B377; }
.row .due.soon .tm { color: #D9AE8B; }
.row .due.none { color: var(--ink3); background: transparent; font-size: 12px; }
.row .acts { grid-column: 3; grid-row: 1 / span 2; }
.row .tick button { width: 28px; height: 28px; font-size: 12px; }
.airs.soon { color: var(--warn); font-weight: 650; }
.pill { display: inline-block; padding: 3px 11px; border-radius: 999px; font-size: 11px;
  background: var(--sunk); color: var(--ink2); font-weight: 600; }
.empty {
  background: var(--card); color: var(--ink3); border-radius: var(--r); padding: 44px 20px;
  text-align: center; font-size: 14px;
}
.links { display: flex; gap: 7px; flex-wrap: wrap; }
.links a { font-size: 11.5px; padding: 3px 11px; border-radius: 999px; background: var(--sunk);
  color: var(--ink2); font-weight: 600; }
.links a.frameio { background: rgba(74,92,212,.22); color: #AEB8F5; }
.links a:hover { background: var(--line); color: var(--ink); }
.warn { color: var(--warn); font-size: 12px; font-weight: 600; }

.chanlist { display: flex; flex-wrap: wrap; gap: 9px; }
.chanlist a {
  background: var(--rail); border-radius: 999px; padding: 10px 17px; font-size: 13.5px;
  display: flex; align-items: center; gap: 10px; color: #9A9AA3; font-weight: 500;
  letter-spacing: -0.012em;
}
.chanlist a:hover { background: #26262A; color: #fff; }
.chanlist a .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 1px rgba(255,255,255,.28); }
.chanlist .n { font-family: var(--display); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 12.5px; }
.back { color: var(--dim); font-size: 13px; }
.brief {
  background: var(--card); color: var(--ink2); border-radius: var(--r); padding: 26px 28px;
  white-space: pre-wrap; line-height: 1.68; font-size: 14.5px; max-width: 800px;
}
form.inline { display: inline; }
button.clear, a.clear {
  display: inline-block;
  background: var(--salmon); border: 0; color: #101012; font-family: var(--ui);
  border-radius: 999px; padding: 11px 22px; font-size: 13px; cursor: pointer; font-weight: 700;
}
button.clear:hover, a.clear:hover { filter: brightness(1.05); }
button.clear.secondary, a.clear.secondary { background: var(--sunk); color: var(--ink2); }
button.clear.secondary:hover, a.clear.secondary:hover { background: var(--line); filter: none; }

/* ── calendar ──────────────────────────────────────────────────────────── */
.calbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; padding: 0 4px; }
.calbar .month { font-family: var(--display); font-size: 24px; font-weight: 700; letter-spacing: -0.04em; min-width: 215px; }
.calbar .nav {
  background: var(--rail); border-radius: 999px; padding: 10px 16px; font-size: 13px;
  color: #9A9AA3; font-weight: 600;
}
.calbar .nav:hover { background: #26262A; color: #fff; }
.calbar .tabs { margin-left: auto; display: flex; gap: 3px; background: var(--rail); border-radius: 999px; padding: 4px; }
.calbar .tab { padding: 8px 19px; border-radius: 999px; font-size: 13px; color: #9A9AA3; font-weight: 600; }
.calbar .tab.on { background: var(--yellow); color: #101012; font-weight: 700; }
.calbar .tab:hover { color: #fff; }
.calbar .tab.on:hover { color: #101012; }

.cal {
  /* minmax(0,1fr), not 1fr: a long title must not widen its column and throw
     the week out of square. The chip ellipsises instead. */
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px;
  background: var(--card); border-radius: var(--r); padding: 12px;
}
.cal .wd {
  padding: 6px 10px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink3); text-align: left;
}
.cal .cell {
  /* Five weeks fill the screen below the toolbar; never smaller than a cell
     that fits five chips, so a short window scrolls instead of crushing. */
  background: var(--sunk); border-radius: 18px; padding: 11px 11px 12px;
  min-height: max(172px, calc((100vh - 290px) / 5));
  display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--ink);
}
.cal .cell.outside { background: #1C1C21; }
.cal .cell.outside .num { color: #8E8E98; }
.cal .cell.today { background: var(--salmon); }
.cal .num {
  font-family: var(--display); font-size: 17px; font-weight: 700; color: var(--ink2);
  font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 5px; border-radius: 8px; align-self: flex-start; letter-spacing: -0.03em;
}
.cal .num:hover { background: rgba(255,255,255,.08); color: var(--ink); }
.cal .cell.today .num { color: #101012; }
.cal .num .tag { font-family: var(--ui); font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; }
/* A day off: striped, with its moon always showing; other days show theirs on hover. */
.cal .cell { position: relative; }
.cal .cell.off { background: repeating-linear-gradient(135deg, rgba(42,169,216,.13) 0 9px, rgba(42,169,216,.04) 9px 18px), var(--sunk); }
.cal .cell.today.off { background: repeating-linear-gradient(135deg, rgba(0,0,0,.08) 0 9px, transparent 9px 18px), var(--salmon); }
.offbtn { margin: 0; }
.cal .offbtn { position: absolute; top: 9px; right: 9px; }
.offbtn button { display: inline-flex; align-items: center; gap: 5px; height: 26px; min-width: 26px; padding: 0 6px;
  border: 0; border-radius: 999px; background: transparent; color: var(--ink3); cursor: pointer;
  font: 700 10.5px/1 var(--ui); letter-spacing: .06em; text-transform: uppercase; opacity: 0; transition: opacity .12s ease; }
.offbtn button svg { width: 14px; height: 14px; flex: none; }
.cal .cell:hover .offbtn button, .daycol:hover .offbtn button, .offbtn button:focus-visible { opacity: 1; }
.offbtn button:hover { background: rgba(42,169,216,.18); color: #9FDDF4; }
.offbtn.on button { opacity: 1; background: rgba(42,169,216,.2); color: #9FDDF4; padding: 0 9px 0 7px; }
.cal .cell.today .offbtn button { color: #3A2A28; }
.cal .cell.today .offbtn.on button { background: rgba(0,0,0,.12); color: #101012; }
/* Today's cell already carries a TODAY tag: its day off shows as the moon alone. */
.cal .cell.today .offbtn.on button { padding: 0 6px; }
.cal .cell.today .offbtn.on button span { display: none; }
@media (hover: none) { .offbtn button { opacity: .6; } }
.daycol.off { background: repeating-linear-gradient(135deg, rgba(42,169,216,.1) 0 9px, transparent 9px 18px), var(--card); }
.daycol.today .offbtn button { color: #3A2A28; }
.off-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 6px; border-radius: 6px;
  background: rgba(42,169,216,.16); color: #A8E0F5; font-weight: 700; font-size: 11px; white-space: nowrap; }
.off-tag svg { width: 11px; height: 11px; }
.nextassign { display: flex; align-items: center; justify-content: space-between; gap: 10px 18px; flex-wrap: wrap; margin: 0 0 14px; padding: 12px 16px;
  background: var(--card); border-radius: var(--r); border-left: 4px solid var(--ch); }
.nalead { display: flex; align-items: baseline; gap: 6px 12px; flex-wrap: wrap; min-width: 0; }
.nalbl { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); }
.nextassign.soon .nalbl { color: #FFB1AA; }
.nach { display: inline-flex; align-items: center; gap: 7px; font-family: var(--display); font-weight: 800; font-size: 18px; color: var(--ink); }
.nach i { width: 10px; height: 10px; border-radius: 50%; background: var(--ch); }
.nach:hover { text-decoration: underline; }
.nawhen { font-size: 14px; color: var(--ink2); } .nawhen b { color: var(--ink); }
.nasub { font-size: 12px; color: var(--ink3); }
.nathen { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.nathen > span { color: var(--ink3); font-weight: 700; margin-right: 2px; }
.nathen a { display: inline-flex; align-items: center; gap: 6px; background: var(--sunk); color: var(--ink2); border-radius: 999px; padding: 4px 10px; font-weight: 600; }
.nathen a:hover { color: var(--ink); background: var(--line); }
.nathen a i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); } .nathen a b { color: var(--ink); }
.gapstrip { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin: 0 0 14px; padding: 12px 16px;
  border-radius: 16px; background: rgba(226,87,76,.10); box-shadow: inset 0 0 0 1.5px rgba(226,87,76,.45); }
.gapstrip .lbl { display: inline-flex; align-items: center; gap: 7px; font-family: var(--display); font-weight: 700; color: #FFB1AA; }
.gapstrip .lbl svg { width: 17px; height: 17px; }
.gapstrip .gapn { background: #E2574C; color: #1B0806; border-radius: 999px; padding: 0 8px; font-size: 12px; }
.gapstrip .gapsub { color: var(--ink3); font-size: 12px; }
.gapchips { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; }
.gapchip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: var(--sunk);
  border: 1px dashed rgba(226,87,76,.6); font-size: 12.5px; color: var(--ink2); }
.gapchip i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); }
.gapchip b { color: var(--ink); }
.gapchip span { color: var(--ink3); }
.gapchip.soon { border-style: solid; background: rgba(226,87,76,.16); }
.gapchip.soon .first { color: #FF9C94; font-weight: 700; }
.gapchip:hover { background: var(--line); }
.gapchip > a { display: inline-flex; align-items: center; gap: 6px; color: inherit; }
.gapx { display: inline-flex; margin: 0 0 0 auto; }
.gapx button { border: 0; background: none; color: var(--ink3); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; border-radius: 6px; }
.gapx button:hover { color: #FFB1AA; background: rgba(226,87,76,.2); }
.gapchip .gapx { margin-left: 2px; }
.cal .gapslot > a, .gapcard > a { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; color: inherit; overflow: hidden; }
.gapcard > a { white-space: nowrap; text-overflow: ellipsis; }
.cal .gapslot, .gapcard { display: flex; align-items: center; gap: 6px; border: 1px dashed rgba(226,87,76,.65); border-radius: 8px;
  color: #FFB1AA; font-size: 11.5px; font-weight: 600; padding: 2px 7px; background: rgba(226,87,76,.07); }
.cal .gapslot i, .gapcard i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); flex: none; }
.cal .gapslot .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gapbadge { margin-left: 6px; background: #E2574C; color: #1B0806; border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 800; }
.gapcard { padding: 7px 8px 7px 10px; border-radius: 12px; font-size: 12px; }
.offstrip { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; margin: 0 0 14px;
  padding: 10px 12px 10px 16px; border-radius: 18px; background: var(--card); color: var(--ink); font-size: 13px; }
.offstrip.today { box-shadow: inset 0 0 0 1.5px rgba(42,169,216,.55); }
.offstrip .lbl { display: inline-flex; align-items: center; gap: 7px; font-family: var(--display); font-weight: 700;
  font-size: 15px; color: #9FDDF4; }
.offstrip .lbl svg { width: 16px; height: 16px; }
.offstrip .none { color: var(--ink3); }
.offstrip ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; flex: 1; min-width: 0; }
.offday { display: flex; align-items: center; gap: 8px; padding: 5px 5px 5px 12px; border-radius: 12px;
  background: rgba(42,169,216,.1); min-width: 0; }
.offday.now { background: rgba(42,169,216,.22); }
.offday b { white-space: nowrap; }
.offday span { color: var(--ink2); min-width: 0; }
.offday form, .offadd { margin: 0; }
.offday .x { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink3);
  cursor: pointer; font-size: 16px; line-height: 1; }
.offday .x:hover { background: rgba(255,255,255,.1); color: #fff; }
.offadd { display: flex; gap: 6px; margin-left: auto; }
.offadd input { height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--sunk);
  color: var(--ink); font: inherit; color-scheme: dark; }
.offadd button { height: 32px; padding: 0 14px; border: 0; border-radius: 10px; background: #2AA9D8; color: #06141A;
  font: inherit; font-weight: 800; cursor: pointer; }
.cal .chip {
  display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 10px;
  background: var(--raised); font-size: 12.5px; color: var(--ink2); min-width: 0; font-weight: 600;
}
.cal .chip:hover { background: var(--line); color: var(--ink); }
.cal .cell.today .chip { background: #FBE3DF; color: #3A2A28; }
.cal .cell.today .chip:hover { background: #fff; color: #101012; }
.cal .cell.today .more, .cal .cell.today .num .tag { color: #3A2A28; }
.cal .chip[draggable] { cursor: grab; }
.cal .chip.dragging { opacity: .35; }
.cal .chip.saving { opacity: .6; }
.cal .cell.over { box-shadow: inset 0 0 0 2px var(--ink); }
.cattoggles { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 4px 14px; }
.cattoggle {
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
  background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600;
}
.cattoggle i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); display: block; }
.cattoggle:hover { background: #26262A; }
.cattoggle.off { color: #85858F; }
.cattoggle.off i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
.cattoggle.all { background: transparent; color: #9A9AA3; }
.draghint { color: var(--dim); font-size: 12px; margin-left: auto; }
.mtoast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 60;
  display: flex; align-items: center; gap: 12px; width: max-content; max-width: min(680px, calc(100vw - 32px));
  padding: 12px 12px 12px 18px; border-radius: 16px; background: #2A2A31; border: 1px solid #3A3A43;
  box-shadow: 0 14px 40px rgba(0,0,0,.55); color: #F2F2F5; font-size: 13.5px; line-height: 1.4; }
.mtoast span { flex: 1; min-width: 0; }
.mtoast small { display: block; color: #A9A9B3; font-size: 12px; margin-top: 2px; }
.mtoast .undo, .mtoast form button { flex: none; border: 0; border-radius: 999px; padding: 8px 16px; background: #F2E86D;
  color: #111; font: inherit; font-weight: 800; cursor: pointer; }
.mtoast .undo:disabled { opacity: .6; cursor: default; }
.mtoast .x { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: #C9C9D1;
  font-size: 18px; line-height: 1; cursor: pointer; text-decoration: none; display: grid; place-items: center; }
.mtoast .x:hover { background: #3A3A43; color: #fff; }
.mtoast form { margin: 0; flex: none; }
.restbox { display: flex; align-items: center; gap: 8px; flex-basis: 100%; color: var(--ink2); font-size: 13px; cursor: pointer; }
.restbox input { width: 16px; height: 16px; accent-color: #F2E86D; }
.cal .chip { box-shadow: inset 3px 0 0 var(--c); }
.cal .chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ch, var(--c)); flex: none; box-shadow: 0 0 0 1px var(--ring); }
.cal .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.01em; }
.cal .more { font-size: 12px; color: var(--ink3); padding: 2px 9px; font-weight: 700; margin-top: auto; }
.cal .more:hover { color: var(--ink); }

/* ── day strip ─────────────────────────────────────────────────────────── */
button.nav { border: 0; cursor: pointer; font-family: var(--ui); }
.daystrip {
  display: flex; gap: 12px; overflow-x: auto; overscroll-behavior-x: contain; position: relative;
  scroll-snap-type: x proximity; padding: 2px 2px 14px; scrollbar-width: thin;
  scrollbar-color: #3A3A40 transparent;
}
.daycol {
  flex: 0 0 clamp(290px, 23vw, 380px); scroll-snap-align: center;
  background: var(--card); color: var(--ink); border-radius: var(--r); padding: 12px;
  display: flex; flex-direction: column; height: max(460px, calc(100vh - 250px));
  transition: box-shadow .15s ease;
}
.daycol > header {
  display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; flex-wrap: wrap;
}
.daycol .dname { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.daycol .wk { font-family: var(--display); font-weight: 800; font-size: 22px; letter-spacing: -0.04em; line-height: 1.05; }
.daycol .dt { color: var(--ink3); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.daycol .rel { margin-left: auto; color: var(--ink3); font-size: 12px; }
.daycol .cnt {
  font-family: var(--display); font-weight: 700; font-size: 13px; min-width: 28px; height: 28px;
  border-radius: 999px; background: var(--sunk); display: grid; place-items: center; padding: 0 8px;
}
.daycol.today > header { background: var(--salmon); color: #101012; border-radius: 16px; padding: 10px 12px 12px; margin-bottom: 8px; }
.daycol.today .dt, .daycol.today .rel { color: #3A2A28; }
.daycol.today .cnt { background: rgba(0,0,0,.1); }
.daycol.focus { box-shadow: 0 0 0 3px var(--yellow); }
.daycol.over { box-shadow: 0 0 0 3px var(--ink), inset 0 0 0 2px var(--ink); }
.daybody { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; flex: 1; padding: 2px; }
.dayempty { color: var(--ink3); font-size: 13px; text-align: center; padding: 40px 10px; }
.dayedge {
  flex: 0 0 120px; border-radius: var(--r); background: var(--rail); color: #9A9AA3;
  display: grid; place-items: center; font-weight: 700; font-size: 13px; scroll-snap-align: center;
}
.dayedge:hover { background: #26262A; color: #fff; }
.dcard {
  background: var(--sunk); border-radius: 16px; padding: 12px 12px 10px 14px;
  box-shadow: inset 4px 0 0 var(--c); display: flex; flex-direction: column; gap: 6px; cursor: grab;
}
.dcard.dragging { opacity: .35; }
.dcard.saving { opacity: .6; }
.dcard .top { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 11.5px; color: var(--ink3); }
.dcard .swatch { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
.dcard .code { font-weight: 700; color: var(--ink2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dcard .bits { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcard .t {
  font-family: var(--display); font-weight: 700; font-size: 16px; letter-spacing: -0.025em;
  line-height: 1.2; overflow-wrap: anywhere;
}
.dcard .t:hover { text-decoration: underline; }
.dcard .t .chdot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--ch);
  margin-right: 7px; vertical-align: 1px; box-shadow: 0 0 0 1px var(--ring);
}
.dcard .chan {
  color: var(--ink, var(--ch)); font-weight: 700; font-size: 12.5px;
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
}
.dcard .chan i { width: 9px; height: 9px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.dcard .pill { align-self: flex-start; background: var(--raised); }
.dcard .foot { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.dcard .at { font-size: 12px; color: var(--ink2); font-variant-numeric: tabular-nums; flex: 1; min-width: 0; }
.dcard .at.over { color: var(--late); font-weight: 700; }
.dcard .tick button { width: 28px; height: 28px; background: var(--card); }
/* Finished work is muted and struck through — never faded, so it stays readable. */
.dcard.cleared .t, .dcard.cleared .top, .dcard.cleared .code, .dcard.cleared .chan, .dcard.cleared .at { color: var(--ink3); }
.dcard.cleared .t { text-decoration: line-through; text-decoration-color: #6E6E78; }

/* ── week ──────────────────────────────────────────────────────────────── */
.weekgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.weekgrid.span4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.chanpick { position: relative; }
.chanpick summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-radius: 999px; background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600; }
.chanpick summary::-webkit-details-marker { display: none; }
.chanpick summary::after { content: "▾"; color: var(--ink3); font-size: 11px; }
.chanpick summary b { background: var(--yellow); color: #101012; border-radius: 999px; padding: 1px 8px; font-size: 11.5px; }
.chanpick[open] summary { background: #26262A; color: #fff; }
.chanmenu { position: absolute; left: 0; top: calc(100% + 8px); z-index: 30; width: min(640px, calc(100vw - 32px)); max-height: min(560px, 70vh);
  overflow: auto; padding: 10px 12px 12px; background: var(--card); border-radius: 16px;
  box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35; }
.chanbtns { display: flex; gap: 6px; position: sticky; top: -10px; background: var(--card); padding: 4px 0 8px; z-index: 1; }
.chanbtns button, .chcat button { border: 0; border-radius: 999px; background: var(--sunk); color: var(--ink2); font: inherit;
  font-size: 12px; font-weight: 700; padding: 6px 12px; cursor: pointer; }
.chanbtns button:hover, .chcat button:hover { color: #fff; background: #2E2E35; }
.chanbtns .go { margin-left: auto; background: var(--yellow); color: #101012; }
.chanbtns .go:hover { background: #FFF38A; color: #101012; }
.chgroups { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; }
.chgroup { min-width: 0; }
.chcat { display: flex; align-items: center; gap: 7px; padding: 6px 4px 4px; color: var(--ink3); font-size: 11px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; }
.chcat i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.chcat button { margin-left: auto; padding: 2px 8px; font-size: 10.5px; letter-spacing: 0; text-transform: none; }
.chgroup label { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 8px; font-size: 13px; font-weight: 600;
  color: var(--ink); cursor: pointer; }
.chgroup label:hover { background: var(--sunk); }
.chgroup input { width: 15px; height: 15px; margin: 0; accent-color: var(--yellow); flex: none; }
.weekgrid .daycol {
  height: auto; min-height: max(460px, calc(100vh - 290px)); padding: 10px; border-radius: 20px;
}
.weekgrid .daybody { overflow: visible; }
.weekgrid .daycol > header { padding: 6px 6px 10px; gap: 6px; flex-wrap: nowrap; }
.weekgrid .daycol .dname { flex: 1; }
.weekgrid .daycol .wk { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weekgrid .daycol.today > header { padding: 8px 10px 10px; }
.weekgrid .daycol .wk { font-size: 18px; }
.weekgrid .daycol .rel { display: none; }
.weekgrid .daycol .cnt { margin-left: auto; }
.weekgrid .dcard { padding: 10px 10px 9px 12px; border-radius: 14px; }
.weekgrid .dcard .t { font-size: 14px; }
.weekgrid .dcard .foot { flex-wrap: wrap; }
.weekgrid .dcard .at { flex-basis: 100%; }
.weekgrid .dcard .acts { margin-left: auto; }

/* status toggles sit after the categories, behind a hairline */
.tsep { width: 1px; height: 22px; background: #2A2A2F; margin: 0 4px; }
.cattoggle.st i { border-radius: 50%; }
.cal .chip.done .t { text-decoration: line-through; text-decoration-color: #6E6E78; color: var(--ink3); }
.cal .cell.today .chip.done .t { color: #6A5552; text-decoration-color: #9A8581; }
.calbar .tabs.views { margin-left: auto; }
.calbar .tabs.views + .tabs { margin-left: 0; }

@media (min-width: 761px) and (max-width: 1100px) {
  .weekgrid { grid-template-columns: repeat(7, minmax(220px, 1fr)); overflow-x: auto; padding-bottom: 12px; }
  .weekgrid.span4 { grid-template-columns: repeat(4, minmax(200px, 1fr)); }
}

/* ── pins ──────────────────────────────────────────────────────────────── */
.pinform { display: inline-flex; margin: 0; flex: none; }
.pinform button { border: 0; cursor: pointer; font-family: var(--ui); }
.pin-ghost {
  width: 26px; height: 26px; border-radius: 8px; background: transparent; color: var(--ink3);
  display: grid; place-items: center; opacity: 0; transition: opacity .12s ease, background .12s ease;
}
.pin-ghost svg, .pinned-tag svg { width: 13px; height: 13px; }
.row:hover .pin-ghost, .dcard:hover .pin-ghost, .pin-ghost:focus-visible { opacity: 1; }
.pin-ghost:hover { background: var(--line); color: var(--ink); }
@media (hover: none) { .pin-ghost { opacity: .45; } }
.pinned-tag {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px;
  background: var(--yellow); color: #101012; font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.pinned-tag:hover { background: #FFF6A8; }
.pinned-tag:hover span { display: none; }
.pinned-tag:hover::after { content: "Unpin"; }
.row.pinned { background: #27251A; box-shadow: inset 0 0 0 1px rgba(243,233,108,.22); }
.row.pinned + .row:not(.pinned) { margin-top: 6px; }
.dcard .pinform { margin-left: auto; }
/* In a card the tag is the pin alone; the cream card already says pinned. */
.dcard .pinned-tag { padding: 5px; }
.dcard .pinned-tag span, .dcard .pinned-tag:hover::after { display: none; }
.dcard.pinned { background: #2A2819; }

/* ── bell ──────────────────────────────────────────────────────────────── */
.bellwrap { position: relative; align-self: center; flex: none; }
.bell {
  width: 44px; height: 44px; border-radius: 14px; border: 0; cursor: pointer; position: relative;
  background: var(--rail); color: #D8D8DE; display: grid; place-items: center;
}
.bell:hover, .bell[aria-expanded="true"] { background: #26262A; color: #fff; }
.bell svg { width: 21px; height: 21px; }
.bell .badge {
  position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 999px; background: #C8352B; color: #fff; font-size: 11px; font-weight: 700;
  display: grid; place-items: center; box-shadow: 0 0 0 3px var(--shell); font-variant-numeric: tabular-nums;
}
.bell .badge[hidden] { display: none; }
.notices {
  position: absolute; right: 0; top: calc(100% + 10px); width: 400px; max-height: min(560px, 72vh);
  overflow-y: auto; background: var(--card); color: var(--ink); border-radius: 22px; padding: 8px;
  box-shadow: 0 24px 60px rgba(0,0,0,.6), 0 0 0 1px #2E2E35; z-index: 20;
}
.notices[hidden] { display: none; }
.nhead { display: flex; align-items: center; gap: 10px; padding: 10px 10px 12px; }
.nhead b { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; }
.nhead .alerts {
  margin-left: auto; border: 0; cursor: pointer; border-radius: 999px; padding: 7px 12px;
  background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui);
}
.nhead .alerts.on { background: var(--gm); color: #fff; }
.notice { display: flex; align-items: center; gap: 12px; padding: 11px 10px; border-radius: 14px; }
.notice:hover { background: var(--sunk); }
.notice[hidden] { display: none; }
.notice .ico, .release .ico {
  width: 34px; height: 34px; border-radius: 11px; flex: none; display: grid; place-items: center;
  color: #fff; background: var(--nc);
}
.notice .ico svg, .release .ico svg { width: 19px; height: 19px; }
.nfilters { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 8px 10px; }
.nf {
  display: inline-flex; align-items: center; gap: 6px; border: 0; cursor: pointer; border-radius: 999px;
  padding: 6px 11px; background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui);
}
.nf i { width: 8px; height: 8px; border-radius: 3px; background: var(--nc); }
.nf span { color: var(--ink3); font-variant-numeric: tabular-nums; }
.nf:hover { background: var(--line); color: var(--ink); }
.nf.on { background: var(--ink); color: #101012; }
.nf.on span { color: #55555E; }
.nf:disabled, .nf:disabled span { color: #8E8E98; cursor: default; }
.nf:disabled i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--nc); }
.nf:disabled:hover { background: var(--sunk); }
.nempty[hidden] { display: none; }
.notice .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.notice .nt { font-weight: 700; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice .ns { color: var(--ink3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice .ago { color: var(--ink3); font-size: 11.5px; flex: none; }
.notice.new-item .ago { color: var(--late); font-weight: 700; }
.notice.new-item .ago::before { content: "● "; }
.notice.new-item.airing .ago::before { content: "●"; }
.nempty { color: var(--ink3); font-size: 13px; padding: 24px 12px 28px; text-align: center; }

/* ── sign in ───────────────────────────────────────────────────────────── */
.login { max-width: 380px; margin: 15vh auto; padding: 0 20px; }
.login h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 6px; line-height: 1; }
.login p { color: var(--dim); font-size: 13.5px; margin: 0 0 22px; }
.login form { background: var(--card); border-radius: var(--r); padding: 24px; }
.login input {
  width: 100%; padding: 14px 16px; border-radius: 16px; background: var(--sunk);
  border: 1px solid transparent; color: var(--ink); font: inherit; margin-bottom: 11px;
}
.login input:focus { outline: 0; border-color: var(--salmon); background: var(--raised); }
.login button {
  width: 100%; padding: 14px; border-radius: 16px; border: 0; cursor: pointer;
  background: var(--salmon); color: #101012; font-family: var(--ui); font-size: 14px; font-weight: 700;
}
.login button:hover { filter: brightness(1.06); }
.err { color: var(--late); font-size: 13px; margin-bottom: 10px; }
/* charts (Finance, Network Overview): the frame, axes, legend and hover areas */
.fchart { margin: 0; }
.fchart svg { width: 100%; height: auto; display: block; overflow: visible; }
.fchart .grid { stroke: #2A2A31; stroke-width: 1; } .fchart .zero { stroke: #55555E; stroke-width: 1; }
.fchart .ax { fill: var(--ink3); font-size: 10.5px; font-family: var(--ui); }
.fchart .hit { fill: transparent; cursor: crosshair; } .fchart .hit:hover { fill: rgba(255,255,255,.04); }
.flegend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--ink2); margin-bottom: 8px; }
.flegend span { display: inline-flex; align-items: center; gap: 6px; }
.flegend i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.flegend .ln i { height: 2px; width: 14px; border-radius: 1px; }
/* chart tooltips (Finance, Network Overview): one for every element with data-tip */
.ftip { position: fixed; z-index: 50; pointer-events: none; padding: 8px 11px; border-radius: 10px; background: #2C2C33; color: var(--ink); font-size: 12px;
  line-height: 1.5; box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px var(--line); font-variant-numeric: tabular-nums; }
.ftip b { display: block; font-family: var(--display); font-size: 13px; }
/* sign-out: the note on the sign-in page after signing out */
.login .note { color: var(--dim); font-size: 13px; margin-bottom: 10px; }
.signacts { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.signacts form { margin: 0; }

.acts { display: grid; grid-template-columns: repeat(2, auto); gap: 5px 6px; align-items: center; justify-content: end; flex: none; }
.tick svg { width: 12px; height: 12px; display: block; margin: auto; }
.tick.pause button:hover { border-color: #8D9BF2; color: #8D9BF2; }
.tick.resume button, .tick.resume button.on { background: transparent; border-color: #8D9BF2; color: #8D9BF2; }
.tick.noscript button:hover { border-color: #E24FCB; color: #F7A6E9; }
.tick.noscript button.on { background: #E24FCB; border-color: #E24FCB; color: #1E0C1B; }
/* No script: the whole card turns magenta, so a card waiting on its script
   reads at a glance — a colour no other state uses (pinned is yellow, late
   red, due-soon orange, cleared green, Frame.io blue). */
/* The dashboard's top row: the chart, Revisions as a column, then today. */
.split.withrev { grid-template-columns: minmax(0, 1.25fr) minmax(330px, 1fr) 280px; align-items: stretch; }
.split.withrev:has(> .revpanel[hidden]) { grid-template-columns: minmax(0, 1fr) 320px; }
.revpanel { padding: 18px 16px 14px; display: flex; flex-direction: column; min-height: 0; max-height: 520px; }
.revpanel .revhead { display: flex; align-items: center; gap: 10px; }
.revpanel h2 { display: inline-flex; align-items: center; gap: 8px; margin: 0; }
.revpanel h2 svg { width: 13px; height: 13px; color: #8E9BF7; }
.revpanel .sub { color: var(--ink3); font-size: 12.5px; margin: 4px 0 10px; }
.revpanel .sub .late { color: #FF9C94; }
.revpanel .seeall { margin-left: auto; padding: 0; font-size: 12.5px; }
.revlist { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; margin: 0 -4px; padding: 0 4px 2px; }
.revmini { background: rgba(91,108,240,.09); box-shadow: inset 3px 0 0 #7D8AF5; border-radius: 14px; padding: 11px 10px 10px 14px;
  display: flex; flex-direction: column; gap: 7px; }
.revmini.late { box-shadow: inset 3px 0 0 #F2685E; }
.revmini.pinned { background: #27251A; }
.revmini .rt { font-family: var(--display); font-weight: 650; font-size: 14px; letter-spacing: -0.02em; line-height: 1.3; color: var(--ink);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.revmini .rt:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.revmini .rchips { display: flex; gap: 5px; flex-wrap: wrap; }
.revmini .rchips > * { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 6px;
  font-size: 11px; font-weight: 700; line-height: 1; white-space: nowrap; background: rgba(255,255,255,.05); color: var(--ink2); }
.revmini .rv { background: rgba(91,108,240,.24) !important; color: #C9CFFB !important; }
.revmini .rv svg { width: 8px; height: 8px; }
.revmini .rscore { background: color-mix(in srgb, var(--sc) 20%, transparent) !important; color: var(--sc) !important; font-weight: 800; }
.revdone { margin-bottom: 14px; }
.rdlist { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; }
.rdrow { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 180px 88px; gap: 10px; align-items: center; padding: 9px 6px; border-top: 1px solid #26262C; font-size: 13px; }
.rdrow .rdt { font-weight: 650; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rdrow .rdt:hover { text-decoration: underline; }
.rdrow .rv, .rdrow .rch { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px; background: var(--raised); color: var(--ink2); font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.rdrow .rv svg { width: 11px; height: 11px; color: #8E9BF7; }
.rdrow .rch i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); }
.rdrow .rch.none { color: var(--ink3); }
.rdrow .rdwhen { color: var(--ink3); font-size: 12px; white-space: nowrap; }
.rdrow .rscore, .rdrow .rdscore { justify-self: end; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap; }
.rdrow .rscore { background: color-mix(in srgb, var(--sc) 20%, transparent); color: var(--sc); }
.rdrow .rdscore { background: rgba(243,233,108,.12); color: var(--yellow); font-weight: 700; }
.rdrow .rdscore:hover { background: rgba(243,233,108,.22); }
@media (max-width: 760px) {
  .rdrow { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
  .rdrow .rdt { grid-column: 1 / 3; }
  .rdrow .rv, .rdrow .rch { display: none; }
}
.revmini .rch i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.revmini .rframe { background: rgba(91,108,240,.28) !important; color: #D6DBFD !important; }
.revmini .rframe:hover { background: #5B6CF0 !important; color: #fff !important; }
.legend .revkey i { background: repeating-linear-gradient(45deg, #7D8AF5 0 3px, #B9C1FA 3px 5px) !important; }
.revmini { container-type: inline-size; }
.revmini .rfoot { display: flex; align-items: center; gap: 6px; }
@container (max-width: 330px) { .revmini .rwhen .tm { display: none; } }
.revmini .rwhen { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 9px;
  background: var(--sunk); color: var(--ink2); font-size: 12px; white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
.revmini .rwhen b { color: var(--ink); font-weight: 700; }
.revmini .rwhen em { font-style: normal; font-weight: 800; margin-left: auto; }
.revmini .rwhen.late { background: rgba(242,104,94,.13); color: #F6B1AB; }
.revmini .rwhen.late b, .revmini .rwhen.late em { color: #FF8F86; }
.revmini .rwhen.soon { background: rgba(238,154,85,.13); color: #F4C9A4; }
.revmini .rwhen.soon em { color: #F8B377; }
.revmini .rwhen.none { color: var(--ink3); }
.revmini .acts { display: flex; gap: 5px; align-items: center; flex: none; }
.revmini .acts > * { margin: 0; }
.revmini .tick button, .revmini .tick.sumlink { width: 28px; height: 28px; }
.revmini .tick.sumlink { border: 1.5px solid #45454D; color: #A6A6B0; box-sizing: border-box; display: grid; place-items: center; }
@media (max-width: 1250px) {
  .split.withrev { grid-template-columns: minmax(0, 1fr) 300px; }
  .split.withrev > .revpanel { grid-column: 1 / -1; grid-row: 2; max-height: none; }
  .split.withrev > .revpanel .revlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
}
/* Each cell is its own container, so a card stacks like the columns' do. */
.revcell { container-type: inline-size; min-width: 0; }
@media (max-width: 760px) { .revpanel .rows { grid-template-columns: minmax(0, 1fr); } }
.row.revision { background: rgba(91,108,240,.09); box-shadow: inset 3px 0 0 #7D8AF5; }
.row.revision:hover { background: rgba(91,108,240,.14); }
.rev-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 6px; border-radius: 6px;
  background: rgba(91,108,240,.24); color: #C9CFFB; font-weight: 700; font-size: 11px; white-space: nowrap; }
.rev-tag svg { width: 9px; height: 9px; }
/* A revision's row: one size for every chip, the due pill and its four
   buttons in a single line, centred on the two lines of text. */
.row.revision .meta { gap: 6px; }
.row.revision .meta > * { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 7px;
  font-size: 11.5px; font-weight: 700; line-height: 1; white-space: nowrap; box-sizing: border-box; max-width: 100%; }
.row.revision .meta .rev-tag { padding: 0 8px 0 7px; }
.row.revision .meta .code { background: rgba(255,255,255,.05); color: var(--ink2); letter-spacing: .02em; }
.row.revision .meta .chan { background: rgba(255,255,255,.05); color: var(--ink, var(--ch)); }
.row.revision .meta .chan i { width: 7px; height: 7px; }
.row.revision .meta .lnk.frameio { background: rgba(91,108,240,.28); color: #D6DBFD; }
.row.revision .meta .lnk.frameio::after { content: "↗"; font-size: 11px; opacity: .8; }
.row.revision .meta .lnk.frameio:hover { background: #5B6CF0; color: #fff; }
.row.revision .meta .revscore { font-weight: 800; }
.row.revision .due { align-self: center; padding: 0 12px; height: 34px; align-items: center; border-radius: 10px; }
.row.revision .acts { display: flex; align-items: center; gap: 6px; align-self: center; }
.row.revision .acts .tick button, .row.revision .acts .tick.sumlink { width: 30px; height: 30px; border-width: 1.5px; }
.row.revision .acts .tick.sumlink { border: 1.5px solid #45454D; color: #A6A6B0; box-sizing: border-box; }
@container (max-width: 560px) {
  /* Narrow: title, chips, then the due pill and the buttons on one line. */
  .row.revision { grid-template-columns: minmax(0, 1fr) auto; row-gap: 8px; }
  .row.revision .acts { grid-column: 2; grid-row: 3; }
  .row.revision .due { grid-column: 1; grid-row: 3; margin: 0 0 0 19px; height: 30px; padding: 0 10px; white-space: nowrap; font-size: 12px; max-width: none; }
  .row.revision .meta > * { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
}
@container (max-width: 380px) {
  .row.revision .due .tm { display: none; }
  .row.revision .due { margin-left: 0; }
}
.dcard.revision { box-shadow: inset 3px 0 0 #7D8AF5; }
.row.noscript { background: rgba(226,79,203,.10); box-shadow: inset 3px 0 0 #E24FCB; }
.row.noscript:hover { background: rgba(226,79,203,.15); }
.noscript-tag { padding: 1px 8px; border-radius: 6px; background: rgba(226,79,203,.2); color: #F7B8EC; font-weight: 700; font-size: 11px; }
.dcard.noscript { background: #2B1A28; box-shadow: inset 0 0 0 1.5px #E24FCB; }
.chip.noscript { box-shadow: inset 3px 0 0 #E24FCB; }
/* Uploaded: live on the channel — solid green, the one state that's finished for good. */
.tick.uploaded button:hover { border-color: #3CCB84; color: #7BE3AE; }
.tick.uploaded button.on { background: #2FB673; border-color: #2FB673; color: #06170E; }
.cal .chip.uploaded { background: #1E7A4C; box-shadow: inset 3px 0 0 #3CCB84; }
.cal .chip.uploaded .t, .cal .cell.today .chip.uploaded .t { color: #E6FFF1; text-decoration: none; }
.dcard.uploaded { background: #133524; box-shadow: inset 0 0 0 1.5px #2FB673; }
.dcard.uploaded .t, .dcard.uploaded .at { color: #CFF5E0; text-decoration: none; }
.uploadbtn svg { width: 12px; height: 12px; vertical-align: -1px; }
.uploadbtn.on { background: #2FB673 !important; color: #06170E !important; }
.tick.sumlink { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 1px solid #34343B; color: var(--ink2); }
.tick.sumlink svg { width: 12px; height: 12px; }
.tick.sumlink:hover { border-color: #8D9BF2; color: #C9CFFB; }
.revscore { padding: 1px 8px; border-radius: 6px; background: color-mix(in srgb, var(--sc) 22%, transparent); color: var(--sc); font-weight: 800; font-size: 11px; }
.sumpanel .big { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.sumpanel .scoreball { width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--sc) 18%, var(--raised));
  box-shadow: inset 0 0 0 3px var(--sc); font-family: var(--display); font-weight: 800; font-size: 26px; color: var(--sc); flex: none; }
.sumpanel .scoreball small { display: block; font-size: 11px; color: var(--ink3); text-align: center; margin-top: -6px; }
.sumpanel .sumtext { flex: 1; min-width: 240px; font-size: 14px; line-height: 1.6; color: var(--ink); }
.sumpanel .sumby { font-size: 11.5px; color: var(--ink3); }
.sumpens { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--ink2); }
.sumpens b { display: inline-block; min-width: 48px; color: #FF9C94; font-variant-numeric: tabular-nums; }
.sumthemes { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.sumthemes span { background: var(--sunk); border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--ink2); }
.sumthemes span.rep { background: rgba(229,83,75,.18); color: #FFB1AA; }
.sumnotes { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.sumnotes li { display: flex; gap: 8px; align-items: baseline; }
.sumnotes .sev { flex: none; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; border-radius: 5px; padding: 1px 6px; }
.sev.minor { background: #20302A; color: #8FE3B6; } .sev.moderate { background: #3A3218; color: #F3D27A; } .sev.major { background: #3A1D1D; color: #FFB4B4; }
.sev.you { background: #2A2745; color: #C9CFFB; }
.sumnotes .tc { color: var(--ink3); font-variant-numeric: tabular-nums; flex: none; }
.sumform .row2 { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.sumform input[type=number] { width: 90px; padding: 9px 10px; border-radius: 10px; border: 1px solid #2E2E35; background: var(--raised); color: var(--ink); font: inherit; }
.revtabs { display: inline-flex; gap: 3px; background: var(--rail); border-radius: 999px; padding: 4px; margin: 0 0 14px; }
.revtabs .tab { padding: 8px 19px; border-radius: 999px; font-size: 13px; color: #9A9AA3; font-weight: 600; }
.revtabs .tab:hover { color: var(--ink); }
.revtabs .tab.on { background: var(--yellow); color: #101012; font-weight: 700; }
.revtabs .n { margin-left: 6px; color: inherit; opacity: .6; font-size: 11.5px; }
.histpick { display: flex; gap: 14px; flex-wrap: wrap; margin: 0 0 14px; }
.histpick label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink2); }
.histpick select { padding: 8px 10px; border-radius: 10px; background: var(--raised); color: var(--ink); border: 1px solid #2E2E35; font: inherit; }
.histchan { padding: 16px 18px; margin-bottom: 12px; border-left: 3px solid var(--ch); }
.histchan.flag { box-shadow: inset 0 0 0 1.5px rgba(229,83,75,.55); }
.histchan.trophy { box-shadow: inset 0 0 0 1.5px rgba(232,197,71,.55); }
.histchan header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.histchan header i { width: 10px; height: 10px; border-radius: 50%; background: var(--ch); }
.histchan header b { font-family: var(--display); font-size: 16px; }
.histmark { font-size: 12px; font-weight: 800; border-radius: 999px; padding: 2px 10px; }
.histmark.flag { background: rgba(229,83,75,.2); color: #FFB1AA; } .histmark.trophy { background: rgba(232,197,71,.2); color: #F8E27A; }
.histavg { font-size: 12.5px; color: var(--ink3); } .histavg b { color: var(--sc); }
.histbtns { margin-left: auto; display: flex; gap: 4px; }
.histbtns button.icon { padding: 4px 9px; font-size: 12px; }
.histalert { border-radius: 12px; padding: 10px 12px; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.histalert.bad { background: rgba(229,83,75,.14); color: #FFC9C4; } .histalert.good { background: rgba(60,203,132,.12); color: #BDF2D6; }
.tlwrap { overflow-x: auto; }
.timeline { display: block; }
.timeline .tlbad { fill: rgba(229,83,75,.09); } .timeline .tlgood { fill: rgba(60,203,132,.09); }
.timeline .tlgrid { stroke: #2A2A30; stroke-dasharray: 3 4; }
.timeline .tlaxis { fill: var(--ink3); font-size: 10.5px; font-family: var(--ui); }
.timeline .tlaxis.mid, .timeline .tlval { text-anchor: middle; }
.timeline .tlval { fill: var(--ink); font-size: 11px; font-weight: 700; font-family: var(--ui); }
.timeline .tlline { fill: none; stroke: #5B5B66; stroke-width: 2; }
.timeline .tldot { stroke: var(--bg, #0B0B0D); stroke-width: 2.5; cursor: pointer; }
.timeline a:hover .tldot { r: 9; }
.chpause { display: flex; align-items: center; margin: 0; align-self: center; }
header.page .chpause { margin-left: 0; }
.chpause button { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; margin: 0; }
header.page .checknow button { white-space: nowrap; }
.chpause button svg { width: 12px; height: 12px; }
.chpause button.on { background: rgba(141,155,242,.2) !important; color: #C9CFFB !important; }
.chpause.compact button { padding: 6px 12px; font-size: 12px; }
.chpausetag { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: rgba(141,155,242,.18);
  color: #C3CAF8; font-size: 11.5px; font-weight: 700; margin-right: 8px; white-space: nowrap; }
.chpausetag svg { width: 10px; height: 10px; }
.batch.chpaused { opacity: .85; }
.batch.chpaused .name { color: var(--ink2); }
.batch.chpaused .chpausetag { justify-self: start; }
.pausedlead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 14px; padding: 12px 16px; border-radius: 16px;
  background: rgba(141,155,242,.10); box-shadow: inset 0 0 0 1.5px rgba(141,155,242,.35); color: #C9CFFB; font-size: 13.5px; }
.pchans { margin-bottom: 14px; padding: 16px 18px; }
.pchanlist { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.pchan { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 12px; background: var(--sunk); }
.pchan i { width: 9px; height: 9px; border-radius: 50%; background: var(--ch); }
.pchan a { font-weight: 700; color: var(--ink); }
.pchan span { color: var(--ink3); font-size: 12px; }
.pchans .pchan form.chpause { margin: 0 0 0 auto; }
.scriptmark { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px 0 6px; border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.scriptmark svg { width: 11px; height: 11px; flex: none; }
.scriptmark.has { background: rgba(60,203,132,.16); color: #8FE3B6; }
.scriptmark.has:hover { background: rgba(60,203,132,.28); }
.scriptmark.none { color: var(--ink3); box-shadow: inset 0 0 0 1px #3A3A42; background: none; }
.scriptmark.none svg { opacity: .7; }
.scriptmark.icon { padding: 0; width: 20px; justify-content: center; }
.ut .scriptmark, .vt .scriptmark { margin-left: 6px; vertical-align: -3px; height: 17px; width: 17px; }
.row.revision .meta .scriptmark { height: 22px; }
/* ── My Day, the VO Queue, recording mode ───────────────────────────────── */
.timerbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; padding: 12px 16px; border-radius: 18px;
  background: rgba(86,201,144,.10); box-shadow: inset 0 0 0 1.5px rgba(86,201,144,.45); color: #CFF5E0; font-size: 13.5px; }
.timerbar .tdot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); animation: pulse 1.6s ease-in-out infinite; }
.timerbar .tlabel b { color: #fff; }
.timerbar .tclock { font-family: var(--display); font-size: 22px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; }
.timerbar .test { color: #9FD9BA; font-size: 12.5px; }
.timerbar form { margin: 0; } .timerbar form:first-of-type { margin-left: auto; }
.timerbar button { padding: 8px 16px; }
@keyframes pulse { 50% { opacity: .35; } }
.wlist { display: flex; flex-direction: column; gap: 6px; }
.wrow { display: grid; grid-template-columns: 88px minmax(0, 1fr) 150px auto; align-items: center; gap: 12px; padding: 10px 12px;
  border-radius: 14px; background: var(--sunk); box-shadow: inset 3px 0 0 var(--wc); }
.wrow.on { background: rgba(86,201,144,.10); box-shadow: inset 3px 0 0 var(--ok), inset 0 0 0 1.5px rgba(86,201,144,.4); }
.wrow.late { background: rgba(242,104,94,.08); }
.wrow.done { grid-template-columns: 88px minmax(0, 1fr) auto; opacity: .85; }
.wgroup > summary { list-style: none; cursor: pointer; }
.wgroup > summary::-webkit-details-marker { display: none; }
.wgroup > summary .wt::after { content: " ▾"; color: var(--ink3); font-size: 12px; }
.wgroup[open] > summary .wt::after { content: " ▴"; }
.wgroup .wlist { margin: 6px 0 0 18px; }
.wtype { justify-self: start; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px;
  background: color-mix(in srgb, var(--wc) 24%, transparent); color: color-mix(in srgb, var(--wc) 45%, #fff); white-space: nowrap; }
.wmain { min-width: 0; }
.wt { display: block; font-family: var(--display); font-weight: 650; font-size: 14.5px; letter-spacing: -0.02em; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wt:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.wmeta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; color: var(--ink3); margin-top: 3px; }
.wch { display: inline-flex; align-items: center; gap: 5px; color: var(--ink2); font-weight: 600; }
.wch i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.wwhy { font-weight: 700; color: var(--ink2); } .wwhy.late { color: #FF8F86; }
.wtime { display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
.wbar { height: 6px; border-radius: 999px; background: #34343B; overflow: hidden; }
.wbar i { display: block; height: 100%; background: var(--ok); border-radius: 999px; }
.wbar i.over { background: var(--warn); }
.wnum { font-size: 12px; color: var(--ink2); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.wnum b.late { color: #FF8F86; } .wnum b.ok { color: #8FE3B6; }
.wacts { display: flex; gap: 6px; }
.wacts form { margin: 0; }
.wbtn { width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #45454D; background: transparent; color: #C9C9D0; cursor: pointer;
  display: grid; place-items: center; font-size: 13px; }
.wbtn svg { width: 12px; height: 12px; }
.wbtn:hover { border-color: var(--ok); color: var(--ok); }
.wbtn.on { background: var(--ok); border-color: var(--ok); color: #06170E; }
.wbtn.ok:hover { background: #26805A; border-color: #26805A; color: #fff; }
.wproj { font-size: 11.5px; color: var(--ink3); white-space: nowrap; }
.wwords, .wair { color: var(--ink3); }
.focus { margin-bottom: 14px; }
.focus .fhead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.focus .fhead h2 { margin: 0; }
.fchips { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.fchip { padding: 7px 14px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 12.5px; font-weight: 700; }
.fchip:hover { background: var(--line); color: var(--ink); }
.fchip.on { background: var(--yellow); color: #101012; }
.fgo { display: inline-block; font-size: 15px; padding: 14px 28px; margin-bottom: 10px; }
.freason { margin: 0 0 10px; color: var(--ink2); font-size: 13.5px; } .freason b { color: var(--ink); }
.fstart { margin: 12px 0 0; } .fstart button svg { width: 11px; height: 11px; margin-right: 6px; vertical-align: -1px; }
.mydaygrid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; margin-bottom: 14px; align-items: start; }
.panel h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; }
.panel h2 .sub .late, .panel h2 .sub b.late { color: #FF9C94; }
.llegend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: var(--ink3); margin-bottom: 12px; }
.llegend span { display: inline-flex; align-items: center; gap: 6px; }
.llegend i, .lcounts i { width: 9px; height: 9px; border-radius: 3px; background: var(--wc); }
.lrows { display: flex; flex-direction: column; gap: 6px; }
.lrow { display: grid; grid-template-columns: 62px minmax(0, 1fr) 76px; grid-template-areas: "day bar tot" ". counts counts"; align-items: center;
  gap: 4px 10px; padding: 8px 10px; border-radius: 12px; }
.lrow:hover { background: var(--sunk); }
.lrow.today { background: rgba(243,233,108,.07); box-shadow: inset 0 0 0 1px rgba(243,233,108,.25); }
.lday { grid-area: day; display: flex; flex-direction: column; font-size: 11.5px; color: var(--ink3); line-height: 1.25; }
.lday b { color: var(--ink); font-size: 12.5px; }
.lbar { grid-area: bar; display: flex; gap: 2px; height: 16px; border-radius: 999px; background: #26262C; overflow: hidden; }
.lbar i { display: block; height: 100%; background: var(--wc); }
.lbar em { font-style: normal; font-size: 11px; color: var(--ink3); padding: 0 10px; line-height: 16px; }
.ltot { grid-area: tot; text-align: right; font-variant-numeric: tabular-nums; display: flex; flex-direction: column; line-height: 1.2; }
.ltot b { font-family: var(--display); font-size: 15px; color: var(--ink); }
.ltot small { font-size: 10.5px; color: #8FE3B6; }
.lcounts { grid-area: counts; display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11px; color: var(--ink3); }
.lcounts span { display: inline-flex; align-items: center; gap: 5px; }
.vorank { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 8px; align-items: center; }
.vn { font-family: var(--display); font-weight: 800; color: var(--ink3); text-align: right; font-variant-numeric: tabular-nums; }
.reccard { padding: 30px 32px; box-shadow: inset 4px 0 0 var(--wc); margin-bottom: 14px; }
.recpos { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); }
.rectitle { font-family: var(--display); font-size: 34px; font-weight: 800; letter-spacing: -0.04em; line-height: 1.08; margin: 8px 0 12px; }
.recmeta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--ink2); margin-bottom: 16px; }
.recscript { display: inline-flex; align-items: center; gap: 8px; } .recscript svg { width: 13px; height: 13px; } .recscript small { color: var(--ink3); font-weight: 500; }
.recbrief { margin-top: 12px; } .recbrief summary { cursor: pointer; color: var(--ink2); font-weight: 700; font-size: 13px; }
.recclock { margin: 22px 0 18px; display: flex; align-items: baseline; gap: 10px; }
.recclock .tclock { font-family: var(--display); font-size: 64px; font-weight: 800; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; line-height: 1; }
.recclock small { color: var(--ink3); font-size: 14px; }
.recacts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.recacts .clear { line-height: 1.2; }
.recacts > a.clear, .recacts button.clear:not(.recbig) { padding: 12px 22px; }
.recacts form { margin: 0; }
.recbig { font-size: 16px; padding: 16px 30px; }
.recdone h2 { font-size: 26px; }
.fgsec { margin-bottom: 14px; }
.fgsec .gapstrip { margin: 0; }
.fgrow { position: relative; }
.fgwhy { display: inline-block; margin: 0 0 2px 14px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #FF9C94; }
header.page .nextbtn { align-self: center; margin-left: 12px; padding: 9px 16px; font-size: 12.5px; white-space: nowrap; }
@media (max-width: 760px) { header.page .nextbtn { display: inline-block; margin: 10px 0 0; } }
.sideflag { margin-left: 6px; background: #E2574C; color: #1B0806; border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 800; }
@media (max-width: 1000px) { .mydaygrid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .wrow { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "type acts" "main main" "time time"; gap: 6px 10px; }
  .wrow .wtype { grid-area: type; } .wrow .wacts { grid-area: acts; } .wrow .wmain { grid-area: main; } .wrow .wtime { grid-area: time; }
  .wrow.done { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "type num" "main main"; }
  .wrow.done .wnum { grid-area: num; }
  .wt { white-space: normal; }
  .rectitle { font-size: 26px; } .recclock .tclock { font-size: 48px; }
  .reccard { padding: 22px 20px; }
  .fchips { margin-left: 0; }
  .timerbar form:first-of-type { margin-left: 0; }
}
.row.uploaded { background: rgba(47,182,115,.10); box-shadow: inset 3px 0 0 #2FB673; }
.uploaded-tag { padding: 1px 8px; border-radius: 6px; background: rgba(47,182,115,.22); color: #9BEBC2; font-weight: 700; font-size: 11px; }
.paused-tag { padding: 1px 8px; border-radius: 6px; background: rgba(141,155,242,.18); color: #C3CAF8; font-weight: 700; font-size: 11px; }
.row.paused .title a { color: var(--ink2); }
.row .due.paused { background: rgba(141,155,242,.12); color: #B8C1F7; }
.row .due.paused b { color: #C3CAF8; }
.recacts2 { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 0; }
.pausebtn svg, .noscriptbtn svg { width: 12px; height: 12px; vertical-align: -1px; margin-right: 4px; }
.noscriptbtn.on { background: #E24FCB !important; color: #1E0C1B !important; }
.paused-link { color: #C3CAF8 !important; }
.tick { display: flex; }
.tick button {
  width: 30px; height: 30px; border-radius: 999px; border: 1.5px solid #45454D;
  background: transparent; color: #A6A6B0; cursor: pointer; font-size: 13px; line-height: 1;
  font-family: var(--ui); flex: none; transition: all .12s ease;
}
.tick button:hover { border-color: var(--ok); color: var(--ok); }
.tick button.on { background: #26805A; border-color: #26805A; color: #fff; }
.row.cleared .title, .row.cleared .title .code { color: var(--ink3); }
.row.cleared .title a { text-decoration: line-through; text-decoration-color: #6E6E78; }
.row.cleared .meta, .row.cleared .meta .chan, .row.cleared .meta .airs, .row.cleared .meta .count, .row.cleared .meta .code { color: var(--ink3); }
.row.cleared .due, .row.cleared .due b, .row.cleared .due .tm { color: var(--ink3); }
.tick.remove button { font-size: 16px; }
.tick.remove button:hover { border-color: var(--late); color: var(--late); }
.tick.restore button:hover { border-color: #8D9BF2; color: #8D9BF2; }

/* ── sorting ─────────────────────────────────────────────────────────────── */
.sortbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 4px 14px; }
.sortlabel { color: var(--dim); font-size: 12px; font-weight: 600; margin-right: 4px; }
.sortpill {
  padding: 7px 13px; border-radius: 999px; background: var(--rail); color: #9A9AA3;
  font-size: 12.5px; font-weight: 600;
}
.sortpill:hover { color: #fff; background: #26262A; }
.sortpill.on { background: var(--yellow); color: #101012; }

/* ── recurring ─────────────────────────────────────────────────────────── */
.batches { display: flex; flex-direction: column; gap: 8px; }
.batch {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px;
  background: var(--sunk); color: var(--ink); font-size: 14px; letter-spacing: -0.012em;
}
.batch:hover { background: var(--line); }
.batch .who { display: flex; align-items: center; gap: 12px; min-width: 250px; }
.batch .tick button { width: 26px; height: 26px; font-size: 12px; }
.tick-space { width: 26px; flex: none; }
.batch .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ch, var(--c)); flex: none; box-shadow: 0 0 0 1px var(--ring); }
.batch .name { font-weight: 600; min-width: 160px; }
.batch .bar {
  flex: 1; height: 7px; border-radius: 999px; background: #3A3A42; overflow: hidden; min-width: 60px;
}
.pips { flex: 1; display: flex; gap: 5px; min-width: 120px; }
.pips form { flex: 1; display: flex; }
.pip {
  flex: 1; height: 26px; border-radius: 8px; border: 0; cursor: pointer; padding: 0;
  background: #3A3A42; transition: background .12s ease;
}
.pip:hover { background: #4A4A53; }
.pip.on { background: var(--c); }
.pip.on:hover { filter: brightness(1.08); }
.batch.done .pip.on { background: var(--gm); }
.row .meta .count { color: var(--ink2); font-weight: 600; }
.batch .bar > span { display: block; height: 100%; background: var(--c); border-radius: 999px; }
.batch .state {
  font-family: var(--display); font-weight: 700; font-size: 13px; color: var(--ink2);
  font-variant-numeric: tabular-nums; min-width: 58px; text-align: right;
}
.batch.done .state { color: var(--ok); }
.batch.done .bar > span { background: var(--gm); }
.airform { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.airform label { font-family: var(--display); font-weight: 700; color: #fff; font-size: 15px; }
.airform input {
  padding: 10px 14px; border-radius: 12px; border: 0; background: var(--raised); color: var(--ink);
  font: inherit; font-size: 14px; color-scheme: dark;
}
.airform .hint { margin: 0; }
.batch-group + .batch-group { margin-top: 18px; }
.batch-head {
  display: flex; align-items: center; gap: 9px; margin: 0 0 9px 4px;
  font-family: var(--display); font-weight: 700; font-size: 14px; letter-spacing: -0.02em;
}
.batch-head .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.batch-head .sub { font-family: var(--ui); font-weight: 500; font-size: 12px; color: var(--ink3); letter-spacing: 0; text-transform: none; }
.lfbadge { margin-left: 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 6px; background: #3A2A33; color: #F4B8CB; vertical-align: 1px; }
.batch-head .n { margin-left: auto; font-family: var(--ui); font-weight: 600; font-size: 12px; color: var(--ink3); padding-right: 4px; }
.hint { color: var(--ink3); font-size: 12.5px; margin: 14px 0 0; max-width: 560px; line-height: 1.6; }
.panel form { margin-top: 14px; }
/* ...but not the buttons inside a batch row, which sit on its centre line. */
.panel .batch form { margin-top: 0; }
@media (max-width: 760px) {
  .batch { flex-wrap: wrap; gap: 8px 10px; }
  .batch .name { min-width: 0; flex: 1; }
  .batch .bar, .batch .pips { order: 3; flex-basis: 100%; }
}

/* ── dashboard columns ─────────────────────────────────────────────────── */
.colbar { display: flex; align-items: center; gap: 12px; margin: 26px 4px 12px; }
.colbar .section-title { margin: 0; }
.colpick { position: relative; margin-left: auto; }
.colpick summary {
  list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-radius: 999px; background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600;
}
.colpick summary::-webkit-details-marker { display: none; }
.colpick summary::after { content: "▾"; color: var(--ink3); font-size: 11px; }
.colpick summary b {
  background: var(--yellow); color: #101012; border-radius: 999px; min-width: 20px; height: 20px;
  display: grid; place-items: center; font-size: 11.5px; padding: 0 6px;
}
.colpick[open] summary { background: #26262A; color: #fff; }
.colmenu {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 15; width: 230px; padding: 6px;
  background: var(--card); border-radius: 16px; box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35;
}
.colmenu { width: 262px; }
.colmenu label {
  display: flex; align-items: center; gap: 10px; padding: 10px 10px; border-radius: 10px;
  cursor: pointer; color: var(--ink); font-size: 13.5px; font-weight: 600;
}
.colmenu label:hover { background: var(--sunk); }
.colmenu input { width: 16px; height: 16px; accent-color: var(--yellow); margin: 0; }
.colmenu i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.colmenu span { margin-left: auto; color: var(--ink3); font-variant-numeric: tabular-nums; font-weight: 700; }
.colopt { display: flex; align-items: center; gap: 2px; }
.colopt label { flex: 1; min-width: 0; }
.colopt .mv { width: 28px; height: 28px; flex: none; border: 0; border-radius: 8px; background: transparent; color: var(--ink3);
  font-size: 13px; cursor: pointer; }
.colopt .mv:hover { background: var(--sunk); color: #fff; }
.colopt:first-child .mv[data-d="-1"], .colopt:last-child .mv[data-d="1"] { visibility: hidden; }
.colhint { margin: 4px 10px 8px; color: var(--ink3); font-size: 11.5px; }
.colparts { border-top: 1px solid #2E2E35; margin-top: 4px; padding-top: 6px; }
.colparts b { display: block; padding: 6px 10px 2px; color: var(--ink3); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
.dashpart[hidden] { display: none; }
.colhead .grip { align-self: center; display: grid; place-items: center; width: 18px; height: 24px; margin-left: -6px;
  color: var(--ink3); cursor: grab; border-radius: 6px; opacity: .55; }
.colhead .grip svg { width: 8px; height: 13px; }
.colhead:hover .grip { opacity: 1; }
.colhead .grip:hover { background: var(--sunk); color: #fff; }
.catcol.moving { opacity: .45; }
@media (hover: none) { .colhead .grip { display: none; } }
.catcols { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 14px; align-items: start; margin-bottom: 14px; }
.catcol { min-width: 0; container-type: inline-size; }
.catcol[hidden], .nocols[hidden] { display: none; }
.colhead { display: flex; align-items: baseline; gap: 10px; padding: 0 8px 10px; }
.colhead .dot { width: 11px; height: 11px; border-radius: 4px; background: var(--c); flex: none; }
.colhead .name { font-family: var(--display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; }
.colhead .name:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.colhead .sub { color: var(--dim); font-size: 12px; }
.colhead .n { margin-left: auto; font-family: var(--display); font-weight: 700; color: var(--dim); font-variant-numeric: tabular-nums; }
.catcol .empty { padding: 28px 16px; font-size: 13px; }
.seeall { display: block; text-align: center; padding: 10px; color: var(--ink3); font-size: 12.5px; font-weight: 600; }
.seeall:hover { color: var(--ink); }
/* In a narrow column a task stacks: title and buttons, whose-and-when, then
   the deadline pill — the same shape as on a phone. */
@container (max-width: 560px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; padding: 10px 8px 11px 12px; }
  .row .title { grid-row: 1; font-size: 14.5px; align-items: flex-start; }
  .row .title .swatch { margin-top: 5px; }
  .row .title a { white-space: normal; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  /* The cream row already says pinned; the tag keeps just its pin. */
  .row .pinned-tag { padding: 4px; }
  .row .pinned-tag span, .row .pinned-tag:hover::after { display: none; }
  .row .acts { grid-column: 2; grid-row: 1; }
  .row .meta { grid-column: 1 / -1; grid-row: 2; }
  .row .due { grid-column: 1 / -1; grid-row: 3; justify-self: start; margin: 3px 0 0 19px; padding: 4px 9px; font-size: 12px;
    white-space: normal; flex-wrap: wrap; column-gap: 6px; max-width: calc(100% - 19px); }
}
@container (max-width: 560px) {
  .row .due.none { display: none; }
}
@container (max-width: 300px) {
  .row .meta { padding-left: 0; }
  .row .due { margin-left: 0; max-width: 100%; }
}
.row .title .chdot {
  display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--ch);
  margin-right: 7px; vertical-align: 1px; box-shadow: 0 0 0 1px var(--ring);
}
@media (max-width: 1100px) {
  .catcols { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .catcols[data-n="1"] { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .catcols { grid-template-columns: minmax(0, 1fr); }
  .colbar { margin: 18px 4px 10px; }
}

.scriptsframe { background: var(--card); border-radius: var(--r); overflow: hidden; height: calc(100vh - 150px); min-height: 480px; }
.scriptsframe iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.scriptsblocked h2 { margin-bottom: 8px; }
header.page a.clear { align-self: center; }
@media (max-width: 760px) { .scriptsframe { height: calc(100vh - 170px); border-radius: 18px; } }

.row .due.delivered { background: rgba(86,201,144,.13); color: #A9E5C6; }
.row .due.delivered b { color: var(--ok); }
.row .title .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cattoggle b { color: var(--ink); margin-left: 2px; }

/* ── google calendar subscribe ────────────────────────────────────────── */
.subscribe { position: relative; }
.subscribe summary {
  list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  background: var(--rail); border-radius: 999px; padding: 10px 16px; font-size: 13px; color: #D8D8DE; font-weight: 600;
}
.subscribe summary::-webkit-details-marker { display: none; }
.subscribe summary svg { width: 16px; height: 16px; }
.subscribe[open] summary, .subscribe summary:hover { background: #26262A; color: #fff; }
.subpanel {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; width: 380px; padding: 18px;
  background: var(--card); color: var(--ink); border-radius: 18px; box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35;
}
.subpanel > b { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; }
.subpanel p { color: var(--ink3); font-size: 12.5px; margin: 6px 0 12px; line-height: 1.55; }
.subpanel p.fine { font-size: 11.5px; margin: 10px 0 0; }
.subpanel a { color: #AEB8F5; }
.subopts { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
.subopts label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.subopts input { accent-color: var(--yellow); width: 15px; height: 15px; margin: 0; }
.subcopy { display: flex; gap: 8px; }
.subcopy input {
  flex: 1; min-width: 0; padding: 9px 11px; border-radius: 10px; border: 0; background: var(--sunk);
  color: var(--ink2); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.subpanel ol { margin: 12px 0 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: var(--ink2); }
@media (max-width: 760px) {
  .subpanel { position: fixed; left: 10px; right: 10px; top: 80px; width: auto; }
}

/* ── uploads ───────────────────────────────────────────────────────────── */
.usub { color: var(--dim); font-size: 13px; margin: -12px 4px 16px; }
.checknow { margin: 0; align-self: center; }
.utiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
.utiles.after { margin-top: 14px; }
.utile { background: var(--card); border-radius: var(--r); padding: 20px 22px; }
.utile .n { font-family: var(--display); font-size: 40px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.utile .l { color: var(--ink3); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 10px; }
.utile.t-ok { background: #173226; } .utile.t-ok .n { color: #7FE0AE; }
.utile.t-late { background: #3A1E1D; } .utile.t-late .n { color: #FF9C94; }
.uplanes { position: relative; margin-bottom: 14px; }
.uphead { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
.uphead h2 { margin: 0; }
.uphead .tabs { margin-left: auto; display: flex; gap: 3px; background: var(--sunk); border-radius: 999px; padding: 4px; }
.uphead .tab { padding: 6px 14px; border-radius: 999px; font-size: 12.5px; color: var(--ink2); font-weight: 600; }
.uphead .tab.on { background: var(--yellow); color: #101012; }
.ulegend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink2); }
.ulegend span { display: inline-flex; align-items: center; gap: 6px; }
.ulegend i { display: inline-block; }
.lg-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink2); box-shadow: 0 0 0 2px var(--card); }
.lg-ok { width: 18px; height: 3px; border-radius: 2px; background: #4A4A53; }
.lg-late { width: 18px; height: 5px; border-radius: 3px; background: #E5534B; }
.lg-due { width: 9px; height: 9px; transform: rotate(45deg); box-shadow: inset 0 0 0 1.5px var(--yellow); }
.upscroll { overflow-x: auto; }
.upscroll svg { display: block; min-width: 760px; }
.uplanes svg .wk { stroke: #26262C; stroke-width: 1; }
.uplanes svg .today { stroke: var(--yellow); stroke-width: 1.5; stroke-dasharray: 3 3; }
.uplanes svg .tick { fill: var(--ink3); font: 600 10.5px var(--ui); }
.uplanes svg .today-l { fill: var(--yellow); }
.uplanes svg .lname { fill: var(--ink); font: 600 12.5px var(--ui); }
.uplanes svg .ring { stroke: var(--card); stroke-width: 2; }
.uplanes svg .track { stroke: #202026; stroke-width: 1; }
.uplanes svg .nolink { fill: var(--ink3); font: 12px var(--ui); }
.uplanes svg .seg line { stroke-linecap: round; }
.uplanes svg .seg.ok line { stroke: #4A4A53; stroke-width: 3; }
.uplanes svg .seg.late line { stroke: #E5534B; stroke-width: 5; }
.uplanes svg .seg.wait line { stroke-dasharray: 2 5; }
.uplanes svg .seg.wait.late line { stroke-dasharray: 5 4; }
.uplanes svg .glab { fill: #FF9C94; font: 700 10.5px var(--ui); }
.uplanes svg .hit { fill: transparent; }
.uplanes svg .due-mark path { fill: none; stroke: var(--yellow); stroke-width: 1.5; }
.uplanes svg .due-mark .ahead { stroke: #5A5520; stroke-width: 1.5; stroke-dasharray: 1 4; }
.uplanes svg .up:hover .ring { stroke: var(--ink); }
.uplanes svg [data-tip] { cursor: default; }
.uplanes svg a.up { cursor: pointer; }
.uplanes svg .lstate { font: 700 12px var(--ui); fill: var(--ink2); }
.uplanes svg .lstate.ok { fill: #7FE0AE; } .uplanes svg .lstate.late { fill: #FF9C94; } .uplanes svg .lstate.due { fill: #F8C58F; }
.uptip {
  position: absolute; z-index: 5; pointer-events: none; max-width: 340px; padding: 8px 11px; border-radius: 10px;
  background: #2E2E35; color: var(--ink); font-size: 12.5px; line-height: 1.4; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.uptip[hidden] { display: none; }
.utable-wrap { overflow-x: auto; }
.utable { width: 100%; border-collapse: collapse; font-size: 13px; }
.utable th { text-align: left; color: var(--ink3); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; padding: 0 10px 10px; white-space: nowrap; }
.utable td { padding: 10px; border-top: 1px solid #26262C; white-space: nowrap; }
.utable td small { color: var(--ink3); margin-left: 4px; }
.utable .num { text-align: right; font-variant-numeric: tabular-nums; }
.cdot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--ch); margin-right: 8px; box-shadow: 0 0 0 1px var(--ring); vertical-align: 0; }
.pace { display: inline-flex; gap: 4px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; background: var(--sunk); color: var(--ink2); }
.pace.ok { background: rgba(86,201,144,.14); color: #8FE3B6; }
.pace.due { background: rgba(238,154,85,.14); color: #F8C58F; }
.pace.late { background: rgba(242,104,94,.14); color: #FF9C94; }
.panel + .panel { margin-top: 14px; }
.ulatest-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; }
.ulatest { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1px 0; padding: 9px 10px; border-radius: 12px; }
.ulatest:hover { background: var(--sunk); }
.ulatest .cdot { grid-row: span 2; margin-top: 5px; }
.ulatest .ut { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ulatest .uc, .ulatest .ud { grid-column: 2; font-size: 12px; color: var(--ink3); }
.ulatest .uc { display: none; }
.ulinks { margin-top: 14px; }
.ulinks summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 12px; }
.ulinks summary::-webkit-details-marker { display: none; }
.ulinks summary h2 { margin: 0; }
.ulinks summary .sub { color: var(--ink3); font-size: 12.5px; }
.ulinks summary::after { content: "▾"; margin-left: auto; color: var(--ink3); }
.linkform { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.linkrow { display: grid; grid-template-columns: 220px minmax(0, 1fr) 260px; align-items: center; gap: 12px; }
.linkrow .lname { font-weight: 600; font-size: 13.5px; }
.linkrow input { padding: 9px 12px; border-radius: 10px; border: 1px solid transparent; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13px; }
.linkrow input:focus { outline: 0; border-color: var(--salmon); }
.lstat { font-size: 12px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lstat.ok { color: #8FE3B6; } .lstat.err { color: #FF9C94; white-space: normal; }
.linkform .clear { align-self: flex-start; margin-top: 10px; }
.uplanes svg .halo-up { fill: none; stroke: #F3E96C; stroke-width: 2; }
.uplanes svg .halo-down { fill: none; stroke: #8A8A94; stroke-width: 1.5; stroke-dasharray: 2 2.5; }
.lg-up { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 2px #F3E96C; }
.lg-down { width: 12px; height: 12px; border-radius: 50%; border: 1.5px dashed #8A8A94; }
.performers h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.pcols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.pcols h3 { font-size: 14px; margin: 0 0 8px; display: flex; gap: 8px; align-items: baseline; }
.pcols h3 span { color: var(--ink3); font-family: var(--ui); font-size: 12px; }
.prow { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 12px; align-items: center; padding: 8px 10px; border-radius: 12px; }
.prow:hover { background: var(--sunk); }
.pmult { font-family: var(--display); font-weight: 800; font-size: 18px; letter-spacing: -0.03em; text-align: right; font-variant-numeric: tabular-nums; }
.pmult.breakout { color: #F8E27A; } .pmult.under { color: #B4B4BE; }
.pbody { display: flex; flex-direction: column; min-width: 0; }
.pbody .ut { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmeta { font-size: 12px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbadge { font-weight: 700; margin-left: 4px; padding: 1px 7px; border-radius: 999px; }
.vbadge.breakout { background: rgba(243,233,108,.14); color: #F8E27A; }
.vbadge.under { background: var(--sunk); color: #B4B4BE; }
.catswitch { display: flex; gap: 6px; flex-wrap: wrap; margin: -6px 4px 14px; }
.catswitch a {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px;
  background: var(--rail); color: #C9C9D0; font-weight: 700; font-size: 13.5px;
}
.catswitch a i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.catswitch a:hover { background: #26262A; color: #fff; }
.catswitch a.on { background: var(--c); color: var(--on); }
.catswitch a.on i { background: var(--on); }
.catswitch a i.round { border-radius: 50%; }
.chswitch a.back { background: transparent; color: var(--ink2); padding-left: 6px; }
.chswitch a.back:hover { color: #fff; background: var(--rail); }
.usub .cdot { margin-right: 6px; }
.usub a { color: var(--ink2); text-decoration: underline; text-decoration-color: var(--ink3); }
.hint-inline { color: var(--ink3); }
a.chlink { color: inherit; }
a.chlink:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.uplanes svg a.lane-a { cursor: pointer; }
.uplanes svg a.lane-a:hover .lname { fill: #fff; text-decoration: underline; }
.outliers .utiles { grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 12px 0 18px; }
.outliers .utile { background: var(--sunk); padding: 16px 18px; }
.outliers .utile .n { font-size: 30px; }
.ocols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px 22px; }
.ocols h3 { font-size: 13px; margin: 0 0 8px; color: var(--ink2); display: flex; gap: 6px; align-items: baseline; }
.ocols h3 span { color: var(--ink3); font-family: var(--ui); font-size: 11px; }
.obar { display: grid; grid-template-columns: 82px minmax(0, 1fr) 32px; gap: 10px; align-items: center; font-size: 12.5px; padding: 3px 0; }
.obar .ol { color: var(--ink2); white-space: nowrap; }
.obar .ot { height: 12px; border-radius: 6px; background: var(--sunk); overflow: hidden; }
.obar .ot i { display: block; height: 100%; border-radius: 6px; background: #6E6E78; min-width: 2px; }
.obar.down .ot i { background: #FF7A70; } .obar.soft .ot i { background: #B08A8A; } .obar.mid .ot i { background: #8A8A96; }
.obar.good .ot i { background: #8FE3B6; } .obar.up .ot i { background: #F8E27A; }
.obar b { text-align: right; font-variant-numeric: tabular-nums; }
.odays { display: flex; flex-direction: column; gap: 4px; }
.odays span { display: grid; grid-template-columns: 100px 56px 1fr; gap: 8px; font-size: 12.5px; align-items: baseline; }
.odays span.up b + * { color: #8FE3B6; } .odays span.down b + * { color: #FF9C94; }
.odays small { color: var(--ink3); }
.everyvid .uphead .evfilter { margin-left: 0; }
.evlist { display: flex; flex-direction: column; margin-top: 6px; }
.evrow { display: grid; grid-template-columns: 58px minmax(0, 1fr) 150px 88px 110px; gap: 12px; align-items: center;
  padding: 8px 8px; border-top: 1px solid #26262C; font-size: 13px; }
.evrow:hover { background: var(--sunk); border-radius: 10px; }
.evrow[hidden] { display: none; }
.evm { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink3); }
.evm.up { color: #8FE3B6; } .evm.down { color: #FF9C94; }
.evt { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evd { color: var(--ink3); font-size: 12px; white-space: nowrap; }
.evv { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.evv small { color: var(--ink3); font-weight: 500; }
.evtier { font-size: 12px; color: var(--ink2); white-space: nowrap; }
.evrow.up .evtier { color: #F8E27A; } .evrow.down .evtier { color: #FF9C94; }
.evmore { margin-top: 12px; }
.everyvid .tabs button { border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px; }
.everyvid .tabs button.on { background: var(--yellow); color: #101012; }
.chlab .isugg a { display: flex; flex-direction: column; gap: 3px; padding: 11px 13px; background: var(--sunk); border-radius: 12px; }
.chlab .isugg a:hover { background: #26262C; }
.chlab .isugg b { font-family: var(--display); font-size: 15px; letter-spacing: -0.02em; }
.chlab .lf { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #B5BEF7; }
.chlab .why { color: var(--ink3); font-size: 12px; line-height: 1.5; }
.chlab .lf.ep { color: #8FE3B6; }
.chlab .isugg .due { color: #F8C58F; } .chlab .isugg .due.late { color: #FF9C94; }
.series { position: relative; margin-bottom: 14px; }
.series .utiles { margin: 12px 0 14px; }
.series .utile { background: var(--sunk); padding: 16px 18px; }
.series .utile .n { font-size: 30px; }
.slist { display: flex; flex-direction: column; }
.srow { display: grid; grid-template-columns: minmax(0, 1fr) 120px 132px 64px 150px; gap: 14px; align-items: center;
  padding: 11px 8px; border-top: 1px solid #26262C; font-size: 13px; }
.srow.resting { opacity: 1; }
.srow.resting .sn { color: var(--ink2); }
.srow .sname { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.srow .sn { font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srow .sch { color: var(--ink3); font-size: 12px; display: inline-flex; align-items: center; gap: 6px; }
.srow .sadv { color: var(--ink2); font-size: 12px; line-height: 1.45; }
.srow .seps { color: var(--ink2); white-space: nowrap; }
.srow .seps small { display: block; color: var(--ink3); font-size: 11.5px; }
.srow .smed { font-family: var(--display); font-weight: 800; font-size: 17px; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink2); }
.srow .smed.up { color: #8FE3B6; } .srow .smed.down { color: #FF9C94; }
.srow .snext { white-space: nowrap; font-size: 12.5px; }
.srow .snext b { display: block; color: var(--ink); font-weight: 700; }
.srow .snext small { color: var(--ink3); } .srow .snext small.late { color: #FF9C94; } .srow .snext small.soon { color: #F8C58F; }
.strend { display: inline-flex; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--raised); color: var(--ink2); width: fit-content; }
.strend.rising { background: rgba(86,201,144,.14); color: #8FE3B6; }
.strend.fading { background: rgba(242,104,94,.14); color: #FF9C94; }
.strend.resting { background: var(--raised); color: var(--ink3); }
.spark { display: block; width: 132px; height: 32px; overflow: visible; }
.spark .mid { stroke: #3A3A42; stroke-width: 1; }
.spark rect { fill: #6E6E78; } .spark rect.up { fill: #8FE3B6; } .spark rect.down { fill: #FF7A70; } .spark rect.na { fill: #3A3A42; }
@media (max-width: 760px) {
  .outliers .utiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .evrow { grid-template-columns: 50px minmax(0, 1fr) auto; row-gap: 2px; }
  .evrow .evt { grid-column: 2 / 4; }
  .evrow .evd { grid-column: 2; grid-row: 2; }
  .evrow .evv { grid-column: 3; grid-row: 2; }
  .evrow .evm { grid-row: span 2; }
  .evrow .evtier { display: none; }
  .srow { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
  .srow .sname { grid-column: 1 / 3; }
  .srow .spark { grid-row: 2; }
  .srow .seps, .srow .smed { display: none; }
  .chswitch { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .chswitch a { flex: none; }
}
.lg-cell { width: 12px; height: 12px; border-radius: 3px; margin-right: -2px; }
.uplanes svg .hc { fill: var(--ink2); font: 700 10.5px var(--ui); pointer-events: none; }
.uplanes svg .hc.dark { fill: #0B0B0D; }
.uplanes svg .hot-today { stroke: var(--yellow); stroke-width: 1.5; }
.ideas h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.ichecker { display: flex; gap: 8px; margin-bottom: 12px; }
.panel .ichecker { margin-top: 4px; }
.ichecker input[type=text] {
  flex: 1; min-width: 0; padding: 11px 14px; border-radius: 12px; border: 1px solid transparent;
  background: var(--sunk); color: var(--ink); font: inherit; font-size: 14px;
}
.ichecker input[type=text]:focus { outline: 0; border-color: var(--salmon); }
.iresult { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; background: var(--sunk); border-radius: 14px; padding: 12px 16px; margin-bottom: 16px; }
.ipred b { font-family: var(--display); font-size: 30px; letter-spacing: -0.04em; display: block; line-height: 1; }
.ipred span { color: var(--ink3); font-size: 12px; }
.ipred.up b { color: #8FE3B6; } .ipred.down b { color: #FF9C94; }
.ireasons { display: flex; gap: 6px; flex-wrap: wrap; }
.ichip { padding: 4px 10px; border-radius: 999px; background: var(--raised); font-size: 12.5px; color: var(--ink2); }
.ichip b { margin-left: 2px; } .ichip small { color: var(--ink3); margin-left: 4px; }
.ichip.up b { color: #8FE3B6; } .ichip.down b { color: #FF9C94; }
.icols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 6px; }
.icol h3, .ihead { font-size: 13px; margin: 0 0 8px; color: var(--ink2); letter-spacing: 0.02em; }
.ihead { margin-top: 18px; }
.ilist { list-style: none; margin: 0; padding: 0; }
.ilist li { border-top: 1px solid #26262C; font-size: 13px; }
.ilist .ik { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ilist .il { font-weight: 700; font-variant-numeric: tabular-nums; }
.ilist .il.up { color: #8FE3B6; } .ilist .il.down { color: #FF9C94; }
.ilist .in { color: var(--ink3); font-size: 11.5px; min-width: 62px; text-align: right; }
.isugg { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
.ikind { font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); }
.ikind.pairing { color: #B5BEF7; } .ikind.sequel { color: #F8E27A; } .ikind.revisit { color: #8FE3B6; }
.iidea { font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: -0.02em; }
.iwhy { color: var(--ink3); font-size: 12px; line-height: 1.5; }
.ihead-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ihead-row h2 { margin-bottom: 10px; }
.ichan { margin-left: auto; }
.panel .ichan { margin-top: 0; }
.ichan label { font-size: 12.5px; color: var(--ink3); display: inline-flex; gap: 8px; align-items: center; }
.ichan select { padding: 7px 10px; border-radius: 10px; border: 0; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13px; color-scheme: dark; }
.ilist li { display: block; padding: 0; }
.ilist details summary {
  list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px;
  align-items: baseline; padding: 6px 2px;
}
.ilist details summary::-webkit-details-marker { display: none; }
.ilist details summary:hover .ik { text-decoration: underline; text-decoration-color: var(--ink3); }
.ilist details[open] summary { background: var(--sunk); border-radius: 8px; }
.idetail { padding: 8px 4px 12px; }
.idetail h4 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin: 12px 0 6px; }
.idetail h4:first-child { margin-top: 2px; }
.imeta { color: var(--ink3); font-size: 12px; margin: 2px 0 6px; line-height: 1.5; }
.ibych { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--ink2); margin: 4px 0; }
.ibych b { margin-left: 3px; } .ibych small { color: var(--ink3); }
.ibych b.up, .vm.up { color: #8FE3B6; } .ibych b.down, .vm.down { color: #FF9C94; }
.ivids { list-style: none; margin: 0; padding: 0; }
.ivids a { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 0 10px; padding: 5px 6px; border-radius: 8px; }
.ivids a:hover { background: var(--sunk); }
.vm { font-weight: 800; font-variant-numeric: tabular-nums; grid-row: span 2; }
.vt { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc { font-size: 11.5px; color: var(--ink3); }
.isugg > li { list-style: none; }
.wnlist { display: flex; flex-direction: column; gap: 16px; }
.wnchan { border-left: 3px solid var(--ch); padding-left: 12px; transition: opacity .15s; }
.wnchan.busy { opacity: .45; pointer-events: none; }
.wnchan > header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.wnchan > header i { width: 10px; height: 10px; border-radius: 50%; background: var(--ch); }
.wnchan > header b { font-family: var(--display); font-size: 15px; }
.wnskip { font-size: 11.5px; color: var(--ink3); }
.wncard { display: flex; flex-direction: column; gap: 6px; }
.wnscore { align-self: flex-start; display: inline-flex; align-items: baseline; gap: 1px; font-family: var(--display); font-weight: 800; font-size: 20px;
  color: var(--sc); line-height: 1; }
.wnscore small { font-size: 11px; color: var(--ink3); font-weight: 700; }
.wnscore.sm { font-size: 13px; min-width: 24px; }
.wnsim { align-self: flex-start; font-size: 11.5px; font-weight: 700; color: #FFD29A; background: rgba(217,130,43,.18); border-radius: 6px; padding: 2px 8px; line-height: 1.45; }
.wnacts { display: flex; gap: 6px; flex-wrap: wrap; }
.wnacts form, .wnbucket form { display: inline; margin: 0; }
.wnbtn { border: 0; cursor: pointer; border-radius: 999px; padding: 5px 11px; background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui); }
.wnbtn:hover { background: var(--line); color: var(--ink); }
.wnbucket { margin-left: auto; }
.wnbucket summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 700; color: var(--ink2); background: var(--sunk); border-radius: 999px; padding: 4px 11px; }
.wnbucket summary b { color: var(--yellow); }
.wnbucket ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.wnbucket li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.wnbucket li a { color: var(--ink); font-weight: 600; } .wnbucket li a:hover { text-decoration: underline; }
.wnbucket li.wnbw { align-items: flex-start; }
.wnbucket li.wnbw details { flex: 1; min-width: 0; }
.wnbucket li.wnbw summary { cursor: pointer; font-weight: 600; color: var(--ink); }
.wnbucket li.wnbw p { margin: 6px 0 4px; color: var(--ink2); font-size: 12.5px; }
.ikind.written { color: #F3C6FF; }
.wncard.written .iidea { color: #fff; }
.wnbeats { margin: 4px 0 10px; padding-left: 20px; color: var(--ink2); font-size: 13px; line-height: 1.5; }
.wnbeats li { margin: 2px 0; }
.wnclaude { margin: -4px 0 14px; color: var(--ink3); font-size: 12.5px; line-height: 1.5; }
.wnfocusrow { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; margin: -2px 0 8px; }
.wnfocus { font-size: 12px; font-weight: 600; color: var(--ink2); }
.wnai { font-size: 11.5px; font-weight: 700; color: #F3C6FF; }
.wnai.bad { color: #FFB4A8; }
.wnedit > summary { cursor: pointer; list-style: none; font-size: 11.5px; font-weight: 700; color: var(--ink3); padding: 2px 8px; border-radius: 999px; background: var(--sunk); }
.wnedit > summary:hover { color: var(--ink); }
.wnedit[open] { flex-basis: 100%; }
.wnedit form { display: flex; flex-direction: column; gap: 8px; margin: 8px 0 4px; max-width: 560px; }
.wnedit label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ink3); }
.wnedit select, .wnedit textarea { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13.5px; }
.wnedit button { align-self: flex-start; }
.wnwhen { color: var(--ink3); font-size: 11.5px; margin-left: auto; white-space: nowrap; }
.wnx { border: 0; background: none; color: var(--ink3); cursor: pointer; font-size: 16px; padding: 0 4px; }
.wnx:hover { color: var(--late); }
.tlog { position: relative; margin-bottom: 14px; }
.tlog .fhead { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.tlog .fhead h2 { margin: 0; }
.tlstats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.tlstat { background: var(--sunk); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tlstat b { font-family: var(--display); font-size: 20px; line-height: 1.1; color: var(--ink); }
.tlstat span { font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tlmix { display: flex; gap: 2px; height: 10px; border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
.tlmix i { background: var(--wc); min-width: 3px; }
.tllegend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ink2); margin-bottom: 14px; }
.tllegend span { display: inline-flex; align-items: center; gap: 6px; } .tllegend i { width: 9px; height: 9px; border-radius: 3px; background: var(--wc); }
.tllegend b { color: var(--ink); font-weight: 700; }
.tlweek { display: flex; flex-direction: column; gap: 5px; }
.tlrow { display: grid; grid-template-columns: 52px minmax(0, 1fr) 64px; gap: 10px; align-items: center; }
.tlday { display: flex; flex-direction: column; font-size: 11px; color: var(--ink3); line-height: 1.2; } .tlday b { color: var(--ink2); font-size: 12.5px; }
.tlrow.today .tlday b { color: var(--yellow); }
.tllane { position: relative; height: 26px; background: var(--sunk); border-radius: 8px; overflow: hidden; }
.tlrow.future .tllane { opacity: .45; } .tlrow.off .tllane { background: repeating-linear-gradient(135deg, var(--sunk) 0 6px, #26262C 6px 12px); }
.tlaxis .tllane { background: none; height: 16px; overflow: visible; }
.tltick { position: absolute; top: 0; transform: translateX(-50%); font-size: 10.5px; color: var(--ink3); }
.tlgrid { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.05); }
.tlb { position: absolute; top: 3px; bottom: 3px; background: var(--wc); border-radius: 4px; cursor: default; }
.tlb:hover { filter: brightness(1.2); }
.tlnow { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--yellow); border-radius: 1px; }
.tlnote { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 11.5px; color: var(--ink3); }
.tltot { text-align: right; font-weight: 700; font-size: 13px; color: var(--ink); font-variant-numeric: tabular-nums; }
.tlbars { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 3px; height: 150px; padding: 0 0 18px 34px;
  background: linear-gradient(to bottom, rgba(255,255,255,.06) 1px, transparent 1px) 34px 0 / 100% 50% no-repeat, linear-gradient(to bottom, transparent calc(50% - 9px), rgba(255,255,255,.05) calc(50% - 9px), rgba(255,255,255,.05) calc(50% - 8px), transparent calc(50% - 8px)); }
.tlymax, .tlyhalf { position: absolute; left: 0; font-size: 10.5px; color: var(--ink3); } .tlymax { top: -6px; } .tlyhalf { top: calc(50% - 15px); }
.tlcol { position: relative; display: flex; align-items: flex-end; height: 100%; }
.tlcol.future { opacity: .3; }
.tlstack { width: 100%; height: 100%; display: flex; flex-direction: column-reverse; gap: 2px; }
.tlstack i { background: var(--wc); display: block; min-height: 2px; }
.tlstack i:last-child { border-radius: 4px 4px 0 0; }
.tlcol:hover .tlstack i { filter: brightness(1.2); }
.tlcol.today::after { content: ""; position: absolute; left: 50%; bottom: -8px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--yellow); }
.tlx { position: absolute; bottom: -18px; left: 0; font-size: 10.5px; color: var(--ink3); white-space: nowrap; }
.hmwrap { --cell: 14px; display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.hmwrap.quarter { --cell: 26px; }
.hmdays { display: grid; grid-template-rows: 16px repeat(7, var(--cell)); gap: 3px; font-size: 10px; color: var(--ink3); flex: none; position: sticky; left: 0; z-index: 1; background: var(--card); padding-right: 4px; }
.hmdays span { line-height: var(--cell); }
.hmgrid { display: flex; gap: 3px; }
.hmcol { display: grid; grid-template-rows: 16px repeat(7, var(--cell)); gap: 3px; flex: 0 0 var(--cell); }
.hmm { font-size: 10px; color: var(--ink3); white-space: nowrap; overflow: visible; }
.hmc { display: block; background: var(--hc); border-radius: 3px; width: var(--cell); height: var(--cell); }
.hmc.today { outline: 2px solid var(--yellow); outline-offset: -2px; }
.hmc.off { background: repeating-linear-gradient(135deg, var(--sunk) 0 3px, #2C2C33 3px 6px); }
.hmc:hover { outline: 2px solid var(--ink2); outline-offset: -2px; }
.hmlegend { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 11px; color: var(--ink3); flex-wrap: wrap; }
.hmlegend i { width: 12px; height: 12px; border-radius: 3px; background: var(--hc); }
.hmlegend small { margin-left: 8px; }
.tltable { margin-top: 12px; } .tltable summary { cursor: pointer; font-size: 12.5px; color: var(--ink3); font-weight: 700; }
.tltable table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
.tltable th { text-align: left; color: var(--ink3); font-size: 11px; padding: 5px 8px; border-bottom: 1px solid var(--line); }
.tltable td { padding: 5px 8px; border-bottom: 1px solid var(--line); color: var(--ink2); } .tltable td:nth-child(2) { color: var(--ink); font-weight: 700; white-space: nowrap; }
.tltip { position: absolute; z-index: 5; pointer-events: none; background: #0E0E11; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font-size: 12px; max-width: 320px; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
@media (max-width: 700px) {
  .tlstats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tlrow { grid-template-columns: 36px minmax(0, 1fr) 54px; gap: 6px; }
  .tltot { white-space: nowrap; font-size: 12px; }
  .hmwrap.quarter { --cell: 19px; }
  .tlbars { gap: 2px; padding-left: 28px; }
}
.upaused { color: var(--ink2); font-weight: 600; } .upaused:hover { color: var(--ink); text-decoration: underline; }
.mdsw { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 14px; }
.mdsw .mdlab { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin-right: 2px; }
.mdsw label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--card); color: var(--ink3); border-radius: 999px; padding: 5px 11px 5px 9px; font: 600 12.5px var(--ui); user-select: none; }
.mdsw label i { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--wc); }
.mdsw label:has(input:checked) { color: var(--ink); } .mdsw label:has(input:checked) i { background: var(--wc); }
.mdsw input { position: absolute; opacity: 0; pointer-events: none; }
.mdsw label:has(input:focus-visible) { outline: 2px solid var(--wc); }
.mdsw .mdx { margin-left: auto; }
.mdpill { border: 0; cursor: pointer; border-radius: 999px; padding: 6px 12px; background: var(--card); color: var(--ink2); font: 600 12.5px var(--ui); white-space: nowrap; }
.mdpill:hover { background: var(--line); color: var(--ink); }
.wrow.done .wnum { display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; }
.wrow.done .wclr { margin: 0 0 0 8px; display: inline; } .wrow.done .wclr .mdpill { background: var(--sunk); padding: 4px 10px; font-size: 11.5px; }
.wnt { color: var(--ink3); font-size: 12px; }
.wunits { color: var(--ink2); font-weight: 600; }
@media (max-width: 600px) { .mdsw .mdx { margin-left: 0; } }
.spgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 14px; }
.spcard { background: var(--sunk); border-radius: 14px; border-top: 3px solid var(--ch); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; transition: opacity .15s; }
.spcard.busy { opacity: .45; pointer-events: none; }
.spcard > header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.spkind { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); }
.spslot { font-size: 12px; color: var(--ink3); margin-left: auto; }
.sptitle { display: flex; gap: 12px; align-items: flex-start; }
.sptitle h3 { margin: 0; flex: 1; font-family: var(--display); font-size: 16.5px; line-height: 1.3; letter-spacing: -0.01em; }
.splist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.splist li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto auto; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.splist li:last-child { border-bottom: 0; }
.spn { color: var(--ink3); font-weight: 700; font-variant-numeric: tabular-nums; }
.splist .spt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.spch { font-size: 11px; font-weight: 700; color: var(--ch); white-space: nowrap; }
.sprt { font-variant-numeric: tabular-nums; color: var(--ink2); white-space: nowrap; text-align: right; }
.sprt em, .sptable em { font-style: normal; font-size: 10.5px; color: var(--ink3); font-weight: 700; }
.sptotal { margin: 0; font-size: 12.5px; color: var(--ink2); } .sptotal b { color: var(--ink); font-variant-numeric: tabular-nums; }
.spwhy { margin: 0; font-size: 12px; color: var(--ink3); line-height: 1.45; }
.wnbtn.go { background: #1E3A2C; color: #8FE3B6; } .wnbtn.go:hover { background: #25503A; color: #BFF3D6; }
.wnbtn.warn { background: #3A1E1D; color: #FFC2BC; }
.sphint { margin: -4px 0 12px; padding: 0; }
.spnext { margin-top: 16px; }
.spnext h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin: 0 0 6px; }
.spnext ul, .sphist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.spnext a, .sphist a { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; font-size: 13px; min-width: 0; }
.spnext a:hover, .sphist a:hover { background: var(--sunk); }
.spnext .spt, .sphist .spt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.spd { color: var(--ink3); font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 72px; }
.spk { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; border-radius: 6px; padding: 2px 7px; white-space: nowrap; }
.spk.movie { background: rgba(229,83,75,.16); color: #FFB0A8; } .spk.sleep { background: rgba(120,140,255,.16); color: #BCC6FF; }
.spok { font-size: 11.5px; font-weight: 700; color: #8FE3B6; white-space: nowrap; }
.spwait { font-size: 11.5px; font-weight: 700; color: var(--ink3); white-space: nowrap; }
.spwait.big { font-size: 14px; color: var(--ink2); }
h2 .spok, h2 .spwait { font-family: var(--ui); margin-left: 8px; vertical-align: middle; }
.spcopy { position: relative; margin: 0 0 14px; }
.spcopy pre { margin: 0; background: var(--sunk); border-radius: 12px; padding: 14px 16px; padding-right: 76px; font: 13px/1.55 var(--ui); color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.spcopy .wnbtn { position: absolute; top: 10px; right: 10px; }
.spfit { border-radius: 10px; padding: 9px 12px; font-size: 13px; margin: 0 0 12px; }
.spfit p { margin: 0 0 6px; } .spfit p:last-child { margin: 0; }
.spfit.ok { background: rgba(60,203,132,.12); color: #BFF3D6; } .spfit.bad { background: #3A2A14; color: #FFD29A; }
.spform { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0 0; }
.spform.col { flex-direction: column; align-items: stretch; } .spform.col label { font-size: 12px; color: var(--ink3); font-weight: 700; }
.spform input[type=text], .spform textarea { flex: 1 1 200px; min-width: 0; background: var(--sunk); border: 1px solid var(--line); color: var(--ink); border-radius: 10px; padding: 8px 11px; font: 13.5px var(--ui); }
.spedit { margin-top: 12px; } .spedit summary { cursor: pointer; font-size: 12.5px; color: var(--ink3); font-weight: 700; }
.spmiss { margin: 6px 0; padding-left: 20px; font-size: 13px; color: var(--ink2); }
.spex { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.spex li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; } .spex li span { color: var(--ink3); font-size: 12px; }
.spex form { margin-left: auto; }
.spcat summary { list-style: none; cursor: pointer; } .spcat summary::-webkit-details-marker { display: none; }
.sptable { overflow-x: auto; margin-top: 10px; }
.sptable table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.sptable th { text-align: left; color: var(--ink3); font-size: 11px; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.sptable td { padding: 5px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; font-variant-numeric: tabular-nums; }
.sptable td.t { white-space: normal; min-width: 240px; font-weight: 600; }
@media (max-width: 600px) { .splist li { grid-template-columns: 16px minmax(0, 1fr) auto; } .splist .spch { display: none; } .spd { min-width: 0; } }
@media (max-width: 760px) { .wnbucket { margin-left: 0; flex-basis: 100%; } }
.isg { background: var(--sunk); border-radius: 12px; }
.isg summary { list-style: none; cursor: pointer; padding: 11px 13px; display: flex; flex-direction: column; gap: 3px; }
.isg summary::-webkit-details-marker { display: none; }
.isg .imore { font-size: 11.5px; color: var(--ink3); font-weight: 600; margin-top: 2px; }
.isg[open] .imore { display: none; }
.isg .idetail { padding: 0 13px 13px; border-top: 1px solid #2E2E35; }
.labcta { display: flex; flex-direction: column; gap: 3px; background: linear-gradient(135deg, #2A1F3D, #1D2433); border-radius: var(--r); padding: 16px 20px; margin-bottom: 14px; }
.labcta b { font-family: var(--display); font-size: 18px; letter-spacing: -0.02em; }
.labcta span { color: var(--ink2); font-size: 13px; }
.labcta:hover { filter: brightness(1.12); }
.labrepeat { background: #3A1E1D; color: #FFC2BC; border-radius: 12px; padding: 10px 14px; font-size: 13px; margin: 0 0 12px; }
.labrepeat a { color: #fff; text-decoration: underline; }
.labsub { color: var(--ink2); font-size: 13.5px; line-height: 1.6; margin: -4px 0 14px; max-width: 900px; }
.labform { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.labform label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); }
.labform select { padding: 9px 10px; border-radius: 10px; border: 0; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13.5px; text-transform: none; letter-spacing: 0; color-scheme: dark; min-width: 150px; }
.labidea .idetail { padding-top: 10px; }
.labwhy { list-style: none; margin: 0 0 10px; padding: 0; font-size: 12.5px; color: var(--ink2); }
.labwhy li { padding: 3px 0; } .labwhy b { display: inline-block; min-width: 46px; } .labwhy b.up { color: #8FE3B6; } .labwhy b.down { color: #FF9C94; }
.bp { display: flex; flex-direction: column; gap: 12px; }
.bphead h3 { font-family: var(--display); font-size: 22px; letter-spacing: -0.02em; margin: 4px 0 2px; }
.bppitch { color: var(--ink2); font-size: 13.5px; line-height: 1.6; margin: 6px 0 0; }
.bpblock h4 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin: 0 0 6px; }
.bpblock p { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.bpmoves, .bpbeats { margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: var(--ink2); line-height: 1.6; }
.bpmoves b, .bpbeats b { color: var(--ink); margin-right: 4px; }
.bpbeats small { color: var(--ink3); margin-left: 6px; } .bpbeats p { margin: 2px 0 8px; }
.bpparts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.bpparts li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; background: var(--raised); border-radius: 12px; padding: 12px 14px; }
.bpn { font-family: var(--display); font-weight: 800; font-size: 20px; color: var(--salmon); }
.bpparts b { font-size: 14px; } .bpparts p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.bpref { margin-top: 8px; font-size: 12px; color: var(--ink3); line-height: 1.5; border-left: 2px solid #3A3A44; padding-left: 10px; }
.bpref b { color: var(--ink2); font-weight: 600; }
.labcheck { padding: 0; }
.labcheck textarea { min-height: 180px; }
.labresult { margin-top: 12px; }
.labfind { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.labfind li { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 2px 10px; background: var(--sunk); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.labfind .lf { grid-row: span 2; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; align-self: start; padding: 3px 0; }
.labfind .fix .lf { color: #FF9C94; } .labfind .note .lf { color: #F8E27A; } .labfind .good .lf { color: #8FE3B6; }
.labfind li > span:last-child { color: var(--ink2); line-height: 1.5; }
.labtable { border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.labtable th, .labtable td { padding: 6px 14px 6px 0; text-align: left; border-bottom: 1px solid #26262C; }
.labtable th { color: var(--ink3); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.labformats { grid-template-columns: minmax(0, 1fr); }
.labcov { overflow-x: auto; }
.labcov table { border-collapse: collapse; font-size: 12px; }
.labcov th { text-align: left; font-weight: 600; color: var(--ink2); padding: 4px 8px 4px 0; white-space: nowrap; }
.labcov thead th { vertical-align: bottom; height: 110px; padding: 0 2px; }
.labcov thead th span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
.labcov td { width: 26px; height: 24px; text-align: center; border: 1px solid #26262C; }
.labcov td.done { color: #8FE3B6; }
.labcov td a { display: block; color: #6E6E7A; } .labcov td a:hover { color: var(--salmon); background: var(--sunk); }
.sform { display: flex; flex-direction: column; gap: 8px; padding: 0 14px 14px; }
.sform input[type=text], .sform textarea {
  width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #2E2E35; background: var(--raised);
  color: var(--ink); font: inherit; font-size: 13.5px; resize: vertical;
}
.sform input[type=file] { color: var(--ink2); font-size: 12.5px; }
.sform button { align-self: flex-start; }
.scripts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.scard { background: var(--raised); border: 1px solid #2A2A30; border-left: 3px solid var(--c, var(--salmon)); border-radius: 12px; padding: 12px 14px; }
.scard .st { font-family: var(--display); font-weight: 800; font-size: 15px; color: var(--ink); }
.scard .sm { font-size: 12.5px; color: var(--ink2); margin-top: 4px; line-height: 1.5; }
.scard .sm a { color: var(--ink); text-decoration: underline; }
.scard .learn { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #1E2A24; color: #8FE3B6; }
.scard .learn.no { background: #26262A; color: var(--ink3); }
.scard details { margin-top: 8px; }
.scard summary { cursor: pointer; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
.scripttext { margin-top: 8px; max-height: 420px; overflow: auto; background: var(--sunk); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.6; color: var(--ink2); }
.scripttext h4 { margin: 10px 0 4px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); }
.scripttext h4:first-child { margin-top: 0; }
.scripttext p { margin: 0 0 8px; }
.sacts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sacts form { display: inline; margin: 0; }
.sacts button { font-size: 12px; padding: 6px 12px; }
.release { padding: 16px 18px; margin-bottom: 12px; }
.release .relhead { display: flex; gap: 12px; align-items: center; }
.release h2 { margin: 0; font-size: 17px; }
.release .reldate { font-size: 12px; color: var(--ink3); margin-top: 2px; }
.relchanges { margin: 12px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; line-height: 1.55; color: var(--ink2); }
.relchanges a { color: var(--nc); font-weight: 700; white-space: nowrap; }
.scripterr { background: #3A1D1D; color: #FFB4B4; border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 10px; }
.sform .or { font-size: 12px; color: var(--ink3); text-align: center; }
.unassigned { margin-bottom: 14px; }
.unassigned > summary { list-style: none; cursor: pointer; }
.unassigned > summary::-webkit-details-marker { display: none; }
.unassigned > summary h2 { margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.unassigned > summary h2::before { content: "▸"; color: var(--ink3); font-size: 14px; transition: transform .15s; }
.unassigned[open] > summary h2::before { transform: rotate(90deg); }
.unassigned[open] > summary { margin-bottom: 12px; }
.uacount { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 22px; padding: 0 8px; border-radius: 999px;
  background: var(--yellow); color: #101012; font-family: var(--ui); font-size: 12px; font-weight: 800; letter-spacing: 0; }
.uabar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; color: var(--ink2); }
.uabar select { margin-left: 6px; padding: 7px 10px; border-radius: 10px; background: var(--raised); color: var(--ink); border: 1px solid #2E2E35; font: inherit; }
.uabar .hint-inline { color: var(--ink3); font-size: 12px; }
.ualist { list-style: none; margin: 0; padding: 0; }
.uarow { border-top: 1px solid #26262C; }
.uarow[hidden] { display: none; }
.uahead { display: grid; grid-template-columns: 12px minmax(0, 1fr) 110px 150px auto; gap: 10px; align-items: center; padding: 8px 4px; font-size: 13px; }
.uahead .uat { font-weight: 650; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uahead .uat:hover { text-decoration: underline; }
.uahead .uach { color: var(--ink2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uahead .uad { color: var(--ink3); font-size: 12px; white-space: nowrap; }
.ualink { justify-self: end; }
.ualink > summary { list-style: none; display: inline-block; cursor: pointer; font-size: 12px; font-weight: 700; padding: 5px 12px;
  border-radius: 999px; background: var(--raised); color: var(--ink); white-space: nowrap; }
.ualink > summary:hover { background: var(--line); }
.ualink[open] > summary { background: var(--salmon); color: #101012; }
.ualink > summary::-webkit-details-marker { display: none; }
.ualink[open] { grid-column: 1 / -1; justify-self: stretch; }
.ualink[open] > summary { margin-bottom: 8px; }
.uaform { padding: 0 0 6px; }
.ualinked { background: #173226; color: #9FE8C2; border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 10px; }
.uamore { margin-top: 10px; }
@media (max-width: 760px) {
  .uahead { grid-template-columns: 12px minmax(0, 1fr) auto; row-gap: 4px; }
  .uahead .uach { display: none; }
  .uahead .uad { grid-column: 2; grid-row: 2; }
  .ualink { grid-column: 3; grid-row: 1 / 3; }
}
.shook { margin: 0; background: var(--sunk); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.idrafts { margin: 0; padding-left: 20px; font-family: var(--display); font-weight: 700; font-size: 14px; line-height: 1.9; }
.idrafts a:hover { text-decoration: underline; }
.ifacts { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink2); margin-top: 12px; }
.ifacts b { color: var(--ink3); font-weight: 700; margin-right: 4px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
.icav { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--ink2); line-height: 1.6; }
.ihead .sub { font-weight: 500; color: var(--ink3); letter-spacing: 0; }
.uplanes svg .band { fill: rgba(255,255,255,.06); }
.uplanes svg .one { stroke: #5A5520; stroke-width: 1.5; stroke-dasharray: 3 3; }
.uplanes svg .sdot { stroke: var(--card); stroke-width: 1.5; }
.uplanes svg .sdot.normal { opacity: .75; }
.lg-tier { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.lg-band { width: 18px; height: 10px; border-radius: 3px; background: rgba(255,255,255,.12); }
.performers h2 .sub, .panel h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.utable .up { color: #8FE3B6; } .utable .down { color: #FF9C94; }
.slots { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.slots li { display: grid; grid-template-columns: 120px minmax(0, 1fr) 54px 40px; gap: 12px; align-items: center; font-size: 13px; }
.slots .sb { height: 10px; background: #26262C; border-radius: 999px; overflow: hidden; }
.slots .sb i { display: block; height: 100%; border-radius: 999px; background: #4A4A53; }
.slots .sb i.up { background: #3A9A6B; }
.slots b { text-align: right; font-variant-numeric: tabular-nums; }
.slots b.up { color: #8FE3B6; } .slots b.down { color: #FF9C94; }
.slots small { color: var(--ink3); }
@media (max-width: 1000px) {
  .pcols, .icols, .isugg, .sgrid { grid-template-columns: minmax(0, 1fr); }
  .icols .icol { grid-column: auto !important; }
  .ichecker { flex-wrap: wrap; }
  .utiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ulatest-list { grid-template-columns: minmax(0, 1fr); }
  .linkrow { grid-template-columns: minmax(0, 1fr); gap: 4px; margin-bottom: 8px; }
}

/* ── working ahead ──────────────────────────────────────────────────────── */
.aheadbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 14px; }
.aheadbar .nav {
  background: var(--sunk); border-radius: 999px; padding: 8px 14px; font-size: 13px; color: var(--ink2); font-weight: 600;
}
.aheadbar .nav:hover { background: var(--line); color: var(--ink); }
.aheadbar .nav[aria-disabled="true"] { pointer-events: none; color: #8E8E98; background: transparent; box-shadow: inset 0 0 0 1px #34343B; }
.aheadbar input[type="date"] {
  padding: 8px 12px; border-radius: 12px; border: 0; background: var(--sunk); color: var(--ink);
  font: inherit; font-size: 13px; color-scheme: dark;
}
.panel .aheadbar form { margin-top: 0; }
.aheadbar .quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.aheadbar .quick:first-of-type { margin-left: auto; }
.aheadbar .quick span { color: var(--ink3); font-size: 12.5px; }
.chipbtn {
  border: 0; cursor: pointer; border-radius: 999px; padding: 8px 13px; background: var(--sunk);
  color: var(--ink2); font: 600 12.5px var(--ui);
}
.chipbtn:hover { background: var(--line); color: var(--ink); }
.chipbtn.go { background: var(--salmon); color: #101012; }
.daychips { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 6px; margin-bottom: 18px; }
.daychip {
  display: flex; flex-direction: column; gap: 3px; padding: 9px 9px 8px; border-radius: 12px;
  background: var(--sunk); color: var(--ink2); min-width: 0;
}
.daychip:hover { background: var(--line); }
.daychip.on { box-shadow: inset 0 0 0 2px var(--yellow); }
.daychip b { font-family: var(--display); font-size: 13px; color: var(--ink); letter-spacing: -0.02em; }
.daychip span { font-size: 11.5px; font-variant-numeric: tabular-nums; }
.daychip i { display: block; height: 4px; border-radius: 999px; background: #3A3A42; overflow: hidden; margin-top: 2px; }
.daychip i em { display: block; height: 100%; background: var(--ok); }
.daychip small { font-size: 10.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daychip.dayoff small { color: #7FD0EE; }
.daychip.none { background: transparent; box-shadow: inset 0 0 0 1px #34343B; }
.daychip.none.on { box-shadow: inset 0 0 0 2px var(--yellow); }
.daychip.part small { color: var(--warn); }
.aheadday { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 4px 0 12px; }
.aheadday h3 { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; margin: 0; }
.panel .aheadday form { margin-top: 0; }
@media (max-width: 1100px) {
  .daychips { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 84px; overflow-x: auto; padding-bottom: 6px; }
}
@media (max-width: 760px) {
  .aheadbar .quick:first-of-type { margin-left: 0; }
}

/* ── phone ─────────────────────────────────────────────────────────────────
   Not a shrunken desktop. The rail becomes a scrolling strip of pills at the
   top, every row drops to one column so a title has the full width instead of
   wrapping four words deep beside a deadline, and a calendar cell shows its
   work as dots — at this size a truncated title tells you nothing a colour
   doesn't.
   ────────────────────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  aside { position: static; height: auto; padding: 10px 10px 0; overflow: visible; }
  aside .inner { padding: 14px 12px; border-radius: 20px; min-height: 0; }
  aside .mark { font-size: 21px; padding: 0 4px 12px; }
  aside nav, aside .cats {
    display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  aside nav::-webkit-scrollbar, aside .cats::-webkit-scrollbar { display: none; }
  aside nav a, aside .cat {
    white-space: nowrap; margin-bottom: 0; padding: 10px 14px; border-radius: 999px;
    background: #1F1F23; font-size: 13.5px; flex: none;
  }
  aside nav a .n, aside .cat .n { margin-left: 8px; }
  aside h3 { margin: 14px 0 8px; padding: 0 4px; }
  aside .live { margin-top: 14px; padding: 11px 13px; }

  main { padding: 14px 10px 60px; }
  header.page { margin-bottom: 14px; padding: 4px 4px 0; display: block; }
  header.page h1 { font-size: 30px; }
  header.page .when { display: block; margin: 4px 0 0; padding: 0; font-size: 12px; }

  .stats { grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 10px; }
  .stat { padding: 16px 18px 17px; border-radius: 20px; }
  .stat .n { font-size: 34px; }
  .stat .l { font-size: 10px; margin-top: 7px; }

  .split { grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 10px; }
  .panel { padding: 18px 18px 20px; border-radius: 20px; }
  .panel > h2, .group > .head .name, .section-title { font-size: 17px; margin-bottom: 14px; }
  .chart-head .hero .n { font-size: 34px; }
  .chart-head .legend { margin-left: 0; }
  /* Below this width the bars stop being readable, so the chart keeps its size
     and scrolls rather than shrinking into a smear. */
  .chartscroll svg { width: 620px; max-width: none; }
  .legend { gap: 12px; font-size: 11.5px; }

  /* Title and buttons on top, whose-and-when under, the deadline pill last. */
  .rows { padding: 6px; border-radius: 20px; }
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; padding: 11px 10px 12px 12px; }
  .row .title { grid-row: 1; }
  .row .title a { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .row .acts { grid-column: 2; grid-row: 1; }
  .row .meta { grid-column: 1 / -1; grid-row: 2; }
  .row .due { grid-column: 1 / -1; grid-row: 3; justify-self: start; margin: 2px 0 0 19px; padding: 4px 9px; font-size: 12px; }
  .row { gap: 3px 10px; padding: 10px 10px 11px 12px; }

  .group > .head { margin: 16px 0 10px; padding: 0 6px; }
  .chanlist a { padding: 9px 14px; font-size: 13px; }
  .brief { padding: 18px 18px; border-radius: 20px; font-size: 14px; }

  .calbar { gap: 8px; padding: 0; }
  .calbar .month { font-size: 19px; min-width: 0; flex: 1; }
  .calbar .nav { padding: 9px 13px; font-size: 12.5px; }
  .calbar .tabs { margin-left: 0; width: 100%; }
  .calbar .tab { flex: 1; text-align: center; padding: 9px 0; }

  .cal { gap: 3px; padding: 7px; border-radius: 20px; }
  .cal .wd { padding: 3px 0 6px; font-size: 8.5px; letter-spacing: 0.06em; text-align: center; }
  .cal .cell {
    min-height: 62px; border-radius: 12px; padding: 5px 4px;
    flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 3px;
  }
  .cal .num { font-size: 12px; width: 100%; padding: 0 2px; }
  .cal .num .tag { display: none; }
  .cal .cell.today .num { width: auto; padding: 1px 7px; border-radius: 999px; background: rgba(0,0,0,.14); }
  /* A chip becomes its own colour dot: a two-word truncation says less. */
  .cal .chip { width: 8px; height: 8px; padding: 0; border-radius: 50%; background: var(--c); gap: 0; }
  .cal .chip .dot, .cal .chip .t { display: none; }
  /* A "nothing assigned" slot becomes a dashed ring around its channel's dot, like a chip; the Day view clears it. */
  .cal .gapslot { width: 12px; height: 12px; padding: 0; justify-content: center; border-radius: 50%; gap: 0; }
  .cal .gapslot > a { flex: none; justify-content: center; }
  .cal .gapslot .t, .cal .gapslot .gapx { display: none; }
  .cal .gapslot i { width: 6px; height: 6px; }
  .cal .more { font-size: 9.5px; padding: 0 2px; white-space: nowrap; }

  .railtoggle { display: none; }
  .daystrip { gap: 8px; scroll-snap-type: x mandatory; margin: 0 -10px; padding: 2px 10px 12px; scroll-padding: 0 10px; }
  .daycol { flex-basis: calc(100vw - 44px); height: max(420px, calc(100vh - 230px)); border-radius: 20px; padding: 10px; }
  .dayedge { flex-basis: 90px; border-radius: 20px; }
  .calbar button.nav, .calbar .nav { flex: none; }
  #dayname { font-size: 17px; }
  .draghint { display: none; }
  header.page { position: relative; }
  .bellwrap { position: absolute; top: 4px; right: 4px; }
  .notices { position: fixed; left: 10px; right: 10px; top: 70px; width: auto; }
  .weekgrid, .weekgrid.span4 { grid-template-columns: minmax(0, 1fr); }
  .weekgrid .daycol { min-height: 0; }
  .chanmenu { position: fixed; left: 16px; right: 16px; top: 120px; width: auto; }
  .weekgrid .daycol .rel { display: inline; margin-left: auto; }
  .weekgrid .daycol .cnt { margin-left: 0; }
  .calbar .tabs.views { margin-left: 0; }
  .tsep { display: none; }

  .login { margin: 8vh auto; }
  .login h1 { font-size: 36px; }
}

@media (min-width: 761px) and (max-width: 1000px) {
  .shell { grid-template-columns: 1fr; }
  aside { position: static; height: auto; }
  .split { grid-template-columns: 1fr; }
  main { padding: 6px 16px 70px; }
  header.page h1 { font-size: 31px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat .n { font-size: 35px; }
  .cal { gap: 4px; padding: 8px; }
  .cal .cell { min-height: 110px; border-radius: 14px; }
  .cal .chip .t { display: none; }
}
/* Revision rows, last so a phone's own rules can't undo them: the chips, then
   the due pill and the four buttons on one line. */
.row.revision .acts > * { margin: 0; align-self: center; }
.row.revision .acts .tick, .row.revision .acts .tick.sumlink { height: 30px; }
@media (max-width: 760px) {
  .row.revision { grid-template-columns: minmax(0, 1fr) auto; row-gap: 8px; }
  .row.revision .acts { grid-column: 2; grid-row: 3; }
  .row.revision .due { grid-column: 1; grid-row: 3; margin: 0 0 0 19px; height: 30px; padding: 0 10px; white-space: nowrap; font-size: 12px; max-width: none; }
}
@media (max-width: 420px) {
  .row.revision .due .tm { display: none; }
  .row.revision .due { margin-left: 0; }
}
@media (max-width: 760px) {
  .split.withrev, .split.withrev:has(> .revpanel[hidden]) { grid-template-columns: minmax(0, 1fr); }
  .split.withrev > .revpanel { grid-column: auto; grid-row: auto; max-height: none; }
  .split.withrev > .revpanel .revlist { display: flex; }
}
/* ── Time estimates ── */
.estgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.estgrid fieldset { border: 0; margin: 0; padding: 12px; border-radius: 16px; background: var(--sunk); min-width: 0; }
.estgrid legend { float: left; width: 100%; padding: 0 0 8px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink2); }
.estgrid legend .sub { display: block; text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--ink3); margin-top: 2px; }
.estsub { clear: both; font-size: 11px; font-weight: 700; color: var(--ink3); margin: 10px 0 4px; }
.estrow { clear: both; display: grid; grid-template-columns: 10px minmax(0, 1fr) 92px; grid-template-areas: "dot nm in" ". src in"; align-items: center; gap: 0 8px; padding: 6px 4px; border-radius: 10px; }
.estrow:hover { background: var(--raised); }
.estrow > i { grid-area: dot; width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 1px var(--ring); }
.estrow .nm { grid-area: nm; font-size: 13px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.estrow .src { grid-area: src; font-size: 11px; color: var(--ink3); }
.estin { grid-area: in; display: flex; align-items: center; gap: 5px; }
.estin input { width: 60px; padding: 7px 8px; border-radius: 9px; border: 1px solid transparent; background: var(--card); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 700; text-align: right; color-scheme: dark; }
.estin input::placeholder { color: var(--ink3); font-weight: 500; }
.estin input:focus { outline: 0; border-color: var(--salmon); }
.estin em { font-style: normal; font-size: 11.5px; color: var(--ink3); }
.lset { margin-left: auto; font-weight: 700; color: var(--ink2); } .lset:hover { color: var(--ink); text-decoration: underline; }
@media (max-width: 1100px) { .estgrid { grid-template-columns: minmax(0, 1fr); } }
/* ── Tasks ── */
.tadd { margin: 0 0 6px; }
.taddrow { display: flex; gap: 8px; align-items: center; }
.taddbox { flex: 1; min-width: 0; position: relative; display: block; }
.taddplus { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  background: var(--salmon); color: #1A0F0C; font-weight: 800; font-size: 16px; line-height: 1; pointer-events: none; }
.taddbox input { width: 100%; padding-left: 46px !important; }
.taddmore { margin-top: 8px; }
.taddmore > summary { cursor: pointer; font-size: 12.5px; font-weight: 700; color: var(--ink3); width: fit-content; }
.taddmore > summary:hover { color: var(--ink2); }
.taddopts { display: grid; grid-template-columns: minmax(0, 1fr) 190px; gap: 8px; margin-top: 8px; }
.taddopts textarea, .taddopts select { min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; background: var(--sunk); color: var(--ink);
  font: inherit; font-size: 13.5px; color-scheme: dark; resize: vertical; }
.taddopts textarea:focus, .taddopts select:focus { outline: 0; border-color: var(--salmon); }
.tnote { margin-top: 4px; font-size: 12.5px; color: var(--ink2); line-height: 1.4; padding-left: 10px; box-shadow: inset 2px 0 0 var(--line); }
.trep { color: #B4BCFF !important; font-weight: 700; }
.trecur { margin-top: 18px; }
.trecur .tghead .tpri { background: rgba(125,138,245,.18); color: #B4BCFF; }
.trecur .tghead .sub { font-weight: 500; letter-spacing: 0; color: var(--ink3); text-transform: none; }
.tedit label.full { grid-column: 1 / -1; }
.tedit textarea { width: 100%; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; background: var(--card); color: var(--ink); font: inherit; font-size: 13.5px; resize: vertical; }
.tedit textarea:focus { outline: 0; border-color: var(--salmon); }
.tadd input, .tedit input, .tedit select { min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent;
  background: var(--raised); color: var(--ink); font: inherit; font-size: 13.5px; color-scheme: dark; }
.tadd input { flex: 1; padding: 12px 14px; border-radius: 12px; background: var(--sunk); font-size: 14.5px; }
.tadd input:focus, .tedit input:focus, .tedit select:focus { outline: 0; border-color: var(--salmon); }
.tedit input, .tedit select { width: 100%; background: var(--card); }
.taddhint { font-size: 12px; color: var(--ink3); margin: 0 0 16px; }
.tgroup { margin-bottom: 16px; }
.tghead { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; color: var(--ink2); }
.tghead .tpri { padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--pc) 20%, transparent); color: color-mix(in srgb, var(--pc) 55%, #fff); }
.tghead span.n { color: var(--ink3); font-weight: 600; letter-spacing: 0; }
.tlist { display: flex; flex-direction: column; gap: 6px; }
.task { border-radius: 14px; background: var(--sunk); box-shadow: inset 3px 0 0 var(--pc); scroll-margin-top: 80px; }
.task:target { box-shadow: inset 3px 0 0 var(--pc), 0 0 0 1.5px var(--yellow); }
.task.on { background: rgba(86,201,144,.10); }
.task .trow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
.task .tmain { flex: 1; min-width: 0; }
.task .ttitle { font-family: var(--display); font-weight: 700; font-size: 14.5px; letter-spacing: -0.02em; color: var(--ink); }
.task .ttitle .tcat { font-family: var(--ui); font-weight: 600; font-size: 12.5px; color: var(--ink2); letter-spacing: 0; white-space: nowrap; }
.task .tmeta { display: flex; flex-wrap: wrap; gap: 3px 10px; margin-top: 3px; font-size: 12px; color: var(--ink3); }
.task .tmeta .late { color: #FF8F86; font-weight: 700; }
.task .tmeta .soon { color: var(--ink2); font-weight: 700; }
.tacts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.tacts form { margin: 0; }
.tacts .wbtn { text-decoration: none; }
.tacts .wbtn svg { width: 14px; height: 14px; }
.tmenu { position: relative; }
.tmenu > summary { list-style: none; cursor: pointer; }
.tmenu > summary::-webkit-details-marker { display: none; }
.tmenu .tpop { position: absolute; right: 0; top: 38px; z-index: 20; display: flex; flex-direction: column; min-width: 150px; padding: 6px;
  border-radius: 12px; background: var(--raised); box-shadow: 0 10px 30px rgba(0,0,0,.45), 0 0 0 1px var(--line); }
.tmenu .tpop form { margin: 0; }
.tmenu .tpop button { width: 100%; text-align: left; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
.tmenu .tpop button:hover { background: var(--sunk); }
.tmenu .tpop.tedit-pop { display: none; }
.tmenu[open] > summary.wbtn { border-color: var(--yellow); color: var(--yellow); }
.tedit { padding: 0 12px 12px; }
.tedit form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; align-items: end; }
.tedit label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ink3); font-weight: 600; }
.tedit label.wide { grid-column: span 3; }
.tedit label.half { grid-column: span 2; }
.tedit .tbtns { grid-column: 1 / -1; display: flex; gap: 8px; }
.tedit .tbody { grid-column: 1 / -1; font-size: 12px; color: var(--ink3); white-space: pre-wrap; max-height: 140px; overflow: auto; background: var(--bg); border-radius: 10px; padding: 8px 10px; margin: 0; }
.tfold { margin-top: 10px; }
.tfold > summary { cursor: pointer; font-size: 13px; font-weight: 700; color: var(--ink2); padding: 6px 0; }
.task.done .ttitle { color: var(--ink3); text-decoration: line-through; text-decoration-color: var(--ink3); }
@media (max-width: 760px) {
  .task .trow { flex-wrap: wrap; gap: 8px; }
  .task .tmain { flex-basis: 100%; }
  .tacts { margin-left: auto; }
  .tedit form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .taddopts { grid-template-columns: minmax(0, 1fr); }
  .taddrow .clear { padding-left: 14px; padding-right: 14px; }
  .tedit label.wide, .tedit label.half { grid-column: 1 / -1; }
}

/* ── Network Overview ───────────────────────────────────────────────────── */
.nt-filters { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; margin-bottom: 14px; }
.nt-frow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.nt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.nt-chip { display: inline-flex; align-items: center; gap: 7px; padding: 7px 13px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 12px;
  font-weight: 800; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; border: 1px solid transparent; }
.nt-chip input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.nt-chip i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); }
.nt-chip.on { background: var(--raised); color: var(--ink); border-color: var(--c); }
.nt-chip:focus-within { outline: 2px solid var(--salmon); outline-offset: 2px; }
.nt-chpick { font-size: 13px; }
.nt-chpick summary { cursor: pointer; color: var(--ink2); padding: 7px 12px; border-radius: 999px; background: var(--sunk); list-style: none; }
.nt-chpick[open] summary { margin-bottom: 8px; }
.nt-chgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px; }
.nt-chgrid fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.nt-chgrid legend { font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px; }
.nt-chgrid label { display: flex; align-items: center; gap: 7px; color: var(--ink2); }
.nt-chgrid label i { width: 8px; height: 8px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px var(--ring); }
.nt-segs { display: inline-flex; background: var(--sunk); border-radius: 999px; padding: 3px; }
.nt-seg { padding: 6px 12px; border-radius: 999px; font-size: 12.5px; color: var(--ink2); cursor: pointer; }
.nt-seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.nt-seg.on { background: var(--raised); color: var(--ink); font-weight: 700; }
.nt-seg:focus-within { outline: 2px solid var(--salmon); }
.nt-range { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink3); }
.nt-range select, .nt-custom input, .nt-inline select, .nt-inline input { background: var(--sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 6px 9px; font: inherit; font-size: 13px; }
.nt-custom { display: inline-flex; gap: 6px; }
.nt-custom[hidden] { display: none; }
.nt-scope { font-family: var(--display); font-size: 20px; margin: 4px 0 2px; letter-spacing: -0.02em; }
.nt-scope small { margin-left: 10px; font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; }
.nt-status { font-size: 12.5px; color: var(--ink3); margin: 0 0 14px; line-height: 1.7; }
.nt-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 10.5px; font-weight: 800;
  letter-spacing: .05em; text-transform: uppercase; vertical-align: middle; }
.nt-pill.warn { background: #3A2A1C; color: #F5B77F; }
.nt-pill.est { background: #3B3416; color: #F3E96C; }
a.nt-pill { text-decoration: none; }
.nt-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.nt-tile { background: var(--card); border-radius: 22px; padding: 18px 20px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.nt-tl { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); }
.nt-tv { font-family: var(--display); font-size: clamp(24px, 2.8vw, 36px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.nt-tv small { font-size: 15px; color: var(--ink3); font-weight: 600; }
.nt-tc { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 28px; }
.nt-ts { font-size: 12px; color: var(--ink3); line-height: 1.5; }
.nt-spark { width: 120px; height: 28px; flex: none; }
.nt-chg { font-size: 12.5px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nt-chg.up { color: var(--ok); } .nt-chg.down { color: #FF9C94; } .nt-chg.flat { color: var(--ink2); } .nt-chg.none { color: var(--ink3); font-weight: 600; }
.nt-panel { margin-bottom: 14px; }
.nt-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 12px; }
.nt-head h2, .nt-head h3 { margin: 0; }
.nt-head .sub { font-size: 12.5px; color: var(--ink3); }
.nt-tabs { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.nt-tab { padding: 6px 12px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 12.5px; text-decoration: none; }
.nt-tab.sm { padding: 4px 10px; font-size: 12px; }
.nt-tab.on { background: var(--raised); color: var(--ink); font-weight: 700; box-shadow: inset 0 0 0 1px var(--line); }
.nt-chart svg { max-height: none; }
.nt-chart .nt-gap { stroke: var(--ink3); stroke-width: 1; stroke-dasharray: 2 2; }
.nt-legend { margin-bottom: 10px; }
.nt-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
.nt-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.nt-table th { text-align: right; font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.nt-table th a { color: inherit; text-decoration: none; }
.nt-table td { text-align: right; padding: 8px; border-bottom: 1px solid #26262C; vertical-align: middle; white-space: nowrap; }
.nt-table td.l, .nt-table th.l { text-align: left; }
.nt-table tr:hover td { background: rgba(255,255,255,.02); }
.nt-table small { color: var(--ink3); font-size: 11px; }
.nt-name { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 650; text-decoration: none; }
.nt-name i { width: 10px; height: 10px; border-radius: 3px; }
.nt-ch { display: inline-flex; align-items: center; gap: 9px; min-width: 0; }
.nt-ch > span { display: flex; flex-direction: column; min-width: 0; }
.nt-ch a { color: var(--ink); font-weight: 650; text-decoration: none; }
.nt-ch small a { color: var(--ink3); font-weight: 500; text-decoration: underline; }
.nt-av { width: 28px; height: 28px; border-radius: 50%; flex: none; object-fit: cover; display: inline-block; }
.nt-rank { color: var(--ink3); width: 28px; }
.nt-stack { display: flex; gap: 2px; height: 18px; border-radius: 6px; overflow: hidden; margin: 6px 0 10px; }
.nt-stack i { display: block; min-width: 3px; }
.nt-shares { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--ink2); }
.nt-shares li { display: inline-flex; align-items: center; gap: 7px; }
.nt-shares i { width: 10px; height: 10px; border-radius: 3px; }
.nt-shares b { color: var(--ink); } .nt-shares span { color: var(--ink3); }
.nt-diverge { display: flex; flex-direction: column; gap: 6px; }
.nt-drow { display: grid; grid-template-columns: minmax(0, 140px) minmax(0, 1fr) 70px; gap: 10px; align-items: center; font-size: 13px; }
.nt-dl { display: inline-flex; align-items: center; gap: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nt-dl i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.nt-dtrack { position: relative; height: 12px; background: var(--sunk); border-radius: 4px; }
.nt-dtrack::after { content: ""; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--ink3); }
.nt-dtrack i { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
.nt-dtrack i.pos { left: 50%; } .nt-dtrack i.neg { right: 50%; }
.nt-dv { text-align: right; font-variant-numeric: tabular-nums; }
.nt-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.nt-two > .nt-panel { margin-bottom: 14px; }
.nt-movers h3 { margin: 0 0 8px; font-size: 14px; }
.nt-movers ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; }
.nt-movers li a { color: var(--ink); font-weight: 650; }
.nt-movers li p { margin: 2px 0 0; font-size: 12.5px; color: var(--ink3); line-height: 1.5; }
.nt-trend { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 16px; background: var(--sunk); margin-bottom: 12px; }
.nt-trend b { font-family: var(--display); font-size: 18px; }
.nt-trend span { font-size: 12px; color: var(--ink3); }
.nt-trend.accelerating b { color: var(--ok); } .nt-trend.declining b { color: #FF9C94; }
.nt-mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); gap: 10px; }
.nt-mrow { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 14px; background: var(--sunk); min-width: 0; }
.nt-mrow span { font-size: 11.5px; color: var(--ink3); }
.nt-mrow b { font-size: 16px; font-variant-numeric: tabular-nums; }
.nt-mrow small { font-size: 11.5px; color: var(--ink3); }
.nt-explain { font-size: 13px; color: var(--ink2); margin: 12px 0 0; line-height: 1.6; }
.nt-hgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 10px; }
.nt-hcount { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 14px; background: var(--sunk); min-width: 0; }
.nt-hcount b { font-family: var(--display); font-size: 24px; line-height: 1.1; }
.nt-hcount span { font-size: 12.5px; color: var(--ink2); }
.nt-hcount small, .nt-hcount em { font-size: 11px; color: var(--ink3); font-style: normal; line-height: 1.45; }
.nt-alerts { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--ink2); display: flex; flex-direction: column; gap: 6px; }
.nt-alerts small { color: var(--ink3); }
.nt-vid { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; max-width: 420px; white-space: normal; }
.nt-vid img { width: 96px; height: 54px; border-radius: 8px; object-fit: cover; flex: none; background: var(--sunk); }
.nt-vid span { display: flex; flex-direction: column; gap: 2px; font-weight: 600; line-height: 1.35; }
.nt-ugrid { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; margin-bottom: 12px; }
.nt-ugrid .nt-shares { align-self: center; }
.nt-heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 12px); grid-auto-columns: 12px; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.nt-heat i { display: block; border-radius: 3px; }
.nt-heat i.pad { visibility: hidden; }
.nt-more summary { cursor: pointer; color: var(--ink2); font-size: 13px; margin-top: 12px; }
.nt-quiet h2 { font-size: 16px; }
.nt-mile { display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.nt-mile > div { display: grid; gap: 4px; }
.nt-mile small { color: var(--ink3); }
.nt-bar { display: block; height: 6px; border-radius: 3px; background: var(--sunk); overflow: hidden; }
.nt-bar i { display: block; height: 100%; background: #E8C547; border-radius: 3px; }
.nt-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13px; color: var(--ink2); }
.nt-inline input[type="number"] { width: 90px; }
.nt-export { position: relative; font-size: 13px; }
.nt-export summary { cursor: pointer; list-style: none; padding: 7px 14px; border-radius: 999px; background: var(--sunk); color: var(--ink2); }
.nt-export > div { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; display: flex; flex-direction: column; gap: 2px; background: var(--raised);
  border-radius: 14px; padding: 8px; min-width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.nt-export a { padding: 7px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; }
.nt-export a:hover { background: var(--line); }
.nt-method { max-width: none; margin: 4px 0 20px; }
.nt-drowform { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; }
.nt-drowform input[name="name"] { background: var(--sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; font: inherit; min-width: 0; flex: 0 1 220px; }
.nt-drowform input[type="color"] { width: 34px; height: 30px; padding: 0; border: 0; background: none; }
.nt-dn { font-size: 12px; color: var(--ink3); min-width: 80px; }
.nt-link { background: var(--sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 6px 9px; font: inherit; font-size: 12.5px; width: 220px; }
.nt-table select { background: var(--sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 5px 8px; font: inherit; font-size: 12.5px; }
.nt-cov { display: block; margin-top: 3px; }
.nt-rpm { border-top: 1px solid var(--line); padding: 10px 0; }
.nt-rpm summary { cursor: pointer; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; font-size: 13.5px; }
.nt-rpm summary span { color: var(--ink2); } .nt-rpm summary small { color: var(--ink3); }
.nt-rpm .nt-table { margin: 10px 0; }
.nt-rpmform { margin-top: 8px; }
.nt-rpmform label small { color: var(--ink3); font-weight: 500; }
@media (max-width: 1100px) { .nt-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .nt-tiles { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  .nt-tile { padding: 14px; border-radius: 18px; }
  .nt-spark { width: 70px; }
  .nt-two { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .nt-drow { grid-template-columns: minmax(0, 96px) minmax(0, 1fr) 56px; }
  .nt-vid img { width: 64px; height: 36px; }
  .nt-export > div { right: auto; left: 0; }
  .nt-link { width: 160px; }
}
`;
