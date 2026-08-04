// The always-on layer: cash, week, share meter, speed, and the dock that opens every panel.
// Nothing here sits in the middle third of the screen and nothing here blocks a gesture on the 3D.

import content from '../sim/content.js';
import { panels } from './panels.js';
import { esc, cr, crShort, delta, pct, quarterLabel, weekLabel } from './format.js';

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

<div id="ticker"><span></span></div>

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
    tickline: root.querySelector('#tickline i'),
    speed: root.querySelector('#speed'),
    dock: root.querySelector('#dock'),
  };

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

    // The UI's own reaction to a tick's events. Sheets never stop the clock, so this only ever
    // slides something up over a scene that keeps running.
    react(events) {
      for (const e of events) {
        if (e.t === 'offer') hud.ticker(`${brand(e.brand)} wants a supply agreement.`);
        if (e.t === 'rival') hud.ticker(`${content.rival.profile.name}: ${rivalWord(e.action)}`);
        if (e.t === 'investigate') hud.ticker(`Investigated over ${e.name}. Fine ${cr(e.fine)} cr.`);
        if (e.t === 'win') hud.ticker(`${e.tier === 'monopoly' ? 'Monopoly' : 'Duopoly'} — ${pct(e.share, 1)} of the Reach.`);
        if (e.t === 'lose') hud.ticker('The company is out of money.');
      }
      const unlock = events.find(e => e.t === 'unlock' && e.story);
      const quarter = events.find(e => e.t === 'quarter');
      if (unlock) panels.open('story', { story: unlock.story, tactic: unlock.tactic });
      else if (quarter) panels.open('quarterly', { event: quarter });
      hud.refresh();
    },
  };

  hud.bind(liveSim);
  panels.onSim(view => hud.bind(view));
  panels.onStack(() => hud.refresh());
  document.body.classList.add('game');
  return hud;
}

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
