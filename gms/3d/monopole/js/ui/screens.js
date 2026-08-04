// The six company panels. Every one is a bottom sheet with its primary action at the thumb.
// They read `api.sim.state` (a snapshot) and push actions through `api.sim.act` — never into
// js/sim/ directly, and never a blocking modal.

import content from '../sim/content.js';
import { definePanel, panels } from './panels.js';
import {
  esc, cr, credits, crShort, delta, pct, tonnes, quarterOf, weekInQuarter, duration, arrow,
  shareCurve,
} from './format.js';
import './gameover.js';
import { initSave } from './save.js';

const sys = content.get('system', 'tamber');
const SITE = Object.fromEntries(sys.sites.map(s => [s.id, s]));
const siteName = id => SITE[id]?.name || id;
// display copy for the two brand ids the tactics and rival options use
const BRAND = { ryland: 'Ryland Coil Works', harrow: 'Harrow Filament' };
const RIVAL = content.rival.profile;

const routeBetween = (a, b) => sys.routes.find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a));
const transit = (from, to, shipDef) => {
  const r = routeBetween(from, to);
  return r ? Math.max(1, Math.round(r.weeks / shipDef.speed)) : null;
};

function wire(el, map) {
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-a]');
    if (!t || t.disabled) return;
    map[t.dataset.a]?.(t.dataset, t);
  });
}

const held = cargo => Object.values(cargo || {}).reduce((a, b) => a + b, 0);

function cargoBar(cargo, hold) {
  const rows = Object.entries(cargo || {}).filter(([, v]) => v > 0.01);
  const used = held(cargo);
  return `<div class="bar hold">
    ${rows.map(([cid, v]) => `<i style="width:${(v / hold * 100).toFixed(1)}%;background:${content.get('commodity', cid)?.tint}"></i>`).join('')}
    <b>${used < 0.5 ? 'empty' : rows.map(([cid, v]) => `${Math.round(v)}${content.get('commodity', cid).unit} ${content.get('commodity', cid).name.split(' ').pop().toLowerCase()}`).join(' · ')}</b>
  </div>`;
}

function shipStatus(sh) {
  if (sh.leg) return `${siteName(sh.leg.from)} → <b>${esc(siteName(sh.leg.to))}</b> · ${sh.eta}w out`;
  return `Docked at <b>${esc(siteName(sh.at))}</b>${sh.route ? ` · running ${sh.route.map(siteName).join(' ↔ ')}` : ' · <s class="warn">no orders</s>'}`;
}

/* ── Assign ─────────────────────────────────────────────────────────────── */

