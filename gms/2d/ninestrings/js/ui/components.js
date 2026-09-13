// js/ui/components.js — the DOM builders every screen is made of (D5).
//
// Two rules this file exists to enforce mechanically rather than by discipline:
// nothing is ever built from an innerHTML template (content comes from data
// files and save state, and a stray `<` must not become markup), and no colour
// is ever written as a literal — palette comes from css/style.css, per-item
// accents come from the [r,g,b] arrays in js/data/**.
//
// The data tables are imported DYNAMICALLY and individually. Lane C writes them
// while this lane runs; a static import of a half-saved file would take the
// whole screens module down with it and turn the boot gate red for a fault that
// is not ours. A table that fails to load is an empty object and every screen
// must render empty-but-correct from that.

const MODULES = [
  ['WEAPONS', '../data/weapons.js', 'WEAPONS'],
  ['PASSIVES', '../data/passives.js', 'PASSIVES'],
  ['EVOLUTIONS', '../data/evolutions.js', 'EVOLUTIONS'],
  ['ENEMIES', '../data/enemies.js', 'ENEMIES'],
  ['STAGES', '../data/stages.js', 'STAGES'],
  ['CHARACTERS', '../data/characters.js', 'CHARACTERS'],
  ['RELICS', '../data/relics.js', 'RELICS'],
  ['SIGILS', '../data/sigils.js', 'SIGILS'],
  ['SANCTUM', '../data/meta.js', 'SANCTUM'],
  ['STORY', '../data/story.js', 'STORY'],
  ['UNLOCKS', '../data/unlocks.js', 'UNLOCKS'],
  ['CHALLENGES', '../data/challenges.js', 'CHALLENGES'],
];

export const DATA = {};
for (const [key] of MODULES) DATA[key] = {};

await Promise.all(MODULES.map(async ([key, path, name]) => {
  try {
    const m = await import(path);
    if (m && m[name] && typeof m[name] === 'object') DATA[key] = m[name];
  } catch (e) { /* not written yet, or mid-save. Empty table, empty screen. */ }
}));

/** Insertion-ordered values of a data table, tolerating an absent table. */
export function values(table) {
  const t = table || {};
  const out = [];
  for (const k in t) if (t[k] && typeof t[k] === 'object') out.push(t[k]);
  return out;
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

export function add(parent, ...kids) {
  for (const k of kids) if (k) parent.appendChild(k);
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * The only place a listener is attached. `click` rather than `pointerup`
 * because it is what both a thumb and the tap harness produce, and because it
 * will not fire after a drag that started on the control.
 */
export function tap(node, ctx, fn, sound = 'uiTap') {
  node.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.hasAttribute('disabled')) return;
    if (ctx && ctx.audio && sound) { try { ctx.audio.sfx(sound); } catch (_) {} }
    if (ctx && ctx.save && ctx.save.settings && ctx.save.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(8); } catch (_) {}
    }
    fn(e);
  });
  return node;
}

export function btn(label, ctx, fn, opts = {}) {
  const b = el('button', 'btn' + (opts.cls ? ' ' + opts.cls : ''));
  b.type = 'button';
  if (opts.icon) add(b, el('span', 'ui-glyph', opts.icon));
  add(b, el('span', null, label));
  if (opts.disabled) b.setAttribute('disabled', '');
  return tap(b, ctx, fn, opts.sound || 'uiSelect');
}

/**
 * The one card shape: accent stripe, glyph, title, one line of body, a level
 * marker on the right. Every list in the game is made of these so that a
 * weapon, a sanctum node and a stage tile all read as the same object type.
 */
