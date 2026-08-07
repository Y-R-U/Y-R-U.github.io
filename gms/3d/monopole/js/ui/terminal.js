// The terminal in your quarters. Tapping the screen in the room opens this full-screen; every
// app that is about YOU rather than about the company lives here.
//
// Apps: the yard (buy a hull, turn it in 3D first), your contacts (borrow money from whoever will
// take your call), and your quarters (upgrade the room). Contracts unlock once you own a hull.

import content from '../sim/content.js';
import { runConversation } from '../sim/voice.js';
import { credits, cr, esc, pct } from './format.js';
import { quarters } from './quarters.js';
import { showcaseShip, clearShowcase } from '../world/showcase.js';

let ctx = null;
let root = null;
let screen = 'home';
let arg = null;
let convo = null;

export const terminal = {
  attach(o) { ctx = o; return terminal; },
  get open2() { return screen !== null; },

  open() {
    ensureRoot();
    screen = 'home';
    arg = null;
    root.classList.add('live');
    document.body.classList.add('in-terminal');
    requestAnimationFrame(() => root.classList.add('in'));
    draw();
  },

  close() {
    if (!root) return;
    if (arg && screen === 'hull') exitShowcase();
    root.classList.remove('in');
    document.body.classList.remove('in-terminal');
    setTimeout(() => { root.classList.remove('live'); root.innerHTML = ''; }, 300);
    screen = 'home';
  },

  go(s, a = null) { screen = s; arg = a; convo = null; draw(); },
};

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('terminal');
  if (!root) {
    root = document.createElement('div');
    root.id = 'terminal';
    document.body.appendChild(root);
  }
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('click', onClick);
  return root;
}

function onClick(e) {
  const t = e.target.closest('[data-t]');
  if (!t) return;
  const a = t.dataset.t;
  const id = t.dataset.id;
  if (a === 'close') return terminal.close();
  if (a === 'home') { if (screen === 'hull') exitShowcase(); return terminal.go('home'); }
  if (a === 'app') return terminal.go(id);
  if (a === 'hull') return openHull(id);
  if (a === 'buy') return buyHull(id);
  if (a === 'lender') return terminal.go('lender', id);
  if (a === 'borrow') return borrow(+t.dataset.amount);
  if (a === 'repay') return repay(+t.dataset.amount);
  if (a === 'upgrade') return upgrade(id);
  if (a === 'back') { if (screen === 'hull') exitShowcase(); return terminal.go(arg === null ? 'home' : t.dataset.to || 'home'); }
}

/* ── the shell ──────────────────────────────────────────────────────────── */

function draw() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile;
  const body = {
    home: homeHtml, yard: yardHtml, hull: hullHtml,
    contacts: contactsHtml, lender: lenderHtml, quarters: quartersHtml,
  }[screen] || homeHtml;

  root.innerHTML = `
<div class="t-frame${screen === 'hull' ? ' see-through' : ''}">
  <header class="t-bar">
    ${screen === 'home'
      ? `<button class="t-x" data-t="close" aria-label="Back to the room">◀ Room</button>`
      : `<button class="t-x" data-t="home" aria-label="Terminal home">◀ Menu</button>`}
    <div class="t-who"><b>${esc(p?.company || 'Ferrous Line')}</b><s>${esc(p?.name || '')}</s></div>
    <div class="t-cash">${cr(st.cash)}<s>cr</s></div>
  </header>
  <div class="t-body">${body()}${pendingNote()}</div>
</div>`;
}

function homeHtml() {
  const st = ctx.sim.state;
  const owns = st.ships.length > 0;
  const apps = [
    { id: 'yard', name: 'Ledger Yard', line: owns ? 'Hulls for sale. Trade-ins considered.' : 'You do not own a ship. Start here.', flag: !owns },
    { id: 'contacts', name: 'Contacts', line: 'The people who will lend you money.' },
    { id: 'quarters', name: 'Quarters', line: 'Where you live, and what you can see from it.' },
    { id: 'contracts', name: 'Contracts', line: owns ? 'Work on offer in the Reach.' : 'Needs a hull. Any hull.', locked: !owns },
  ];
  return `
<div class="t-lede">
  <i>Ledger Station · public terminal</i>
  <p>${owns ? 'Everything the Reach will let you do from a rented room.' : 'You have a room, a licence and no ships. The yard is the only door that opens.'}</p>
</div>
<div class="t-apps">
  ${apps.map(a => `
    <button class="t-app${a.locked ? ' locked' : ''}${a.flag ? ' flag' : ''}"
      ${a.locked ? 'disabled' : `data-t="app" data-id="${esc(a.id)}"`}>
      <b>${esc(a.name)}</b><s>${esc(a.line)}</s>
    </button>`).join('')}
</div>`;
}

