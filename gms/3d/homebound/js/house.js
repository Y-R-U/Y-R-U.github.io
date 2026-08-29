// HOME — the block of land, the debt, and the money sink that eventually pays
// you back a little.
//
// No Three.js in here on purpose. The land is one inline SVG scene built once
// and then re-textured: buildings are `<g>` slots that get filled or emptied as
// levels change, so a purchase never rebuilds the picture. Everything that
// moves (chimney smoke, crops swaying, the collect pill) is a CSS transform on
// a group, because this screen can be open while the autoplay backdrop is still
// rendering behind it.
//
// The economy has two acts and they are deliberately not the same shape:
//
//   Act 1 — DEBT. $12,000 and nothing else is purchasable. There is exactly one
//   verb (pay) and the whole screen is a bar going down. This is chapter 2's
//   entire content, so it has to feel like progress: a running total, a
//   percentage, and the family saying something different at every quarter.
//
//   Act 2 — BUILD. Plots, then buildings on them, at costs that run from $400
//   to a quarter of a million. Buildings pay an hourly rate that accrues while
//   the game is closed, capped at ECON.offlineCapHours so a week away is not a
//   windfall. The rate is real but small next to the prices — the land is a
//   sink with a tap on it, not an idle game.

import { ECON } from './config.js';
import { P, save, spend, canAfford, payDebt, pendingIncome, collectIncome, isUnlocked } from './save.js';
import { on, emit } from './bus.js';
import { $, el, fmt, fmtMoney, fmtTime, clamp } from './utils.js';

// The debt is the one number in the game that must be shown to the dollar.
// fmt()'s "12K" is right for a troop count read at speed and wrong here: a $100
// payment against $12,000 has to visibly move, or the player stops making them.
const exact = (n) => '$' + Math.round(n).toLocaleString('en-US');
import { sfx } from './audio.js';

// --------------------------------------------------------------------------
// The land
// --------------------------------------------------------------------------

// Plot 1 comes with the house. Each further plot is a wall the player has to
// save through — the jump is steep because a plot unlocks a whole price band.
const PLOT_MAX = 3;
const plotCost = (n) => Math.round(5000 * Math.pow(3.4, n - 2));   // plot 2 $5k, plot 3 $17k

// `rate` is dollars per hour at that level. The ladder is tuned so each new
// band roughly triples the income and roughly quadruples the price: income
// always trails the sink, which is what keeps runs worth doing.
const BUILDINGS = [
  { id: 'house',    name: 'THE HOUSE',      icon: '🏠', plot: 1, max: 6,  base: 900,    growth: 1.90, rate: (l) => l * 6,
    blurb: 'Every level here lifts the whole block by 15%.' },
  { id: 'garden',   name: 'VEGETABLE PLOT', icon: '🥕', plot: 1, max: 10, base: 350,    growth: 1.42, rate: (l) => l * 8 },
  { id: 'coop',     name: 'CHICKEN COOP',   icon: '🐔', plot: 1, max: 10, base: 1400,   growth: 1.46, rate: (l) => l * 22 },
  { id: 'orchard',  name: 'ORCHARD',        icon: '🌳', plot: 2, max: 10, base: 6000,   growth: 1.50, rate: (l) => l * 70 },
  { id: 'workshop', name: 'WORKSHOP',       icon: '🔧', plot: 2, max: 10, base: 18000,  growth: 1.55, rate: (l) => l * 180 },
  { id: 'barn',     name: 'BARN',           icon: '🚜', plot: 3, max: 10, base: 72000,  growth: 1.60, rate: (l) => l * 450 },
  { id: 'solar',    name: 'SOLAR ARRAY',    icon: '🔆', plot: 3, max: 10, base: 260000, growth: 1.66, rate: (l) => l * 1200 },
];
// Sanity check on the shape of that table, because it is the one place the
// whole economy can quietly go wrong: a full plot-1 build (~lv 5) pays about
// $200/hr, which is roughly one story level's reward per waking hour — a real
// trickle you notice and never a replacement for running. Maxing everything
// pays ~$37K/hr against a build cost north of $60M, so the land stays a sink
// with a tap on it. Income scales ~linearly; cost scales geometrically.

const B_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