definePanel({
  id: 'assign',
  title: 'Assign a ship',
  group: 'fleet',

  render(props, api) {
    const st = api.sim.state;
    const ships = st.ships;
    const sh = ships.find(x => x.id === props.ship) || ships[0];
    if (!sh) return `<div class="pad"><p class="dim">No ships.</p></div>`;
    const def = content.get('ship', sh.class);
    const from = sh.leg ? sh.leg.to : sh.at;
    const pending = api.sim.queued().find(a => a.ship === sh.id);

    const dests = sys.sites
      .filter(t => t.id !== from && routeBetween(from, t.id))
      .map(t => ({ site: t, weeks: transit(from, t.id, def), fuel: routeBetween(from, t.id).fuel }));

    const loops = [
      { id: 'mine', legs: ['ledger', 'kestrel'], label: 'Mine run', note: 'Cut ore at Kestrel, bring it home' },
      { id: 'sell', legs: ['ledger', 'ossian'], label: 'Sale run', note: 'Take whatever Ledger has free to market' },
      { id: 'long', legs: ['ledger', 'kestrel', 'ossian'], label: 'Long haul', note: 'Ledger, the belt, then straight to Ossian' },
    ].filter(l => l.legs.every((a, i) => i === 0 || routeBetween(l.legs[i - 1], a)) && routeBetween(l.legs[l.legs.length - 1], l.legs[0]));

    const chosen = props.dest || null;
    const loop = props.loop || null;

    return `
<div class="pad">
  <div class="chips scroll-x">
    ${ships.map(x => `<button class="chip ${x.id === sh.id ? 'on' : ''}" data-a="pick" data-ship="${esc(x.id)}">
      ${esc(content.get('ship', x.class).name.split('-')[0])}<s>${esc(x.id.split('-')[1])}</s></button>`).join('')}
  </div>

  <div class="card ship-card">
    <div class="card-top"><b>${esc(def.name)}</b><s>${esc(sh.id)}</s></div>
    <p class="dim">${shipStatus(sh)}</p>
    ${cargoBar(sh.cargo, def.hold)}
    <ul class="facts">
      <li><s>Hold</s><em>${def.hold} t</em></li>
      <li><s>Speed</s><em>${def.speed.toFixed(2)}×</em></li>
      <li><s>Upkeep</s><em>${cr(def.upkeep)}/wk</em></li>
      ${def.mine ? `<li><s>Cuts</s><em>${def.mine} t/wk</em></li>` : ''}
    </ul>
  </div>

  ${pending ? `<div class="note ok">Order queued — it goes out when the week ticks.
    <button class="link" data-a="cancel">Cancel it</button></div>` : ''}

  <h4 class="sec">Send it somewhere</h4>
  <div class="dest-grid">
    ${dests.map(d => `
      <button class="dest ${chosen === d.site.id ? 'on' : ''}" data-a="dest" data-dest="${esc(d.site.id)}">
        <b>${esc(d.site.name)}</b>
        <s>${d.weeks} week${d.weeks > 1 ? 's' : ''} · ${cr(d.fuel)} cr fuel</s>
        <p>${esc(destBlurb(d.site, st))}</p>
      </button>`).join('')}
  </div>

  <h4 class="sec">Or put it on a loop</h4>
  <div class="loop-list">
    ${loops.map(l => `
      <button class="loop ${loop === l.id ? 'on' : ''}" data-a="loop" data-loop="${esc(l.id)}">
        <b>${esc(l.label)}</b><s>${l.legs.map(siteName).join(' → ')} → ${siteName(l.legs[0])}</s>
        <p>${esc(l.note)}</p>
      </button>`).join('')}
  </div>
</div>

<div class="sheet-cta">
  <button data-open="holdings" data-swap>Holdings</button>
  <button class="primary" data-a="send" ${chosen || loop ? '' : 'disabled'}>
    ${chosen ? `Send to ${esc(siteName(chosen))}` : loop ? `Run the ${esc(loops.find(l => l.id === loop).label.toLowerCase())}` : 'Pick a destination'}
  </button>
</div>`;
  },

  mount(el, props, api) {
    wire(el, {
      pick: d => { props.ship = d.ship; props.dest = null; props.loop = null; api.rerender(); },
      dest: d => { props.dest = props.dest === d.dest ? null : d.dest; props.loop = null; api.rerender(); },
      loop: d => { props.loop = props.loop === d.loop ? null : d.loop; props.dest = null; api.rerender(); },
      cancel: () => { api.sim.unact(a => a.ship === props.ship); api.rerender(); },
      send: () => {
        const sh = api.sim.state.ships.find(x => x.id === props.ship) || api.sim.state.ships[0];
        api.sim.unact(a => a.ship === sh.id);
        if (props.dest) api.sim.act({ type: 'assign', ship: sh.id, to: props.dest });
        else {
          const legs = { mine: ['ledger', 'kestrel'], sell: ['ledger', 'ossian'], long: ['ledger', 'kestrel', 'ossian'] }[props.loop];
          api.sim.act({ type: 'route', ship: sh.id, legs });
        }
        props.dest = null; props.loop = null;
        api.rerender();
      },
    });
  },
});

function destBlurb(site, st) {
  if (site.kind === 'belt') return `Ore in the rock. Reserve ${pct(st.sites[site.id]?.reserve ?? 1)}.`;
  if (site.kind === 'market') return `Buys ${site.buys.map(c => content.get('commodity', c).name.toLowerCase()).join(', ')}.`;
  if (site.owner === 'player') return 'Home. Unloads into the station and reloads.';
  return `${RIVAL.name}. Nothing here is yours.`;
}

/* ── Holdings ───────────────────────────────────────────────────────────── */

definePanel({
  id: 'holdings',
  title: 'Holdings',
  group: 'company',

  render(props, api) {
    const st = api.sim.state;
    const tab = props.tab || 'fleet';
    const body = { fleet: fleetTab, station: stationTab, finance: financeTab }[tab](st, api);
    return `
<div class="tabs">
  ${[['fleet', 'Fleet'], ['station', 'Ledger'], ['finance', 'Finance']].map(([k, l]) =>
      `<button class="${k === tab ? 'on' : ''}" data-a="tab" data-tab="${k}">${l}</button>`).join('')}
</div>
<div class="pad">${body}</div>
<div class="sheet-cta">
  <button data-open="market" data-swap>Market</button>
  <button class="primary" data-open="assign" data-swap>Assign a ship</button>
</div>`;
  },

  mount(el, props, api) {
    wire(el, {
      tab: d => { props.tab = d.tab; api.rerender(); },
      buyShip: d => { api.sim.act({ type: 'buyShip', class: d.cls }); api.rerender(); },
      buyModule: d => { api.sim.act({ type: 'buyModule', module: d.mod, site: 'ledger' }); api.rerender(); },
      loan: d => { api.sim.act({ type: 'loan', amount: +d.amt }); api.rerender(); },
      repay: d => { api.sim.act({ type: 'repay', amount: +d.amt }); api.rerender(); },
      assign: d => panels.open('assign', { ship: d.ship }),
    });
  },
});

