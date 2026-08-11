// Ledger Yard — a sales floor rather than a list. The hull turns in the live scene, the chrome is
// a rail you swipe through the board with, labels reach off the metal as it comes round, and the
// broker is on the line the whole time and will move on the price if you ask them right.
//
// The 3D underneath keeps every gesture. That is why the swipe between hulls lives on the rail and
// nowhere else: a horizontal drag over the ship has to mean turn the ship.

import content from '../sim/content.js';
import { npcSay, playerSay } from '../sim/voice.js';
import { createRng, hashSeed } from '../sim/rng.js';
import { cr, esc, pct } from './format.js';
import { showcaseShip, showcasePoint, frameShowcase } from '../world/showcase.js';

const Y = content.yard;

let ctx = null;
let root = null;
let live = false;
let idx = 0;
let hulls = [];
let broker = null;
let offers = new Map();     // class id → { cut, reason, endDay, days }
let offerKey = '';          // seed and block the offers above were drawn for
let deals = new Map();      // class id → { price, cut, endDay, days }
let tries = new Map();      // class id → how many times the player has pushed
let told = new Set();       // hulls the broker has already been told to break the bad news on
let chat = [];
let chatOpen = true;
let detail = false;
let calls = [];             // the callouts that say something about the hull on the stand
let calloutAt = 0;
let calloutT = 0;
let calloutLast = 0;
let raf = 0;
let sized = 0;

const sizeKey = () => innerWidth + innerHeight * 4096;

export const yard = {
  attach(o) {
    ctx = o;
    // Deals and pushes are per run, and nothing in here is saved — a new game inherited the
    // prices the last one talked the broker down to otherwise.
    ctx.sim.on(kind => {
      if (kind === 'reset') { offerKey = ''; deals = new Map(); tries = new Map(); told = new Set(); }
    });
    return yard;
  },
  get isOpen() { return live; },

  open() {
    hulls = content.all('ship');
    idx = 0;
    detail = false;
    chatOpen = true;
    chat = [];
    rollOffers();
    broker = pickBroker();
    ensureRoot();
    live = true;
    root.classList.add('live');
    document.body.classList.add('in-yard');
    requestAnimationFrame(() => root.classList.add('in'));
    show(0, true);
    connect();
    cancelAnimationFrame(raf);
    calloutLast = performance.now();
    tick();
  },

  close() {
    if (!live) return;
    live = false;
    cancelAnimationFrame(raf);
    document.body.classList.remove('in-yard');
    root.classList.remove('in');
    setTimeout(() => { if (!live) { root.classList.remove('live'); root.innerHTML = ''; } }, 280);
  },

  refresh() { if (live) { rollOffers(); draw(); } },

  // What the terminal's tile says. The tile is drawn before the yard has ever been opened, so the
  // offers have to be rollable from the state alone.
  boardLine(st) {
    rollOffers();
    const live = [...offers.keys()].map(offerFor).filter(Boolean);
    const n = live.length;
    if (!st.ships.length) return n ? `${n} on offer · you own nothing that flies` : 'You own nothing that flies';
    if (!n) return 'Hulls for sale · trade-ins';
    const soon = Math.min(...live.map(leftOn));
    return soon <= Y.time.urgent
      ? `${n} discounted · ${Y.countdown.sale(soon).toLowerCase()}`
      : `${n} hull${n > 1 ? 's' : ''} discounted right now`;
  },
};

/* ── the board ──────────────────────────────────────────────────────────── */

const day = () => ctx.sim.state.week * Y.time.daysPerWeek;

// Days left on a window, or 0 once it is gone. Nothing between ticks moves it — a week is seven
// days at a time — so the number on the chip is honest about how many ticks you have.
const leftOn = w => (w ? Math.max(0, w.endDay - day()) : 0);

function windowDays(bands, cut, r) {
  const b = bands.find(x => cut <= x.upTo) || bands[bands.length - 1];
  return b.from + r() * (b.to - b.from);
}