export function card(ctx, spec) {
  const c = el('button', 'card' + (spec.cls ? ' ' + spec.cls : ''));
  c.type = 'button';
  if (spec.accent) c.style.setProperty('--accent', spec.accent);
  if (spec.locked) c.classList.add('card--locked');
  if (spec.on) c.classList.add('card--on');

  if (spec.icon !== undefined) {
    const ic = el('span', 'card__icon', spec.locked ? '─' : spec.icon);
    add(c, ic);
  }
  const body = el('span', 'card__text');
  const head = el('span', 'ui-cardhead');
  add(head, el('span', 'h2', spec.title));
  if (spec.flag) add(head, el('span', 'ui-flag', spec.flag));
  add(body, head);
  if (spec.sub) add(body, el('span', 'body ui-clamp', spec.sub));
  if (spec.note) add(body, el('span', 'ui-note', spec.note));
  add(c, body);
  if (spec.right) add(c, el('span', 'card__lvl num', spec.right));
  if (spec.pips) add(c, pips(spec.pips.level, spec.pips.max, spec.accent));
  if (spec.onTap && !spec.locked) tap(c, ctx, spec.onTap, spec.sound || 'uiSelect');
  else if (spec.onTap) tap(c, ctx, spec.onTap, 'uiDeny');
  else c.setAttribute('disabled', '');
  return c;
}

export function pips(level, max, accent) {
  const wrap = el('span', 'ui-pips');
  const n = Math.max(0, Math.min(12, max | 0));
  for (let i = 0; i < n; i++) {
    const p = el('i', 'ui-pip' + (i < level ? ' ui-pip--on' : ''));
    if (accent && i < level) p.style.setProperty('--accent', accent);
    add(wrap, p);
  }
  return wrap;
}

export function bar(frac, accent) {
  const b = el('div', 'bar');
  const f = el('div', 'bar__fill');
  f.style.width = Math.max(0, Math.min(1, frac || 0)) * 100 + '%';
  if (accent) f.style.setProperty('--accent', accent);
  add(b, f);
  return b;
}

export function statRow(label, value) {
  const r = el('div', 'ui-stat');
  add(r, el('span', 'ui-stat__k', label), el('span', 'ui-stat__dots'), el('span', 'ui-stat__v num', value));
  return r;
}

export function empty(title, sub) {
  const e = el('div', 'ui-empty');
  add(e, el('div', 'ui-empty__mark', '—'), el('div', 'h2', title));
  if (sub) add(e, el('p', 'body', sub));
  return e;
}

/** A screen root. `mods` are the ui.css `screen--*` modifiers, space separated. */
export function screenEl(mods = '') {
  return el('div', 'screen' + (mods ? ' ' + mods : ''));
}

export function scrollEl() { return el('div', 'screen__scroll ui-scroll'); }

/** Title + back, laid out so the back control stays a 52px square target. */
export function header(ctx, title, onBack, rightNode) {
  const h = el('div', 'ui-header');
  if (onBack) {
    const b = el('button', 'btn btn--icon btn--ghost ui-back');
    b.type = 'button';
    b.setAttribute('aria-label', 'Back');
    add(b, el('span', 'ui-glyph', '‹'));
    add(h, tap(b, ctx, onBack, 'uiBack'));
  } else {
    add(h, el('span', 'ui-back ui-back--none'));
  }
  add(h, el('h2', 'ui-header__title', title));
  add(h, rightNode || el('span', 'ui-back ui-back--none'));
  return h;
}

/**
 * The standard menu page: fixed header, scrolling middle, and a foot that
 * never scrolls away — the foot is where Back and the primary action live, so
 * a thumb always finds them in the same place at the bottom of the screen.
 */
export function page(ctx, title, onBack, right) {
  const scr = screenEl();
  const body = scrollEl();
  const foot = el('div', 'ui-foot');
  add(scr, header(ctx, title, onBack, right), body, foot);
  return { scr, body, foot };
}

export function soulsChip(n) {
  const s = el('div', 'souls ui-chip');
  add(s, el('span', 'ui-glyph ui-glyph--soul', '◇'), el('span', 'num', fmtInt(n)));
  return s;
}

// ---------------------------------------------------------------------------
// values -> presentation
// ---------------------------------------------------------------------------

/** [r,g,b] in 0..1 (the data-file convention) to a CSS colour. Never a literal. */
export function rgbOf(c, fallback) {
  if (!Array.isArray(c) || c.length < 3) return fallback || 'var(--choir)';
  const f = (v) => Math.max(0, Math.min(255, Math.round((+v || 0) * 255)));
  return `rgb(${f(c[0])} ${f(c[1])} ${f(c[2])})`;
}

