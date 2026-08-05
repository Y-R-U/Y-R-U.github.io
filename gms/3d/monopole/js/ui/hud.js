// The always-on layer: cash, week, share meter, speed, and the dock that opens every panel.
// Nothing here sits in the middle third of the screen and nothing here blocks a gesture on the 3D.

import content from '../sim/content.js';
import { panels } from './panels.js';
import { esc, cr, crShort, delta, pct, pts, quarterLabel, weekLabel } from './format.js';
import { featured } from './storypool.js';

const ICON = {
  assign: '<path d="M2.5 8.4 15 2.2 9.6 15l-2-5.2z"/>',
  holdings: '<rect x="2.2" y="8.6" width="5" height="5.4" rx="1"/><rect x="8.8" y="8.6" width="5" height="5.4" rx="1"/><rect x="5.5" y="2.4" width="5" height="5" rx="1"/>',
  market: '<path d="M4.6 13.6V4.2M2.4 6.4l2.2-2.2 2.2 2.2M11.4 2.4v9.4M9.2 9.6l2.2 2.2 2.2-2.2"/>',
  refinery: '<circle cx="3.4" cy="8" r="2"/><circle cx="8" cy="8" r="2"/><circle cx="12.6" cy="8" r="2"/><path d="M5.4 8h.6M10 8h.6"/>',
  tactics: '<path d="M8 2.4v3.2M8 5.6 4.2 9M8 5.6 11.8 9"/><circle cx="8" cy="2.4" r="1.5"/><circle cx="4.2" cy="10.6" r="1.5"/><circle cx="11.8" cy="10.6" r="1.5"/>',
  dossier: '<path d="M3 3.2h4.2L8.4 5H13v7.8H3z"/><path d="M3 7.6h10"/>',
  focus: '<circle cx="8" cy="8" r="3.1"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2"/>',
};

const DOCK = [
  ['assign', 'Assign'],
  ['holdings', 'Holdings'],
  ['market', 'Market'],
  ['refinery', 'Refinery'],
  ['tactics', 'Tactics'],
  ['dossier', 'Dossier'],
];

const icon = k => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