const bLevel = (id) => P().home.buildings?.[id] || 0;
const bCost = (b) => Math.round(b.base * Math.pow(b.growth, bLevel(b.id)));

// What the family says, keyed to how much of the mortgage is gone. The lines
// are the reward for a screen whose only verb is "pay", so they carry the arc:
// frightened → working → nearly → free.
const FAMILY_LINES = [
  [0.00, '🏠', 'The bank called again this morning.'],
  [0.15, '🏠', 'It is going down. Slowly, but it is going down.'],
  [0.40, '🏠', 'The kids asked if we get to stay. I said yes.'],
  [0.70, '🏠', 'Almost. I can nearly see the end of it.'],
  [0.95, '🏠', 'One more run and this house is ours.'],
];

// `?build=N` stands the whole block up at level N so the land art can be
// reviewed without spending half a million dollars. Same spirit as `?level=`.
const BUILD_ARG = parseInt(new URLSearchParams(location.search).get('build') || '0', 10) || 0;

let root = null;
let R = null;
let ticker = 0;
let built = false;

export function initHouse(/* ctx */) {
  root = $('#home-screen');
  if (!root || built) return;
  built = true;

  root.innerHTML = `
    <div class="scr scr-home">
      <header class="scr-top">
        <button class="rnd-btn back" data-act="back" aria-label="Back">◀</button>
        <h1>HOME</h1>
        <div class="cash-chip big"><span>💰</span><b id="home-cash">0</b></div>
      </header>

      <div class="land">
        ${LAND_SVG}
        <button class="collect" id="home-collect" data-act="collect">
          <span class="col-icon">💵</span>
          <span class="col-txt"><b id="col-amt">$0</b><i id="col-rate">$0/hr</i></span>
        </button>
        <div class="land-tag" id="land-tag">1 PLOT</div>
      </div>

      <div class="scr-scroll" id="home-body"></div>
    </div>`;

  R = {
    cash: $('#home-cash', root),
    body: $('#home-body', root),
    collect: $('#home-collect', root),
    amt: $('#col-amt', root),
    rate: $('#col-rate', root),
    tag: $('#land-tag', root),
    svg: $('.land svg', root),
  };

  if (BUILD_ARG > 0) {
    const h = P().home;
    h.owned = true; h.debt = 0; h.plots = PLOT_MAX; h.lastCollect = Date.now() - 6 * 3.6e6;
    for (const b of BUILDINGS) h.buildings[b.id] = Math.min(b.max, BUILD_ARG);
    save(true);
  }

  root.addEventListener('click', onClick);
  on('cash:change', () => { if (visible()) { R.cash.textContent = fmt(P().cash); refreshBody(); } });
  on('debt:paid', () => { paintLand(); refreshBody(); });
}

export function showHouse() {
  if (!built) initHouse();
  // Owning the block is what starts the offline clock. Doing it here rather
  // than at unlock time means the timer starts when the player first *sees* the
  // land, not when a level clear silently flipped a flag.
  const h = P().home;
  if (!h.owned) { h.owned = true; h.lastCollect = Date.now(); save(true); }

  root.classList.remove('hidden');
  R.cash.textContent = fmt(P().cash);
  paintLand();
  refreshBody();
  refreshCollect();
  clearInterval(ticker);
  ticker = setInterval(refreshCollect, 1000);
}

export function hideHouse() {
  root?.classList.add('hidden');
  clearInterval(ticker); ticker = 0;
}

// Exported for the frame loop if it ever gets wired (see the MANAGER note in
// menus.js). The 1s interval above does the same job meanwhile; both are
// idempotent, so having both running is harmless.
export function updateHouse(dt) {
  if (!visible()) return;
  ticker || refreshCollect();
  void dt;
}

// Dollars per hour, all buildings summed and lifted by the house's own level.
// menus.js and anything else that wants the number calls this rather than
// re-deriving it, because `pendingIncome(rate)` must be given the same rate
// that `collectIncome(rate)` is given or the player is quietly robbed.
export function houseIncomeRate() {
  const p = P();
  if (!p.home.owned || p.home.debt > 0) return 0;   // the bank takes it all first
  let sum = 0;
  for (const b of BUILDINGS) {
    const lv = bLevel(b.id);
    if (lv > 0 && b.id !== 'house') sum += b.rate(lv);
  }
  const houseLv = bLevel('house');
  if (houseLv > 0) sum += b_house_rate(houseLv);
  return Math.round(sum * (1 + houseLv * 0.15));
}
const b_house_rate = (l) => B_BY_ID.house.rate(l);