export function fmtTime(s) {
  const t = Math.max(0, Math.floor(s || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

export function fmtInt(n) {
  return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Gold counting up is the whole point of a payout screen. */
export function countUp(node, to, ms = 900) {
  const end = Math.round(+to || 0);
  if (end <= 0) { node.textContent = fmtInt(0); return () => {}; }
  const t0 = performance.now();
  let raf = 0;
  const frame = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    node.textContent = fmtInt(end * eased);
    if (k < 1) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Lazy art with a real fallback. Flux output lands in art/ over the life of the
 * build, so a missing file is the normal case, not an exception — a broken
 * image icon would be worse than the silhouette it degrades to.
 */
export function art(node, file, accent) {
  node.classList.add('ui-art');
  if (accent) node.style.setProperty('--accent', accent);
  if (!file) { node.classList.add('ui-art--sil'); return node; }
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    node.style.backgroundImage = 'url("' + file + '")';
    node.classList.add('ui-art--on');
  };
  img.onerror = () => node.classList.add('ui-art--sil');
  img.src = file;
  return node;
}

export function portraitFile(key) {
  return key ? 'art/' + String(key).replace(/[^a-z0-9_-]/gi, '') + '.png' : null;
}

// ---------------------------------------------------------------------------
// Styles this lane owns. css/ui.css belongs to the manager; anything the kit
// does not already provide is scoped here under a ui- prefix and injected once.
// Colour is var()/color-mix only.
// ---------------------------------------------------------------------------

const STYLE_ID = 'ns-ui-lane-d';

export function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = el('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const CSS = `
.ui-glyph { font-weight: 800; letter-spacing: 0; }
.ui-glyph--soul { color: var(--gold); }
.ui-cardhead { display: flex; align-items: baseline; gap: 8px; }
.ui-clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ui-note { display: block; font-size: 12px; line-height: 1.35; margin-top: 5px; color: var(--accent, var(--choir)); letter-spacing: .04em; }
.ui-flag { font: 800 10px/1 var(--font); letter-spacing: .16em; text-transform: uppercase;
  padding: 4px 6px; border-radius: 4px; color: var(--ink);
  background: var(--accent, var(--choir)); flex: 0 0 auto; }
.ui-flag--dim { background: transparent; color: var(--text-faint); border: 1px solid var(--edge); }

.ui-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex: 0 0 auto; }
.ui-header__title { flex: 1; text-align: center; margin: 0; font: 700 14px/1 var(--font);
  letter-spacing: .26em; text-transform: uppercase; color: var(--text-dim); }
.ui-back { flex: 0 0 52px; }
.ui-back--none { height: 1px; }
.ui-back .ui-glyph { font-size: 26px; line-height: 1; }

.ui-scroll { padding-bottom: 6px; }
.ui-foot { flex: 0 0 auto; padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }

.ui-pips { display: flex; gap: 3px; flex: 0 0 auto; align-items: center; }
.ui-pip { width: 5px; height: 12px; border-radius: 2px; background: var(--ink); border: 1px solid var(--edge); }
.ui-pip--on { background: var(--accent, var(--choir)); border-color: transparent;
  box-shadow: 0 0 8px -1px var(--accent, var(--choir)); }

.ui-stat { display: flex; align-items: baseline; gap: 8px; padding: 7px 0; }
.ui-stat__k { font-size: 13px; color: var(--text-dim); white-space: nowrap; }
.ui-stat__dots { flex: 1; border-bottom: 1px dotted var(--edge); transform: translateY(-3px); }
.ui-stat__v { font: 700 15px/1 var(--font); color: var(--text); white-space: nowrap; }

.ui-empty { text-align: center; padding: 40px 20px; color: var(--text-faint); }
.ui-empty__mark { font-size: 32px; letter-spacing: .3em; color: var(--edge); margin-bottom: 10px; }
.ui-empty .h2 { color: var(--text-dim); }
.ui-empty .body { margin-top: 6px; }

.ui-chip { min-height: 30px; padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--edge); background: color-mix(in srgb, var(--ink-2) 88%, transparent); }

/* art: a Flux file when it exists, a tinted silhouette when it does not */
.ui-art { background-size: cover; background-position: center top; background-repeat: no-repeat; }
.ui-art--sil { background-image: radial-gradient(60% 50% at 50% 34%,
    color-mix(in srgb, var(--accent, var(--choir)) 34%, transparent), transparent 70%),
  linear-gradient(180deg, var(--ink-3), var(--ink)); }
.ui-art--sil::after { content: ''; position: absolute; inset: 0;
  background: radial-gradient(26% 20% at 50% 30%, var(--ink) 60%, transparent 72%); opacity: .8; }

/* A full-page menu shown over a LIVE run needs its own ground, or the game
   renders straight through the text. The two screens that are deliberately
   see-through opt out below. */
.screen { background: var(--ink); }
.ui-title { background: transparent; }        /* has its own art plate */
.ui-lu { background: transparent; }           /* deliberately overlays the run */

/* ---- title ---- */
/* Absolute + inset, NOT relative: a relative screen sits in normal flow inside
   #ui and sizes to its content, so the title filled the top 40% of the phone
   and left the rest black. The body below uses margin-top:auto to sit in the
   bottom half where a thumb is (DESIGN 8.5). */
.ui-title { position: absolute; inset: 0; display: flex; flex-direction: column; }
.ui-title__bg { position: absolute; inset: 0; z-index: 0; }
.ui-title__veil { position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ink) 62%, transparent) 0%, transparent 28%),
    linear-gradient(0deg, var(--ink) 8%, color-mix(in srgb, var(--ink) 82%, transparent) 40%, transparent 72%); }
