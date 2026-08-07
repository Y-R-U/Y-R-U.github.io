// Onboarding: the first-run briefing over the cold open, the persistent objective chip and its
// dock coach mark, and the How to play reference. Owns #intro and nothing else on the page.

import content from '../sim/content.js';
import { credits, pct, esc } from './format.js';
import data from '../../content/intro.js';

const SEEN_KEY = 'monopole.seen.v1';
const SAVE_KEY = 'monopole.save.v1';

const b = content.balance;

// Three origins run on three sets of loan terms, and the cash the player actually started with is
// on the state — so these are read per call rather than frozen at import.
function numbers() {
  const st = ctx?.sim?.state;
  const loan = st?.loan || b.loan;
  return {
    cash: credits(st ? st.cash : b.start.cash),
    debt: credits(st?.startDebt ?? b.start.debt),
    playerShare: pct(b.start.share.player),
    rivalShare: pct(b.start.share.rival),
    duopoly: pct(b.win.duopoly),
    monopoly: pct(b.win.monopoly),
    holdWeeks: String(b.win.holdWeeks),
    fromWeek: String(b.win.checkFromWeek),
    heat: String(b.heat.threshold),
    debtLimit: credits(loan.debtLimit),
    interest: pct(loan.interestWeekly, 1),
    feedWeeks: String(b.market.feedWeeks),
    window: String(b.share.window),
    mine: String(content.get('ship', 'ossa')?.mine ?? 0),
    hold: String(content.get('ship', 'kite')?.hold ?? 0),
  };
}

const fill = s => { const n = numbers(); return String(s).replace(/\{(\w+)\}/g, (m, k) => n[k] ?? m); };

// Every panel the player has opened this session. The tour's reading steps complete on being
// looked at, which is the only honest test for "have you seen the Market yet".
const seenPanel = new Set();

// Each objective completes by observation. Every read here is a real field in js/sim/state.js;
// the log-backed ones are monotonic on purpose so a step cannot un-finish itself.
const DONE = {
  quarters: () => seenPanel.has('__quarters'),
  ship: sim => sim.state.ships.length > 0 || sim.queued().some(a => a.type === 'buyShip'),
  rig: sim => sim.state.ships.some(sh => (sim.shipDef(sh)?.mine || 0) > 0 && Array.isArray(sh.route) && sh.route.includes('kestrel'))
    || sim.queued().some(a => (a.type === 'assign' && a.to === 'kestrel') || (a.type === 'route' && a.legs?.includes('kestrel'))),
  market: () => seenPanel.has('market'),
  ore: sim => sim.stock('ledger', 'ore') > 0,
  halide: sim => sim.stock('ledger', 'halide') > 0 || sim.state.log.some(e => e.t === 'refine' && e.into === 'halide'),
  sell: sim => sim.state.log.some(e => e.t === 'deliver' && e.credits > 0),
  books: () => seenPanel.has('holdings'),
  module: sim => sim.state.log.some(e => e.t === 'module')
    || (sim.state.sites.ledger?.modules?.length || 0) > (content.get('station', 'ledger')?.modules.length || 0),
  tactic: sim => sim.state.tactics.owned.length > 0 || sim.state.log.some(e => e.t === 'tactic'),
  dossier: () => seenPanel.has('dossier') || seenPanel.has('story'),
};

let ctx = null;
let root = null;
let guideEl = null;
let done = new Set();
let card = -1;
let expanded = false;
let chipKey = '';
let coached = null;
let latched = -1;
let started = false;

export const intro = {
  start(opts = {}) {
    ctx = opts;
    ensureRoot();
    ctx.showroom?.register({
      id: 'how_to_play', group: 'misc', label: 'How to play',
      note: 'the onboarding reference',
      run: () => openGuide(),
    });

    const q = new URLSearchParams(location.search);
    const forced = q.get('intro');
    // A player who just watched the ruling and built a character does not then want four cards
    // with a Next button; `cards: false` gives them the title hold and hands straight over.
    const brief = opts.cards !== false && (forced === '1'
      || (forced !== '0' && !read(SEEN_KEY) && !read(SAVE_KEY)));

    ctx.sim?.on(kind => {
      if (kind === 'speed') return;
      if (kind === 'reset') { done = new Set(); latched = -1; chipKey = ''; }
      sync();
    });
    watchSheet();

    coldOpen(brief);
    return intro;
  },

  brief() { ensureRoot(); showCard(0); },
  replay() { ensureRoot(); openGuide(); },
  get guideOpen() { return !!guideEl && !guideEl.hidden; },
};

/* ── the cold open ──────────────────────────────────────────────────────── */