const visible = () => root && !root.classList.contains('hidden');

// --------------------------------------------------------------------------
// Clicks
// --------------------------------------------------------------------------

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;

  if (act === 'back') return emit('ui:nav', { to: 'main' });
  if (act === 'collect') return doCollect();
  if (act === 'pay') return doPay(b.dataset.amount);
  if (act === 'buy') return doBuy(b.dataset.id, b);
  if (act === 'plot') return doPlot(b);
}

function doCollect() {
  const rate = houseIncomeRate();
  const got = collectIncome(rate);
  if (got <= 0) {
    if (rate <= 0) {
      emit('ui:popup', {
        title: 'NOTHING TO COLLECT',
        body: P().home.debt > 0
          ? 'Every cent the land makes goes straight to the bank until the debt is clear.'
          : 'Build something first. A vegetable plot pays from the hour you plant it.',
        actions: [{ label: 'OK', kind: 'primary' }],
      });
    }
    return;
  }
  sfx('coin');
  pop(R.collect, 'bump');
  emit('hud:toast', { icon: '💵', text: 'COLLECTED ' + fmtMoney(got) });
  refreshCollect();
}

// The three pay buttons exist so the act has weight at every scale: a $100 tap
// when you are broke, and PAY ALL when a good run finally covers the rest.
function doPay(kind) {
  const p = P();
  const debt = p.home.debt;
  if (debt <= 0) return;
  let want = kind === 'all' ? Math.min(p.cash, debt) : Math.min(Number(kind) || 0, debt);
  if (want <= 0 || !canAfford(want)) {
    emit('ui:popup', {
      title: 'NOT ENOUGH',
      body: `You have ${fmtMoney(p.cash)}. Every run pays, and a lost run still pays a quarter.`,
      actions: [{ label: 'RUN A LEVEL', kind: 'primary', nav: 'play' }, { label: 'STAY', kind: 'ghost' }],
    });
    return;
  }
  const paid = payDebt(want);
  if (paid <= 0) return;
  sfx('coin');

  if (p.home.debt <= 0) {
    // The one moment this whole chapter exists for.
    emit('ui:popup', {
      title: 'THE HOUSE IS YOURS',
      body: 'Deed clear. The land is yours to build on, and every hour it works whether you are here or not.',
      actions: [{ label: 'START BUILDING', kind: 'primary' }],
    });
    emit('unlock', { what: 'home-built' });
    P().home.lastCollect = Date.now();
    save(true);
  }
  paintLand();
  refreshBody();
}

function doBuy(id, btn) {
  const b = B_BY_ID[id];
  if (!b) return;
  if (P().home.debt > 0) return;
  const lv = bLevel(id);
  if (lv >= b.max) return;
  const cost = bCost(b);
  if (!spend(cost)) { pop(btn, 'nope'); return; }

  const p = P();
  p.home.buildings[id] = lv + 1;
  save(true);
  sfx('buy');
  pop(btn.closest('.up-card'), 'bought');
  paintLand();
  refreshBody();
  refreshCollect();
  emit('hud:toast', { icon: b.icon, text: `${b.name} LV${lv + 1} · ${fmtMoney(houseIncomeRate())}/hr` });
}

function doPlot(btn) {
  const p = P();
  if (p.home.debt > 0) return;
  const next = (p.home.plots || 1) + 1;
  if (next > PLOT_MAX) return;
  const cost = plotCost(next);
  if (!spend(cost)) { pop(btn, 'nope'); return; }
  p.home.plots = next;
  save(true);
  sfx('buy');
  paintLand();
  refreshBody();
}

// --------------------------------------------------------------------------
// The body: debt panel, or the build list
// --------------------------------------------------------------------------

function refreshBody() {
  if (!R) return;
  const p = P();
  R.cash.textContent = fmt(p.cash);
  R.body.innerHTML = '';
  if (p.home.debt > 0) R.body.appendChild(debtPanel());
  else R.body.appendChild(buildPanel());
}

