// The terminal on the desk in your quarters. Tapping the screen walks the camera up to it and this
// takes the frame — and it is a computer, not a menu: a status strip, a grid of applications, and a
// back key that always goes one place up.
//
// It is also the whole game. Every company panel opens from here as well as from the dock, so the
// dock is a shortcut rather than the only route, and the things that are about YOU rather than the
// company — the yard, the people who lend you money, your own record, the room itself — live here
// and nowhere else.

import content from '../sim/content.js';
import { runConversation } from '../sim/voice.js';
import { panels } from './panels.js';
import { cr, crShort, delta, esc, pct, plural, weekLabel, quarterLabel } from './format.js';
import { quarters } from './quarters.js';
import { nav } from './nav.js';
import { yard } from './yard.js';
import { clearShowcase, showcaseLighting } from '../world/showcase.js';
import { quartersLighting } from '../world/room.js';

let ctx = null;
let root = null;
let screen = 'home';
let arg = null;
let live = false;

export const terminal = {
  attach(o) { ctx = o; return terminal; },
  get isOpen() { return live; },

  // Sitting down at it is a move, not a cut. The camera walks the last metre to the desk first and
  // the screen only fades up once it has arrived, so the fullscreen UI reads as the thing you are
  // now looking at rather than a page that replaced the room.
  open(to = 'home') {
    if (live) { terminal.go(to); return Promise.resolve(); }
    live = true;
    nav.push('terminal', () => terminal.close());
    const arrive = quarters.inside ? quarters.enter('terminal', 760) : Promise.resolve();
    return arrive.then(() => {
      if (!live) return;
      ensureRoot();
      screen = to;
      arg = null;
      root.classList.add('live');
      document.body.classList.add('in-terminal');
      requestAnimationFrame(() => root.classList.add('in'));
      draw();
    });
  },

  // …and standing up is the same move backwards. The screen goes first so the pull-back starts
  // from the framing the player was actually reading on, which makes it one gesture rather than a
  // dismissal followed by a camera move.
  close() {
    if (!live) return Promise.resolve();
    live = false;
    if (yard.isOpen) closeYard();
    panels.closeAll();
    nav.drop('terminal');
    screen = 'home';
    arg = null;
    document.body.classList.remove('in-terminal');
    if (root) {
      root.classList.remove('in');
      setTimeout(() => { if (!live) { root.classList.remove('live'); root.innerHTML = ''; } }, 300);
    }
    if (!quarters.inside) return Promise.resolve();
    return quarters.enter('enter', 900);
  },

  // Always a step deeper — the keys that come back out go through nav, so history and the screen
  // stack cannot disagree about where the player is.
  go(s, a = null) {
    if (s !== 'home') nav.push('t:' + s, () => terminal.show(PARENT[s] || 'home'));
    terminal.show(s, a);
  },

  show(s, a = null) {
    screen = s; arg = a;
    draw();
  },

  refresh() { if (!live) return; yard.refresh(); if (root && !yard.isOpen) draw(); },
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
  if (a === 'room') return nav.backTo('room');
  if (a === 'home') return nav.backTo('terminal');
  if (a === 'app') return id === 'yard' ? openYard() : terminal.go(id);
  // the company panels are the real bottom sheets, raised above the terminal by a body class
  if (a === 'panel') return panels.open(id);
  if (a === 'lender') return terminal.go('lender', id);
  if (a === 'borrow') return borrow(+t.dataset.amount);
  if (a === 'repay') return repay(+t.dataset.amount);
  if (a === 'upgrade') return upgrade(id);
  if (a === 'back') return nav.back();
}

/* ── applications ───────────────────────────────────────────────────────────
   `panel` entries hand off to the real bottom sheet rather than reimplementing it; everything else
   is a screen in here. `line` is read live, so the grid is a status board and not just a menu. */