// The name over the live system with no card in front of it. Two seconds of nothing but the
// scene is the whole point of the beat, so the first card is not scheduled until it is up.
function coldOpen(brief) {
  const t = data.title;
  const p = ctx.profile;
  const el = document.createElement('div');
  el.className = 'intro-title';
  el.innerHTML = `<b>${esc(p?.company || t.name)}</b><s>${esc(p ? `${p.name} · Tamber Reach · week 0` : t.sub)}</s>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));

  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 700);
    if (brief) showCard(0);
    else finishCards();
  }, t.titleMs);
}

// Hands the running game back. Everything that was held for the intro — the clock, the touch
// gestures, the home framing — is released here and nowhere else.
function begin() {
  if (started) return;
  started = true;
  ctx.begin?.();
}

/* ── root ───────────────────────────────────────────────────────────────── */

function ensureRoot() {
  if (root) return root;
  if (!document.querySelector('link[href$="intro.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'intro.css';
    document.head.appendChild(l);
  }
  root = document.getElementById('intro');
  if (!root) {
    root = document.createElement('div');
    root.id = 'intro';
    document.body.appendChild(root);
  }
  // main.js dismisses the fly-by on any pointerdown outside the known UI roots, and #intro is not
  // in that list — swallowing the event here keeps a tap on Next from also cutting the fly-by.
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('click', onClick);
  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (intro.guideOpen) closeGuide();
      else if (card >= 0) finishCards();
      return;
    }
    if (card < 0 || intro.guideOpen) return;
    if (e.key === 'ArrowRight') showCard(card + 1);
    else if (e.key === 'ArrowLeft') showCard(card - 1);
  });
  return root;
}

function onClick(e) {
  const t = e.target.closest('[data-i]');
  if (!t) return;
  const a = t.dataset.i;
  if (a === 'next') showCard(card + 1);
  else if (a === 'back') showCard(card - 1);
  else if (a === 'skip') finishCards();
  else if (a === 'dot') showCard(+t.dataset.n);
  else if (a === 'why') { expanded = !expanded; sync(); }
  else if (a === 'guide') openGuide();
  else if (a === 'guide-close') closeGuide();
}

/* ── the briefing ───────────────────────────────────────────────────────── */

function showCard(n) {
  if (n >= data.cards.length) return finishCards();
  if (n < 0) return;
  const back = n < card;
  card = n;
  const c = data.cards[n];
  const last = n === data.cards.length - 1;
  root.querySelector('.intro-chip')?.remove();
  chipKey = '';
  let el = root.querySelector('.intro-card');
  if (!el) {
    el = document.createElement('div');
    el.className = 'intro-card';
    root.appendChild(el);
    wireSwipe(el);
  }
  el.innerHTML = `
<i class="eyebrow">${esc(c.eyebrow)}</i>
<h2>${esc(c.title)}</h2>
<p>${esc(fill(c.body))}</p>
<div class="row">
  ${n > 0 ? '<button class="step" data-i="back" aria-label="Previous card">‹</button>' : '<span class="step ghosted"></span>'}
  <div class="dots">${data.cards.map((_, i) =>
    `<button data-i="dot" data-n="${i}" class="${i === n ? 'on' : ''}" aria-label="Card ${i + 1}"></button>`).join('')}</div>
  ${last ? '' : '<button class="ghost" data-i="skip">Skip</button>'}
  <button class="go" data-i="next">${last ? 'Start' : 'Next'}</button>
</div>`;
  el.classList.remove('in', 'from-left', 'from-right');
  el.classList.add(back ? 'from-left' : 'from-right');
  requestAnimationFrame(() => el.classList.add('in'));
  beat(n + 1);
}

// Card n moves the camera to shot n+1 — shot 0 is the title hold. moveTo interrupts whatever is
// already playing and interpolates from the frame it is actually on, so paging back mid-move
// turns round on the spot instead of snapping.
function beat(i) {
  const shot = ctx.shots?.[i];
  if (!shot || !ctx.camera) return;
  ctx.camera.moveTo({ pos: shot.pos, look: shot.look, fov: shot.fov, ms: shot.ms || 4000, ease: 'inout' });
}

function finishCards() {
  card = -1;
  write(SEEN_KEY, '1');
  const el = root.querySelector('.intro-card');
  if (el) { el.classList.remove('in'); setTimeout(() => el.remove(), 340); }
  begin();
  sync();
}

// A drag across the card pages it, and so does a tap on its outer third. Both are cancelled by
// anything that started on a control, so Next and the dots keep working normally.
function wireSwipe(el) {
  let x0 = 0, y0 = 0, id = null, live = false;

  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; live = true;
  });
  el.addEventListener('pointerup', e => {
    if (!live || e.pointerId !== id) return;
    live = false;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) return showCard(card + (dx < 0 ? 1 : -1));
    if (Math.hypot(dx, dy) > 10) return;
    const r = el.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    if (u > 0.72) showCard(card + 1);
    else if (u < 0.28) showCard(card - 1);
  });
  el.addEventListener('pointercancel', () => { live = false; });
}

/* ── the objective chip ─────────────────────────────────────────────────── */

function current() {
  const sim = ctx.sim;
  const w = sim.state.week;
  // latched < 0 means nothing has completed yet this session, so a loaded save catches up in one
  // pass. After that it is one completion a week: ore lands and the refinery runs on the SAME
  // tick, and without this the halide step would never get a week on screen.
  const settle = latched < 0;
  for (const o of data.objectives) {
    if (done.has(o.id)) continue;
    if (!DONE[o.id](sim)) return o;
    // A `look` step finished the moment the player opened the panel, so holding it back until
    // next week just makes the chip look broken. Only the sim-driven ones queue.
    if (!o.look && !settle && latched === w) return o;
    done.add(o.id);
    if (!o.look) latched = w;
  }
  return data.standing;
}

function paintChip(o) {
  const st = ctx.sim.state;
  let line = fill(o.label);
  let tail = '';
  if (st.over) line = st.over === 'bust' ? 'The company is out of money.' : `You took the Reach — ${st.over}.`;
  else if (o.id === 'hold') {
    const streak = st.week >= b.win.checkFromWeek ? st.holdStreak : 0;
    tail = streak ? `${streak}/${b.win.holdWeeks} wk` : pct(st.share.player, 1);
  }
  const key = `${line}|${tail}|${expanded}`;
  if (key === chipKey) return;
  chipKey = key;

  let el = root.querySelector('.intro-chip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'intro-chip';
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }
  el.classList.toggle('over', !!st.over);
  el.innerHTML = `
<button class="obj" data-i="why" aria-expanded="${expanded}">
  <s></s><b>${esc(line)}</b>${tail ? `<em>${esc(tail)}</em>` : ''}<u>${expanded ? '▾' : '▸'}</u>
</button>
<button class="help" data-i="guide" aria-label="How to play">?</button>
${expanded && !st.over ? `<p class="why">${esc(fill(o.why))}</p>` : ''}`;
}

// The coach mark follows the step: the dock button while the sheet is shut, and once the right
// panel is open, the control inside it that actually does the thing.
function paintCoach(o) {
  let el = null;
  if (o && !ctx.sim.state.over) {
    const open = document.body.dataset.panel;
    if (o.quartersStep || o.id === 'ship') el = document.querySelector('[data-hud-quarters]');
    else if (!open) el = o.dock ? document.querySelector(`#dock button[data-hud="${o.dock}"]`) : null;
    else if (open === o.dock) el = pickMark(o.mark);
  }
  // a sheet redraw leaves `coached` pointing at a detached node, so identity alone is not enough
  const same = el === coached && (!coached || coached.isConnected);
  if (same) return;
  const moved = !coached || el?.dataset?.a !== coached.dataset?.a || el?.className !== coached.className;
  coached?.classList.remove('intro-coach');
  el?.classList.add('intro-coach');
  coached = el;
  // pointing at a control below the fold is the same as not pointing at anything
  if (el && moved && el.closest('#sheet')) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function pickMark(list) {
  for (const sel of list || []) {
    const el = document.querySelector(`#sheet ${sel}`);
    if (el && !el.disabled) return el;
  }
  return null;
}

