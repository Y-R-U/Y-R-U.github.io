import { el, btn, show, setText } from './dom.js?v=20261004a';

const TABS = [
  { id: 'lines', icon: '🏪', label: 'Street' },
  { id: 'town', icon: '🗺️', label: 'Town' },
  { id: 'crew', icon: '🕴', label: 'Crew' },
  { id: 'goals', icon: '📜', label: 'Demands' },
  { id: 'boothill', icon: '⚰️', label: 'Boot Hill' },
  { id: 'season', icon: '👻', label: 'Ghosts' },
];

// The tab bar also carries the jump dock (⤒ ×qty … ⤓). Docked in the bar, the jump buttons can never sit over a
// card's badge while the list scrolls under them (IL2's floating dock did; its backlog item 1).
export function createTabs(root, { onTab, model, onJump }) {
  const bar = el('nav', 'tabbar');
  bar.hidden = true;
  const up = btn('jump-btn up', '⤒', () => onJump('up'), 'Jump to the street');
  const qty = btn('jump-btn qty-mini', '', () => onJump('qty'), 'Buy amount');
  const down = btn('jump-btn down', '⤓', () => onJump('down'), 'Jump to the newest');
  up.hidden = qty.hidden = down.hidden = true;
  const tabs = el('div', 'tabs');
  bar.append(up, qty, tabs, down);
  const btns = new Map();
  for (const t of TABS) {
    const b = btn('tab', '', () => onTab(t.id), t.label);
    b.dataset.tab = t.id;
    b.append(el('span', 'tab-i', t.icon), el('small', 'tab-l', t.label), el('i', 'tab-dot'));
    b.hidden = t.id !== 'lines';
    btns.set(t.id, b);
    tabs.appendChild(b);
  }
  root.appendChild(bar);
  let cur = 'lines', jumpKey = '';
  const fresh = new Set();

  return {
    set(id) {
      cur = id;
      for (const [k, b] of btns) b.classList.toggle('on', k === id);
      fresh.delete(id);
      btns.get(id)?.classList.remove('new');
    },
    update(R, started) {
      for (const t of TABS) {
        if (t.id === 'lines') continue;
        const b = btns.get(t.id);
        const on = !!R[t.id];
        if (on && b.hidden) { fresh.add(t.id); b.classList.add('new'); }
        b.hidden = !on;
      }
      bar.hidden = !started;
      root.classList.toggle('has-tabs', !bar.hidden);
      btns.get('goals').classList.toggle('dot', model.goalsReady() > 0);
      btns.get('crew').classList.toggle('dot', model.boxCount() > 0 || (model.freeItemCount() > 0 && model.managers().some((m) => m.hired)));
      btns.get('boothill').classList.toggle('dot', !!model.death().recommended);
    },
    jump({ up: u, down: d, qty: q, qtyText }) {
      const key = +u + '' + +d + +q + qtyText;
      if (key === jumpKey) return;
      jumpKey = key;
      show(up, u);
      show(down, d);
      show(qty, q);
      if (q) setText(qty, qtyText);
      bar.classList.toggle('jumping', u || d);
    },
    hintNew(coach) {
      for (const id of fresh) {
        const b = btns.get(id);
        if (!b.hidden) coach.show('tab:' + id, b, '');
      }
    },
    tab: (id) => btns.get(id),
    get current() { return cur; },
    el: bar,
  };
}
