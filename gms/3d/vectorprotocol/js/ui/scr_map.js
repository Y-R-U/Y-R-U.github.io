import { h, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { load } from '../app/modules.js';
import { maps, mapByIndex, unitDef, wavePower } from '../app/data.js';
import { btn, ibtn, stars, header, rewardChips } from './components.js';
import { playScene } from './dialogue.js';
import { hint } from './tutorial.js';
import { orient } from '../app/orient.js';

export const openMaps = (store) => maps().filter((m, i) => store.mapOpen(i + 1)).length;

// Chapter list (#/chapters): the hub agent's createMapSelect, stub list otherwise.
export async function mountChapters(root, ctx) {
  const { store, router } = ctx;
  const all = maps();
  const mapMod = await load('map');
  root.append(header('Operations', () => router.go('/hub')));
  const host = h('div.ch-host');
  root.append(host);
  let sel = null;
  if (mapMod?.createMapSelect) {
    try {
      sel = mapMod.createMapSelect(host, { maps: all, progress: store.state.progress, isOpen: (lid) => store.isLevelOpen(lid), title: 'CONTRACTS' });
      sel.on('map', (id) => router.go('/map/' + (all.findIndex((m) => m.id === id) + 1)));
    } catch (e) { console.warn('[chapters] createMapSelect failed', e); sel = null; host.replaceChildren(); }
  }
  if (!sel) host.append(h('div.col', all.map((m, i) => btn(m.name, () => store.mapOpen(i + 1) ? router.go('/map/' + (i + 1)) : ctx.toast('Locked', 'err'), { icon: store.mapOpen(i + 1) ? 'map' : 'lock' }))));
  return { topbar: false, bg: 'on', unmount() { sel?.dispose?.(); } };
}

export async function mount(root, ctx, route) {
  const { store, router } = ctx;
  const n = +(route.args[0] || 1);
  const map = mapByIndex(n);
  if (!map) { router.go('/map/1', { replace: true }); return {}; }
  if (n > 1 && !store.mapOpen(n)) { ctx.toast(map.name + ' is locked — clear the previous chapter', 'err'); router.go('/map/' + Math.max(1, openMaps(store)), { replace: true }); return {}; }
  const all = maps();
  const idx = all.indexOf(map) + 1;

  const sheet = h('div.lvl-sheet.hide');
  const openLevel = (levelId) => showLevel(sheet, ctx, map, levelId);

  const host = h('div.map-host');
  const mapMod = await load('map');
  let mapObj = null;
  if (mapMod?.createStoryMap) {
    root.classList.add('real-map');
    root.append(host, sheet);
    try {
      mapObj = mapMod.createStoryMap(host, { mapId: map.id, map, index: idx - 1, progress: store.state.progress, isOpen: (id) => store.isLevelOpen(id), showTitle: true, showBack: true, cta: true });
      mapObj.on?.('level', openLevel);
      mapObj.on?.('back', () => router.go(openMaps(store) > 1 ? '/chapters' : '/hub'));
    } catch (e) { console.warn('[map] createStoryMap failed, stub', e); mapObj = null; host.innerHTML = ''; root.classList.remove('real-map'); }
  }
  if (!mapObj) {
    const prev = idx > 1 ? ibtn('back', '', () => router.go('/map/' + (idx - 1))) : null;
    const next = idx < all.length ? ibtn('back', '', () => store.mapOpen(idx + 1) ? router.go('/map/' + (idx + 1)) : ctx.toast('Clear ' + map.name + ' first', 'err'), store.mapOpen(idx + 1) ? 'flip' : 'flip off') : null;
    const done = map.levels.filter((l) => store.levelStars(l.id)).length;
    const starsGot = map.levels.reduce((a, l) => a + store.levelStars(l.id), 0);
    root.append(header('', () => router.go('/hub')),
      h('div.map-title', h('div.vp-kicker', 'Operation ' + String(idx).padStart(2, '0')), h('h2.vp-title', map.name),
        h('div.map-prog', h('span', done + '/' + map.levels.length + ' cleared'), h('span.t-gold', '★ ' + starsGot + '/' + map.levels.length * 3))),
      h('div.map-nav', prev || h('i'), next || h('i')), host, sheet);
    stubMap(host, ctx, map, openLevel);
  }
  // the chest bar tucks under the map's title row (its height varies with the chapter name's wrap)
  const cb = chestBar(ctx, map.id);
  root.append(cb);
  // landscape: the map head has a slot between title and stars (hub's `.vpm-slot` / map.headSlot), and the level sheet is a
  // right-side panel under the head (docs/LANDSCAPE.md §4-5)
  const placeCb = () => {
    const head = root.querySelector('.vpm-head, .map-title');
    if (!head) return;
    const hb = Math.round(head.getBoundingClientRect().bottom - root.getBoundingClientRect().top);
    root.style.setProperty('--map-head', hb + 'px');
    const slot = orient.landscape ? (mapObj?.headSlot || root.querySelector('.vpm-slot')) : null;
    if (slot) { if (cb.parentNode !== slot) slot.append(cb); cb.classList.add('in-slot'); cb.style.top = ''; return; }
    if (cb.parentNode !== root) root.append(cb);
    cb.classList.remove('in-slot');
    cb.style.top = hb + 8 + 'px';
  };
  const cro = new ResizeObserver(placeCb); cro.observe(root);
  requestAnimationFrame(placeCb);
  const offOrient = orient.on(() => { placeCb(); requestAnimationFrame(placeCb); });
  if (route.q.level) openLevel(route.q.level);
  return { topbar: !mapObj, bg: 'on', unmount() { offOrient(); cro.disconnect(); mapObj?.dispose?.(); } };
}

function stubMap(host, ctx, map, openLevel) {
  const { store } = ctx;
  const L = map.levels;
  const W = Math.max(host.clientWidth || 360, 120 + (L.length - 1) * 96);
  const pts = L.map((l, i) => ({ l, x: l.x != null ? l.x * W : 60 + i * 96, y: l.y != null ? l.y : 0.42 + (i % 2 ? -0.13 : 0.13) * (i % 4 < 2 ? 1 : -0.6) }));
  const road = 'M' + pts.map((p) => p.x + ',' + (p.y * 100)).join(' L');
  const scroller = h('div.map-scroll.scroll-x');
  const inner = h('div.map-inner', { style: { width: W + 'px' } });
  inner.innerHTML = `<svg class="map-road" viewBox="0 0 ${W} 100" preserveAspectRatio="none"><path d="${road}" class="r0"/><path d="${road}" class="r1"/></svg>`;
  let current = null;
  for (const p of pts) {
    const st = store.levelStars(p.l.id), open = store.isLevelOpen(p.l.id);
    if (open && !st && !current) current = p.l.id;
    const node = h('button.map-node' + (st ? '.done' : open ? '.open' : '.locked') + (p.l.boss ? '.boss' : ''),
      { type: 'button', style: { left: p.x + 'px', top: p.y * 100 + '%' }, dataset: { level: p.l.id },
        onclick: () => open ? openLevel(p.l.id) : ctx.toast('Locked — clear the previous contract', 'err') },
      h('span.hex', p.l.boss ? icon('burst') : h('b', p.l.node ?? '')), st ? stars(st) : open ? h('span.here', 'NEXT') : icon('lock'));
    inner.appendChild(node);
  }
  scroller.appendChild(inner);
  host.appendChild(scroller);
  if (current) requestAnimationFrame(() => {
    const el = inner.querySelector(`[data-level="${current}"]`);
    if (el) scroller.scrollLeft = Math.max(0, el.offsetLeft - scroller.clientWidth / 2);
  });
}

function showLevel(sheet, ctx, map, levelId) {
  const { store, router } = ctx;
  const lvl = map.levels.find((l) => l.id === levelId);
  if (!lvl) return;
  const enemyPower = lvl.power || Math.max(...lvl.waves.map(wavePower));
  const mine = store.squadPower();
  const ratio = mine / Math.max(1, enemyPower);
  const verdict = ratio >= 1.15 ? ['Favourable', 't-cyan'] : ratio >= 0.9 ? ['Even', 't-gold'] : ['Dangerous', 't-red'];
  const r = lvl.rewards || {};
  const enemies = [];
  for (const w of lvl.waves) for (const u of w.units) { const d = unitDef(u.def); if (d && !enemies.find((e) => e.id === d.id)) enemies.push(d); }
  sheet.replaceChildren(h('div.vp-panel.lvl-card', { '--cut': '16px' },
    h('div.row.between', h('div', h('div.vp-kicker', (lvl.boss ? 'Boss contract · ' : 'Contract ') + (lvl.node ?? '')), h('h2.vp-title', lvl.name)),
      ibtn('close', '', () => sheet.classList.add('hide'))),
    h('div.row.lvl-meta', h('span', 'Waves ', h('b', lvl.waves.length)), stars(store.levelStars(levelId)), h('span.grow'),
      h('span', 'Threat ', h('b.' + verdict[1], verdict[0]))),
    h('div.pow-cmp', h('div', h('small', 'Your squad'), h('b.t-cyan', fmt(mine))), h('div.vs', 'VS'), h('div', h('small', 'Hostiles'), h('b.t-red', fmt(enemyPower)))),
    goalList(store.goals(levelId)),
    h('div.vp-kicker', 'Intel'),
    h('div.enemy-row', enemies.map((d) => h('div.enemy-chip', roleBadge(d.role, true), h('span', d.name)))),
    h('div.vp-kicker', store.levelStars(levelId) ? 'Rewards (replay)' : 'Rewards'),
    h('div.row.wrap', r.credits ? h('span.vp-chip', icon('credits'), fmt(r.credits)) : null, r.scrap ? h('span.vp-chip', icon('scrap'), fmt(r.scrap)) : null,
      r.xp ? h('span.vp-chip', icon('xp'), fmt(r.xp) + ' XP') : null,
      ...Object.entries(r.shards || {}).map(([k, n]) => h('span.vp-chip', icon('hex'), (unitDef(k)?.name || k) + ' ×' + n)),
      lvl.firstClear?.unlockSlot && !store.levelStars(levelId) ? h('span.vp-chip.t-gold', icon('plus'), 'Squad slot ' + lvl.firstClear.unlockSlot) : null),
    btn('Deploy squad', deploy, { cls: 'primary big', icon: 'play', id: 'lvl-deploy' })));
  sheet.classList.remove('hide');
  async function deploy() {
    // the briefing plays once per session, before the squad screen (design's suggestion)
    const seen = (ctx.session.preSeen ||= new Set());
    const pre = !store.levelStars(levelId) && !seen.has(levelId) && lvl.story?.pre;
    if (pre) { seen.add(levelId); await playScene(pre); }
    router.go('/formation/' + levelId);
  }
}

// star goals: one star each, earned once and independently; first completion pays the listed reward
export function goalList(goals, { title = 'Star goals' } = {}) {
  if (!goals?.length) return null;
  const got = goals.filter((g) => g.done).length;
  return h('div.goal-box',
    h('div.row.between', h('div.vp-kicker', title), h('small.t-gold', got + '/' + goals.length + ' ★')),
    h('div.goal-list', goals.map((g) => h('div.goal-row' + (g.done ? '.done' : ''),
      h('span.goal-star', icon(g.done ? 'star' : 'starO')),
      h('div.goal-txt', h('span', g.text), g.squad && !g.done ? h('small.goal-rule', icon('squad'), 'Squad rule') : null),
      h('div.goal-rw', g.done ? h('small.goal-ok', icon('check'), 'Earned') : rewardChips(g.reward, { small: true }))))));
}

// map star chests (sim: auto-granted when the map's star total reaches each threshold)
export function chestBar(ctx, mapId) {
  const { store } = ctx;
  const m = store.maps().find((x) => x.id === mapId);
  const chests = store.chests(mapId);
  if (!m || !chests.length) return h('div.chest-bar.hide');
  const max = m.maxStars || chests[chests.length - 1].stars || 1;
  const pct = Math.min(100, (100 * m.stars) / max);
  const next = chests.find((c) => !c.claimed);
  const marks = chests.map((c) => h('button.chest-mk' + (c.claimed ? '.open' : c.ready ? '.ready' : ''), { type: 'button', style: { left: (100 * c.stars / max).toFixed(1) + '%' },
    'aria-label': 'Star chest at ' + c.stars + ' stars', onclick: () => ctx.modal({ title: 'Star chest · ' + c.stars + ' ★',
      body: h('div.col', h('small.t-muted', c.claimed ? 'Opened — rewards delivered.' : 'Opens automatically at ' + c.stars + ' stars on this map (' + m.stars + ' now).'),
        h('div.row.wrap', rewardChips(c.rewards))) }) },
    h('span.chest-ic', icon('chest')), h('b', c.stars)));
  return h('div.chest-bar.vp-panel', { '--cut': '8px' },
    h('div.chest-lbl', h('span.t-gold', icon('chest'), 'Star chests'), h('small', next ? (next.stars - m.stars) + ' ★ to the next' : 'All opened')),
    h('div.chest-track', h('div.chest-fill', { style: { width: pct.toFixed(1) + '%' } }), marks));
}