function fleetTab(st, api) {
  const wages = st.ships.reduce((n, sh) => n + content.get('ship', sh.class).upkeep * (sh.leg ? 1 : content.balance.costs.idleUpkeepMult), 0);
  return `
<ul class="rows">
  ${st.ships.map(sh => {
    const def = content.get('ship', sh.class);
    return `<li class="row-card">
      <div class="card-top"><b>${esc(def.name)}</b><s>${esc(sh.id)}</s></div>
      <p class="dim">${shipStatus(sh)}</p>
      ${cargoBar(sh.cargo, def.hold)}
      <button class="link" data-a="assign" data-ship="${esc(sh.id)}">Assign →</button>
    </li>`;
  }).join('')}
</ul>
<p class="foot-note">Wage bill ${cr(Math.round(wages))} cr a week. A docked hull costs ${pct(content.balance.costs.idleUpkeepMult)} of a working one.</p>

<h4 class="sec">Order a hull</h4>
<ul class="rows">
  ${content.all('ship').map(d => `
    <li class="row-card buy">
      <div class="card-top"><b>${esc(d.name)}</b><em>${cr(d.cost)} cr</em></div>
      <ul class="facts">
        <li><s>Hold</s><em>${d.hold} t</em></li>
        <li><s>Speed</s><em>${d.speed.toFixed(2)}×</em></li>
        <li><s>Upkeep</s><em>${cr(d.upkeep)}/wk</em></li>
        <li><s>Cuts</s><em>${d.mine ? d.mine + ' t/wk' : '—'}</em></li>
      </ul>
      <button class="buy-btn" data-a="buyShip" data-cls="${esc(d.id)}" ${st.cash < d.cost ? 'disabled' : ''}>
        ${st.cash < d.cost ? `Short ${crShort(d.cost - st.cash)} cr` : 'Order it'}</button>
    </li>`).join('')}
</ul>`;
}

function stationTab(st, api) {
  const site = st.sites.ledger;
  const upkeep = site.modules.reduce((n, m) => n + (content.get('module', m)?.upkeep || 0), 0);
  const stock = Object.entries(site.stock).filter(([, v]) => v > 0.01);
  const owned = new Set(site.modules);
  return `
<div class="card">
  <div class="card-top"><b>Ledger Station</b><s>${site.modules.length} modules</s></div>
  ${stock.length ? `<div class="stock-list">${stock.map(([cid, v]) => {
    const c = content.get('commodity', cid);
    return `<span class="tag"><i style="background:${c.tint}"></i>${esc(c.name)} <em>${tonnes(v, c.unit)}</em></span>`;
  }).join('')}</div>` : '<p class="dim">Nothing in the bond store.</p>'}
  <div class="bar hold"><i style="width:${Math.min(100, held(site.stock) / site.hold * 100).toFixed(1)}%"></i>
    <b>${Math.round(held(site.stock))} / ${site.hold} t stored</b></div>
</div>

<ul class="rows">
  ${site.modules.map(mid => {
    const m = content.get('module', mid);
    return `<li class="row-card">
      <div class="card-top"><b>${esc(m.name)}</b><s>${cr(m.upkeep)}/wk</s></div>
      <p class="dim">${esc(m.blurb)}</p>
      ${m.converts ? `<p class="chain-line">${esc(content.get('commodity', m.converts.from).name)} <i>→</i> ${esc(content.get('commodity', m.converts.into).name)} · up to ${m.converts.rate} t a week</p>` : ''}
    </li>`;
  }).join('')}
</ul>
<p class="foot-note">Module upkeep ${cr(upkeep)} cr a week.</p>

<h4 class="sec">Build on</h4>
<ul class="rows">
  ${content.all('module').filter(m => m.cost > 0).map(m => `
    <li class="row-card buy ${owned.has(m.id) ? 'have' : ''}">
      <div class="card-top"><b>${esc(m.name)}</b><em>${cr(m.cost)} cr</em></div>
      <p class="dim">${esc(m.blurb)}</p>
      <button class="buy-btn" data-a="buyModule" data-mod="${esc(m.id)}" ${st.cash < m.cost ? 'disabled' : ''}>
        ${st.cash < m.cost ? `Short ${crShort(m.cost - st.cash)} cr` : owned.has(m.id) ? 'Build another' : 'Build it'}</button>
    </li>`).join('')}
</ul>`;
}