// Offers are drawn once per block off the run seed, so two players in the same seed see the same
// yard — but each one then runs its own window from the start of that block and can be off the
// board long before the block turns over.
function rollOffers() {
  const seed = ctx.sim.seed || 1;
  const block = Math.floor(ctx.sim.state.week / Y.sale.everyWeeks);
  const key = `${seed}:${block}`;
  if (offerKey === key) return;
  offerKey = key;
  offers = new Map();
  const from = block * Y.sale.everyWeeks * Y.time.daysPerWeek;
  for (const h of content.all('ship')) {
    const r = createRng((hashSeed(h.id) ^ (seed + block * 7919)) >>> 0);
    if (!r.chance(Y.sale.chance)) continue;
    const cut = r.pick(Y.sale.cuts);
    const days = windowDays(Y.sale.windows, cut, r);
    offers.set(h.id, { cut, days, reason: r.pick(Y.sale.reasons), endDay: from + days });
  }
}

// Everything downstream reads the board and the desk through these two, so an expired window is
// simply not there rather than something every caller has to remember to check.
const offerFor = id => { const o = offers.get(id); return o && o.endDay > day() ? o : null; };
const dealFor = id => { const d = deals.get(id); return d && d.endDay > day() ? d : null; };

function pickBroker() {
  const r = createRng(((ctx.sim.seed || 1) * 2654435761) >>> 0);
  const list = content.voice.brokers;
  return content.voice.npcs[r.pick(list)];
}

// What the board says before the player has talked to anybody, which is also the ceiling on what
// they can be quoted — the sim clamps the charge to it either way, so a higher number on the rail
// is only ever a lie.
function boardPrice(id) {
  const def = content.get('ship', id);
  return Math.round(def.cost * (1 - (offerFor(id)?.cut || 0)));
}

function priceFor(id) {
  return dealFor(id)?.price ?? boardPrice(id);
}

const hull = () => hulls[idx];

const spendable = () => ctx.sim.spendable();

/* ── the conversation ───────────────────────────────────────────────────── */

function say(who, text, cls = '') { chat.push({ who, text, cls }); drawChat(); }

function connect() {
  chat = [{ who: 'sys', text: `Raising ${broker.name}…`, cls: 'wait' }];
  drawChat();
  setTimeout(() => {
    if (!live) return;
    chat = [];
    say('npc', npcSay(broker.id, 'yard_connect', ctx.sim.profile).text);
    pitch();
  }, 950);
}

// Walking up to a hull. If a price the player already agreed has run out, or the board has taken
// its sale off since they last looked, that is the first thing out of the broker's mouth — a
// countdown nobody ever mentions again is just a number that quietly stopped mattering.
function pitch() {
  const h = hull();
  const stale = deals.get(h.id) && !dealFor(h.id);
  const gone = offers.get(h.id) && !offerFor(h.id);
  if (stale && !told.has('d:' + h.id)) {
    told.add('d:' + h.id);
    say('npc', npcSay(broker.id, 'yard_lapsed', ctx.sim.profile, {
      hull: h.name, price: cr(boardPrice(h.id)) + ' cr',
    }).text, 'firm');
  } else if (gone && !told.has('s:' + h.id)) {
    told.add('s:' + h.id);
    say('npc', npcSay(broker.id, 'yard_gone', ctx.sim.profile, {
      hull: h.name, price: cr(boardPrice(h.id)) + ' cr',
    }).text, 'firm');
  }

  const off = offerFor(h.id);
  const d = dealFor(h.id);
  const left = leftOn(d || off);
  say('npc', npcSay(broker.id, 'yard_pitch', ctx.sim.profile, {
    hull: h.name, price: cr(priceFor(h.id)) + ' cr', cut: pct(off?.cut || 0, 0),
    hold: (d ? Y.countdown.deal : Y.countdown.sale)(left || 1).toLowerCase(),
  }, { onSale: !!off, held: !!d, urgent: !!(off || d) && left <= Y.time.urgent }).text);
}

// One roll, seeded off who the player decided to be. `hard` is the second ask, which either lands
// properly or costs them the ground they already took.
function haggleOdds(hard) {
  const p = ctx.sim.profile;
  let o = Y.haggle.base;
  for (const t of p.traits || []) o += Y.haggle.perTrait[t] || 0;
  o += Y.haggle.perPersonality[p.personality] || 0;
  o += Y.haggle.perOrigin[p.origin] || 0;
  if (hard) o += Y.haggle.hardWin;
  return Math.max(0.05, Math.min(0.92, o));
}