// panels.onStack and panels.onSim each hold ONE callback and the HUD already owns both, so which
// sheet is open has to be read off the body instead of hooked.
function watchSheet() {
  new MutationObserver(() => {
    const open = document.body.dataset.panel;
    if (open) seenPanel.add(open);
    // the quarters and the terminal are body classes, not sheets, so they are watched here too
    if (document.body.classList.contains('in-quarters')) seenPanel.add('__quarters');
    if (document.body.classList.contains('in-terminal')) seenPanel.add('__terminal');
    sync();
  }).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-panel'] });
}

function sync() {
  if (!ctx?.sim) return;
  root.classList.toggle('hidden-by-sheet', document.body.classList.contains('sheet-open'));
  if (card >= 0) return paintCoach(null);
  const o = current();
  paintChip(o);
  paintCoach(o);
}

/* ── How to play ────────────────────────────────────────────────────────── */

function guideHtml() {
  const g = data.guide;
  const dockRows = `<div class="dock-rows">${g.dockRows.map(r =>
    `<div class="dock-row"><b>${esc(r.name)}</b><p>${esc(fill(r.text))}</p></div>`).join('')}</div>`;
  return `
<div class="guide-sheet" role="dialog" aria-label="${esc(g.title)}">
  <header>
    <h2>${esc(g.title)}</h2>
    <button data-i="guide-close" aria-label="Close">✕</button>
  </header>
  <div class="guide-body">
    <p class="lede">${esc(fill(g.lede))}</p>
    ${g.sections.map(s => `
      <h3>${esc(s.h)}</h3>
      ${s.dock ? dockRows : ''}
      ${(s.p || []).map(p => `<p>${esc(fill(p))}</p>`).join('')}`).join('')}
    <p class="sign">Ferrous Line · Tamber Reach</p>
  </div>
</div>`;
}

function openGuide() {
  ensureRoot();
  if (!guideEl) {
    guideEl = document.createElement('div');
    guideEl.className = 'intro-guide';
    guideEl.addEventListener('click', e => { if (e.target === guideEl) closeGuide(); });
    root.appendChild(guideEl);
  }
  guideEl.innerHTML = guideHtml();
  guideEl.hidden = false;
  guideEl.querySelector('.guide-body').scrollTop = 0;
  requestAnimationFrame(() => guideEl.classList.add('in'));
}

function closeGuide() {
  if (!guideEl) return;
  guideEl.classList.remove('in');
  guideEl.hidden = true;
}

/* ── storage, which is allowed to be unavailable ────────────────────────── */

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }

export default intro;
