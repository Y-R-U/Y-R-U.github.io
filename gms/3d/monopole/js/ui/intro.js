// Onboarding: the first-run briefing over the cold open, the persistent objective chip and its
// dock coach mark, and the How to play reference. Owns #intro and nothing else on the page.

import content from '../sim/content.js';
import { cr, pct, esc } from './format.js';
import data from '../../content/intro.js';

const SEEN_KEY = 'monopole.seen.v1';
const SAVE_KEY = 'monopole.save.v1';

const b = content.balance;
const NUMBERS = {
  cash: cr(b.start.cash),
  debt: cr(b.start.debt),
  playerShare: pct(b.start.share.player),
  rivalShare: pct(b.start.share.rival),
  duopoly: pct(b.win.duopoly),
  monopoly: pct(b.win.monopoly),
  holdWeeks: String(b.win.holdWeeks),
  fromWeek: String(b.win.checkFromWeek),
  heat: String(b.heat.threshold),
  debtLimit: cr(b.loan.debtLimit),
  interest: pct(b.loan.interestWeekly, 1),
  feedWeeks: String(b.market.feedWeeks),
  window: String(b.share.window),
  mine: String(content.get('ship', 'ossa')?.mine ?? 0),
  hold: String(content.get('ship', 'kite')?.hold ?? 0),
};

const fill = s => String(s).replace(/\{(\w+)\}/g, (m, k) => NUMBERS[k] ?? m);

// Each objective completes by observation. Every read here is a real field in js/sim/state.js;
// the log-backed ones are monotonic on purpose so a step cannot un-finish itself.
const DONE = {
  rig: sim => sim.state.ships.some(sh => (sim.shipDef(sh)?.mine || 0) > 0 && Array.isArray(sh.route) && sh.route.includes('kestrel'))
    || sim.queued().some(a => (a.type === 'assign' && a.to === 'kestrel') || (a.type === 'route' && a.legs?.includes('kestrel'))),
  ore: sim => sim.stock('ledger', 'ore') > 0,
  halide: sim => sim.stock('ledger', 'halide') > 0 || sim.state.log.some(e => e.t === 'refine' && e.into === 'halide'),
  sell: sim => sim.state.log.some(e => e.t === 'deliver' && e.credits > 0),
  module: sim => sim.state.log.some(e => e.t === 'module')
    || (sim.state.sites.ledger?.modules?.length || 0) > (content.get('station', 'ledger')?.modules.length || 0),
  tactic: sim => sim.state.tactics.owned.length > 0 || sim.state.log.some(e => e.t === 'tactic'),
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
    const brief = forced === '1'
      || (forced !== '0' && !read(SEEN_KEY) && !read(SAVE_KEY));

    ctx.sim?.on(kind => {
      if (kind === 'speed') return;
      if (kind === 'reset') { done = new Set(); latched = -1; chipKey = ''; }
      sync();
    });
    watchSheet();

    if (brief) showCard(0);
    else ctx.coldOpen ? ctx.coldOpen.then(sync) : sync();
    return intro;
  },

  brief() { ensureRoot(); showCard(0); },
  replay() { ensureRoot(); openGuide(); },
  get guideOpen() { return !!guideEl && !guideEl.hidden; },
};

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
    if (e.key !== 'Escape') return;
    if (intro.guideOpen) closeGuide();
    else if (card >= 0) finishCards();
  });
  return root;
}

function onClick(e) {
  const t = e.target.closest('[data-i]');
  if (!t) return;
  const a = t.dataset.i;
  if (a === 'next') showCard(card + 1);
  else if (a === 'skip') finishCards();
  else if (a === 'dot') showCard(+t.dataset.n);
  else if (a === 'why') { expanded = !expanded; sync(); }
  else if (a === 'guide') openGuide();
  else if (a === 'guide-close') closeGuide();
}

/* ── the briefing ───────────────────────────────────────────────────────── */

function showCard(n) {
  if (n >= data.cards.length) return finishCards();
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
  }
  el.innerHTML = `
<i class="eyebrow">${esc(c.eyebrow)}</i>
<h2>${esc(c.title)}</h2>
<p>${esc(fill(c.body))}</p>
<div class="row">
  <div class="dots">${data.cards.map((_, i) =>
    `<button data-i="dot" data-n="${i}" class="${i === n ? 'on' : ''}" aria-label="Card ${i + 1}"></button>`).join('')}</div>
  <button class="ghost" data-i="skip">Skip</button>
  <button class="go" data-i="next">${last ? 'Start' : 'Next'}</button>
</div>`;
  el.classList.remove('in');
  requestAnimationFrame(() => el.classList.add('in'));
}

function finishCards() {
  card = -1;
  write(SEEN_KEY, '1');
  root.querySelector('.intro-card')?.remove();
  sync();
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
    if (!settle && latched === w) return o;
    done.add(o.id);
    latched = w;
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

function paintCoach(o) {
  const want = o && !ctx.sim.state.over && !document.body.classList.contains('sheet-open') ? o.dock : null;
  const el = want ? document.querySelector(`#dock button[data-hud="${want}"]`) : null;
  if (el === coached) return;
  coached?.classList.remove('intro-coach');
  el?.classList.add('intro-coach');
  coached = el;
}

// panels.onStack and panels.onSim each hold ONE callback and the HUD already owns both, so the
// sheet-open state has to be read off the body class instead of hooked.
function watchSheet() {
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
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