.ui-title__top, .ui-title__body { position: relative; z-index: 2; }
.ui-title__body { margin-top: auto; display: flex; flex-direction: column; gap: 12px; }
.ui-title__mark { margin-bottom: 18px; }
.ui-title .subtitle { margin-top: 10px; }
.ui-title__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ui-title__grid .btn { width: 100%; }
.ui-title__ver { font: 500 11px/1 var(--font); letter-spacing: .18em; color: var(--text-faint); text-align: center; }

/* ---- level-up sheet ---- */
/* Same fix as .ui-title: a relative screen sizes to its content and sticks to
   the TOP. The level-up sheet is the most-used screen in the game and the
   player is mid-run, one-handed - it has to rise from the BOTTOM (DESIGN 8.5). */
.ui-lu { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; }
.ui-lu__veil { position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(0deg, var(--ink) 6%,
    color-mix(in srgb, var(--ink) 88%, transparent) 46%,
    color-mix(in srgb, var(--ink) 20%, transparent) 78%, transparent 100%); }
.ui-lu__in { position: relative; margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.ui-lu__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
.ui-lu__lv { font: 800 26px/1 var(--font); letter-spacing: .1em; color: var(--bone);
  text-shadow: 0 0 22px color-mix(in srgb, var(--choir) 60%, transparent); }
.ui-lu__hint { font-size: 12px; color: var(--text-faint); letter-spacing: .14em; text-transform: uppercase; }
.ui-lu .card { min-height: 84px; }
.ui-lu--n4 .card, .ui-lu--n5 .card { min-height: 70px; padding: 10px 14px; gap: 11px; }
.ui-lu--n5 .card__icon { flex-basis: 40px; height: 40px; font-size: 13px; }
.ui-lu--n5 .ui-clamp { -webkit-line-clamp: 1; }
.ui-lu__util { display: flex; gap: 8px; }
.ui-lu__util .btn { flex: 1; min-height: 46px; font-size: 12px; letter-spacing: .1em; }
.ui-lu__count { font: 700 11px/1 var(--font); opacity: .7; }
.ui-lu--arm .card { border-color: color-mix(in srgb, var(--danger) 55%, var(--edge)); }
.ui-lu--arm .card__icon { color: var(--danger); }
.ui-lu__evo { color: var(--gold) !important; }

/* ---- results ---- */
.ui-verdict { font: 800 clamp(26px, 9vw, 40px)/1 var(--font); letter-spacing: .14em;
  text-transform: uppercase; color: var(--bone); margin: 0; }
.ui-verdict--dead { color: var(--blood); text-shadow: 0 0 30px color-mix(in srgb, var(--blood) 60%, transparent); }
.ui-verdict--win { color: var(--gold); text-shadow: 0 0 30px color-mix(in srgb, var(--gold) 55%, transparent); }
.ui-payout { display: flex; align-items: baseline; justify-content: center; gap: 10px;
  padding: 14px 0 4px; }
.ui-payout__n { font: 800 44px/1 var(--font); color: var(--gold); font-variant-numeric: tabular-nums;
  text-shadow: 0 0 34px color-mix(in srgb, var(--gold) 50%, transparent); }
.ui-payout__l { font: 700 12px/1 var(--font); letter-spacing: .24em; text-transform: uppercase; color: var(--text-faint); }
.ui-unlock { border: 1px solid color-mix(in srgb, var(--gold) 40%, var(--edge)); border-radius: var(--r-md);
  padding: 12px 14px; background: color-mix(in srgb, var(--gold) 7%, var(--ink-2)); }
.ui-unlock__h { font: 800 11px/1 var(--font); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
.ui-unlock__i { display: block; font-size: 13px; line-height: 1.45; color: var(--text); margin-top: 7px; }

/* ---- settings ---- */
.ui-field { padding: 12px 0; border-bottom: 1px solid var(--edge); }
.ui-field:last-child { border-bottom: 0; }
.ui-field__l { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.ui-field__l .h2 { font-size: 14px; }
.ui-field__v { font: 700 13px/1 var(--font); color: var(--text-dim); }
.ui-range { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; display: block; }
.ui-range::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;
  background: linear-gradient(90deg, var(--choir) var(--fill, 50%), var(--ink) var(--fill, 50%)); }
.ui-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
  width: 26px; height: 26px; margin-top: -10px; border-radius: 50%;
  background: var(--bone); border: 2px solid var(--ink); box-shadow: 0 0 14px -2px var(--choir); }
.ui-range::-moz-range-track { height: 6px; border-radius: 3px; background: var(--ink); }
.ui-range::-moz-range-thumb { width: 26px; height: 26px; border-radius: 50%; background: var(--bone); border: 2px solid var(--ink); }
.ui-seg { display: flex; gap: 8px; }
.ui-seg .btn { flex: 1; min-height: 44px; font-size: 12px; letter-spacing: .08em; }
.ui-seg .btn.is-on { border-color: color-mix(in srgb, var(--choir) 70%, var(--edge));
  background: linear-gradient(180deg, color-mix(in srgb, var(--choir) 22%, var(--ink-3)), var(--ink-2));
  color: var(--text); }

/* ---- dialogue / VN ---- */
.ui-vn { padding-left: 0; padding-right: 0; }
.ui-vn .vn { gap: 0; }
.ui-vn__art { position: relative; overflow: hidden; }
.ui-vn__bg { position: absolute; inset: 0; opacity: .55;
  mask-image: linear-gradient(180deg, #000 55%, transparent 96%); }
.ui-vn__fig { position: absolute; top: 0; bottom: 0; width: 62%; overflow: hidden;
  filter: saturate(.85) contrast(1.05); transition: opacity 260ms ease, transform 300ms ease; }
/* Feather the INNER edge into the backdrop. Without this a portrait ends on a
   hard vertical seam straight down the middle of the screen, which reads as a
   layout bug rather than as a composition. The figure is mirrored on the right,
   so both sides fade "to the right" in their own local space. */
.ui-vn__fig--l, .ui-vn__fig--r {
  -webkit-mask-image: linear-gradient(90deg, #000 52%, transparent 97%);
  mask-image: linear-gradient(90deg, #000 52%, transparent 97%);
}
.ui-vn__fig--l { left: -4%; }
.ui-vn__fig--r { right: -4%; transform: scaleX(-1); }
.ui-vn__fig.is-off { opacity: .22; filter: saturate(.2) brightness(.5); }
.ui-vn__fig.is-off.ui-vn__fig--l { transform: translateX(-6px); }
.ui-vn__fig.is-off.ui-vn__fig--r { transform: scaleX(-1) translateX(-6px); }
.ui-vn__floor { position: absolute; inset: auto 0 0 0; height: 45%; pointer-events: none;
  background: linear-gradient(0deg, var(--ink) 12%, transparent 100%); }
.ui-vn__pad { padding: 0 16px; }
.ui-vn__bar { display: flex; align-items: center; gap: 10px; padding: 0 16px 10px; }
.ui-vn__dots { flex: 1; display: flex; gap: 5px; }
.ui-vn__dot { flex: 1; height: 3px; border-radius: 2px; background: var(--edge); }
.ui-vn__dot.is-on { background: var(--choir); box-shadow: 0 0 10px -2px var(--choir); }
.ui-vn__box { position: relative; }
.ui-vn__more { position: absolute; right: 14px; bottom: 10px; font-size: 18px; color: var(--choir);
  animation: vnmore 1.1s ease-in-out infinite; }
@keyframes vnmore { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(3px); opacity: 1; } }
.ui-vn__foot { display: flex; gap: 10px; padding: 10px 16px 0; }
.ui-vn__foot .btn { flex: 1; }

/* ---- sanctum ---- */
.ui-branch { margin: 16px 0 8px; display: flex; align-items: center; gap: 10px; }
.ui-branch__l { font: 800 11px/1 var(--font); letter-spacing: .22em; text-transform: uppercase; color: var(--text-faint); }
.ui-branch__r { flex: 1; height: 1px; background: linear-gradient(90deg, var(--edge), transparent); }
.ui-cost { display: flex; align-items: center; gap: 5px; font: 700 13px/1 var(--font); color: var(--gold); }
.ui-cost--no { color: var(--text-faint); }
.ui-node__r { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; flex: 0 0 auto; }
.ui-door { text-align: center; padding: 18px 10px 4px; font-size: 12px; color: var(--text-faint);
  letter-spacing: .1em; }

/* ---- stage / character tiles ---- */
.ui-tile { min-height: 92px; align-items: stretch; }
.ui-tile__no { font: 800 20px/1 var(--font); color: var(--accent, var(--choir)); }
.ui-lock { display: block; font-size: 12px; line-height: 1.4; margin-top: 5px; color: var(--text-faint); }
.ui-lock::before { content: '\\2022  '; color: var(--text-faint); }
.ui-charart { flex: 0 0 74px; align-self: stretch; margin: -14px 0 -14px -16px; position: relative;
  border-right: 1px solid var(--edge); }
.ui-slots { display: flex; gap: 8px; margin-bottom: 12px; }
.ui-slot { flex: 1; min-height: 58px; border: 1px dashed var(--edge); border-radius: var(--r-md);
  display: grid; place-items: center; font-size: 12px; color: var(--text-faint); text-align: center;
  padding: 6px; background: color-mix(in srgb, var(--ink-2) 70%, transparent); }
.ui-slot.is-full { border-style: solid; border-color: color-mix(in srgb, var(--choir) 50%, var(--edge));
  color: var(--text); font-weight: 700; }

/* ---- codex ---- */
.ui-codex__n { font: 700 12px/1 var(--font); color: var(--text-faint); letter-spacing: .1em; }
.ui-shroud .card__icon { color: var(--text-faint); background: var(--ink); }
.card.is-open { align-items: flex-start; }
.card.is-open .ui-clamp { -webkit-line-clamp: 12; }
.ui-detail { margin-top: 8px; padding-top: 4px; border-top: 1px solid var(--edge); }
.ui-detail .ui-stat { padding: 5px 0; }
.ui-shroud .h2 { color: var(--text-faint); letter-spacing: .3em; }

/* ---- pause affordance ---- */
.ui-pausebtn { position: fixed; z-index: 12; pointer-events: auto;
  top: calc(var(--safe-t) + 10px); right: calc(var(--safe-r) + 10px);
  width: 46px; height: 46px; padding: 0; border-radius: var(--r-sm);
  display: grid; place-items: center; border: 1px solid var(--edge);
  background: color-mix(in srgb, var(--ink) 55%, transparent); color: var(--text-dim);
  font: 800 15px/1 var(--font); letter-spacing: 2px; cursor: pointer; }
.ui-pausebtn[hidden] { display: none !important; }

@media (max-height: 700px) {
  .ui-lu .card { min-height: 70px; }
  .ui-lu--n5 .card { min-height: 62px; }
  .ui-title__mark { margin-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-vn__more { animation: none; }
}
`;