export function buildHud(liveSim, { root = document.getElementById('ui'), onFocus = null } = {}) {
  const speeds = content.balance.tick.speeds;
  let sim = liveSim;
  let unsub = null;
  root.innerHTML = `
<div id="tickline"><i></i></div>

<div id="topbar">
  <button class="hud-cash" data-hud="holdings" data-tab="finance">
    <em></em><s>cr</s><u></u>
  </button>
  <div class="hud-week"><b></b><s></s></div>
  <button class="hud-share" data-hud="quarterly"><em></em><s>of the Reach</s></button>
</div>

<div id="sharebar"><i class="you"></i><i class="them"></i><i class="other"></i></div>

<div id="feed">
  <div id="ticker"><span></span></div>
</div>

<div id="controls">
  ${onFocus ? `<button class="hud-focus" data-hud-focus aria-label="Recentre">${icon('focus')}</button>` : ''}
  <div id="speed" role="group" aria-label="Speed">
    ${speeds.map(v => `<button data-speed="${v}" aria-label="${v ? v + ' times' : 'Pause'}">${v ? '×' + v : '❙❙'}</button>`).join('')}
  </div>
</div>

<nav id="dock">
  ${DOCK.map(([id, label]) => `<button data-hud="${id}">${icon(id)}<s>${label}</s></button>`).join('')}
</nav>`;

  const el = {
    cash: root.querySelector('.hud-cash em'),
    cashDelta: root.querySelector('.hud-cash u'),
    week: root.querySelector('.hud-week b'),
    quarter: root.querySelector('.hud-week s'),
    share: root.querySelector('.hud-share em'),
    bar: root.querySelector('#sharebar'),
    ticker: root.querySelector('#ticker'),
    tickerText: root.querySelector('#ticker span'),
    feed: root.querySelector('#feed'),
    tickline: root.querySelector('#tickline i'),
    speed: root.querySelector('#speed'),
    dock: root.querySelector('#dock'),
  };

  el.feed.addEventListener('click', () => { for (const r of el.feed.querySelectorAll('.feed-row')) retire(r, 0); });

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-hud]');
    if (b) {
      const id = b.dataset.hud;
      return panels.isOpen(id) && panels.top()?.id === id
        ? panels.close(id)
        : panels.open(id, b.dataset.tab ? { tab: b.dataset.tab } : {});
    }
    if (e.target.closest('[data-hud-focus]')) return onFocus?.();
    const s = e.target.closest('[data-speed]');
    if (s) sim.setSpeed(+s.dataset.speed);
  });

  let tickerTimer = 0;

  const hud = {
    root,
    get sim() { return sim; },
    get live() { return liveSim; },

    // The showroom points the whole shell at a canned company; the HUD follows it there and back
    // so what gets reviewed is the real HUD against real state.
    bind(view) {
      unsub?.();
      sim = view || liveSim;
      unsub = sim.on(kind => {
        if (kind === 'tick') hud.react(sim.events);
        else { hud.refresh(); panels.refresh(); }
      });
      hud.refresh();
    },

    refresh() {
      if (sim.held !== null && !panels.isOpen('quarterly')) sim.release();
      const st = sim.state;
      const c = sim.last('cost');
      el.cash.textContent = crShort(st.cash);
      el.cash.parentElement.classList.toggle('thin', st.cash < 8000);
      el.cashDelta.textContent = c ? delta(c.revenue - c.total) : '';
      el.cashDelta.className = c ? (c.revenue - c.total >= 0 ? 'up' : 'down') : '';
      el.week.textContent = weekLabel(st.week);
      el.quarter.textContent = quarterLabel(st.week);
      el.share.textContent = pct(st.share.player, 1);
      el.bar.children[0].style.width = (st.share.player * 100).toFixed(2) + '%';
      el.bar.children[1].style.width = (st.share.rival * 100).toFixed(2) + '%';
      el.bar.children[2].style.width = (st.share.other * 100).toFixed(2) + '%';
      for (const b of el.speed.children) b.classList.toggle('on', +b.dataset.speed === sim.speed);
      for (const b of el.dock.children) b.classList.toggle('on', panels.isOpen(b.dataset.hud));
      document.body.classList.toggle('paused', sim.speed === 0);
    },

    // 0..1 through the current week. Component 12's clock drives this.
    setTickProgress(f) { el.tickline.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(2) + '%'; },

    ticker(text, ms = 5200) {
      el.tickerText.textContent = text;
      el.ticker.classList.add('on');
      clearTimeout(tickerTimer);
      tickerTimer = setTimeout(() => el.ticker.classList.remove('on'), ms);
    },

    // The week's account, newest week only. Rows retire themselves and a tap clears the lot; it is
    // never a log, and it never takes the middle of the screen.
    feed(rows) {
      // last week's lines go at once, not on a timer: a ×4 run would otherwise stack them
      for (const old of el.feed.querySelectorAll('.feed-row')) { clearTimeout(old.__t); old.remove(); }
      const cap = innerHeight < 560 ? 2 : 4;
      rows.slice(0, cap).forEach((r, i) => {
        const n = document.createElement('div');
        n.className = `feed-row f-${r.tone || 'flat'}`;
        n.innerHTML = `<b>${esc(r.label)}</b>${r.value ? `<em>${esc(r.value)}</em>` : ''}${r.sub ? `<s>${esc(r.sub)}</s>` : ''}`;
        el.feed.appendChild(n);
        retire(n, 6400 + i * 260);
      });
    },

    // The UI's own reaction to a tick's events. Sheets never stop the clock, so this only ever
    // slides something up over a scene that keeps running — except the end card, which is the end.
    react(events) {
      hud.feed(feedRows(events, sim));

      if (sim.state.over) {
        sim.held = null;
        sim.setSpeed(0);
        // nothing from the run sits behind the end card — a ‹ back to last quarter's report is not
        // a thing anyone wants at that point
        if (!panels.isOpen('gameover')) { panels.closeAll(); panels.open('gameover', { over: sim.state.over }); }
        hud.refresh();
        return;
      }

      const quarter = events.find(e => e.t === 'quarter');
      const unlock = events.find(e => e.t === 'unlock' && e.story);
      // Thirteen weeks is the game's rhythm: the clock stops and the report is read. The panel has
      // to be on the stack BEFORE the hold — `refresh` hands the speed straight back if it is not.
      if (quarter) { panels.open('quarterly', { event: quarter }); sim.hold(); }
      if (unlock) panels.open('story', { story: featured(unlock.tactic) || unlock.story, tactic: unlock.tactic });
      hud.refresh();
    },
  };

  function retire(node, ms) {
    clearTimeout(node.__t);
    node.__t = setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 260);
    }, ms);
  }

  hud.bind(liveSim);
  panels.onSim(view => hud.bind(view));
  panels.onStack(() => hud.refresh());
  document.body.classList.add('game');
  return hud;
}

