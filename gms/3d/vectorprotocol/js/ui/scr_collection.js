// Barracks / collection: current squad strip + roster grid (+ unrecruited units as locked cards).
import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { data } from '../app/data.js';
import { header, unitCard, btn } from './components.js';
import { snd } from '../app/sound.js';
import { hint } from './tutorial.js';

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };

export function mount(root, ctx, route) {
  const { store, router, portraits } = ctx;
  let filter = 'all', sort = 'power';
  const title = route.name === 'workshop' ? 'Workshop' : 'Barracks';
  const grid = h('div.col-grid');
  const tabs = h('div.vp-tabs');
  const sortBtn = h('button.vp-tab.sort', { type: 'button', onclick: () => { sort = sort === 'power' ? 'rarity' : sort === 'rarity' ? 'level' : 'power'; render(); } });
  const squadRow = h('div.col-squad');
  const surplusEl = h('div.col-surplus-wrap');

  root.append(header(title, () => router.go('/hub')));
  if (route.name === 'workshop') root.append(h('div.col-hint.vp-panel.dim', icon('wrench'), h('span', 'Pick a unit to level, rank up or train abilities.')));
  root.append(
    h('div.col-squad-wrap', h('div.row.between', h('div.vp-kicker', 'Active squad ' + store.state.squad.length + '/' + store.state.slots), h('small.t-muted', 'Edit before each deployment')), squadRow),
    surplusEl, h('div.row', tabs, sortBtn), h('div.col-scroll.scroll', grid));

  function render() {
    const sp = store.surplusTotal();
    surplusEl.replaceChildren(...(sp.shards ? [h('div.col-surplus.vp-panel.purple', { '--cut': '10px' }, icon('hex'),
      h('div.grow', h('b', sp.shards + ' surplus shards'), h('small', 'Beyond max rank · worth ' + fmt(sp.chips) + ' chips')),
      btn('Convert all', () => { const r = store.convertAllShards(); if (!r.ok) return ctx.toast(r.why, 'err'); snd.sfx('reward');
        ctx.toast('+' + fmt(r.gained?.chips || 0) + ' chips', 'gold'); render(); }, { cls: 'gold sm', icon: 'cores', sfx: 'none' }))] : []));
    tabs.replaceChildren(...['all', 'tank', 'archer', 'mage'].map((f) => h('button.vp-tab' + (f === filter ? '.on' : ''), { type: 'button', onclick: () => { filter = f; render(); } }, f === 'all' ? 'All' : icon(f), f === 'all' ? null : h('span', f))));
    sortBtn.textContent = '⇅ ' + sort;
    squadRow.replaceChildren(...Array.from({ length: 6 }, (_, i) => {
      const e = store.state.squad[i];
      if (e) { const v = store.view(e.uid); return unitCard(v, { portraits, onclick: () => router.go('/unit/' + v.uid) }); }
      return h('div.col-empty' + (i >= store.state.slots ? '.locked' : ''), i >= store.state.slots ? icon('lock') : icon('plus'));
    }));
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
  render();
  hint(store, 'collection', grid.firstElementChild, 'Tap a robot to open its profile and upgrades.', { place: 'below', delay: 500 });
  return { topbar: true, bg: 'on' };
}
