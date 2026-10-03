import { el, btn } from './dom.js?v=20261004b';

const TABS = [
  { id: 'lines', icon: '🏪', label: 'Lines' },
  { id: 'town', icon: '🗺️', label: 'Town' },
  { id: 'life', icon: '🏠', label: 'Life' },
  { id: 'crew', icon: '🕴', label: 'Crew' },
  { id: 'goals', icon: '🏆', label: 'Goals' },
];

export function createTabs(root, { onTab, model }) {
  const bar = el('nav', 'tabbar');
  bar.hidden = true;
  const btns = new Map();
  for (const t of TABS) {
    const b = btn('tab', '', () => onTab(t.id), t.label);
    b.dataset.tab = t.id;
    b.append(el('span', 'tab-i', t.icon), el('small', 'tab-l', t.label), el('i', 'tab-dot'));
    b.hidden = t.id !== 'lines';
    btns.set(t.id, b);
    bar.appendChild(b);
  }
  root.appendChild(bar);
  let cur = 'lines';
  const fresh = new Set();

  return {
    set(id) {
      cur = id;
      for (const [k, b] of btns) b.classList.toggle('on', k === id);
      fresh.delete(id);
      btns.get(id)?.classList.remove('new');
    },
    update(R) {
      let n = 0;
      for (const t of TABS) {
        if (t.id === 'lines') continue;
        const b = btns.get(t.id);
        const on = !!R[t.id];
        if (on && b.hidden) { fresh.add(t.id); b.classList.add('new'); }
        b.hidden = !on;
        if (on) n++;
      }
      bar.hidden = n === 0;
      root.classList.toggle('has-tabs', n > 0);
      const goals = model.goalsReady();
      btns.get('goals').classList.toggle('dot', goals > 0);
      if (!btns.get('life').hidden) btns.get('life').classList.toggle('dot', model.partnerOffered() || model.dogOffered() || model.retire().recommended || (!!model.nextHome() && model.q('housing', { tier: model.housingTier() + 1 }).affordable));
      if (!btns.get('crew').hidden) btns.get('crew').classList.toggle('dot', model.freeItemCount() > 0);
    },
    hintNew(coach) {
      for (const id of fresh) {
        const b = btns.get(id);
        if (!b.hidden) coach.show('tab:' + id, b, '');
      }
    },
    get current() { return cur; },
    el: bar,
  };
}