function debtPanel() {
  const p = P();
  const total = ECON.debtTotal;
  const left = p.home.debt;
  const paid = total - left;
  const frac = clamp(paid / total, 0, 1);

  const wrap = el('div', 'panel debt-panel');
  wrap.innerHTML = `
    <div class="panel-head"><span class="ph-icon">🏦</span><b>THE MORTGAGE</b></div>

    <div class="debt-nums">
      <div><i>OWED</i><b class="big-red">${exact(left)}</b></div>
      <div class="right"><i>PAID</i><b class="big-green">${exact(paid)}</b></div>
    </div>

    <div class="debt-bar"><i style="transform:scaleX(${frac.toFixed(4)})"></i>
      <span>${Math.floor(frac * 100)}%</span></div>

    <div class="pay-row">
      <button class="fat-btn small" data-act="pay" data-amount="100">PAY $100</button>
      <button class="fat-btn small" data-act="pay" data-amount="1000">PAY $1K</button>
      <button class="fat-btn gold" data-act="pay" data-amount="all">PAY ALL<i>${exact(Math.min(p.cash, left))}</i></button>
    </div>

    <div class="family-line"><span class="fam-chip">${famLine(frac)[1]}</span><p>${famLine(frac)[2]}</p></div>

    <p class="panel-note">Nothing on this land can be bought until the deed is clear.
    Run levels, missions and events — every one of them pays.</p>`;
  return wrap;
}

function famLine(frac) {
  let out = FAMILY_LINES[0];
  for (const l of FAMILY_LINES) if (frac >= l[0]) out = l;
  return out;
}

function buildPanel() {
  const p = P();
  const plots = p.home.plots || 1;
  const wrap = el('div', 'panel');

  const rate = houseIncomeRate();
  const head = el('div', 'income-head');
  head.innerHTML = `<div><i>THE LAND EARNS</i><b>${fmtMoney(rate)}<small>/hr</small></b></div>
    <div class="right"><i>BANKS UP TO</i><b>${fmtMoney(rate * ECON.offlineCapHours)}</b></div>`;
  wrap.appendChild(head);

  for (let plot = 1; plot <= PLOT_MAX; plot++) {
    const owned = plot <= plots;
    const sec = el('div', 'plot-sec' + (owned ? '' : ' locked'));
    const title = el('div', 'plot-title');
    title.innerHTML = `<b>PLOT ${plot}</b>`;
    if (!owned) {
      const cost = plotCost(plot);
      const canBuyNow = plot === plots + 1;
      const btn = el('button', 'fat-btn small' + (canBuyNow && p.cash >= cost ? ' gold' : ''), '');
      btn.dataset.act = 'plot';
      btn.disabled = !canBuyNow;
      btn.innerHTML = canBuyNow ? `BUY LAND <i>${fmtMoney(cost)}</i>` : `NEEDS PLOT ${plot - 1}`;
      title.appendChild(btn);
    }
    sec.appendChild(title);

    for (const b of BUILDINGS.filter((x) => x.plot === plot)) sec.appendChild(buildCard(b, owned));
    wrap.appendChild(sec);
  }
  return wrap;
}

function buildCard(b, plotOwned) {
  const lv = bLevel(b.id);
  const maxed = lv >= b.max;
  const cost = bCost(b);
  const cash = P().cash;
  const affordable = plotOwned && !maxed && cash >= cost;

  const n = el('div', 'up-card home-card' + (maxed ? ' maxed' : '') + (affordable ? ' affordable' : '') + (plotOwned ? '' : ' dimmed'));
  const nowTxt = lv > 0 ? `${fmtMoney(b.rate(lv))}/hr` : (b.id === 'house' ? 'as it stands' : 'not built');
  const nextTxt = maxed ? 'MAX' : `${fmtMoney(b.rate(lv + 1))}/hr`;

  n.innerHTML = `
    <div class="uc-icon"><span>${b.icon}</span><i class="uc-lvl">${lv}</i></div>
    <div class="uc-mid">
      <b class="uc-name">${b.name}</b>
      <div class="uc-effect"><span class="uc-now">${nowTxt}</span><i class="uc-arrow">▸</i><span class="uc-next">${nextTxt}</span></div>
      ${b.blurb ? `<span class="uc-blurb">${b.blurb}</span>` : ''}
    </div>
    <button class="buy-btn" data-act="buy" data-id="${b.id}" ${!plotOwned || maxed || cash < cost ? 'disabled' : ''}>
      <span class="bb-cost">${maxed ? '' : '$' + fmt(cost)}</span>
      <span class="bb-word">${maxed ? 'MAXED' : lv ? 'UP' : 'BUILD'}</span>
    </button>`;
  return n;
}