// One tick of events → at most a handful of readable lines, ordered by how much the player needs
// to know. `p` is priority, not position; the stack is capped, so a bad week pushes the routine
// lines out rather than burying itself under them.
function feedRows(events, sim) {
  const rows = [];
  const of = t => events.filter(e => e.t === t);
  const add = (p, tone, label, value = '', sub = '') => rows.push({ p, tone, label, value, sub });
  const site = id => SITE[id] || id;
  const comm = id => content.get('commodity', id)?.name.toLowerCase() || id;
  const sum = (list, k) => list.reduce((n, e) => n + (e[k] || 0), 0);

  for (const e of of('shock')) add(0, e.cash < 0 ? 'bad' : 'good', e.title || 'Something landed', e.cash ? delta(e.cash) : '', e.body || '');
  for (const e of of('investigate')) {
    add(0, 'bad', `Investigated over ${e.name}`, '−' + crShort(e.fine),
      e.banned ? 'Struck off for the rest of the run.' : `Lost ${pct(e.shareLoss, 1)} of the Reach with it.`);
  }
  for (const e of of('warn')) add(1, 'warn', e.body || WARN_WORD[e.level] || 'A letter arrived', WARN_TAG[e.level] || '');
  for (const e of of('shortfall')) add(2, 'bad', `Short ${e.units} t on the contract`, '−' + crShort(e.fee));
  for (const e of of('offer')) add(2, 'good', `${brand(e.brand)} wants a supply agreement`);
  for (const e of of('unlock')) add(2, 'good', `${e.name} unlocked`, BAND_TAG[e.band] || '');
  for (const e of of('tactic')) add(2, 'good', `${e.name} is running`, e.cost ? '−' + crShort(e.cost) : 'free');
  for (const e of of('expire')) add(3, 'warn', `${e.name} has run out`);
  for (const e of of('contractEnd')) add(3, 'warn', `The ${brand(e.with)} contract has ended`);
  for (const e of of('module')) add(3, 'good', `${e.name} built at Ledger`, '−' + crShort(e.cost));
  for (const e of of('ship')) add(3, 'good', `${e.name} ordered`, '−' + crShort(e.cost));

  const del = of('deliver');
  if (del.length) {
    const units = {};
    for (const e of del) units[e.commodity] = (units[e.commodity] || 0) + e.units;
    const [cid, u] = Object.entries(units).sort((a, b) => b[1] - a[1])[0];
    const extra = Object.keys(units).length - 1;
    add(4, 'good', `Sold ${Math.round(u)} t of ${comm(cid)}${extra > 0 ? ` and ${extra} more` : ''}`, '+' + crShort(sum(del, 'credits')));
  }

  const c = events.find(e => e.t === 'cost');
  if (c && c.revenue - c.total < 0) {
    const worst = [['wages', c.wages], ['module upkeep', c.modules], ['fuel', c.fuel], ['interest', c.interest], ['overhead', c.overhead]]
      .sort((a, b) => b[1] - a[1])[0];
    add(4, 'bad', `The week closed in the red · ${worst[0]} ${cr(worst[1])}`, delta(c.revenue - c.total));
  }

  const sh = sim.all('share');
  if (sh.length > 1) {
    const d = sh[sh.length - 1].player - sh[sh.length - 2].player;
    if (Math.abs(d) >= 0.001) add(5, d > 0 ? 'good' : 'bad', `Reach share ${pct(sh[sh.length - 1].player, 1)}`, pts(d));
  }

  for (const e of of('rival')) add(5, 'flat', `${content.rival.profile.name}: ${rivalWord(e.action)}`);

  const mined = of('mine');
  if (mined.length) add(6, 'flat', `Cut ${Math.round(sum(mined, 'units'))} t of ore at ${site('kestrel')}`, mined.some(e => e.rich) ? 'rich vein' : '');
  const refined = of('refine');
  if (refined.length) {
    const into = refined[refined.length - 1].into;
    add(6, 'flat', `Refined ${Math.round(sum(refined, 'units'))} t of ${comm(into)}`);
  }

  return rows.sort((a, b) => a.p - b.p);
}

const SITE = Object.fromEntries((content.get('system', 'tamber')?.sites || []).map(s => [s.id, s.name]));
const BAND_TAG = { legal: 'legal', grey: 'contested', illegal: 'illegal' };
const WARN_WORD = { debt: 'The bank is watching the overdraft', heat: 'The regulator is reading your filings', contract: 'A contract is running short' };
const WARN_TAG = { debt: 'debt', heat: 'heat', contract: 'contract' };

const brand = id => ({ ryland: 'Ryland Coil Works', harrow: 'Harrow Filament' }[id] || id);
const rivalWord = a => ({
  expand_capacity: 'another hull ordered.',
  undercut_freight: 'freight rates cut.',
  own_supply_deal: 'signed an exclusive of its own.',
  buy_brand: 'bought a brand outright.',
  cut_costs: 'cutting its own costs.',
  hold: 'holding.',
}[a] || a);

export default buildHud;