function financeTab(st, api) {
  const c = api.sim.last('cost');
  const b = content.balance.loan;
  const room = Math.max(0, b.maxDraw - st.debt);
  const net = c ? c.revenue - c.total : 0;
  return `
<div class="card ledger-card">
  <div class="big-cash">${cr(st.cash)}<s>cr on hand</s></div>
  <div class="split">
    <div><s>Debt</s><em class="${st.debt > b.debtLimit ? 'warn' : ''}">${cr(st.debt)}</em></div>
    <div><s>Interest</s><em>${cr(Math.round(st.debt * b.interestWeekly))}/wk</em></div>
    <div><s>Credit left</s><em>${cr(room)}</em></div>
  </div>
</div>

${c ? `
<h4 class="sec">Last week</h4>
<table class="pnl">
  <tr class="in"><td>Revenue</td><td>${cr(c.revenue)}</td></tr>
  <tr><td>Wages</td><td>−${cr(c.wages)}</td></tr>
  <tr><td>Modules</td><td>−${cr(c.modules)}</td></tr>
  <tr><td>Fuel</td><td>−${cr(c.fuel)}</td></tr>
  <tr><td>Interest</td><td>−${cr(c.interest)}</td></tr>
  <tr><td>Overhead</td><td>−${cr(c.overhead)}</td></tr>
  <tr class="net ${net >= 0 ? 'up' : 'down'}"><td>Net</td><td>${delta(net, cr)}</td></tr>
</table>` : '<p class="dim">No trading week closed yet.</p>'}

<h4 class="sec">Credit line</h4>
<p class="dim">${pct(b.drawFee, 0)} drawing fee, ${(b.interestWeekly * 100).toFixed(2)}% a week on the balance. Past ${cr(b.debtLimit)} cr of debt with no cash, the company folds.</p>
<div class="btn-row">
  ${[10000, 20000, room].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v =>
      `<button data-a="loan" data-amt="${v}">Draw ${crShort(v)}</button>`).join('')}
</div>
<div class="btn-row">
  ${[10000, Math.min(st.debt, st.cash)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v =>
      `<button data-a="repay" data-amt="${Math.round(v)}">Repay ${crShort(v)}</button>`).join('')}
</div>`;
}

/* ── Market ─────────────────────────────────────────────────────────────── */

definePanel({
  id: 'market',
  title: 'Market',
  group: 'company',

  render(props, api) {
    const st = api.sim.state;
    const prices = api.sim.last('price')?.prices || {};
    const prev = api.sim.last('price', st.week - 1)?.prices || {};
    const everywhere = cid => Object.values(st.sites).reduce((n, s) => n + (s.stock?.[cid] || 0), 0)
      + st.ships.reduce((n, sh) => n + (sh.cargo?.[cid] || 0), 0);

    return `
<div class="pad">
  <p class="dim">Ossian Orbitals is the only buyer in the Reach. Prices move ${pct(content.balance.market.priceStep)} of the way to clearing every week.</p>

  ${content.all('commodity').map(c => {
    const m = st.market[c.id];
    const p = prices[c.id] ?? m.price;
    const was = prev[c.id];
    const tight = m.demand / Math.max(1, m.supply);
    const dir = arrow(p, was);
    return `
    <div class="card comm" style="--tint:${c.tint}">
      <div class="card-top">
        <b><i class="dot"></i>${esc(c.name)}</b>
        <em class="price ${dir === '▲' ? 'up' : dir === '▼' ? 'down' : ''}">${cr(p)}<s>cr/${c.unit}</s> ${dir}</em>
      </div>
      <div class="ds">
        <div class="bar ds-bar"><i style="width:${Math.min(100, tight * 50).toFixed(0)}%"></i><u></u></div>
        <s>${m.demand.toFixed(0)} wanted vs ${m.supply.toFixed(0)} offered — ${tight > 1.02 ? 'short' : tight < 0.98 ? 'glutted' : 'balanced'}</s>
      </div>
      <ul class="facts">
        <li><s>You hold</s><em>${tonnes(everywhere(c.id), c.unit)}</em></li>
        <li><s>Base</s><em>${cr(c.base)} cr</em></li>
        <li><s>Made from</s><em>${c.from ? Object.entries(c.from).map(([k, v]) => `${v} t ${content.get('commodity', k).name.split(' ').pop().toLowerCase()}`).join(' + ') : 'the rock'}</em></li>
        ${c.decay ? `<li><s>Burns out</s><em>${pct(c.decay)}/wk</em></li>` : ''}
      </ul>
    </div>`;
  }).join('')}

  <h4 class="sec">The chain</h4>
  <div class="chain">
    ${content.all('commodity').map((c, i) => `
      ${i ? '<i class="chain-arrow">→</i>' : ''}
      <div class="chain-node" style="--tint:${c.tint}"><b>${esc(c.name.split(' ').pop())}</b><s>${cr(st.market[c.id].price)} cr</s></div>`).join('')}
  </div>
  <p class="dim">Every lamp and drive coil in the Reach eats filament, so that demand never stops. It is the whole reason to build up the chain rather than sell the rock.</p>

  <h4 class="sec">Contracts</h4>
  ${st.contracts.length ? `<ul class="rows">${st.contracts.map(k => `
    <li class="row-card">
      <div class="card-top"><b>${esc(BRAND[k.with] || k.with)}</b><s>${k.weeksLeft === Infinity ? 'permanent' : k.weeksLeft + ' weeks left'}</s></div>
      <p>${k.units} t of ${esc(content.get('commodity', k.commodity).name.toLowerCase())} a week at a floor of ${cr(k.price)} cr${k.exclusive ? ' · exclusive' : ''}.</p>
      <p class="dim">Miss the tonnage and the shortfall costs ${pct(content.balance.contract.shortfallFrac)} of the contract price on what you did not deliver.</p>
    </li>`).join('')}</ul>` : '<p class="dim">None. Contracts arrive with tactics.</p>'}

  <h4 class="sec">Loading priority</h4>
  <p class="dim">A hauler fills its hold in this order from whatever the station has free.</p>
  <ul class="order-list">
    ${st.loadOrder.map((cid, i) => `<li>
      <span class="num">${i + 1}</span><b>${esc(content.get('commodity', cid).name)}</b>
      <button class="link" data-a="up" data-cid="${esc(cid)}" ${i ? '' : 'disabled'}>↑</button>
    </li>`).join('')}
  </ul>
</div>
<div class="sheet-cta">
  <button data-open="refinery" data-swap>Refinery</button>
  <button class="primary" data-open="tactics" data-swap>Tactics</button>
</div>`;
  },

  mount(el, props, api) {
    wire(el, {
      up: d => {
        const o = api.sim.state.loadOrder.slice();
        const i = o.indexOf(d.cid);
        if (i > 0) { o.splice(i - 1, 0, o.splice(i, 1)[0]); api.sim.act({ type: 'loadOrder', order: o }); }
        api.rerender();
      },
    });
  },
});