const ICON = {
  yard: '<path d="M2.6 13.4h12.8"/><path d="M3.8 13.4V7.2l4.4-3 4.4 3v6.2"/><path d="M6.6 13.4V9.6h3.2v3.8"/>',
  bank: '<path d="M2.6 7.2 9 3.2l6.4 4"/><path d="M4.2 7.6v5.2M7.4 7.6v5.2M10.6 7.6v5.2M13.8 7.6v5.2"/><path d="M2.6 14.4h12.8"/>',
  identity: '<rect x="2.4" y="3.6" width="13.2" height="10.8" rx="1.6"/><circle cx="6.6" cy="8" r="1.7"/><path d="M3.9 12.6c.5-1.5 1.5-2.2 2.7-2.2s2.2.7 2.7 2.2"/><path d="M11 7.4h3.2M11 10h3.2"/>',
  quarters: '<path d="M2.6 7.6 9 2.8l6.4 4.8v6.2a.6.6 0 0 1-.6.6H3.2a.6.6 0 0 1-.6-.6z"/><path d="M6.8 14.4V9.8h4.4v4.6"/>',
  contracts: '<path d="M4 2.6h6.2L14 6.2v9.2H4z"/><path d="M10 2.6v3.8h4"/><path d="M6.2 9.4h5.4M6.2 11.8h5.4"/>',
  assign: '<path d="M2.8 9.4 15.2 3l-5.4 12.6-2.2-5.4z"/>',
  holdings: '<rect x="2.4" y="9.6" width="5.4" height="5.8" rx="1"/><rect x="10.2" y="9.6" width="5.4" height="5.8" rx="1"/><rect x="6.3" y="2.6" width="5.4" height="5.4" rx="1"/>',
  market: '<path d="M5.2 15V4.6M2.8 7l2.4-2.4L7.6 7M12.8 3v10.4M10.4 11l2.4 2.4L15.2 11"/>',
  refinery: '<circle cx="3.8" cy="9" r="2.2"/><circle cx="9" cy="9" r="2.2"/><circle cx="14.2" cy="9" r="2.2"/><path d="M6 9h.8M11.2 9h.8"/>',
  tactics: '<circle cx="9" cy="3" r="1.7"/><circle cx="4.6" cy="12.2" r="1.7"/><circle cx="13.4" cy="12.2" r="1.7"/><path d="M9 4.7 4.9 10.6M9 4.7l4.1 5.9"/>',
  dossier: '<path d="M3.2 3.4h4.9l1.4 2h5.3v9.2H3.2z"/><path d="M3.2 8.4h11.6"/>',
};

const APPS = [
  {
    group: 'Ledger Station',
    items: [
      { id: 'yard', icon: 'yard', name: 'Ledger Yard', line: st => yard.boardLine(st), flag: st => !st.ships.length },
      { id: 'contracts', icon: 'contracts', name: 'Contracts', line: st => st.contracts.length ? plural(st.contracts.length, 'agreement') + ' running' : 'Who is watching the Reach' },
    ],
  },
  {
    group: 'Your company',
    items: [
      { id: 'assign', panel: true, icon: 'assign', name: 'Assign', line: st => st.ships.length ? plural(st.ships.length, 'hull') + ' on the books' : 'Nothing to send yet', lock: st => !st.ships.length, lockLine: 'Buy a hull first' },
      { id: 'holdings', panel: true, icon: 'holdings', name: 'Holdings', line: st => crShort(st.cash) + ' cr · ' + crShort(st.debt) + ' owed' },
      { id: 'market', panel: true, icon: 'market', name: 'Market', line: () => 'What the Reach is paying' },
      { id: 'refinery', panel: true, icon: 'refinery', name: 'Refinery', line: sim => `${Math.round(sim.stock('ledger', 'ore'))} t of ore at Ledger`, ofSim: true },
      { id: 'tactics', panel: true, icon: 'tactics', name: 'Tactics', line: st => st.tactics.owned.length ? plural(st.tactics.owned.length, 'play') + ' unlocked' : 'Nothing unlocked yet' },
      { id: 'dossier', panel: true, icon: 'dossier', name: 'Dossier', line: st => `Corvain holds ${pct(st.share.rival, 0)}` },
    ],
  },
  {
    group: 'Personal',
    items: [
      { id: 'banking', icon: 'bank', name: 'Banking', line: st => st.debt > 0 ? `${crShort(st.debt)} cr out at ${pct(st.loan.interestWeekly, 1)}/wk` : 'No debt drawn' },
      { id: 'identity', icon: 'identity', name: 'Identity', line: (st, p) => `${p?.name || 'Unregistered'} · ${content.get('origin', st.origin)?.name || 'independent'}` },
      { id: 'quarters', icon: 'quarters', name: 'Quarters', line: st => content.get('quarters', st.quarters || 'dockbox')?.name || 'Rented' },
    ],
  },
];