function refreshCollect() {
  if (!R) return;
  const rate = houseIncomeRate();
  const got = pendingIncome(rate);
  R.rate.textContent = rate > 0 ? `${fmtMoney(rate)}/hr` : 'no income yet';
  R.amt.textContent = fmtMoney(got);
  R.collect.classList.toggle('ready', got > 0);
  R.collect.classList.toggle('idle', rate <= 0);

  // Tell the player when the barn stops filling. An uncapped-looking number
  // that silently stopped growing is how an idle screen loses trust.
  if (rate > 0) {
    const hrs = (Date.now() - (P().home.lastCollect || Date.now())) / 3.6e6;
    const leftS = Math.max(0, (ECON.offlineCapHours - hrs) * 3600);
    R.collect.classList.toggle('full', leftS <= 0);
    if (leftS <= 0) R.rate.textContent = 'FULL — collect it';
    else if (hrs > 0.05) R.rate.textContent = `${fmtMoney(rate)}/hr · full in ${fmtTime(leftS)}`;
  }
}

// --------------------------------------------------------------------------
// The picture
// --------------------------------------------------------------------------

// Slots are fixed rectangles in the 400×240 viewBox. Filling one is a string
// swap on a <g>, so a purchase costs one innerHTML on a group of ~10 nodes and
// never touches the rest of the scene.
// The house owns the middle (x 154..246). Everything else is laid out around it
// in three bands that never overlap it or each other, so a slot can be filled or
// emptied without any z-order thinking:
//   plot 1 = front-left, plot 2 = front-right, plot 3 = the back strips.
const SLOTS = {
  garden:   { x: 18,  y: 156, w: 84,  h: 50 },
  coop:     { x: 108, y: 166, w: 42,  h: 40 },
  orchard:  { x: 252, y: 152, w: 82,  h: 54 },
  workshop: { x: 338, y: 158, w: 48,  h: 48 },
  barn:     { x: 22,  y: 104, w: 78,  h: 42 },
  solar:    { x: 258, y: 116, w: 116, h: 26 },
};

