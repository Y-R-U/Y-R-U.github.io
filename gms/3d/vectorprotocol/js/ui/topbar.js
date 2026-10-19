import { h, fmt } from './dom.js';
import { icon } from './icons.js';
import { bar, setBar } from './components.js';
import { fullscreenButton } from './fullscreen.js';

const CUR = [['credits', 'var(--gold)'], ['scrap', 'var(--text-2)'], ['chips', 'var(--purple)']];
const CUR_ICON = { credits: 'credits', scrap: 'scrap', chips: 'cores' };

export const ACCOUNT_SCREENS = new Set(['hub', 'settings']);

export function createTopbar(ctx) {
  const { store } = ctx;
  const lv = h('div.tb-lv', '1');
  const name = h('div.tb-name', '');
  const xp = bar(0, 'thin');
  const chips = {};
  const curRow = h('div.tb-cur', CUR.map(([k, c]) => {
    const ic = icon(CUR_ICON[k]); ic.style.color = c;
    const n = h('span.n', '0');
    chips[k] = n;
    return h('span.vp-chip', { dataset: { cur: k } }, ic, n);
  }));
  // the company box folds down to just the level emblem a few seconds after it appears; a tap opens it again
  // (a tap on the open box goes to HQ, as before)
  const FOLD_MS = 3500;
  let foldT = 0;
  const fold = (on) => { co.classList.toggle('folded', on); clearTimeout(foldT); if (!on) foldT = setTimeout(() => fold(true), FOLD_MS); };
  const co = h('button.tb-co.vp-panel', { type: 'button', 'aria-label': 'Company', onclick: () => co.classList.contains('folded') ? fold(false) : ctx.router.go('/hq') },
    h('div.tb-emblem', lv), h('div.tb-txt', name, xp));
  // top-right: fullscreen toggle, then a slot kept clear for the br8t account avatar (js/app/account.js; hub + settings)
  const fs = fullscreenButton('tb-fs');
  const acct = h('div.tb-acct', { 'aria-hidden': 'true' });
  const el = h('div.vp-topbar', h('div.tb-co-slot', co), curRow, fs, acct);

  function refresh() {
    const s = store.state; if (!s) return;
    lv.textContent = s.company.level;
    name.textContent = s.company.name;
    setBar(xp, s.company.xp / store.companyXpNext());
    for (const [k] of CUR) chips[k].textContent = fmt(s.cur[k] || 0);
  }
  store.on(refresh);

  return {
    el,
    show(on, title, route) {
      el.classList.toggle('hide', !on);
      // the avatar only shows on the hub and in settings (account.js reads the same rule), but its corner stays
      // reserved on every top-bar screen so the layout doesn't jump between screens (QA A3)
      el.classList.toggle('acct', !!on);
      if (on) { refresh(); if (!co.classList.contains('folded') && !foldT) fold(false); }
    },
    refresh,
  };
}
