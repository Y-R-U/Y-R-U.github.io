// Tap anything in the Reach and this tells you what it is. A one-line card first, a fuller
// readout if you ask for it, and a fly-to that always leaves a way back.
//
// It is not a panel: panels are the bottom-sheet stack and they cover the scene, which is the
// opposite of what an object inspector is for. This sits in the same lane as the objective chip
// and hides that instead.

import content from '../sim/content.js';
import { camera } from '../world/camera.js';
import { panels } from './panels.js';
import { esc, cr, credits, pct, tonnes } from './format.js';

let ctx = null;
let root = null;
let subject = null;
let open = false;
let expanded = false;
let parked = null;   // where the camera was before a fly-to

export const inspect = {
  attach(opts) {
    ctx = opts;
    root = document.getElementById('inspect');
    if (!root) {
      root = document.createElement('div');
      root.id = 'inspect';
      document.body.appendChild(root);
    }
    root.addEventListener('pointerdown', e => e.stopPropagation());
    root.addEventListener('click', onClick);
    ctx.sim?.on(kind => { if (open && kind !== 'speed') paint(); });
    return inspect;
  },

  show(tag) {
    if (!tag) return inspect.close();
    subject = tag;
    expanded = false;
    open = true;
    document.body.classList.add('inspecting');
    paint();
    return inspect;
  },

  close() {
    open = false;
    subject = null;
    painted = '';
    document.body.classList.remove('inspecting');
    if (root) root.innerHTML = '';
    return inspect;
  },

  get open() { return open; },
  get parked() { return !!parked; },
};

function onClick(e) {
  const b = e.target.closest('[data-x]');
  if (!b) return;
  const a = b.dataset.x;
  if (a === 'close') return inspect.close();
  if (a === 'more') { expanded = !expanded; return paint(); }
  if (a === 'fly') return flyTo();
  if (a === 'back') return flyBack();
  if (a === 'panel') { inspect.close(); panels.open(b.dataset.panel, b.dataset.props ? JSON.parse(b.dataset.props) : {}); }
}

/* ── the camera trip ────────────────────────────────────────────────────── */

function flyTo() {
  const d = describe(subject);
  if (!d?.focus) return;
  if (!parked) parked = camera.snapshot();
  if (d.focus.object) camera.focus(d.focus.object, { dist: d.focus.dist, ms: 900 });
  else if (d.focus.point) camera.focusPoint(d.focus.point, d.focus.radius || 60, { ms: 900 });
  paint();
}

function flyBack() {
  const p = parked;
  parked = null;
  camera.goTo(p, 800);
  paint();
}

/* ── paint ──────────────────────────────────────────────────────────────── */

let painted = '';

function paint() {
  if (!open || !subject) return;
  const d = describe(subject);
  if (!d) return inspect.close();

  const facts = (d.facts || []).filter(f => f && f[1] !== undefined && f[1] !== null && f[1] !== '');
  const html = `
<div class="ins-card">
  <button class="ins-close" data-x="close" aria-label="Close">✕</button>
  <button class="ins-head" data-x="more" aria-expanded="${expanded}">
    <i class="ins-kind">${esc(d.kind)}</i>
    <b>${esc(d.title)}</b>
    <s>${esc(d.sub)}</s>
    <u>${expanded ? '▾' : '▸'}</u>
  </button>
  ${expanded ? `
  <div class="ins-body">
    ${facts.length ? `<ul class="ins-facts">${facts.map(([k, v]) =>
      `<li><s>${esc(k)}</s><em>${esc(String(v))}</em></li>`).join('')}</ul>` : ''}
    ${d.body ? `<p>${esc(d.body)}</p>` : ''}
  </div>` : ''}
  <div class="ins-row">
    ${d.focus ? `<button data-x="fly">View</button>` : ''}
    ${parked ? `<button data-x="back">Back</button>` : ''}
    ${d.action ? `<button class="go" data-x="panel" data-panel="${esc(d.action.panel)}"
      data-props='${esc(JSON.stringify(d.action.props || {}))}'>${esc(d.action.label)}</button>` : ''}
  </div>
</div>`;
  // the card repaints on every tick because its facts are live, so an unchanged card must not be
  // rebuilt — a fresh node replays the fade-in and the whole thing flickers once a second
  if (html === painted) return;
  painted = html;
  root.innerHTML = html;
  requestAnimationFrame(() => root.querySelector('.ins-card')?.classList.add('in'));
}