const LAND_SVG = `
<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-label="Your block of land">
  <defs>
    <linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fb0d6"/><stop offset="1" stop-color="#cfe4ee"/>
    </linearGradient>
    <linearGradient id="lgrass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7d9450"/><stop offset="1" stop-color="#5f7a3c"/>
    </linearGradient>
    <linearGradient id="lroof" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8552f"/><stop offset="1" stop-color="#a83a20"/>
    </linearGradient>
  </defs>

  <rect width="400" height="240" fill="url(#lsky)"/>
  <circle cx="62" cy="34" r="17" fill="#ffd85e"/>
  <path d="M0 96 L70 62 L128 92 L196 56 L262 90 L330 64 L400 94 L400 120 L0 120Z" fill="#8ba07a" opacity=".75"/>
  <path d="M0 104 L58 82 L120 106 L188 78 L252 106 L322 84 L400 108 L400 240 L0 240Z" fill="url(#lgrass)"/>

  <!-- Clouds and a hedge. Purely decorative, but an unbuilt block is otherwise a
       green rectangle, and a green rectangle reads as a missing asset. -->
  <g opacity=".85" fill="#fff">
    <ellipse cx="150" cy="40" rx="22" ry="11"/><ellipse cx="166" cy="34" rx="15" ry="12"/>
    <ellipse cx="300" cy="24" rx="18" ry="9"/><ellipse cx="313" cy="19" rx="12" ry="10"/>
  </g>
  <g>
    <rect x="-4" y="150" width="16" height="66" rx="6" fill="#2f7a34" stroke="#1d4d21" stroke-width="2.5"/>
    <rect x="388" y="150" width="16" height="66" rx="6" fill="#2f7a34" stroke="#1d4d21" stroke-width="2.5"/>
  </g>

  <g id="l-plot3" class="plot-art"></g>
  <g id="sl-barn" class="b-slot"></g>
  <g id="sl-solar" class="b-slot"></g>
  <g id="sl-workshop" class="b-slot"></g>

  <!-- the house itself: always present, its level changes the silhouette -->
  <g id="l-house" transform="translate(200 150)">
    <ellipse cx="0" cy="4" rx="52" ry="8" fill="#000" opacity=".18"/>
    <rect id="h-wall" x="-38" y="-46" width="76" height="50" rx="4" fill="#efe3cc" stroke="#2b2118" stroke-width="3"/>
    <path id="h-roof" d="M-46 -44 L0 -74 L46 -44 Z" fill="url(#lroof)" stroke="#2b2118" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-8" y="-22" width="16" height="26" rx="2" fill="#7a4b25" stroke="#2b2118" stroke-width="2.5"/>
    <rect x="-30" y="-34" width="14" height="13" rx="2" fill="#8fd0ff" stroke="#2b2118" stroke-width="2.5"/>
    <rect x="16" y="-34" width="14" height="13" rx="2" fill="#8fd0ff" stroke="#2b2118" stroke-width="2.5"/>
    <g id="h-chimney" opacity="0">
      <rect x="18" y="-70" width="11" height="18" fill="#a6584a" stroke="#2b2118" stroke-width="2.5"/>
      <g class="smoke"><circle cx="24" cy="-78" r="5" fill="#fff" opacity=".8"/></g>
      <g class="smoke s2"><circle cx="27" cy="-90" r="7" fill="#fff" opacity=".55"/></g>
    </g>
    <g id="h-extras"></g>
    <g id="h-notice" opacity="0">
      <rect x="-26" y="-16" width="52" height="24" rx="3" fill="#f4efe4" stroke="#d8352f" stroke-width="3" transform="rotate(-6)"/>
      <text x="0" y="-1" transform="rotate(-6)" text-anchor="middle" font-size="9"
            font-family="Arial Black, Impact, sans-serif" fill="#d8352f">BANK</text>
    </g>
  </g>

  <g id="sl-orchard" class="b-slot"></g>
  <g id="sl-garden" class="b-slot"></g>
  <g id="sl-coop" class="b-slot"></g>

  <!-- the fence is the front edge of the property; it is what makes a green
       rectangle read as "yours" rather than as a field -->
  <g id="l-fence"></g>
</svg>`;