function askPrice() {
  const h = hull();
  const n = tries.get(h.id) || 0;
  if (n >= Y.haggle.tries) return;
  const hard = n > 0;
  const asked = playerSay(hard ? 'yard_push' : 'yard_ask', ctx.sim.profile);
  say('you', asked.text);
  tries.set(h.id, n + 1);
  const r = createRng((hashSeed(h.id + ':' + n) ^ ((ctx.sim.seed || 1) + ctx.sim.state.week * 31)) >>> 0);
  const won = r.chance(haggleOdds(hard));
  setTimeout(() => {
    if (!live) return;
    const now = priceFor(h.id);
    const board = boardPrice(h.id);
    if (won) {
      const cut = Y.haggle.win.min + r() * (Y.haggle.win.max - Y.haggle.win.min);
      const price = Math.round(now * (1 - cut));
      // the window is drawn against how far under the board they have come in total, not against
      // this one concession — a second win on top of a first is a price they hold for even less
      const off = Math.max(0, 1 - price / board);
      const days = windowDays(Y.haggle.holds, off, r);
      deals.set(h.id, { price, cut: off, days, endDay: day() + days });
      told.delete('d:' + h.id);
      say('npc', npcSay(broker.id, 'yard_deal', ctx.sim.profile, {
        price: cr(price) + ' cr', hold: Y.countdown.deal(days).toLowerCase(),
      }, asked.flags).text, 'deal');
    } else if (hard) {
      // pushing a broker who has already moved costs some of what you took off them, but never
      // more than they took — the yard's own discount is not the broker's to withdraw
      const d = dealFor(h.id);
      if (d) deals.set(h.id, { ...d, price: Math.min(board, Math.round(now * (1 + Y.haggle.hardLoss))) });
      say('npc', npcSay(broker.id, 'yard_firm', ctx.sim.profile).text, 'firm');
    } else {
      say('npc', npcSay(broker.id, 'yard_no', ctx.sim.profile, {}, asked.flags).text, 'firm');
    }
    draw();
  }, 700);
}

function buy() {
  const h = hull();
  const price = priceFor(h.id);
  if (spendable() < price) return;
  const first = !ctx.sim.state.ships.length;
  ctx.sim.act({ type: 'buyShip', class: h.id, price });
  say('npc', npcSay(broker.id, 'yard_sold', ctx.sim.profile, {}, { first }).text, 'deal');
  draw();
}

/* ── the frame ──────────────────────────────────────────────────────────── */

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('yard');
  if (!root) {
    root = document.createElement('div');
    root.id = 'yard';
    document.body.appendChild(root);
  }
  root.innerHTML = '';
  root.addEventListener('click', onClick);
  wireSwipe();
  wireResize();
  return root;
}

function onClick(e) {
  const b = e.target.closest('[data-y]');
  if (!b) return;
  const a = b.dataset.y;
  if (a === 'next') return show(idx + 1);
  if (a === 'prev') return show(idx - 1);
  if (a === 'to') return show(+b.dataset.i);
  if (a === 'detail') { detail = !detail; return draw(); }
  if (a === 'chat') { chatOpen = !chatOpen; return draw(); }
  if (a === 'ask') return askPrice();
  if (a === 'buy') return buy();
  if (a === 'out') return ctx.onLeave?.();
}

function show(n, force = false) {
  const to = (n + hulls.length) % hulls.length;
  if (to === idx && !force) return;
  idx = to;
  detail = false;
  calloutAt = 0;
  calloutT = 0;
  calls = Y.callouts.filter(c => c.label(hull()));
  showcaseShip(ctx.app, ctx.world, ctx.camera, hull().id);
  sized = sizeKey();
  draw();
  if (!force && chat.length) pitch();
}