const APP = new Map(APPS.flatMap(g => g.items.map(a => [a.id, a])));
const icon = k => `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.dossier}</svg>`;

/* ── the shell ──────────────────────────────────────────────────────────── */

const TITLE = {
  home: 'Applications', banking: 'Banking', lender: 'Banking',
  identity: 'Identity', quarters: 'Quarters', contracts: 'Contracts',
};

const PARENT = { lender: 'banking' };

function draw() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile;
  const body = {
    home: homeHtml, banking: bankingHtml, lender: lenderHtml,
    identity: identityHtml, quarters: quartersHtml, contracts: contractsHtml,
  }[screen] || homeHtml;
  const up = screen === 'home' ? null : (PARENT[screen] || 'home');
  const title = screen === 'home' ? '' : `<h2 class="t-title">${esc(TITLE[screen] || screen)}</h2>`;

  root.innerHTML = `
<div class="t-frame">
  <header class="t-bar">
    <div class="t-badge" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="t-who"><b>${esc(p?.company || 'Ferrous Line')}</b><s>Ledger Station · terminal 4-C</s></div>
    <div class="t-clock"><b>${esc(weekLabel(st.week))}</b><s>${esc(quarterLabel(st.week))}</s></div>
  </header>
  <div class="t-strip">
    <span><s>Credits</s><b>${cr(st.cash)}</b></span>
    <span><s>Debt</s><b class="${st.debt > 0 ? 'owe' : ''}">${cr(st.debt)}</b></span>
    <span><s>The Reach</s><b>${pct(st.share.player, 1)}</b></span>
  </div>
  <div class="t-body">${title}${body()}${pendingNote()}</div>
  <nav class="t-keys">
    <button class="t-key" data-t="room"><em>◀</em><s>Room</s></button>
    <button class="t-key wide${screen === 'home' ? ' on' : ''}" data-t="home"><em>▦</em><s>Applications</s></button>
    <button class="t-key${up ? '' : ' ghost'}" ${up ? 'data-t="back"' : 'disabled'}><em>‹</em><s>Back</s></button>
  </nav>
</div>`;
}

function homeHtml() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile;
  const sim = ctx.sim;
  return APPS.map(g => `
<h3 class="t-h">${esc(g.group)}</h3>
<div class="t-grid">
  ${g.items.map(a => {
    const locked = a.lock?.(st) || false;
    const line = locked ? a.lockLine : (a.ofSim ? a.line(sim, p) : a.line(st, p));
    const flag = !locked && a.flag?.(st);
    return `<button class="t-tile${locked ? ' locked' : ''}${flag ? ' flag' : ''}"
      ${locked ? 'disabled' : `data-t="${a.panel ? 'panel' : 'app'}" data-id="${esc(a.id)}"`}>
      <div class="t-ico">${icon(a.icon)}</div>
      <div class="t-tile-txt"><b>${esc(a.name)}</b><s>${esc(line)}</s></div>
    </button>`;
  }).join('')}
</div>`).join('');
}

/* ── the yard ───────────────────────────────────────────────────────────── */

// The yard is not a screen in here — it is a sales floor over the live turntable. This hands the
// frame to it and takes it back, which is also what puts the camera on the desk again.
function openYard() {
  nav.push('t:yard', () => closeYard());
  root.classList.add('lent');
  showcaseLighting(ctx.app);
  yard.open();
}

function closeYard() {
  yard.close();
  root.classList.remove('lent');
  clearShowcase(ctx.world);
  ctx.world.resumeLive();
  quartersLighting(ctx.app, ctx.sim.state.quarters || 'dockbox');
  if (quarters.inside) quarters.enter('terminal', 0);
  draw();
}

const spendable = () => ctx.sim.spendable();

function pendingNote() {
  const n = ctx.sim.queued().length;
  if (!n) return '';
  return `<p class="t-pending">${n === 1 ? 'One order is' : n + ' orders are'} on the wire. A week goes by while they land.</p>`;
}

/* ── money ──────────────────────────────────────────────────────────────── */

