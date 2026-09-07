// The Economy panel: every number that decides how long the game takes, on a slider.
//
// Aaron asked for this by name. Prices, drop odds and what a contract pays are pacing, and pacing
// is a thing you find out by watching somebody play — so they live in js/game/economy.js behind
// `tuning()` and `retune()`, and this is the front of that. Move a slider and the next kill and
// the next shop visit use the new number; nothing has to be reloaded and no save is touched.
//
// The readout under the sliders is the point of the panel. "Stone drop 0.32" means nothing on its
// own; "about 40 contracts to twenty abilities, roughly an hour" is a number you can argue with.

import { DEFAULTS, ROWS, tuning, retune, reset } from '../../../game/economy.js';
import { contractsToTwenty } from '../../../game/loot.js';
import { stockPrice } from '../../../game/items.js';
import { buyableIds } from '../../../game/weapons.js';
import { BOARDS } from '../../../game/contracts.js';
import { handles } from '../game.js';
import { h, section, table, button, slider, num, clear, download } from '../ui.js';

// What an iron contract pays on average, off the board itself rather than typed here — the
// estimate has to move when somebody edits a contract.
const ironPay = () => {
  const jobs = BOARDS['board.iron']?.jobs || [];
  return jobs.length ? jobs.reduce((a, j) => a + (j.reward || 0), 0) / jobs.length : 25;
};

// About how long, in minutes, at roughly ninety seconds a contract including the walk back.
const MINUTES_PER_CONTRACT = 1.5;

export const panel = {
  id: 'economy',
  label: 'Economy',

  mount(el, ctx) {
    const knobs = h('div');
    const readout = h('div');
    const prices = h('div');
    const purse = h('div');

    const paint = () => {
      clear(readout).append(estimate());
      clear(prices).append(priceTable());
      clear(purse).append(purseRow(ctx, paint));
    };

    const draw = () => {
      clear(knobs);
      for (const r of ROWS) {
        knobs.append(slider({
          label: r.label,
          min: r.min, max: r.max, step: r.step,
          get: () => tuning()[r.key],
          set: v => { retune({ [r.key]: v }); paint(); },
          fmt: v => (r.step < 1 ? num(v, 2) : String(Math.round(v))),
        }));
      }
      paint();
    };

    el.append(
      section('How long the game is', readout,
        h('p', 'dbg-note', 'Sixteen awakening stones is the whole distance from registration to '
          + 'Bronze — the gate is all twenty abilities awake. Move the drop chance first: buying '
          + 'stones is meant to stay the slow way round.')),
      h('div', 'dbg-cols',
        section('Pacing', knobs, h('div', 'row',
          button('Reset to shipped', '', () => { reset(); draw(); }),
          button('Copy as defaults', '', () => copyDefaults(ctx)))),
        section('The shelves', prices, purse)),
    );
    draw();
  },

  unmount() {},
};

function estimate() {
  const pay = ironPay();
  const n = contractsToTwenty({ pay });
  const mins = Number.isFinite(n) ? Math.round(n * MINUTES_PER_CONTRACT) : Infinity;
  const t = tuning();
  const perContract = Math.min(1, Math.max(0, t.stoneDrop))
    + (pay * t.payMultiplier) / Math.max(1, t.stonePrice);
  return table(['', ''], [
    ['Iron contract pays', `${Math.round(pay * t.payMultiplier)} marks (board average ${Math.round(pay)})`],
    ['Stones per contract', `${perContract.toFixed(2)} — ${(t.stoneDrop * 100).toFixed(0)}% dropped, the rest bought`],
    ['Contracts to twenty abilities', Number.isFinite(n) ? String(n) : 'never at these numbers'],
    ['Roughly', Number.isFinite(mins)
      ? (mins < 90 ? `${mins} minutes` : `${(mins / 60).toFixed(1)} hours`)
      : '—'],
  ]);
}

function priceTable() {
  return table(['What', 'Marks'], [
    ...buyableIds().map(id => [id, String(stockPrice(id))]),
    ['healing potion', String(stockPrice('potion.healing'))],
    ['awakening stone', String(stockPrice('stone.awakening'))],
  ]);
}

// The live purse, and two buttons for testing a shop without playing an hour first.
function purseRow(ctx, paint) {
  const g = handles(ctx);
  const doc = g.session?.doc;
  const row = h('div', 'row');
  if (!doc) { row.append(h('span', 'dim', 'no game running')); return row; }
  const give = n => {
    doc.items.marks = Math.max(0, (doc.items.marks || 0) + n);
    g.session.autosave?.mark?.();
    g.session.inventory?.refresh?.();
    g.session.shopUI?.refresh?.();
    paint();
  };
  row.append(
    h('span', null, `Purse: ${doc.items.marks || 0} marks`),
    button('+100', '', () => give(100)),
    button('+1000', '', () => give(1000)),
    button('Empty', '', () => give(-(doc.items.marks || 0))),
  );
  return row;
}

// An afternoon of moving sliders should become the shipped numbers, not be lost on reload. This
// writes out exactly the object js/game/economy.js's DEFAULTS is, ready to paste over it.
function copyDefaults(ctx) {
  const t = tuning();
  const body = Object.keys(DEFAULTS).map(k => (k === 'weaponPrice'
    ? `  weaponPrice: {\n${Object.entries(t.weaponPrice).map(([id, p]) => `    ${id}: ${p},`).join('\n')}\n  },`
    : `  ${k}: ${t[k]},`)).join('\n');
  const text = `export const DEFAULTS = {\n${body}\n};\n`;
  download('economy-defaults.js', text, 'text/javascript');
  ctx?.toast?.('saved economy-defaults.js — paste it over DEFAULTS in js/game/economy.js');
}
