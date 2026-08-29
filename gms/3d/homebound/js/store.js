// The base store: six upgrade cards and the POWER number they feed.
//
// The whole screen is built around one teaching job. Levels are gated on
// `playerPower()`, so the player has to connect "I bought a thing" with "the
// number at the top went up" with "that level stopped saying no". That is why
// POWER sits in the header at display size, why a purchase animates it upward
// instead of swapping the text, and why every card shows current → next rather
// than just a price.
//
// This module never routes. It emits `ui:nav` and `ui:popup` and lets menus.js
// decide what that means, which keeps the import graph one-way: menus → store,
// never back.

import { UPGRADES, TIERS } from './config.js';
import { P, upLevel, upCost, upMaxed, buyUpgrade, playerPower, canAfford } from './save.js';
import { on, emit } from './bus.js';
import { $, el, fmt, approach } from './utils.js';
import { sfx } from './audio.js';

let root = null;
let cards = new Map();       // upgradeId → { node, ... }
let powerEl = null, cashEl = null;
let shownPower = 0;          // eased, so the number visibly climbs on a buy
let raf = 0;

export function initStore() {
  root = $('#store-screen');
  if (!root || root.dataset.built) return;
  root.dataset.built = '1';

  root.innerHTML = `
    <div class="scr scr-store">
      <header class="scr-top">
        <button class="rnd-btn back" data-act="back" aria-label="Back">◀</button>
        <h1>ARMOURY</h1>
        <div class="cash-chip big"><span>💰</span><b id="store-cash">0</b></div>
      </header>

      <div class="power-band">
        <span class="pb-label">POWER</span>
        <b id="store-power">0</b>
        <span class="pb-note">levels unlock at power</span>
      </div>

      <div class="scr-scroll" id="store-list"></div>
    </div>`;

  powerEl = $('#store-power', root);
  cashEl = $('#store-cash', root);
  const list = $('#store-list', root);

  for (const u of UPGRADES) list.appendChild(buildCard(u));

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') emit('ui:nav', { to: 'main' });
    if (b.dataset.act === 'buy') onBuy(b.dataset.id, b);
  });

  // A purchase can happen from anywhere (a level-select shortcut, a popup), so
  // the screen refreshes off the bus rather than off its own click handler.
  on('upgrade:bought', () => refresh());
  on('cash:change', () => { if (visible()) refresh(); });

  shownPower = playerPower();
}

export function showStore() {
  if (!root) initStore();
  root.classList.remove('hidden');
  refresh();
  shownPower = playerPower();
  powerEl.textContent = fmt(shownPower);
  tick();
}

export function hideStore() {
  root?.classList.add('hidden');
  cancelAnimationFrame(raf); raf = 0;
}

const visible = () => root && !root.classList.contains('hidden');

// --------------------------------------------------------------------------
// Cards
// --------------------------------------------------------------------------

function buildCard(u) {
  const n = el('div', 'up-card');
  n.dataset.id = u.id;
  n.innerHTML = `
    <div class="uc-icon"><span>${u.icon}</span><i class="uc-lvl">0</i></div>
    <div class="uc-mid">
      <b class="uc-name">${u.name}</b>
      <div class="uc-effect"><span class="uc-now">—</span><i class="uc-arrow">▸</i><span class="uc-next">—</span></div>
      <div class="uc-pips"></div>
    </div>
    <button class="buy-btn" data-act="buy" data-id="${u.id}">
      <span class="bb-cost">$0</span><span class="bb-word">BUY</span>
    </button>`;
  cards.set(u.id, {
    node: n,
    lvl: $('.uc-lvl', n), now: $('.uc-now', n), next: $('.uc-next', n),
    pips: $('.uc-pips', n), btn: $('.buy-btn', n),
    cost: $('.bb-cost', n), word: $('.bb-word', n),
  });
  return n;
}

function refresh() {
  if (!root) return;
  const cash = P().cash;
  cashEl.textContent = fmt(cash);

  for (const u of UPGRADES) {
    const c = cards.get(u.id);
    const lv = upLevel(u.id);
    const maxed = upMaxed(u.id);
    const cost = upCost(u.id);

    c.lvl.textContent = String(lv);
    c.now.textContent = lv > 0 ? u.fmt(lv) : 'none';
    c.next.textContent = maxed ? 'MAX' : u.fmt(lv + 1);
    c.node.classList.toggle('maxed', maxed);
    c.node.classList.toggle('affordable', !maxed && cash >= cost);

    // Pips are the progress bar for a 40-level upgrade that would look absurd
    // as 40 dots, so they are bucketed: eight pips, each worth max/8.
    const buckets = 8;
    const on_ = Math.round((lv / u.max) * buckets);
    if (c.pips.childElementCount !== buckets) {
      c.pips.innerHTML = '';
      for (let i = 0; i < buckets; i++) c.pips.appendChild(el('i'));
    }
    [...c.pips.children].forEach((p, i) => p.classList.toggle('on', i < on_));

    c.btn.disabled = maxed || cash < cost;
    c.cost.textContent = maxed ? '' : '$' + fmt(cost);
    c.word.textContent = maxed ? 'MAXED' : 'BUY';
  }

  const p = playerPower();
  powerEl.dataset.target = String(p);
}

function onBuy(id, btn) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return;
  if (upMaxed(id)) return;

  const cost = upCost(id);
  if (!canAfford(cost)) {
    btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope');
    emit('ui:popup', {
      title: 'NOT ENOUGH CASH',
      body: `${u.name} costs $${fmt(cost)}. You have $${fmt(P().cash)}.\nRun a level — even a loss pays.`,
      actions: [{ label: 'RUN A LEVEL', kind: 'primary', nav: 'play' }, { label: 'STAY', kind: 'ghost' }],
    });
    return;
  }

  const before = playerPower();
  if (!buyUpgrade(id)) return;
  sfx('buy');

  const card = cards.get(id).node;
  card.classList.remove('bought'); void card.offsetWidth; card.classList.add('bought');

  // The point of the whole screen: make the power number move, loudly, and
  // say by how much.
  const gain = playerPower() - before;
  powerEl.parentElement.classList.remove('surge'); void powerEl.parentElement.offsetWidth;
  powerEl.parentElement.classList.add('surge');
  floatGain(gain);

  if (u.id === 'start') {
    emit('hud:toast', { icon: '▲', text: 'DEPLOYING AS ' + TIERS[Math.min(upLevel('start'), TIERS.length - 1)].name });
  }
  refresh();
  tick();
}

function floatGain(gain) {
  if (gain <= 0) return;
  const f = el('span', 'power-gain', '+' + fmt(gain));
  powerEl.parentElement.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

// The power number rolls rather than snaps. Own rAF because updateStore is not
// in the frame loop, and it stops itself the moment it arrives — a permanent
// rAF behind a 3D scene is a permanent tax.
function tick() {
  cancelAnimationFrame(raf);
  const step = () => {
    const target = Number(powerEl.dataset.target || playerPower());
    shownPower = approach(shownPower, target, 0.999, 1 / 60);
    if (Math.abs(shownPower - target) < 0.5) { shownPower = target; powerEl.textContent = fmt(target); raf = 0; return; }
    powerEl.textContent = fmt(shownPower);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// Exposed so menus.js can jump straight to the card a power gate blames.
export function flashUpgrade(id) {
  const c = cards.get(id);
  if (!c) return;
  c.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  c.node.classList.remove('bought'); void c.node.offsetWidth; c.node.classList.add('bought');
}