function draw() {
  const h = hull();
  const st = ctx.sim.state;
  const off = offerFor(h.id);
  const price = priceFor(h.id);
  const held = dealFor(h.id);
  const deal = !!held;
  const left = leftOn(held || off);
  const clock = held || off
    ? `<span class="y-clock${left <= Y.time.urgent ? ' hot' : ''}">${esc((deal ? Y.countdown.deal : Y.countdown.sale)(left))}</span>`
    : '';
  const can = spendable() >= price;
  const asks = Y.haggle.tries - (tries.get(h.id) || 0);
  const ordered = ctx.sim.queued('buyShip').some(a => a.class === h.id);

  root.innerHTML = `
<div class="y-top">
  <button class="y-out" data-y="out" aria-label="Back to applications">‹</button>
  <div class="y-where"><b>Ledger Yard</b><s>${esc(broker.role)}</s></div>
  <div class="y-cash">${cr(st.cash)}<s>cr</s></div>
</div>

<div class="y-calls" aria-hidden="true"></div>

<div class="y-floor">
  <div class="y-rail">
    <button class="y-arrow" data-y="prev" aria-label="Previous hull">‹</button>
    <div class="y-card">
      ${off || deal ? `<u class="${deal ? 'deal' : ''}">${deal
        ? 'Agreed with the desk'
        : `${pct(off.cut, 0)} off · ${esc(off.reason)}`}</u>` : ''}
      <b>${esc(h.name)}</b>
      <div class="y-price">
        ${price < h.cost ? `<i>${cr(h.cost)}</i>` : ''}
        <em class="${can ? '' : 'short'}">${cr(price)}</em><s>cr</s>
      </div>
      ${clock}
    </div>
    <button class="y-arrow" data-y="next" aria-label="Next hull">›</button>
  </div>

  <div class="y-dots">
    ${hulls.map((x, i) => `<button data-y="to" data-i="${i}" class="${i === idx ? 'on' : ''}" aria-label="${esc(x.name)}"></button>`).join('')}
  </div>

  <div class="y-acts">
    <button class="y-ghost" data-y="detail">${detail ? 'Hide the sheet' : 'Show the sheet'}</button>
    <button class="y-ghost" data-y="ask" ${asks > 0 ? '' : 'disabled'}>
      ${asks > 0 ? 'Talk the price' : 'No further'}
    </button>
    <button class="y-buy" data-y="buy" ${can && !ordered ? '' : 'disabled'}>
      ${ordered ? 'Ordered' : can ? 'Buy' : 'Short'}
    </button>
  </div>

  ${detail ? sheetHtml(h, off) : ''}
  ${chatHtml()}
</div>`;
  const log = root.querySelector('.y-log');
  if (log) log.scrollTop = log.scrollHeight;
}

function sheetHtml(h, off) {
  const u = Y.speedUnit;
  const rows = [
    ['Hold', `${h.hold} t`],
    ['Cuts ore', h.mine > 0 ? `${h.mine} t a week` : '—'],
    ['Cruise', `${h.speed.toFixed(2)}× ${u.name}`],
    ['Upkeep', `${cr(h.upkeep)} cr a week`],
    ['Over all', `${h.hull.len} m`],
    ['Board price', `${cr(h.cost)} cr`],
  ];
  if (off) {
    rows.push(['On the board', `−${pct(off.cut, 0)} · ${off.reason.toLowerCase()}`]);
    rows.push(['Sale runs', Y.countdown.sale(leftOn(off))]);
  }
  const d = dealFor(h.id);
  if (d) rows.push(['Agreed with the desk', `${cr(d.price)} cr · ${Y.countdown.deal(leftOn(d)).toLowerCase()}`]);
  return `
<div class="y-sheet">
  <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <p>${esc(u.blurb)}</p>
</div>`;
}

function chatHtml() {
  const p = ctx.sim.profile;
  return `
<div class="y-chat${chatOpen ? ' open' : ''}">
  <button class="y-chat-head" data-y="chat">
    <span class="y-face" style="background-image:url(assets/faces/${esc(broker.face)}.jpg)"></span>
    <span class="y-who"><b>${esc(broker.name)}</b><s>${chat.some(c => c.cls === 'wait') ? 'connecting…' : 'on the line'}</s></span>
    <em>${chatOpen ? '⌄' : '⌃'}</em>
  </button>
  <div class="y-log">
    ${chat.map(c => `<p class="${c.who} ${c.cls}"><s>${esc(c.who === 'you' ? p.name : c.who === 'npc' ? broker.name : 'Ledger')}</s>${esc(c.text)}</p>`).join('')}
  </div>
</div>`;
}

