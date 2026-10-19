// Arena ladder: async PvP vs generated rival companies near your power (D11, sim arenaRivals).
import { h, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { data, unitDef } from '../app/data.js';
import { btn, header } from './components.js';

const DIFF = { easy: ['Easy', 't-cyan'], even: ['Even', 't-gold'], hard: ['Hard', 't-red'] };

export function mount(root, ctx) {
  const { store, router } = ctx;
  const A = store.state.arena;
  const tier = store.arenaTier();
  const tiers = data().arena?.tiers || [];
  const next = tiers.find((t) => t.minRating > A.rating);
  const mine = store.squadPower();
  root.append(header('Vector Arena', () => router.go('/hub')), h('div.ar-body.scroll',
    h('div.ar-rank.vp-panel', { '--cut': '16px' },
      h('div.ar-badge', icon('trophy')), h('div.grow', h('div.vp-kicker', 'League tier'), h('h2.vp-title', tier?.name || tier?.id || 'Unranked'),
        h('small.t-muted', 'Rating ', h('b.t-cyan', A.rating), next ? ' · ' + (next.minRating - A.rating) + ' to ' + (next.name || next.id) : ' · top tier')),
      h('div.ar-wl', h('b', A.wins), h('small', 'W'), h('b.t-red', A.losses), h('small', 'L'))),
    h('div.row.between', h('div.vp-kicker', 'Rival companies'), h('small.t-muted', 'Your power ', h('b.t-cyan', fmt(mine)))),
    h('div.ar-list', store.arenaRivals().map((rv, i) => {
      const [dn, dc] = DIFF[rv.difficulty] || ['', ''];
      return h('div.ar-rival.vp-panel.red', { '--cut': '12px' },
        h('div.grow', h('div.row', h('b', rv.name), h('small.' + dc, dn)),
          h('div.ar-units', rv.units.map((u) => roleBadge(unitDef(u.def)?.role, true))),
          h('small.t-muted', fmt(rv.power) + ' PWR · rating ' + Math.round(rv.rating))),
        btn('Fight', () => fight(i), { cls: 'danger sm', icon: 'sword' }));
    })),
    h('div.vp-kicker', 'Token exchange · ', h('span.t-cyan', fmt(store.state.cur.arena_tokens || 0) + ' tokens')),
    h('div.ar-shop', (data().arena?.shop || []).map((s) => h('div.ar-item.vp-panel.dim', h('b', s.name || s.id), btn(String(s.cost.arena_tokens), async () => {
      let choice;
      if (s.item.shardsChoice) {
        // every owned unit, strongest first, as a scrolling list (QA Q8: the old button row showed 4 and ran off-screen)
        const opts = store.roster().sort((a, b) => b.power - a.power);
        let pick = null;
        const list = h('div.pick-list', opts.map((u) => h('button.pick-row', { type: 'button', onclick: () => { pick = u.id; done?.(u.id); } },
          roleBadge(u.role), h('b.grow', u.name), h('small.t-muted', 'Lv' + u.level + ' · ' + fmt(u.power) + ' PWR'))));
        let done = null;
        const pr = ctx.modal({ title: 'Shards for…', body: h('div.col', h('small.t-muted', 'Pick the unit that receives ' + s.item.shardsChoice + ' shards.'), list),
          actions: [{ label: 'Cancel', value: null }], cls: 'pick' });
        done = () => document.querySelector('.vp-modal.pick')?.closest('.vp-modal-wrap')?.click();
        await pr;
        choice = pick;
        if (!choice) return;
      }
      const r = store.buyArena(s.id, choice);
      if (!r.ok) ctx.toast(r.why, 'err'); else { ctx.toast('Acquired ' + (s.name || s.id), 'gold'); router.reload(); }
    }, { cls: 'sm', icon: 'token' }))))));

  function fight(i) { router.go('/formation/arena/' + i); }
  return { topbar: true, bg: 'on' };
}