function paintLand() {
  if (!R?.svg) return;
  const p = P();
  const S = R.svg;
  const g = (id) => S.querySelector('#' + id);

  const houseLv = bLevel('house');
  g('h-chimney').setAttribute('opacity', houseLv >= 1 ? '1' : '0');
  g('h-notice').setAttribute('opacity', p.home.debt > 0 ? '1' : '0');
  g('h-wall').setAttribute('fill', houseLv >= 4 ? '#f7f0dd' : houseLv >= 2 ? '#efe3cc' : '#ddd0b6');

  // Extra storeys and a porch as the house levels up. It is the only building
  // whose picture has to change shape rather than multiply, because there is
  // only ever one of it.
  let extras = '';
  if (houseLv >= 2) extras += `<rect x="-46" y="0" width="92" height="6" rx="2" fill="#c9b98f" stroke="#2b2118" stroke-width="2.5"/>`;
  if (houseLv >= 3) extras += `<rect x="-44" y="-14" width="10" height="18" fill="#7a4b25" stroke="#2b2118" stroke-width="2"/>
                               <rect x="34" y="-14" width="10" height="18" fill="#7a4b25" stroke="#2b2118" stroke-width="2"/>`;
  if (houseLv >= 5) extras += `<rect x="-9" y="-64" width="18" height="14" fill="#8fd0ff" stroke="#2b2118" stroke-width="2.5"/>
                               <path d="M-13 -63 L0 -73 L13 -63 Z" fill="#a83a20" stroke="#2b2118" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (houseLv >= 6) extras += `<circle cx="0" cy="-58" r="6" fill="#f5c518" stroke="#2b2118" stroke-width="2.5"/>`;
  g('h-extras').innerHTML = extras;

  // Plots 2 and 3 are drawn as bare, roped-off dirt until bought — an empty
  // green field looks like the game forgot to draw something, a roped one looks
  // like a purchase.
  const plots = p.home.plots || 1;
  g('l-plot3').innerHTML =
    (plots >= 3 ? '' : forSale(14, 100, 140, 48, 3) + forSale(248, 100, 140, 48, 0)) +
    (plots >= 2 ? '' : forSale(248, 150, 140, 60, 2));

  g('sl-garden').innerHTML   = drawRows(SLOTS.garden, bLevel('garden'), '#3f8a3a', '#2c6128');
  g('sl-coop').innerHTML     = drawCoop(SLOTS.coop, bLevel('coop'));
  g('sl-orchard').innerHTML  = plots >= 2 ? drawTrees(SLOTS.orchard, bLevel('orchard')) : '';
  g('sl-workshop').innerHTML = plots >= 2 ? drawShed(SLOTS.workshop, bLevel('workshop')) : '';
  g('sl-barn').innerHTML     = plots >= 3 ? drawBarn(SLOTS.barn, bLevel('barn')) : '';
  g('sl-solar').innerHTML    = plots >= 3 ? drawSolar(SLOTS.solar, bLevel('solar')) : '';

  g('l-fence').innerHTML = drawFence();
  R.tag.textContent = plots === 1 ? '1 PLOT' : `${plots} PLOTS`;
}

// Every drawer takes a level and returns more of the same thing, which is the
// cheapest possible way to make "level 7" legible from across the screen.
function drawRows(s, lv, top, bot) {
  if (lv <= 0) return '';
  const rows = Math.min(5, 1 + Math.floor(lv / 2));
  let out = `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4" fill="#6b5636" stroke="#3a2d1c" stroke-width="2.5"/>`;
  for (let r = 0; r < rows; r++) {
    const y = s.y + 8 + r * ((s.h - 12) / rows);
    for (let i = 0; i < 9; i++) {
      const x = s.x + 8 + i * ((s.w - 16) / 8);
      out += `<circle class="crop" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.4 + lv * 0.12).toFixed(1)}" fill="${i % 3 ? top : bot}"/>`;
    }
  }
  return out;
}
function drawCoop(s, lv) {
  if (lv <= 0) return '';
  let out = `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4" fill="#c98f4e" stroke="#2b2118" stroke-width="2.5"/>
             <path d="M${s.x - 4} ${s.y} L${s.x + s.w / 2} ${s.y - 14} L${s.x + s.w + 4} ${s.y} Z" fill="#8a5c2e" stroke="#2b2118" stroke-width="2.5" stroke-linejoin="round"/>
             <rect x="${s.x + s.w / 2 - 6}" y="${s.y + 14}" width="12" height="20" fill="#5c3a1c"/>`;
  // Birds scatter in front of the coop rather than in a line beside it — a row
  // of evenly spaced dots reads as a UI element, not as livestock.
  for (let i = 0; i < Math.min(6, lv); i++) {
    const cx = s.x + 6 + (i * 13) % (s.w - 10);
    const cy = s.y + s.h + 2 + ((i * 5) % 7);
    out += `<circle cx="${cx}" cy="${cy}" r="3" fill="#f4efe4" stroke="#2b2118" stroke-width="1.5"/>`;
  }
  return out;
}
function drawTrees(s, lv) {
  if (lv <= 0) return '';
  let out = '';
  const n = Math.min(8, 2 + lv);
  for (let i = 0; i < n; i++) {
    const x = s.x + 12 + (i % 4) * ((s.w - 24) / 3);
    const y = s.y + 12 + Math.floor(i / 4) * 26;
    out += `<rect x="${x - 2.5}" y="${y}" width="5" height="14" fill="#5c3a1c"/>
            <circle cx="${x}" cy="${y - 2}" r="${8 + Math.min(4, lv * 0.4)}" fill="#2f7a34" stroke="#1d4d21" stroke-width="2"/>`;
  }
  return out;
}
function drawShed(s, lv) {
  if (lv <= 0) return '';
  return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4" fill="#8f989f" stroke="#2b2118" stroke-width="2.5"/>
          <rect x="${s.x + 6}" y="${s.y + 10}" width="${s.w - 12}" height="${s.h - 16}" fill="#5e666c"/>
          <circle class="gear" cx="${s.x + s.w / 2}" cy="${s.y + s.h / 2}" r="${6 + lv * 0.5}" fill="none" stroke="#f5c518" stroke-width="4" stroke-dasharray="5 4"/>`;
}
function drawBarn(s, lv) {
  if (lv <= 0) return '';
  return `<path d="M${s.x} ${s.y + 12} L${s.x + s.w / 2} ${s.y - 8} L${s.x + s.w} ${s.y + 12} L${s.x + s.w} ${s.y + s.h} L${s.x} ${s.y + s.h} Z"
            fill="#b23a30" stroke="#2b2118" stroke-width="3" stroke-linejoin="round"/>
          <rect x="${s.x + s.w / 2 - 12}" y="${s.y + s.h - 24}" width="24" height="24" fill="#f4efe4" stroke="#2b2118" stroke-width="2.5"/>
          ${lv >= 4 ? `<rect x="${s.x + s.w + 6}" y="${s.y + s.h - 16}" width="22" height="16" rx="3" fill="#4e7a4a" stroke="#2b2118" stroke-width="2.5"/>` : ''}`;
}
function drawSolar(s, lv) {
  if (lv <= 0) return '';
  let out = '';
  const n = Math.min(6, 2 + Math.floor(lv / 2));
  for (let i = 0; i < n; i++) {
    const x = s.x + i * ((s.w) / n);
    out += `<g transform="translate(${x.toFixed(1)} ${s.y}) skewX(-12)">
              <rect width="${(s.w / n - 5).toFixed(1)}" height="18" fill="#20456b" stroke="#0f2438" stroke-width="2"/>
            </g>`;
  }
  return out;
}
// An unbought plot is bare, roped and signed. A plain translucent rectangle
// reads as a rendering bug; a rope and a board reads as a price tag. `n === 0`
// is the second half of a two-part plot, which gets the rope but not a second
// board saying the same number twice.
function forSale(x, y, w, h, n) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#8f8259" opacity=".6"/>
    <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="3" fill="none"
          stroke="#f4efe4" stroke-width="2.5" stroke-dasharray="7 6" opacity=".75"/>
    ${n ? `<g transform="translate(${(x + w / 2).toFixed(0)} ${(y + 17).toFixed(0)})">
      <rect x="-33" y="-11" width="66" height="22" rx="4" fill="#f4efe4" stroke="#2b2118" stroke-width="2.5"/>
      <text x="0" y="5" text-anchor="middle" font-size="10.5" letter-spacing="1"
            font-family="Arial Black, Impact, sans-serif" fill="#2b2118">PLOT ${n}</text>
    </g>` : ''}
  </g>`;
}

