// js/hud styles owned by UI round 4: kept out of css/game.css (another lane edits it), injected once by createGameHUD.
const CSS = `/* parked AIRCRAFT chips: locked types (padlock, dimmed; the requirement shows on tap) */
.krz-diff.krz-plane { flex-wrap: wrap; max-width: calc(100vw - 16px); row-gap: 3px; }
/* D33: more than three planes in the AIRCRAFT row: slimmer chips in one row that scrolls sideways (stays in the top band) */
.krz-diff.krz-plane:has(> button:nth-of-type(4)) button { min-width: 0; padding: 0 9px; flex: none; }
.krz-diff.krz-plane:has(> button:nth-of-type(4)) { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; overscroll-behavior: contain; touch-action: pan-x; }
.krz-diff.krz-plane:has(> button:nth-of-type(4))::-webkit-scrollbar { display: none; }
.krz-diff.krz-plane:has(> button:nth-of-type(4)) span { flex: none; }
.krz-chips.stack .krz-diff.krz-plane:has(> button:nth-of-type(4)) span { flex: none; padding: 0 2px 0 0; }
.krz-diff button[data-locked] { color: rgba(246,241,228,.5); display: inline-flex; align-items: center; gap: 4px; }
.krz-diff button[data-locked] svg { width: 10px; height: 12px; flex: none; opacity: .85; }
.krz-diff button[data-locked].nope { animation: krz-shake .35s linear; }
.krz-plane-why { pointer-events: none; padding: 4px 10px; border-radius: 9px; background: rgba(14,18,28,.78); color: #ffb547; font: 700 11.5px/1.2 system-ui;
  border: 1px solid rgba(255,181,71,.45); opacity: 0; transform: translateY(-4px); transition: opacity .2s, transform .2s; text-align: center; }
.krz-plane-why.in { opacity: 1; transform: none; }
.krz-plane-why[hidden] { display: none; }

/* online: connection pill under the pause button + the Court ladder (js/hud/online.js) */
.krz-net { position: absolute; left: calc(var(--sl) + var(--gut)); top: calc(var(--st) + 66px); min-width: 48px; height: 20px; padding: 0 6px;
  display: flex; align-items: center; justify-content: center; gap: 4px; border-radius: 10px; border: 1px solid var(--krz-line); background: var(--krz-glass);
  color: var(--krz-auto); font: 800 8.5px/1 system-ui; letter-spacing: .08em; white-space: nowrap; cursor: pointer; pointer-events: auto; touch-action: manipulation;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.krz-net::before { content: ''; position: absolute; inset: -8px -4px; }
.krz-net[hidden] { display: none; }
.krz-net[data-q="relay"], .krz-net[data-q="mixed"] { color: var(--krz-wait); }
.krz-net[data-q="solo"] { color: var(--krz-dim); }
.krz-net[data-q="off"] { color: var(--krz-bad); border-color: rgba(255,107,107,.55); animation: krz-hint 1.2s steps(2) infinite; }
.krz-net[data-q="recon"], .krz-net[data-q="ap"] { color: var(--krz-wait); border-color: rgba(255,190,90,.55); animation: krz-hint 1.2s steps(2) infinite; }
.krz-net.open { letter-spacing: .02em; font-size: 9.5px; }
.krz-net-bars { display: inline-flex; align-items: flex-end; gap: 1.5px; height: 10px; }
.krz-net-bars b { width: 2.5px; border-radius: 1px; background: rgba(246,241,228,.22); }
.krz-net-bars b:nth-child(1) { height: 3px; } .krz-net-bars b:nth-child(2) { height: 5px; } .krz-net-bars b:nth-child(3) { height: 7.5px; } .krz-net-bars b:nth-child(4) { height: 10px; }
.krz-net-bars b.on { background: currentColor; }

.krz-court { --row: 20px; position: absolute; left: calc(var(--sl) + var(--gut)); top: calc(var(--st) + 100px); width: 196px; pointer-events: none;
  border-radius: 12px; background: rgba(14,18,28,.5); border: 1px solid rgba(226,179,60,.32); color: var(--krz-ink); overflow: hidden;
  -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); font-family: system-ui, sans-serif; transition: background .3s; }
.krz-court[hidden] { display: none; }
.krz-crt-head { pointer-events: auto; display: flex; align-items: center; gap: 5px; width: 100%; height: 26px; padding: 0 8px; border: 0; background: none;
  color: var(--krz-gold); cursor: pointer; touch-action: manipulation; font: 800 9px/1 system-ui; letter-spacing: .14em; }
.krz-crt-ico { width: 15px; height: 11px; display: grid; flex: none; }
.krz-crt-ico svg { width: 15px; height: 11px; }
.krz-crt-h { flex: 1; text-align: left; }
.krz-crt-me { color: var(--krz-ink); letter-spacing: .06em; font-variant-numeric: tabular-nums; }
.krz-court[data-mine="crown"] .krz-crt-me { color: var(--krz-gold); }
.krz-crt-chev { width: 10px; height: 7px; display: grid; flex: none; color: var(--krz-dim); transition: transform .2s; }
.krz-crt-chev svg { width: 10px; height: 7px; }
.krz-court[data-collapsed="1"] .krz-crt-chev { transform: rotate(-90deg); }
.krz-court[data-collapsed="1"] .krz-crt-list, .krz-court[data-collapsed="1"] .krz-crt-news { display: none; }
.krz-crt-news { font: italic 400 14px/1.15 var(--serif); color: #ffe7a3; padding: 0 8px 3px; }
.krz-crt-news:empty { display: none; }
.krz-crt-list { list-style: none; margin: 0; padding: 0 0 3px; }
.krz-crt-list li { display: grid; grid-template-columns: 15px minmax(0, 1fr) auto; align-items: center; gap: 6px; height: var(--row); padding: 0 8px;
  transition: transform .45s cubic-bezier(.2,.9,.3,1), background .3s; }
.krz-crt-list li.you { background: rgba(226,179,60,.18); box-shadow: inset 2px 0 0 var(--krz-gold); }
.krz-crt-list li.gap { border-top: 1px dashed rgba(246,241,228,.25); }
.krz-crt-pl { font: 800 10.5px/1 ui-monospace, Menlo, monospace; color: var(--krz-dim); text-align: center; display: grid; place-items: center; }
.krz-crt-pl svg { width: 15px; height: 11px; color: var(--krz-gold); filter: drop-shadow(0 0 3px rgba(226,179,60,.6)); }
.krz-crt-who { display: flex; align-items: baseline; gap: 4px; min-width: 0; white-space: nowrap; overflow: hidden; }
.krz-crt-who small { flex: none; max-width: 58%; overflow: hidden; text-overflow: ellipsis; font: 700 9.5px/1 system-ui; letter-spacing: .04em; color: #e9c873; font-variant: small-caps; }
.krz-crt-who b { min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 700 12px/1 system-ui; }
.krz-crt-pp { font: 700 10.5px/1 ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; color: var(--krz-dim); }
.krz-crt-list li.crown .krz-crt-pp { color: var(--krz-gold); }
.krz-crt-list li.crowned { animation: krz-crt-glow 1.8s ease-out; }
.krz-crt-list li.crowned .krz-crt-pl svg { animation: krz-crt-drop .8s cubic-bezier(.3,1.7,.5,1); }
.krz-court.krz-crt-flash { background: rgba(60,44,8,.66); }
.krz-court.krz-crt-flash .krz-crt-ico { animation: krz-crt-drop .8s cubic-bezier(.3,1.7,.5,1); }
@keyframes krz-crt-glow { 0% { background: rgba(255,215,94,.55); } 100% { background: transparent; } }
@keyframes krz-crt-drop { 0% { transform: translateY(-14px) scale(1.8) rotate(-20deg); opacity: 0; } 60% { opacity: 1; } 100% { transform: none; } }
@media (min-width: 1000px) and (min-height: 600px) { .krz-court { --row: 22px; width: 220px; } }
@media (orientation: landscape) and (max-height: 420px) { .krz-court { --row: 18px; } .krz-crt-who b { font-size: 11.5px; } }
/* landscape, stick right: the subtitles move to the left column (css/radio.css), so the ladder takes the column under the tower */
@media (orientation: landscape) { html[data-krz-hand="right"] .krz-court { left: auto; right: calc(var(--sr) + var(--gut)); top: calc(var(--krz-tr-top, 64px) + 52px); } }
/* portrait: the right-hand column under the tower badge, which the subtitles already keep clear (--krz-tr-w); no warp chip online */
@media (orientation: portrait) {
  .krz-court { --row: 30px; left: auto; right: calc(var(--sr) + 6px); top: calc(var(--st) + var(--krz-tr-top, 64px) + 88px); width: calc(var(--krz-tr-w, 78px) - 2px); border-radius: 11px; }
  .krz-crt-head { padding: 0 6px; gap: 4px; }
  .krz-crt-h { display: none; }
  .krz-crt-me { flex: 1; text-align: left; font-size: 9.5px; }
  .krz-crt-news { font-size: 12px; padding: 0 6px 3px; }
  .krz-crt-list li { grid-template-areas: "pl name" "pl title"; grid-template-columns: 11px minmax(0, 1fr); column-gap: 4px; row-gap: 1px; padding: 0 5px;
    align-content: center; }
  .krz-crt-pl { grid-area: pl; font-size: 9.5px; }
  .krz-crt-pl svg { width: 11px; height: 8px; }
  .krz-crt-who { display: contents; }
  .krz-crt-who b { grid-area: name; font-size: 11px; white-space: nowrap; }
  .krz-crt-who small { grid-area: title; max-width: none; font: 600 8.5px/1.05 system-ui; letter-spacing: 0; font-variant: normal; white-space: nowrap; }
  .krz-crt-pp { display: none; }
}
@media (prefers-reduced-motion: reduce) { .krz-crt-list li, .krz-crt-list li.crowned, .krz-crt-list li.crowned svg, .krz-court .krz-crt-ico { transition: none; animation: none !important; } }

/* PLAYTEST_2 B9: portrait — the papers toast sits on the score widget's hint line (it covered the KT/FT strip),
   PP popups go below the plane instead of over it */
@media (orientation: portrait) {
  .krz-paper-toast { top: auto; bottom: 3px; left: 5px; white-space: normal; width: max-content; max-width: 140px; font-size: 13px; }
  .krz-paper-toast:not(.in) { transform: translateY(4px); }
  .krz-pops { top: 54%; }
}
/* HUDPOLISH E3 hints.js: one-time first-run hints, small, beside the control, never touchable */
.krz-hint { position: fixed; inset: 0; z-index: 25; pointer-events: none; opacity: 0; transition: opacity .3s; font-family: system-ui, sans-serif; }
.krz-hint.in { opacity: 1; }
.krz-hint[hidden] { display: none; }
.krz-hint-ring { position: absolute; border-radius: 16px; border: 2px solid rgba(255,215,94,.85); animation: krz-ring 1.4s ease-in-out infinite; }
.krz-hint-bub { position: absolute; width: min(60vw, 216px); box-sizing: border-box; padding: 7px 10px 8px; border-radius: 11px; background: rgba(255,248,230,.94);
  color: #1e2433; font: 500 12px/1.3 system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
.krz-hint-bub b { font-weight: 800; }
.krz-hint-bub::after { content: ''; position: absolute; width: 10px; height: 10px; background: inherit; transform: rotate(45deg); }
.krz-hint-bub[data-dir="down"]::after { bottom: -5px; left: calc(var(--ax, 50%) - 5px); }
.krz-hint-bub[data-dir="up"]::after { top: -5px; left: calc(var(--ax, 50%) - 5px); }
.krz-hint-bub[data-dir="right"]::after { right: -5px; top: calc(var(--ay, 50%) - 5px); }
.krz-hint-bub[data-dir="left"]::after { left: -5px; top: calc(var(--ay, 50%) - 5px); }
.krz-hint-bub[data-dir=""]::after { display: none; }
@media (orientation: landscape) and (max-height: 500px) { .krz-hint-bub { width: min(34vw, 220px); font-size: 11.5px; } }
@media (prefers-reduced-motion: reduce) { .krz-hint-ring { animation: none; } .krz-hint { transition: none; } }
/* MSGFIX msgcap.js: messages over the on-screen budget wait, hidden, lowest priority first */
html[data-krz-shed~="banner"] #krz-hud .krz-banner, html[data-krz-shed~="story"] .krz-st-coach, html[data-krz-shed~="score"] .krz-pop,
html[data-krz-shed~="radio"] .krz-r-pill, html[data-krz-shed~="tasks"] .kz-tk-toast, html[data-krz-shed~="prompt"] .krz-prompt, html[data-krz-shed~="paper"] .krz-paper-toast { visibility: hidden !important; }
`;

export function injectHudCss() {
  if (document.getElementById('krz-hud-ui4')) return;
  const st = document.createElement('style');
  st.id = 'krz-hud-ui4';
  st.textContent = CSS;
  document.head.append(st);
}