/* ── Refinery ───────────────────────────────────────────────────────────── */

definePanel({
  id: 'refinery',
  title: 'Refinery',
  group: 'company',

  render(props, api) {
    const st = api.sim.state;
    const site = st.sites[props.site || 'ledger'];
    const feedWeeks = content.balance.market.feedWeeks;
    const converters = content.all('module').filter(m => m.converts);
    const owned = new Set(site.modules);
    const next = converters.find(m => !owned.has(m.id));

    const stages = converters.map(m => {
      const cv = m.converts;
      const have = site.stock[cv.from] || 0;
      const runs = owned.has(m.id) ? Math.min(cv.rate, Math.floor(have / cv.per)) : 0;
      return { m, cv, have, runs, built: owned.has(m.id), reserved: cv.per * cv.rate * feedWeeks };
    });

    return `
<div class="pad">
  <p class="dim">Ore is worth ${cr(st.market.ore.price)} cr a tonne. Drawn all the way to filament the same rock is worth ${cr(Math.round(st.market.filament.price / 4))} cr a tonne of ore, and the Reach never stops buying it.</p>

  <div class="pipeline">
    <div class="stage raw">
      <b>${esc(content.get('commodity', 'ore').name)}</b>
      <em>${tonnes(site.stock.ore || 0)}</em>
      <s>in the bond store</s>
    </div>
    ${stages.map(s => `
      <div class="stage-arrow ${s.built ? (s.runs ? 'live' : '') : 'gap'}">
        <i></i><span>${s.built ? (s.runs ? `${s.runs} t/wk` : 'starved') : 'not built'}</span>
      </div>
      <div class="stage ${s.built ? '' : 'ghost'}">
        <b>${esc(content.get('commodity', s.cv.into).name)}</b>
        <em>${tonnes(site.stock[s.cv.into] || 0)}</em>
        <s>${s.built ? `${esc(s.m.name)} · ${s.cv.per} t in, 1 t out` : `needs the ${esc(s.m.name)}`}</s>
        ${s.built ? '' : `<button class="buy-btn" data-a="build" data-mod="${esc(s.m.id)}" ${st.cash < s.m.cost ? 'disabled' : ''}>
          ${st.cash < s.m.cost ? `Short ${crShort(s.m.cost - st.cash)} cr` : `Build · ${cr(s.m.cost)} cr`}</button>`}
      </div>`).join('')}
  </div>

  <h4 class="sec">Why a hauler cannot take it all</h4>
  <p class="dim">Each converter holds back ${feedWeeks} weeks of feed so a hauler docking on the same tick cannot strip the station before production runs.
  ${stages.filter(s => s.built).map(s => `${esc(content.get('commodity', s.cv.from).name)}: ${tonnes(s.reserved)} reserved.`).join(' ')}</p>

  ${stages.filter(s => s.built).map(s => `
    <div class="card">
      <div class="card-top"><b>${esc(s.m.name)}</b><s>${cr(s.m.upkeep)} cr/wk</s></div>
      <div class="bar"><i style="width:${(s.runs / s.cv.rate * 100).toFixed(0)}%"></i><b>${s.runs} of ${s.cv.rate} t/wk capacity</b></div>
      <p class="dim">${s.runs < s.cv.rate
        ? `Short of feed. It wants ${tonnes(s.cv.rate * s.cv.per)} of ${esc(content.get('commodity', s.cv.from).name.toLowerCase())} a week and has ${tonnes(s.have)}.`
        : 'Running flat out.'}</p>
    </div>`).join('')}
</div>

<div class="sheet-cta">
  <button data-open="market" data-swap>Market</button>
  ${next ? `<button class="primary" data-a="build" data-mod="${esc(next.id)}" ${st.cash < next.cost ? 'disabled' : ''}>
      Build the ${esc(next.name)} · ${cr(next.cost)} cr</button>`
    : '<button class="primary" data-open="tactics" data-swap>Tactics</button>'}
</div>`;
  },

  mount(el, props, api) {
    wire(el, {
      build: d => { api.sim.act({ type: 'buyModule', module: d.mod, site: props.site || 'ledger' }); api.rerender(); },
    });
  },
});