/* ── the yard ───────────────────────────────────────────────────────────── */

function yardHtml() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile;
  const { npc, beats } = runConversation('yard_first', p);
  const hulls = content.all('ship');
  return `
<div class="t-convo">
  <i>${esc(npc.name)} — ${esc(npc.role)}</i>
  ${beats.map(bt => `<p class="${bt.who}"><s>${esc(bt.who === 'npc' ? npc.name : p.name)}</s>${esc(bt.text)}</p>`).join('')}
</div>
<h3 class="t-h">The board</h3>
<div class="t-list">
  ${hulls.map(h => `
    <button class="t-row" data-t="hull" data-id="${esc(h.id)}">
      <div class="t-row-main"><b>${esc(h.name)}</b><s>${esc(roleLine(h))}</s></div>
      <em class="${spendable() >= h.cost ? '' : 'short'}">${cr(h.cost)}</em>
    </button>`).join('')}
</div>`;
}

function roleLine(h) {
  const bits = [`${h.hold} t hold`];
  if (h.mine > 0) bits.push(`cuts ${h.mine} t/wk`);
  bits.push(`${h.upkeep} cr/wk`);
  return bits.join(' · ');
}

function openHull(id) {
  arg = id;
  screen = 'hull';
  convo = null;
  showcaseShip(ctx.app, ctx.world, ctx.camera, id);
  draw();
}

function exitShowcase() {
  clearShowcase(ctx.world);
  ctx.world.resumeLive();
  quarters.enter('terminal', 0);
}

function hullHtml() {
  const h = content.get('ship', arg);
  const st = ctx.sim.state;
  const can = spendable() >= h.cost;
  const rows = [
    ['Hold', `${h.hold} t`],
    ['Cuts ore', h.mine > 0 ? `${h.mine} t / week` : '—'],
    ['Speed', `${h.speed.toFixed(2)}×`],
    ['Upkeep', `${cr(h.upkeep)} cr / week`],
    ['Hull length', `${h.hull.len} m`],
  ];
  return `
<div class="t-hull">
  <button class="t-back" data-t="back" data-to="yard">‹ The board</button>
  <h2>${esc(h.name)}</h2>
  <p class="t-hint">Drag to turn it. Pinch to look closer.</p>
  <table class="t-spec">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <div class="t-buy">
    <span>${cr(h.cost)} cr</span>
    <button class="t-cta" data-t="buy" data-id="${esc(h.id)}" ${can ? '' : 'disabled'}>
      ${can ? 'Buy this hull' : 'Not enough cash'}
    </button>
  </div>
</div>`;
}

// Orders queue and go out when the week ticks — the same contract as every other panel. Forcing
// a tick here would burn a week per transaction and drift the terminal out of step with the clock.
function buyHull(id) {
  const h = content.get('ship', id);
  if (spendable() < h.cost) return;
  ctx.sim.act({ type: 'buyShip', class: id });
  exitShowcase();
  terminal.go('yard');
}

// cash minus everything already queued this week, so two purchases cannot be committed against
// the same credits and silently dropped when the tick applies them
function spendable() {
  const q = ctx.sim.queued();
  let spent = 0;
  for (const a of q) {
    if (a.type === 'buyShip') spent += content.get('ship', a.class)?.cost || 0;
    if (a.type === 'buyQuarters') spent += content.get('quarters', a.tier)?.cost || 0;
    if (a.type === 'repay') spent += a.amount || 0;
  }
  return ctx.sim.state.cash - spent;
}

function pendingNote() {
  const n = ctx.sim.queued().length;
  return n ? `<p class="t-pending">${n === 1 ? 'One order' : n + ' orders'} goes out when the week ticks.</p>` : '';
}

