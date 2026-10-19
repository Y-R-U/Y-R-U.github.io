import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { load } from '../app/modules.js';
import { maps, levelById, data } from '../app/data.js';
import { ibtn } from './components.js';
import { hint } from './tutorial.js';
import { orient } from '../app/orient.js';

export const FEATURES = [
  { id: 'story', label: 'Operations', sub: 'Story contracts', icon: 'map' },
  { id: 'squad', label: 'Barracks', sub: 'Squad & units', icon: 'squad' },
  { id: 'recruit', label: 'Recruitment', sub: 'New mercs', icon: 'recruit' },
  { id: 'arena', label: 'Arena', sub: 'Vector League', icon: 'trophy' },
  { id: 'events', label: 'Special Ops', sub: 'Rotating events', icon: 'calendar' },
  { id: 'workshop', label: 'Workshop', sub: 'Upgrades', icon: 'wrench' },
  { id: 'hq', label: 'HQ', sub: 'Company skills', icon: 'hq' },
];

const GATE = { workshop: 'workshop', recruit: 'recruit_street', hq: 'hq', arena: 'arena', events: 'daily_ops' };
export const featureOpen = (store, id) => store.isUnlocked(GATE[id]);
export function lockedMsg(store, id) {
  const lid = store.unlockLevelFor(GATE[id]);
  const l = lid && levelById(lid);
  return (FEATURES.find((f) => f.id === id)?.label || id) + ' unlocks after ' + (l ? l.map.name + ' · ' + (l.level.node ?? '') + ' ' + l.level.name : 'more story progress');
}

export function currentMapIndex(store) {
  const ms = maps();
  let idx = 1;
  ms.forEach((m, i) => { if (store.mapOpen(i + 1)) idx = i + 1; });
  return idx;
}

export function routeForFeature(id, store) {
  if (id === 'story') return '/map/' + currentMapIndex(store);
  return '/' + id;
}

const TALL_M = { top: 64, bottom: 150, side: 8 };

export async function mount(root, ctx) {
  const { store, router, engine } = ctx;
  const go = (id) => featureOpen(store, id) ? router.go(routeForFeature(id, store)) : ctx.toast(lockedMsg(store, id), 'err', 3);
  const unlocked = FEATURES.map((f) => f.id).filter((id) => featureOpen(store, id));
  let scene = null;
  // the squad parked in the yard: current formation, front column first
  const squad = store.squad().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
    .map((u) => ({ model: u.model || u.id, rarity: u.rarity, faction: u.faction, rank: u.rank || 0 }));
  const riftOpen = store.mapOpen(6);
  const hubMod = engine ? await load('hub') : null;
  if (hubMod?.createHubScene) {
    try {
      scene = hubMod.createHubScene(engine, { companyLevel: store.state.company.level, unlocked, container: root,
        names: Object.fromEntries(FEATURES.map((f) => [f.id, f.label])), features: data().features, squad: squad.length ? squad : undefined, riftOpen, margins: TALL_M });
      scene.on?.('select', go);
      scene.on?.('locked', go);
    } catch (e) { console.warn('[hub] scene failed, using stub', e); scene = null; }
  }

  const dock = h('div.hub-dock', ['story', 'squad', 'recruit', 'arena', 'events'].map((id) => {
    const f = FEATURES.find((x) => x.id === id);
    return h('button.dock-btn' + (featureOpen(store, id) ? '' : '.locked'), { type: 'button', onclick: () => go(id), dataset: { feature: id } }, icon(featureOpen(store, id) ? f.icon : 'lock'), h('span', f.label));
  }));
  const gear = ibtn('gear', '', () => router.go('/settings'));
  gear.classList.add('hub-gear');
  const side = h('div.hub-side', gear);
  root.append(side);

  if (!scene) {
    // stub compound: a grid of building tiles (replaced by the 3D compound when js/hub lands)
    root.append(h('div.hub-stub',
      h('div.hub-stub-title', h('div.vp-kicker', 'Company compound'), h('h2.vp-title', 'Sector 7 Platform')),
      h('div.hub-grid', FEATURES.map((f) => h('button.hub-tile.vp-panel' + (featureOpen(store, f.id) ? '' : '.locked'), { type: 'button', onclick: () => go(f.id), dataset: { feature: f.id } },
        icon(f.icon), h('b', f.label), h('small', f.sub))))));
  }
  const cta = h('button.hub-cta.vp-btn.primary.big', { type: 'button', onclick: () => go('story') },
    icon('play'), h('span', store.levelStars('m1_l1') ? 'Continue' : 'Start'), h('small', maps()[currentMapIndex(store) - 1]?.name || ''));
  root.append(cta, dock);
  // landscape (docs/LANDSCAPE.md §3.1): the dock is a left rail, CONTINUE sits bottom-right, the gear joins the top bar;
  // the scene and its labels keep clear of all three. Rotation moves nodes, never rebuilds them.
  let wasLand = false;
  const layout = () => {
    const land = orient.landscape;
    const tb = ctx.screens?.topbar?.el;
    if (land && tb?.isConnected) tb.insertBefore(gear, tb.querySelector('.tb-fs') || tb.querySelector('.tb-acct'));
    else if (gear.parentNode !== side) side.append(gear);
    if (!scene?.setMargins) return;
    if (!land) { if (wasLand) scene.setMargins(TALL_M); wasLand = false; return; }
    wasLand = true;
    const r = root.getBoundingClientRect(), d = dock.getBoundingClientRect(), c = cta.getBoundingClientRect();
    scene.setMargins({ top: 52, bottom: 16, left: Math.round(d.right - r.left + 8), right: Math.round(r.right - c.right + 0) || 12,
      avoid: [{ x: c.left - r.left - 6, y: c.top - r.top - 6, w: c.width + 12, h: c.height + 12 }] });
  };
  const offOrient = orient.on(() => { layout(); requestAnimationFrame(layout); });
  requestAnimationFrame(layout);
  // sim-4: a squad unit has its rank-up shards but credits are short -> one notice per unit and rank per session
  const told = (ctx.session.rankSave ||= new Set());
  for (const v of store.squad()) {
    const rc = store.rankUpCost(v.uid), cr = store.state.cur.credits || 0;
    const key = v.uid + ':' + v.rank;
    if (!rc || told.has(key) || (v.shards || 0) < rc.shards || cr >= rc.credits) continue;
    told.add(key);
    setTimeout(() => ctx.toast('Save credits for a rank-up', 'gold', 4.5, { icon: 'credits', sub: v.name + ' has the shards; ' + fmt(rc.credits - cr) + ' more credits to rank it up.' }), 1200);
    break;
  }
  // upgrade loop: once the first contract has paid out scrap, point at the Barracks
  if (store.levelStars('m1_l1') && (store.state.cur?.scrap || 0) > 0)
    hint(store, 'barracks', dock.querySelector('[data-feature="squad"]'), 'Contracts pay out scrap. Spend it in the Barracks to level up your robots: tougher contracts need stronger squads.', { delay: 900 });
  return { scene, topbar: true, bg: scene ? 'off' : 'on', unmount() { offOrient(); gear.remove(); scene?.off?.('select', go); } };
}