/* ── Tactics ────────────────────────────────────────────────────────────── */

const BANDS = [
  ['legal', 'Legal', 'Done in the open. Still ruthless.'],
  ['grey', 'Contested', 'Lawful or not depending on facts somebody has to prove in court.'],
  ['illegal', 'Illegal', 'Over the line as the line stands today. Heat builds every week it runs.'],
];

definePanel({
  id: 'tactics',
  title: 'Tactics',
  group: 'company',

  render(props, api) {
    const st = api.sim.state;
    const focus = props.focus;
    const heat = content.balance.heat;

    return `
<div class="pad tree">
  <div class="heat-strip ${st.heat > heat.threshold * 0.6 ? 'hot' : ''}">
    <div class="bar heat"><i style="width:${Math.min(100, st.heat / heat.threshold * 100).toFixed(0)}%"></i></div>
    <s>Regulator attention ${Math.round(st.heat)} / ${heat.threshold}${st.heat > 0 ? ` · cools ${heat.decayWeekly}/wk` : ' · nothing on their desk'}</s>
  </div>

  ${BANDS.map(([band, label, note]) => {
    const rows = content.all('tactic').filter(t => t.band === band);
    if (!rows.length) return '';
    return `
    <section class="band-group band-${band}">
      <h3><i></i>${esc(label)}</h3>
      <p class="band-note">${esc(note)}</p>
      <div class="spine">
        ${rows.map(t => tacticCard(api.sim.tacticStatus(t.id), st, focus === t.id)).join('')}
      </div>
    </section>`;
  }).join('')}
</div>
<div class="sheet-cta">
  <button data-open="dossier" data-swap>Dossier</button>
  <button class="primary" data-sheet-close>Close</button>
</div>`;
  },

  mount(el, props, api) {
    wire(el, {
      focus: d => { props.focus = props.focus === d.id ? null : d.id; api.rerender(); },
      take: d => { api.sim.act({ type: 'tactic', tactic: d.id }); props.focus = d.id; api.rerender(); },
      story: d => panels.open('story', { story: content.get('tactic', d.id).story, tactic: d.id }),
    });
  },
});

function tacticCard(s, st, open) {
  const t = s.def;
  const state = s.banned ? 'banned' : s.active ? 'active' : s.owned ? 'owned'
    : s.unlocked ? (s.affordable ? 'ready' : 'costly') : 'locked';
  const gate = s.missing[0];
  const label = {
    banned: 'Banned for the run', active: 'Running', owned: 'Held', ready: 'Available',
    costly: `Short ${crShort(t.cost - st.cash)} cr`,
    locked: gate ? `Locked · ${gateWord(gate)}` : 'Locked',
  }[state];
  const showMissing = !s.owned && !s.active && s.missing.length;

  return `
<article class="tactic ${state} ${open ? 'open' : ''}">
  <button class="tactic-head" data-a="focus" data-id="${esc(t.id)}">
    <i class="node"></i>
    <div>
      <b>${esc(t.name)}</b>
      <s>${esc(label)}${s.active && s.active.weeksLeft !== Infinity ? ` · ${s.active.weeksLeft} weeks left` : ''}${s.offered && !s.owned ? ' · offered to you' : ''}</s>
    </div>
    <em>${t.cost ? crShort(t.cost) : 'free'}</em>
  </button>

  <div class="tactic-more">
    <p class="blurb">${esc(t.blurb)}</p>

    ${showMissing ? `<ul class="need">${s.missing.map(m => `<li>${esc(needLine(m))}</li>`).join('')}</ul>` : ''}

    <h5>What it does</h5>
    <ul class="effects">${t.effect.map(op => `<li>${esc(effectLine(op))}</li>`).join('')}</ul>

    <ul class="facts">
      <li><s>Cost</s><em>${t.cost ? cr(t.cost) + ' cr' : 'Free'}</em></li>
      <li><s>Runs for</s><em>${esc(duration(t.duration))}</em></li>
      <li><s>Heat</s><em>${t.heat ? t.heat + '/wk' : 'None'}</em></li>
      ${t.penalty ? `<li><s>If caught</s><em>${cr(t.penalty.fine)} cr${t.penalty.ban ? ' + banned' : ''}</em></li>` : ''}
    </ul>

    ${t.penalty ? `<p class="penalty">Get investigated and it costs ${cr(t.penalty.fine)} cr, ${pct(t.penalty.shareLoss)} of your share and ${pct(t.penalty.repLoss)} of your standing${t.penalty.ban ? ', and the tactic is gone for the rest of the run' : ''}.</p>` : ''}

    <div class="tactic-cta">
      <button class="link" data-a="story" data-id="${esc(t.id)}">Read the real case →</button>
      ${state === 'ready' ? `<button class="primary sm" data-a="take" data-id="${esc(t.id)}">Take it · ${cr(t.cost)} cr</button>` : ''}
    </div>
  </div>
</article>`;
}

