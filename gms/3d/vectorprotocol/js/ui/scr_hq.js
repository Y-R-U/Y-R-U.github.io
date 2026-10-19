// HQ company skills: branches of global upgrades (DATA.hq).
import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { data } from '../app/data.js';
import { btn, header } from './components.js';
import { modsText } from './scr_formation.js';

const BRANCH = { offense: ['sword', 'var(--red)'], defense: ['shield', 'var(--cyan)'], tech: ['overdrive', 'var(--purple)'], economy: ['credits', 'var(--gold)'] };

function reqText(r = {}) {
  const out = [];
  if (r.hq) out.push((data().hq[r.hq]?.name || r.hq) + ' Lv' + (r.level || 1));
  if (r.companyLevel) out.push('Company Lv' + r.companyLevel);
  return out.join(', ') || 'prerequisite';
}

export function mount(root, ctx) {
  const { store, router } = ctx;
  const list = h('div.hq-list.scroll');
  const co = store.state.company;
  root.append(header('HQ · Company', () => router.go('/hub')),
    h('div.hq-co.vp-panel', { '--cut': '14px' }, h('div.tb-emblem', co.level), h('div.grow', h('div.vp-kicker', 'Mercenary company'), h('h2.vp-title', co.name),
      h('small.t-muted', 'Squad slots ' + store.state.slots + '/6 · Arena rating ' + store.state.arena.rating))),
    list);

  function render() {
    const skills = Object.values(data().hq || {});
    const branches = [...new Set(skills.map((s) => s.branch))];
    list.replaceChildren(...branches.map((br) => {
      const [ic, col] = BRANCH[br] || ['hex', 'var(--cyan)'];
      return h('div.hq-branch', { style: { '--bc2': col } },
        h('div.hq-bh', icon(ic), h('b', br)),
        h('div.hq-nodes', skills.filter((s) => s.branch === br).map((s) => {
          const lv = store.state.hq[s.id] || 0, c = store.hqCost(s.id);
          const req = store.hqLocked(s.id);
          const eff = modsText(Object.fromEntries(Object.entries(s.mods || {}).map(([k, v]) => [k, v * Math.max(1, lv)]))) ||
            Object.entries(s.effect || {}).map(([k, v]) => '+' + Math.round(v * Math.max(1, lv) * 100) + '% ' + k.replace(/([A-Z])/g, ' $1')).join(' · ');
          return h('div.hq-node' + (req ? '.locked' : '') + (lv ? '.owned' : ''),
            h('div.hq-hex', h('b', lv), h('small', '/' + s.max)),
            h('div.grow', h('b', s.name), h('div.hq-eff', (lv ? '' : 'Lv1: ') + eff),
              req ? h('small.t-red', 'Requires ' + reqText(s.requires)) : null,
              h('div.hq-pips', Array.from({ length: s.max }, (_, i) => h('i' + (i < lv ? '.on' : ''))))),
            c ? btn(fmt(c.credits), () => { const r = store.hqUp(s.id); if (!r.ok) ctx.toast(r.why, 'err'); else { ctx.toast(s.name + ' upgraded', 'gold'); render(); } },
              { cls: 'sm', icon: 'credits', disabled: req }) : h('small.t-gold', 'MAX'));
        })));
    }));
  }
  render();
  return { topbar: true, bg: 'on' };
}