/* ── what a thing is ────────────────────────────────────────────────────── */

function describe(tag) {
  const sim = ctx.sim;
  if (tag.kind === 'ship') return describeShip(tag, sim);
  if (tag.kind === 'rock') return describeRock(tag, sim);
  if (tag.kind === 'rival') return describeRival(tag, sim);
  if (tag.kind === 'site') return describeSite(tag, sim);
  return null;
}

function describeShip(tag, sim) {
  const sh = sim.ship(tag.ship);
  const def = sh && sim.shipDef(sh);
  if (!def) return null;
  const load = Object.entries(sh.cargo || {}).filter(([, n]) => n > 0);
  const carried = load.reduce((n, [, v]) => n + v, 0);
  return {
    kind: 'Your ship',
    title: def.name,
    sub: sh.leg ? `In transit to ${siteName(sh.leg.to)}` : `Docked at ${siteName(sh.at)}`,
    body: def.mine
      ? `The only hull you own that can cut rock. It works the face itself and carries what it cuts home.`
      : `A freighter. It moves what the station makes, and it costs the same tied up as it does flying.`,
    facts: [
      ['Registry', sh.id],
      ['Hold', `${carried ? Math.round(carried) + ' / ' : ''}${def.hold} t`],
      ['Carrying', load.length ? load.map(([c, n]) => `${Math.round(n)} t ${commName(c)}`).join(', ') : 'empty'],
      ['Speed', def.speed.toFixed(2) + '×'],
      ['Wages', cr(def.upkeep) + ' / wk'],
      def.mine ? ['Cuts', def.mine + ' t / wk'] : null,
      ['Replacement', credits(def.cost)],
    ],
    focus: { object: tag.object, dist: (def.hull?.len || 60) * 2.6 },
    action: { panel: 'assign', label: 'Assign', props: { ship: sh.id } },
  };
}

// Nobody surveys a belt one rock at a time and gives them all names, so these read the way real
// minor bodies do: the field, then the survey block, then the object inside it. The number is a
// hash of the rock's own index, so the same rock is the same designation every time.
function describeRock(tag, sim) {
  const r = tag.rock || {};
  const field = content.get('system', 'tamber')?.sites.find(s => s.id === (r.field || 'kestrel'));
  const n = hash(`${r.field || 'kestrel'}:${r.index || 0}`);
  const block = 1 + (n % 9);
  const num = 1000 + (n % 8000);
  const suffix = 'ABCDEFGH'[(n >>> 5) % 8];
  const radius = tag.radius || r.radius || 60;
  const span = radius * 2;
  // a rubble pile at roughly 2 t/m³ — a round enough number to be honest about being an estimate
  const mass = (4 / 3) * Math.PI * radius ** 3 * 2 / 1e6;
  const ore = r.ore ?? ((n % 100) < 34 ? ((n % 40) + 12) / 100 : 0);
  const grade = ore <= 0 ? 'barren' : ore > 0.7 ? 'rich' : ore > 0.3 ? 'workable' : 'marginal';
  // nobody catalogues gravel. Under ten metres it is a chip with a survey tag, not a body.
  const chip = span < 10;
  const name = chip ? `Chip ${block}-${num}` : `KB ${block}-${num}${suffix}`;
  return {
    kind: (field?.name || 'Kestrel Belt'),
    title: name,
    sub: `${span < 1 ? span.toFixed(1) : Math.round(span)} m across · ${chip ? 'uncatalogued' : grade}`,
    body: chip
      ? 'Too small for the survey to bother with. There are tens of thousands of these, and the field is mostly made of them.'
      : ore > 0
        ? `Silicate rubble with a halide-bearing seam through it${r.worked ? '. This is the face your rig is cutting.' : '. Nothing is working it.'}`
        : 'Silicate rubble with no seam anyone has found. It is in the way, and that is all it is.',
    facts: [
      ['Designation', name],
      ['Field', field?.name || 'Kestrel Belt'],
      ['Span', `${span < 1 ? span.toFixed(1) : Math.round(span)} m`],
      ['Mass', mass < 0.001 ? `${Math.round(mass * 1e6).toLocaleString('en-US')} t (est.)`
        : `${mass < 1 ? mass.toFixed(2) : Math.round(mass).toLocaleString('en-US')} Mt (est.)`],
      ['Ore grade', chip ? 'not surveyed' : ore > 0 ? pct(ore) : 'none detected'],
      ['Claim', 'unclaimed — the Reach has no belt title'],
    ],
    focus: tag.at ? { point: tag.at, radius } : { object: tag.object, dist: radius * 3.4 },
    action: { panel: 'assign', label: 'Send the rig', props: { dest: 'kestrel' } },
  };
}