function gateWord(m) {
  if (m.k === 'share') return `needs ${pct(m.need)} share`;
  if (m.k === 'cash') return `needs ${crShort(m.need)} cr`;
  return `needs the ${content.get('module', m.need)?.name || m.need}`;
}

function needLine(m) {
  if (m.k === 'share') return `Needs ${pct(m.need)} of Reach freight — you have ${pct(m.have, 1)}.`;
  if (m.k === 'cash') return `Needs ${cr(m.need)} cr on hand — you have ${cr(m.have)}.`;
  return `Needs the ${content.get('module', m.need)?.name || m.need} built at Ledger.`;
}

const cName = id => (id === '*' ? 'every commodity' : content.get('commodity', id)?.name.toLowerCase() || id);
const upDown = m => (m > 1 ? `${pct(m - 1)} more` : `${pct(1 - m)} less`);

function effectLine(op) {
  switch (op.op) {
    case 'lockBrand': return `${BRAND[op.brand] || op.brand} sells ${cName(op.commodity)} in the Reach through you and nobody else.`;
    case 'rivalPrice': return `${RIVAL.name} moves ${cName(op.commodity)} at ${upDown(op.mult)} — ${op.mult > 1 ? 'they lose volume' : 'they gain it'}.`;
    case 'ownPrice': return `You sell ${cName(op.commodity)} at ${upDown(op.mult)} than the market.`;
    case 'ownCost': return `Your ${op.stage} costs ${upDown(op.mult)}.`;
    case 'rivalCash': return `${RIVAL.name} bleeds ${cr(Math.abs(op.perWeek))} cr a week.`;
    case 'sharePull': return `${op.perWeek > 0 ? 'Pulls' : 'Loses'} ${pct(Math.abs(op.perWeek), 1)} of Reach freight a week.`;
    case 'absorb': return `Absorbs ${op.ships} of their hulls and ${pct(op.share)} of their share.`;
    case 'demandPull': return `Turns ${pct(op.frac)} of ${cName(op.commodity)} demand your way and takes it off them.`;
    case 'demandMult': return `Demand for ${cName(op.commodity)} runs at ${op.mult}× forever.`;
    case 'decayMult': return `${cName(op.commodity)} burns out ${op.mult}× faster, so it has to be bought again.`;
    case 'rivalMood': return `${RIVAL.name} stops competing and starts co-ordinating.`;
    default: return op.op;
  }
}

/* ── Quarterly results ──────────────────────────────────────────────────── */