function drawFence() {
  // A gap in the middle is the gate, and the path from it to the front door is
  // what turns a fenced rectangle into somewhere someone walks in and out of.
  let out = `<path d="M186 216 L214 216 L228 240 L172 240 Z" fill="#c8bfa4"/>`;
  out += `<rect x="0" y="228" width="400" height="12" fill="#8a8f7a"/>`;
  for (let x = 4; x < 400; x += 22) {
    if (x > 168 && x < 224) continue;                     // the gate
    out += `<rect x="${x}" y="206" width="7" height="26" rx="2" fill="#c9a86c" stroke="#5c4322" stroke-width="2"/>`;
    }
  out += `<rect x="0" y="212" width="170" height="5" fill="#c9a86c" stroke="#5c4322" stroke-width="1.5"/>`;
  out += `<rect x="226" y="212" width="174" height="5" fill="#c9a86c" stroke="#5c4322" stroke-width="1.5"/>`;
  // mailbox on the right gatepost
  out += `<rect x="232" y="188" width="5" height="22" fill="#5c4322"/>
          <rect x="226" y="178" width="19" height="12" rx="5" fill="#3d7ecc" stroke="#2b2118" stroke-width="2"/>`;
  return out;
}

function pop(node, cls) {
  if (!node) return;
  node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
}

// The one-line version of this screen, for the main menu's HOME chip. Kept here
// rather than re-derived in menus.js so there is one definition of "how the
// block is doing".
export function houseSummary() {
  const p = P();
  return { owned: p.home.owned, debt: p.home.debt, plots: p.home.plots, rate: houseIncomeRate(), unlocked: isUnlocked('home') };
}
