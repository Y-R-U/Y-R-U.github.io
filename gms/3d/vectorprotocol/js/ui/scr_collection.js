// Barracks (D28): your units. Squad strip + roster grid (+ unrecruited units as locked cards); a card opens the unit profile
// (level up, rank up, abilities). Company-wide fabrication (buffs, shard exchange) is the Workshop (scr_workshop.js).
import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { data } from '../app/data.js';
import { header, unitCard, btn, confirmBox } from './components.js';
import { featureOpen } from './scr_hub.js';
import { snd } from '../app/sound.js';
import { hint } from './tutorial.js';
import { orient } from '../app/orient.js';

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };

export function mount(root, ctx, route) {
  const { store, router, portraits } = ctx;
  let filter = 'all', sort = 'power';
  const grid = h('div.col-grid');
  const tabs = h('div.vp-tabs');
  const sortBtn = h('button.vp-tab.sort', { type: 'button', onclick: () => { sort = sort === 'power' ? 'rarity' : sort === 'rarity' ? 'level' : 'power'; render(); } });
  const squadRow = h('div.col-squad');
  const surplusEl = h('div.col-surplus-wrap');

  // .l2-a / .l2-b: the two landscape columns (display: contents in portrait, so the DOM reads as the old single column)
  root.classList.add('l2');
  root.append(header('Barracks', () => router.go('/hub')),
    h('div.l2-a',
      h('div.col-hint.vp-panel.dim', icon('up'), h('span', 'Tap a robot to level up, rank up or train it')),
      h('div.col-squad-wrap', h('div.row.between', h('div.vp-kicker', 'Active squad ' + store.state.squad.length + '/' + store.state.slots), h('small.t-muted', 'Edit before each deployment')), squadRow),
      surplusEl),
    h('div.l2-b', h('div.row', tabs, sortBtn), h('div.col-scroll.scroll', grid)));

  function render() {
    const sp = store.surplusTotal();
    // the shard exchange lives in the Workshop (D28); before the Workshop opens, convert here as before
    const ws = featureOpen(store, 'workshop');
    surplusEl.replaceChildren(...(sp.shards ? [h('div.col-surplus.vp-panel.purple', { '--cut': '10px' }, icon('hex'),
      h('div.grow', h('b', sp.shards + ' surplus shards'), h('small', 'Beyond max rank · worth ' + fmt(sp.chips) + ' chips' + (ws ? ' at the Workshop exchange' : ''))),
      ws ? btn('Workshop', () => router.go('/workshop'), { cls: 'gold sm', icon: 'wrench' })
        : btn('Convert all', async () => { if (!await confirmBox('Convert all surplus?', sp.shards + ' surplus shards become ' + fmt(sp.chips) + ' chips. This can\'t be undone.', 'Convert', 'Keep')) return; const r = store.convertAllShards(); if (!r.ok) return ctx.toast(r.why, 'err'); snd.sfx('reward');
          ctx.toast('+' + fmt(r.gained?.chips || 0) + ' chips', 'gold'); render(); }, { cls: 'gold sm', icon: 'cores', sfx: 'none' }))] : []));
    tabs.replaceChildren(...['all', 'tank', 'archer', 'mage'].map((f) => h('button.vp-tab' + (f === filter ? '.on' : ''), { type: 'button', onclick: () => { filter = f; render(); } }, f === 'all' ? 'All' : icon(f), f === 'all' ? null : h('span', f))));
    sortBtn.textContent = '⇅ ' + sort;
    squadRow.replaceChildren(...(orient.landscape ? squadGrid() : Array.from({ length: 6 }, (_, i) => {
      const e = store.state.squad[i];
      if (e) { const v = store.view(e.uid); return unitCard(v, { portraits, onclick: () => router.go('/unit/' + v.uid) }); }
      return h('div.col-empty' + (i >= store.state.slots ? '.locked' : ''), i >= store.state.slots ? icon('lock') : icon('plus'));
    })));
    const owned = store.roster();
    const ownedIds = new Set(owned.map((u) => u.id));
    let list = owned.filter((u) => filter === 'all' || u.role === filter);
    list.sort((a, b) => sort === 'power' ? b.power - a.power : sort === 'level' ? b.level - a.level : RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || b.power - a.power);
    const locked = Object.values(data().units).filter((d) => !ownedIds.has(d.id) && d.recruitable !== false && !d.enemyOnly && (filter === 'all' || d.role === filter))
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    grid.replaceChildren(
      ...list.map((v) => {
        const c = unitCard(v, { portraits, onclick: () => router.go('/unit/' + v.uid) });
        c.appendChild(h('div.pw', fmt(v.power)));
        if (v.shardsNext && v.shards >= v.shardsNext) c.appendChild(h('div.vp-badge', '↑'));
        else if (v.surplusShards > 0) c.appendChild(h('div.vp-badge.surplus', { title: v.surplusShards + ' surplus shards' }, '+' + v.surplusShards));
        return c;
      }),
      ...locked.map((d) => {
        const shards = store.state.shards?.[d.id] || 0;
        const c = unitCard({ ...d }, { portraits, onclick: () => ctx.toast(d.name + ' — recruit or earn shards to unlock') });
        c.classList.add('locked');
        c.appendChild(h('div.lockico', icon('lock'), shards ? h('small', shards + ' shards') : null));
        return c;
      }));
  }
  // landscape: the squad as a 2x3 grid mirroring the formation (same mapping as the battle HUD / scr_formation)
  function squadGrid() {
    const pos = (col, lane) => ({ gridColumn: col === 0 ? 2 : 1, gridRow: 3 - lane });
    const taken = new Set(), out = [];
    for (const e of store.state.squad) {
      const v = store.view(e.uid); if (!v) continue;
      const c = unitCard(v, { portraits, onclick: () => router.go('/unit/' + v.uid) });
      Object.assign(c.style, pos(e.slot.col, e.slot.lane)); taken.add(e.slot.col + ':' + e.slot.lane); out.push(c);
    }
    for (let col = 0; col < 2; col++) for (let lane = 0; lane < 3; lane++)
      if (!taken.has(col + ':' + lane)) out.push(h('div.col-empty', { style: pos(col, lane) }, icon('plus')));
    return out;
  }
  render();
  const offOrient = orient.on(render);
  hint(store, 'collection', grid.firstElementChild, 'Tap a robot to open its profile: level up with scrap, rank up and train abilities there.', { place: 'below', delay: 500 });
  return { topbar: true, bg: 'on', unmount: offOrient };
}