definePanel({
  id: 'quarterly',
  title: 'Quarterly results',
  group: 'company',

  render(props, api) {
    const st = api.sim.state;
    const q = props.event || api.sim.last('quarter');
    if (!q) return `<div class="pad"><p class="dim">The first quarter closes at week ${content.balance.tick.weeksPerQuarter}.</p></div>
      <div class="sheet-cta"><button class="primary" data-sheet-close>Close</button></div>`;

    const all = api.sim.all('quarter');
    const prev = all[all.indexOf(q) - 1] || null;
    const lo = q.week - content.balance.tick.weeksPerQuarter + 1;
    const costs = api.sim.all('cost').filter(e => e.week >= lo && e.week <= q.week);
    const sum = k => costs.reduce((n, e) => n + (e[k] || 0), 0);
    const rev = sum('revenue'), out = sum('total');
    const rivalAct = content.rival.options.find(o => o.id === q.rivalAction);
    const dShare = prev ? q.share.player - prev.share.player : q.share.player - content.balance.start.share.player;

    return `
<div class="pad results">
  <div class="q-head">
    <div class="q-num">Q${q.quarter}</div>
    <div>
      <b>${esc(sys.name)}</b>
      <s>weeks ${lo}–${q.week}</s>
    </div>
  </div>

  <p class="headline">${esc(headline(q, dShare, rev - out))}</p>

  <h4 class="sec">The line, so far</h4>
  ${curveBlock(api, q)}

  <h4 class="sec">Freight in the Reach</h4>
  <div class="share-split">
    <div class="bar split3">
      <i class="you" style="width:${(q.share.player * 100).toFixed(1)}%"></i>
      <i class="them" style="width:${(q.share.rival * 100).toFixed(1)}%"></i>
      <i class="other" style="width:${(q.share.other * 100).toFixed(1)}%"></i>
    </div>
    <ul class="legend">
      <li class="you"><s>Ferrous Line</s><em>${pct(q.share.player, 1)}</em><u>${delta(dShare * 1000, n => (n / 10).toFixed(1))} pts</u></li>
      <li class="them"><s>${esc(RIVAL.name)}</s><em>${pct(q.share.rival, 1)}</em></li>
      <li class="other"><s>Everybody else</s><em>${pct(q.share.other, 1)}</em></li>
    </ul>
  </div>

  <h4 class="sec">The quarter</h4>
  <table class="pnl">
    <tr class="in"><td>Revenue</td><td>${cr(rev)}</td></tr>
    <tr><td>Wages</td><td>−${cr(sum('wages'))}</td></tr>
    <tr><td>Modules</td><td>−${cr(sum('modules'))}</td></tr>
    <tr><td>Fuel</td><td>−${cr(sum('fuel'))}</td></tr>
    <tr><td>Interest</td><td>−${cr(sum('interest'))}</td></tr>
    <tr><td>Overhead</td><td>−${cr(sum('overhead'))}</td></tr>
    <tr class="net ${rev - out >= 0 ? 'up' : 'down'}"><td>Net</td><td>${delta(rev - out, cr)}</td></tr>
  </table>
  <ul class="facts wide">
    <li><s>Cash</s><em>${cr(q.cash)}</em></li>
    <li><s>Debt</s><em>${cr(q.debt)}</em></li>
    <li><s>Heat</s><em>${Math.round(q.heat)} / ${content.balance.heat.threshold}</em></li>
  </ul>

  <h4 class="sec">Across the Reach</h4>
  <div class="card rival-card">
    <div class="card-top"><b>${esc(RIVAL.name)}</b><s>${st.rival.ships} hulls · ${esc(st.rival.mood)}</s></div>
    <p>${esc(rivalAct ? rivalLine(q.rivalAction, st) : 'Sat on its hands this quarter.')}</p>
  </div>
</div>

<div class="sheet-cta">
  <button data-open="holdings" data-swap>Holdings</button>
  <button class="primary" data-a="carry">Carry on</button>
</div>`;
  },

  // the clock is held while the report is up; hud.refresh hands it back on any other dismissal
  mount(el, props, api) {
    wire(el, { carry: () => { api.close(); api.sim.release(); } });
  },
});

// Weeks the player has lived through, against the two thresholds that end the game. This is the
// whole reason the quarterly exists: one glance says whether the line is bending your way.
function curveBlock(api, q) {
  const rows = api.sim.all('share').filter(e => e.week <= q.week);
  const svg = shareCurve(rows, {
    marks: [
      { at: content.balance.win.monopoly, label: 'mono' },
      { at: content.balance.win.duopoly, label: 'duo' },
    ],
  });
  if (!svg) return `<p class="dim">Two quarters of trading and this becomes a line worth reading.</p>`;
  const first = rows[0], last = rows[rows.length - 1];
  const d = last.player - first.player;
  const moved = (Math.abs(d) * 100).toFixed(1);
  return `
<div class="q-curve">
  ${svg}
  <p class="curve-read">${esc(d > 0.005
    ? `Up ${moved} points since week ${first.week}. Hold ${pct(content.balance.win.duopoly, 0)} for ${content.balance.win.holdWeeks} weeks and it is a duopoly.`
    : d < -0.005
      ? `Down ${moved} points since week ${first.week}. The line is bending the wrong way.`
      : 'Flat since the first week on the chart. Nothing you have done has moved it yet.')}</p>
</div>`;
}

function headline(q, dShare, net) {
  const s = pct(q.share.player, 1);
  const them = RIVAL.name.replace(/\.$/, '');
  if (dShare > 0.03) return `You took ${s} of Reach freight this quarter, and most of it came out of ${them}.`;
  if (dShare > 0.005) return `${s} of Reach freight, up on the quarter. ${them} has not noticed yet.`;
  if (dShare < -0.01) return `${s}, and falling. ${them} is taking it back.`;
  return net < 0 ? `${s} of freight and a loss on the quarter. Something has to change.` : `${s} of freight, holding steady.`;
}

function rivalLine(action, st) {
  return {
    expand_capacity: `Ordered another hull. ${st.rival.ships} of them working the Reach now.`,
    undercut_freight: `Cut its freight rate to hold the contracts it still has.`,
    own_supply_deal: `Signed an exclusive of its own with Harrow Filament.`,
    buy_brand: `Bought a brand outright rather than compete for it.`,
    cut_costs: `Cut its own costs, and its reputation with them.`,
    hold: `Held. Nothing moved.`,
  }[action] || 'Held.';
}

initSave();

export default { definePanel };