function describeRival(tag, sim) {
  const rival = content.rival.profile;
  const st = sim.state;
  return {
    kind: 'Rival hulls',
    title: `${rival.name} line`,
    sub: `Four hulls holding station off Dray Yard`,
    body: `${rival.name} moves ${pct(st.share.rival, 1)} of the Reach. You cannot board them, buy them or bid for them — the only thing you can take off Corvain is the work.`,
    facts: [
      ['Operator', rival.name],
      ['Their share', pct(st.share.rival, 1)],
      ['Your share', pct(st.share.player, 1)],
      ['Home', 'Dray Yard'],
    ],
    focus: { object: tag.object, dist: 420 },
    action: { panel: 'quarterly', label: 'The numbers' },
  };
}

function describeSite(tag, sim) {
  const def = content.get('system', 'tamber')?.sites.find(s => s.id === tag.site);
  if (!def) return null;
  const st = sim.state.sites[tag.site];
  const focus = { object: tag.object, dist: tag.site === 'ossian' ? 2600 : tag.site === 'kestrel' ? 1400 : 620 };

  if (def.kind === 'market') {
    const rows = (def.buys || []).map(c =>
      [commName(c), `${cr(sim.state.market?.[c]?.price ?? content.get('commodity', c).base)} cr/t`]);
    return {
      kind: 'Market', title: def.name, sub: 'The only buyer in the Reach',
      body: 'A gas giant with three hundred million people in orbit around it. Everything the Reach digs up ends up here, and nothing you cannot sell here is worth carrying.',
      facts: [...rows, ['Buys', (def.buys || []).map(commName).join(', ')]],
      focus, action: { panel: 'market', label: 'Market' },
    };
  }

  if (def.kind === 'belt') {
    return {
      kind: 'Asteroid field', title: def.name, sub: `Reserve ${pct(st?.reserve ?? 1)} · one week out`,
      body: 'Loose silicate rubble with halide seams through it. Unclaimed, unregulated, and the only place in the system the raw material comes from.',
      facts: [
        ['Yield', `${def.yield ?? 1}× base`],
        ['Reserve left', pct(st?.reserve ?? 1)],
        ['Transit', 'one week from Ledger'],
        ['Title', 'none — first hull to the face works it'],
      ],
      focus, action: { panel: 'assign', label: 'Send a ship', props: { dest: 'kestrel' } },
    };
  }

  const mine = def.owner === 'player';
  const mods = (st?.modules || []).map(m => content.get('module', m)?.name).filter(Boolean);
  return {
    kind: mine ? 'Your station' : 'Rival station',
    title: def.name,
    sub: mine ? `${mods.length} modules · home berth` : content.rival.profile.name,
    body: mine
      ? 'Everything you own that does not move. Cargo lands here, the converters run here, and every module you buy is bolted onto this truss.'
      : `${content.rival.profile.name}'s yard. Bigger than yours, older than yours, and the reason the Reach looks the way it does.`,
    facts: mine
      ? [['Modules', mods.join(', ') || 'none'],
        ['Ore held', tonnes(sim.stock(def.id, 'ore'))],
        ['Halide held', tonnes(sim.stock(def.id, 'halide'))],
        ['Filament held', tonnes(sim.stock(def.id, 'filament'))],
        ['Upkeep', cr((st?.modules || []).reduce((n, m) => n + (content.get('module', m)?.upkeep || 0), 0)) + ' / wk']]
      : [['Operator', content.rival.profile.name],
        ['Their share', pct(sim.state.share.rival, 1)],
        ['Modules', 'five, last anyone counted'],
        ['Access', 'none — you can dock, and that is all']],
    focus,
    action: mine ? { panel: 'holdings', label: 'Holdings', props: { tab: 'station' } }
      : { panel: 'quarterly', label: 'The numbers' },
  };
}

const siteName = id => content.get('system', 'tamber')?.sites.find(s => s.id === id)?.name || id;
const commName = id => content.get('commodity', id)?.name || id;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export default inspect;