function drawChat() {
  const box = root?.querySelector('.y-chat');
  if (!box) return draw();
  box.outerHTML = chatHtml();
  const log = root.querySelector('.y-log');
  if (log) log.scrollTop = log.scrollHeight;
}

/* ── the labels on the metal ────────────────────────────────────────────── */

// One at a time, moved on every few seconds, because the hull is turning and a label that stays on
// the same lump of it while the lump goes round the back is worse than no label at all.
function tick() {
  raf = requestAnimationFrame(tick);
  if (!live) return;
  const layer = root.querySelector('.y-calls');
  if (!layer) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - calloutLast) / 1000);
  calloutLast = now;

  const h = hull();
  if (!calls.length) { layer.classList.remove('on'); return; }

  const T = Y.calloutTiming;
  calloutT += dt;
  if (calloutT > T.hold) { calloutT = 0; calloutAt = (calloutAt + 1) % calls.length; }

  const c = calls[calloutAt % calls.length];
  const p = showcasePoint(ctx.app.camera, c.at, innerWidth, innerHeight);
  if (!p || !p.front) { layer.classList.remove('on'); return; }

  const fade = Math.min(1, calloutT / T.fade) * Math.min(1, (T.hold - calloutT) / T.fade);

  if (layer.dataset.k !== c.id) {
    layer.dataset.k = c.id;
    layer.innerHTML = `
<svg class="y-lead"><line x1="0" y1="0" x2="0" y2="0"/><circle cx="0" cy="0" r="3"/></svg>
<div class="y-tag"><b>${esc(c.label(h))}</b><s>${esc(c.note)}</s></div>`;
  }
  layer.classList.add('on');
  layer.style.opacity = fade.toFixed(2);
  const tag = layer.querySelector('.y-tag');
  // The label goes on whichever side of the anchor has room for it, and if neither has, it is
  // pinned to the edge and the leader stretches — a tag half off the screen is worse than a long
  // line, and on a phone held upright it is off the screen more often than not.
  const tw = tag.offsetWidth || 180;
  // sideways the rail and the chat own the right of the frame, so the label may not go there
  const edge = innerWidth > innerHeight ? innerWidth * 0.5 : innerWidth - 10;
  const right = p.x + 74 + tw < edge;
  const lx = right
    ? Math.max(10, p.x + 74)
    : Math.max(tw + 10, Math.min(edge, p.x - 74));
  const ly = Math.max(tag.offsetHeight + 96, p.y - 26);
  tag.style.left = `${lx}px`;
  tag.style.top = `${ly}px`;
  tag.classList.toggle('flip', !right);
  const svg = layer.querySelector('svg');
  const line = svg.querySelector('line');
  const dot = svg.querySelector('circle');
  line.setAttribute('x1', p.x); line.setAttribute('y1', p.y);
  line.setAttribute('x2', lx); line.setAttribute('y2', ly);
  dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
}

/* ── the rail is the only thing that swipes ─────────────────────────────── */

// One finger owns the swipe from the moment it lands. The second finger of a pinch on the hull
// lands on the rail whenever the rail is near it — sideways it always is — and it used to both
// take over the start point and page the board as the pinch opened, so a non-primary pointer is
// not a swipe at all.
function wireSwipe() {
  let id = null, x0 = 0, y0 = 0;
  const start = e => {
    if (id !== null || !e.isPrimary || !e.target.closest('.y-rail')) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY;
  };
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 42 && Math.abs(e.clientY - y0) < 60) show(idx + (dx < 0 ? 1 : -1));
  };
  root.addEventListener('pointerdown', start);
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', e => { if (e.pointerId === id) id = null; });
}

// A turned phone changes both the fov the hull is framed at and the distance it is framed from,
// and the room's own resize stands down while the terminal has the frame, so the yard takes its
// framing again itself.
function wireResize() {
  let t = 0;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!live || sizeKey() === sized) return;
      sized = sizeKey();
      frameShowcase(ctx.camera);
    }, 220);
  });
}

export default yard;