// A statement, not a table: what is on the account against what is drawn on the line, the week's
// two flows, and the people who will pick up the phone with their faces on the card.
function bankingHtml() {
  const st = ctx.sim.state;
  const o = content.get('origin', st.origin || 'saved');
  const loan = st.loan;
  const room = Math.max(0, loan.maxDraw - st.debt);
  const used = loan.maxDraw ? st.debt / loan.maxDraw : 0;
  const c = ctx.sim.last('cost');
  const inWk = c ? Math.round(c.revenue) : 0;
  const outWk = c ? Math.round(c.total) : 0;
  const net = inWk - outWk;
  const weeks = ctx.sim.all('cost').slice(-14);
  return `
<div class="ap-hero">
  <i>Account 44-119-C · Reach Clearing</i>
  <b class="${st.cash < 8000 ? 'thin' : ''}">${cr(st.cash)}<u>cr</u></b>
  <s>on account, ${weekLabel(st.week).toLowerCase()}</s>
</div>

<div class="ap-meter ${used > 0.75 ? 'hot' : ''}">
  <div class="ap-meter-top"><b>Credit line</b><em>${cr(st.debt)} of ${cr(loan.maxDraw)}</em></div>
  <div class="ap-bar"><i style="width:${(Math.min(1, used) * 100).toFixed(1)}%"></i></div>
  <s>${cr(room)} cr still on the line · ${pct(loan.interestWeekly, 1)} a week on what is drawn</s>
</div>

<div class="ap-tiles three">
  <div class="ap-tile up"><s>In last week</s><b>${c ? cr(inWk) : '—'}</b></div>
  <div class="ap-tile down"><s>Out</s><b>${c ? cr(outWk) : '—'}</b></div>
  <div class="ap-tile ${net >= 0 ? 'up' : 'down'}"><s>Net</s><b>${c ? delta(net, cr) : '—'}</b></div>
</div>

${weeks.length > 1 ? `<div class="ap-block"><h4>The last ${weeks.length} weeks</h4>${bars(weeks)}</div>` : ''}

${c ? `<div class="ap-block">
  <h4>Where it went</h4>
  <ul class="ap-split">
    ${[['Wages', c.wages], ['Module upkeep', c.modules], ['Fuel', c.fuel], ['Interest', c.interest], ['Overhead', c.overhead]]
      .filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1])
      .map(([k, v]) => `<li><s>${esc(k)}</s><i style="width:${((v / Math.max(1, outWk)) * 100).toFixed(0)}%"></i><em>${cr(Math.round(v))}</em></li>`).join('')}
  </ul>
</div>` : ''}

<h3 class="t-h">Who will take your call</h3>
<div class="ap-people">
  ${(o.lenders || []).map(id => {
    const n = content.voice.npcs[id];
    if (!n) return '';
    return `<button class="ap-person" data-t="lender" data-id="${esc(id)}">
      <span class="ap-face" style="background-image:url(assets/faces/${esc(n.face || 'merrow')}.jpg)"></span>
      <span class="ap-person-txt"><b>${esc(n.name)}</b><s>${esc(n.role)}</s><u>${esc(n.blurb)}</u></span>
      <em>›</em></button>`;
  }).join('')}
</div>`;
}

