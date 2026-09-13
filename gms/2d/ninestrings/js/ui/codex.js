// js/ui/codex.js — the bestiary, which fills in as you kill things.
//
// An unseen entry is a silhouette with no name and no text. That is the whole
// point of a codex: it is a record of what you have met, and a list of things
// you have not met yet is just a spoiler with extra steps.

import { DATA, values, el, add, clear, card, btn, page, empty, statRow, ensureStyles } from './components.js';

const GROUPS = [
  { key: 'dead', label: 'The dead', test: (e) => !e.elite && !e.boss },
  { key: 'elite', label: 'Elites', test: (e) => e.elite && !e.boss },
  { key: 'boss', label: 'Choirmasters', test: (e) => !!e.boss },
];

/** props: { onBack() } */
export function codex(root, ctx, props = {}) {
  ensureStyles();
  const save = ctx.save;
  const back = props.onBack || (() => ctx.ns.screens.show('title'));
  const list = values(DATA.ENEMIES);
  const seenOf = (id) => record(save, id);

  const known = list.filter((e) => seenOf(e.id).seen).length;
  const count = el('span', 'ui-codex__n num', known + ' / ' + list.length);

  const { scr, body, foot } = page(ctx, 'Codex', back, count);
  add(foot, btn('Back', ctx, back, { cls: 'btn--ghost' }));
  root.appendChild(scr);

  if (!list.length) {
    add(body, empty('Nothing recorded', 'The bestiary has not been written.'));
    return { destroy() { scr.remove(); } };
  }

  for (const g of GROUPS) {
    const members = list.filter(g.test);
    if (!members.length) continue;
    // A group nobody has met yet stays shut: a row of five ??? teaches nothing.
    if (!members.some((e) => seenOf(e.id).seen) && g.key !== 'dead') continue;

    const head = el('div', 'ui-branch');
    add(head, el('span', 'ui-branch__l', g.label), el('span', 'ui-branch__r'));
    add(body, head);

    const stack = el('div', 'stack');
    for (const e of members) add(stack, entry(e));
    add(body, stack);
  }

  function entry(e) {
    const rec = seenOf(e.id);
    if (!rec.seen) {
      return card(ctx, {
        cls: 'ui-shroud', icon: '?', title: '???',
        sub: 'Not yet met.', locked: true, accent: 'var(--text-faint)',
      });
    }
    const c = card(ctx, {
      icon: (e.name || '?').slice(0, 1).toUpperCase(),
      title: e.name || e.id,
      sub: e.codex || '',
      right: rec.kills ? rec.kills + ' slain' : null,
      accent: e.boss ? 'var(--blood)' : e.elite ? 'var(--gold)' : 'var(--bone)',
      onTap: () => expand(c, e),
      sound: 'uiTap',
    });
    return c;
  }

  function expand(c, e) {
    const open = c.classList.toggle('is-open');
    const old = c.querySelector('.ui-detail');
    if (old) old.remove();
    if (!open) return;
    const d = el('div', 'ui-detail');
    add(d, statRow('Health', e.hp), statRow('Speed', e.speed), statRow('Damage', e.dmg));
    if (e.armour) add(d, statRow('Armour', e.armour));
    add(d, statRow('Takes a thread', Math.round((e.strungChance || 0) * 100) + '%'));
    add(c.querySelector('.card__text'), d);
  }

  return { destroy() { scr.remove(); } };
}

/**
 * The save shape for a codex entry has been loose across the build — a bare
 * truthy flag, a kill count, or the full record. Read all three; write the
 * full record (see `note` in js/ui/screens.js).
 */
export function record(save, id) {
  const r = save.codex && save.codex.enemies ? save.codex.enemies[id] : null;
  if (!r) return { seen: false, kills: 0 };
  if (r === true) return { seen: true, kills: 0 };
  if (typeof r === 'number') return { seen: r > 0, kills: r };
  return { seen: !!r.seen || (r.kills | 0) > 0, kills: r.kills | 0 };
}
