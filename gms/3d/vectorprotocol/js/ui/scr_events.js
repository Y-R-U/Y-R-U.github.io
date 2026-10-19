// Special Ops: rotating events (daily resource ops, faction trials, raids) from DATA.events.
import { h, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { data, unitDef, wavePower } from '../app/data.js';
import { btn, header } from './components.js';

const KIND = { daily: ['Daily op', 'calendar', 'var(--cyan)'], trial: ['Faction trial', 'flag', 'var(--orange)'], raid: ['Raid boss', 'burst', 'var(--red)'] };

export function activeToday(ev, day = new Date()) {
  const r = ev.rotation || {};
  if (r.days) return r.days.includes(day.getDay());
  return true;
}

export function mount(root, ctx) {
  const { store, router } = ctx;
  const active = new Set(store.activeEvents().map((e) => e.id));
  const evs = Object.values(data().events || {}).sort((a, b) => active.has(b.id) - active.has(a.id));
  const mine = store.squadPower();
  root.append(header('Special Ops', () => router.go('/hub')),
    h('div.ev-list.scroll', evs.map((ev) => {
      const [kname, kic, kcol] = KIND[ev.kind] || ['Operation', 'hex', 'var(--cyan)'];
      const live = active.has(ev.id) && store.isUnlocked(ev.unlock);
      return h('div.ev-card.vp-panel' + (live ? '' : '.dim'), { '--cut': '16px', style: { '--bc': live ? kcol : '' } },
        h('div.row', h('span.ev-ic', { style: { color: kcol } }, icon(kic)), h('div.grow', h('div.vp-kicker', kname + (ev.faction ? ' · ' + ev.faction : '')), h('h2.vp-title', ev.name)),
          h('span.vp-tag' + (live ? '' : '.red'), live ? 'Live' : !store.isUnlocked(ev.unlock) ? 'Locked' : 'Offline')),
        ev.desc ? h('small.t-muted', ev.desc) : null,
        h('div.ev-tiers', (ev.tiers || []).map((t, i) => {
          const pw = t.power || Math.max(...t.waves.map(wavePower));
          const r = t.rewards || {};
          const foes = [...new Set(t.waves.flatMap((w) => w.units.map((u) => unitDef(u.def)?.role)))];
          return h('div.ev-tier',
            h('b', t.name || 'Tier ' + (i + 1)), h('div.ev-foes', foes.map((ro) => roleBadge(ro, true))),
            h('small' + (mine >= pw ? '.t-cyan' : '.t-red'), fmt(pw) + ' PWR'),
            h('div.grow.ev-rw', Object.entries(r).map(([k, v]) => typeof v === 'number' ? h('span', fmt(v) + ' ' + k.replace('_', ' ')) : h('span', Object.entries(v).map(([a, n]) => (unitDef(a)?.name || a) + ' ×' + n).join(', ')))),
            btn('Go', () => go(ev, t), { cls: 'sm primary', disabled: !live }));
        })));
    })));

  function go(ev, t) {
    if (!t.id) return ctx.toast('Operation data incomplete', 'err');
    router.go('/formation/event/' + encodeURIComponent(ev.id) + '/' + encodeURIComponent(t.id));
  }
  return { topbar: true, bg: 'on' };
}