// Fourteen weeks of takings against outgoings, drawn as paired bars. It is the one place the
// player can see whether the company is trending anywhere before the quarterly says so.
function bars(rows) {
  const top = Math.max(1, ...rows.map(r => Math.max(r.revenue, r.total)));
  return `<div class="ap-bars">${rows.map(r => `
    <span title="week ${r.week}">
      <i class="in" style="height:${((r.revenue / top) * 100).toFixed(0)}%"></i>
      <i class="out" style="height:${((r.total / top) * 100).toFixed(0)}%"></i>
    </span>`).join('')}</div>`;
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

/* ── who you are ────────────────────────────────────────────────────────── */

// The character sheet the player built before the game started, kept somewhere they can read it
// back. It is also the only screen that shows heat, which is a number about the person holding the
// licence rather than about the company's books.
function identityHtml() {
  const st = ctx.sim.state;
  const p = ctx.sim.profile || {};
  const origin = content.get('origin', st.origin || p.origin);
  const traits = (p.traits || []).map(id => content.get('trait', id)).filter(Boolean);
  const heatMax = content.balance.heat.threshold;
  const heat = Math.min(1, (st.heat || 0) / heatMax);
  const rep = Math.max(0, Math.min(1, st.rep ?? 0));
  const initials = (p.name || 'U N').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || 'U';
  return `
<div class="ap-licence">
  <div class="ap-lic-head">
    <span class="ap-mono">${esc(initials.toUpperCase())}</span>
    <span class="ap-lic-who">
      <b>${esc(p.name || 'Unregistered')}</b>
      <s>${esc(content.get('gender', p.gender)?.filed || 'Not stated')} · master of ${esc(p.company || 'no vessel')}</s>
    </span>
    <span class="ap-lic-seal">${icon('identity')}</span>
  </div>
  <dl class="ap-lic-grid">
    <div><s>Licence</s><b>TR-${String(1000 + (ctx.sim.seed % 8999))}</b></div>
    <div><s>Registered</s><b>${esc(origin?.name || 'Independent')}</b></div>
    <div><s>Issued</s><b>week 0</b></div>
    <div><s>Manner</s><b>${esc(content.get('personality', p.personality)?.name || '—')}</b></div>
  </dl>
  <p>${esc(origin?.lede || 'A licence, a room, and whatever you can talk somebody into.')}</p>
</div>

<h3 class="t-h">Noted on the file</h3>
${traits.length
    ? `<div class="ap-traits">${traits.map(t => `<span><b>${esc(t.name)}</b><s>${esc(t.blurb || '')}</s></span>`).join('')}</div>`
    : '<p class="t-hint">Nothing on file. That is its own kind of reputation.</p>'}

<h3 class="t-h">How you are read</h3>
<div class="ap-gauges">
  <div class="ap-gauge">
    <div class="ap-meter-top"><b>Standing</b><em>${pct(rep, 0)}</em></div>
    <div class="ap-bar good"><i style="width:${(rep * 100).toFixed(0)}%"></i></div>
    <s>What the Reach says about you when you are not there.</s>
  </div>
  <div class="ap-gauge">
    <div class="ap-meter-top"><b>Regulator interest</b><em>${Math.round(st.heat || 0)} / ${heatMax}</em></div>
    <div class="ap-bar ${heat > 0.7 ? 'bad' : 'warn'}"><i style="width:${(heat * 100).toFixed(0)}%"></i><u style="left:70%"></u></div>
    <s>${heat > 0.7 ? 'Past the mark. They are reading the filings.' : 'The mark is where an investigation starts.'}</s>
  </div>
</div>

<h3 class="t-h">The record</h3>
<div class="ap-tiles three">
  <div class="ap-tile"><s>Trading</s><b>${st.week}<u>wk</u></b></div>
  <div class="ap-tile"><s>Hulls</s><b>${st.ships.length}</b></div>
  <div class="ap-tile"><s>Convictions</s><b>${st.convictions || 0}</b></div>
</div>
<div class="ap-tiles two">
  <div class="ap-tile wide"><s>Quarters</s><b>${esc(content.get('quarters', st.quarters || 'dockbox')?.name || '—')}</b></div>
  <div class="ap-tile wide"><s>The Reach</s><b>${pct(st.share.player, 1)}</b></div>
</div>`;
}

/* ── quarters and contracts ─────────────────────────────────────────────── */

// A property board. Every tier is a real room the game can put you in, so the card shows the
// floor to scale, the glass you get and what it costs to keep — a price beside a name told the
// player nothing about what they were actually buying.
function quartersHtml() {
  const st = ctx.sim.state;
  const now = st.quarters || 'dockbox';
  const all = content.all('quarters');
  const big = Math.max(...all.map(q => Math.max(q.room.w, q.room.d)));
  return `
<div class="ap-lede">
  <i>Ledger Station · residential</i>
  <p>Where you live. Mostly it changes what is outside the window, which is more of a reason than
  it sounds.</p>
</div>
<div class="ap-props">
  ${all.map(q => {
    const owned = q.id === now;
    const ordered = !owned && ctx.sim.queued('buyQuarters').some(a => a.tier === q.id);
    const can = !owned && !ordered && spendable() >= q.cost;
    const sw = (q.room.w / big) * 100;
    const win = (q.win.w / q.room.w) * 100;
    return `<div class="ap-prop${owned ? ' on' : ''}">
      <div class="ap-plan" aria-hidden="true">
        <div class="ap-floor" style="width:${sw.toFixed(1)}%;aspect-ratio:${q.room.w}/${q.room.d}">
          <i class="ap-glass" style="width:${win.toFixed(0)}%"></i>
          <i class="ap-desk"></i>
        </div>
      </div>
      <div class="ap-prop-txt">
        <div class="ap-prop-top">
          <b>${esc(q.name)}</b>
          ${owned ? '<u class="own">Yours</u>' : `<u class="${can ? '' : 'short'}">${cr(q.cost)}</u>`}
        </div>
        <s>${esc(q.blurb)}</s>
        <ul class="ap-facts">
          <li><s>Floor</s><em>${q.room.w} × ${q.room.d} m</em></li>
          <li><s>Glass</s><em>${q.win.w} m wide</em></li>
          <li><s>Upkeep</s><em>${q.upkeep} cr/wk</em></li>
        </ul>
        ${owned
          ? '<p class="ap-you">You are standing in it.</p>'
          : ordered
            ? '<button class="ap-cta" disabled>Taken — the keys come next week</button>'
            : `<button class="ap-cta" ${can ? `data-t="upgrade" data-id="${esc(q.id)}"` : 'disabled'}>
              ${can ? 'Take it' : `Short ${cr(q.cost - Math.max(0, spendable()))} cr`}
             </button>`}
      </div>
    </div>`;
  }).join('')}
</div>`;
}

function upgrade(id) {
  const q = content.get('quarters', id);
  if (!q || spendable() < q.cost) return;
  ctx.sim.act({ type: 'buyQuarters', tier: id });
  quarters.setTier(id);
  draw();
}

// Not a dead end: the desk shows the agreements you are actually running, and what the two coil
// brands are waiting for. The old copy said "nothing on offer" and stopped there, which reads as
// a screen that does not work rather than one with nothing in it yet.
function contractsHtml() {
  const st = ctx.sim.state;
  const b = content.balance.offer;
  const held = Math.round(ctx.sim.stock('ledger', b.commodity));
  const ready = st.week >= b.weekMin;
  const c = content.get('commodity', b.commodity);
  return `
<div class="ap-lede">
  <i>Reach supply desk</i>
  <p>Supply agreements are offered to you, not applied for. Carry enough of the right thing and the
  brands come looking.</p>
</div>

<h3 class="t-h">Running</h3>
${st.contracts.length ? `<div class="ap-deals">
  ${st.contracts.map(k => `<div class="ap-deal">
    <div class="ap-deal-top"><b>${esc(brandName(k.with))}</b><u>${k.exclusive ? 'exclusive' : 'supply'}</u></div>
    <ul class="ap-facts">
      <li><s>Commits</s><em>${k.units} t / week</em></li>
      <li><s>Floor price</s><em>${cr(k.price)} cr/t</em></li>
      <li><s>Runs for</s><em>${plural(k.weeksLeft, 'week')}</em></li>
      <li><s>At Ledger</s><em class="${held >= k.units ? '' : 'short'}">${Math.round(ctx.sim.stock('ledger', k.commodity))} t</em></li>
    </ul>
  </div>`).join('')}
</div>` : '<p class="ap-empty">Nothing signed. The desk is quiet.</p>'}

<h3 class="t-h">Who is watching</h3>
<div class="ap-watch">
  <div class="ap-watcher">
    <div class="ap-deal-top"><b>${esc(brandName('ryland'))}</b><u class="${ready ? 'live' : ''}">${ready ? 'in the window' : `from week ${b.weekMin}`}</u></div>
    <s>Wants ${b.units} t of ${esc(c?.name.toLowerCase() || b.commodity)} a week, on a floor price, and wants it from one supplier.</s>
    <div class="ap-meter-top"><b>Your ${esc(c?.name.toLowerCase() || b.commodity)} at Ledger</b><em>${held} / ${b.units} t</em></div>
    <div class="ap-bar"><i style="width:${Math.min(100, (held / Math.max(1, b.units)) * 100).toFixed(0)}%"></i></div>
  </div>
  <div class="ap-watcher dim">
    <div class="ap-deal-top"><b>${esc(brandName('harrow'))}</b><u>not yet</u></div>
    <s>Buys what Ryland does not. Comes to the table when somebody else has already tied up the line.</s>
  </div>
</div>`;
}

const brandName = id => ({ ryland: 'Ryland Coil Works', harrow: 'Harrow Filament' }[id] || id);

export default terminal;