/* ── money ──────────────────────────────────────────────────────────────── */

function contactsHtml() {
  const st = ctx.sim.state;
  const o = content.get('origin', st.origin || 'saved');
  const loan = st.loan;
  const room = Math.max(0, loan.maxDraw - st.debt);
  return `
<div class="t-lede">
  <i>Your contacts</i>
  <p>You owe ${credits(st.debt)} at ${pct(loan.interestWeekly, 1)} a week. There is ${credits(room)} of line left.</p>
</div>
<div class="t-list">
  ${(o.lenders || []).map(id => {
    const n = content.voice.npcs[id];
    if (!n) return '';
    return `<button class="t-row" data-t="lender" data-id="${esc(id)}">
      <div class="t-row-main"><b>${esc(n.name)}</b><s>${esc(n.blurb)}</s></div><em>›</em></button>`;
  }).join('')}
</div>`;
}

function lenderHtml() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile;
  const n = content.voice.npcs[arg];
  const loan = st.loan;
  const room = Math.max(0, loan.maxDraw - st.debt);
  const convId = arg === 'vosk' ? 'vosk_first' : 'mutual_first';
  const c = content.voice.conversations[convId]
    ? runConversation(convId, p, { rate: pct(loan.interestWeekly, 1) })
    : null;
  const steps = [10000, 25000, 50000].filter(v => v <= room);
  return `
<button class="t-back" data-t="back" data-to="contacts">‹ Contacts</button>
${c ? `<div class="t-convo">
  <i>${esc(n.name)} — ${esc(n.role)}</i>
  ${c.beats.map(bt => `<p class="${bt.who}"><s>${esc(bt.who === 'npc' ? n.name : p.name)}</s>${esc(bt.text)}</p>`).join('')}
</div>` : ''}
<h3 class="t-h">Draw on the line</h3>
<div class="t-chips">
  ${steps.length
    ? steps.map(v => `<button class="t-chip" data-t="borrow" data-amount="${v}">${cr(v)}</button>`).join('')
    : '<p class="t-hint">Nothing left on the line.</p>'}
</div>
${st.debt > 0 && spendable() > 5000 ? `
  <h3 class="t-h">Pay some back</h3>
  <div class="t-chips">
    ${[10000, 25000].filter(v => v <= Math.min(st.debt, spendable() - 2000))
      .map(v => `<button class="t-chip ghost" data-t="repay" data-amount="${v}">${cr(v)}</button>`).join('') || '<p class="t-hint">Not enough spare cash.</p>'}
  </div>` : ''}
<p class="t-hint">A draw costs ${pct(loan.drawFee, 0)} up front and ${pct(loan.interestWeekly, 1)} a week after that.</p>`;
}

function borrow(amount) { ctx.sim.act({ type: 'loan', amount }); draw(); }
function repay(amount) { ctx.sim.act({ type: 'repay', amount }); draw(); }

/* ── quarters ───────────────────────────────────────────────────────────── */

function quartersHtml() {
  const st = ctx.sim.state;
  const now = st.quarters || 'dockbox';
  return `
<div class="t-lede">
  <i>Quarters</i>
  <p>Where you live. Mostly it changes what is outside the window, which is more of a reason than it sounds.</p>
</div>
<div class="t-list">
  ${content.all('quarters').map(q => {
    const owned = q.id === now;
    const can = !owned && spendable() >= q.cost;
    return `<button class="t-row${owned ? ' on' : ''}" ${owned || !can ? 'disabled' : `data-t="upgrade" data-id="${esc(q.id)}"`}>
      <div class="t-row-main"><b>${esc(q.name)}</b><s>${esc(q.blurb)}</s></div>
      <em class="${can || owned ? '' : 'short'}">${owned ? 'Yours' : cr(q.cost)}</em>
    </button>`;
  }).join('')}
</div>`;
}

function upgrade(id) {
  const q = content.get('quarters', id);
  const st = ctx.sim.state;
  if (!q || spendable() < q.cost) return;
  ctx.sim.act({ type: 'buyQuarters', tier: id });
  quarters.setTier(id);
  draw();
}

export default terminal;
