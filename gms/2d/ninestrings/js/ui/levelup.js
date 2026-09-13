// js/ui/levelup.js — the most-used screen in the game.
//
// It rises from the bottom and everything on it lives in the bottom half,
// because the player is mid-run, one-handed, and must not change grip to pick
// an upgrade (DESIGN §8.5). The host has already stopped stepping the sim —
// `world.pendingLevels > 0` — so the game is frozen behind the sheet and stays
// visible through it, which is what makes this read as a pause in a fight
// rather than a menu.

import { DATA, el, add, clear, card, btn, tap, rgbOf, screenEl, ensureStyles } from './components.js';

const MAX_WEAPON_LEVEL = 8;

// FIXTURE — delete when a run is always available behind this screen. It exists
// so the screen can be looked at and tap-tested before/without a live world.
const FIXTURE_OFFERS = [
  { id: 'emberlash', kind: 'weapon', level: 3, isNew: false, name: 'Emberlash', tag: 'LSH',
    colour: [1.0, 0.62, 0.22], desc: '+1 arc, on the other side' },
  { id: 'graveash', kind: 'passive', level: 1, isNew: true, name: 'Grave Ash', tag: 'ASH',
    colour: null, desc: '+12% damage' },
  { id: 'tolling', kind: 'weapon', level: 1, isNew: true, name: 'Tolling', tag: 'TLL',
    colour: [0.82, 0.86, 0.95], desc: 'One note, held, on a count nobody set.' },
  { id: 'widowspan', kind: 'passive', level: 2, isNew: false, name: "Widow's Span", tag: 'SPN',
    colour: null, desc: '+10% area' },
  { id: 'ns_mend', kind: 'heal', level: 0, isNew: false, name: 'Mend', tag: 'MND',
    colour: [0.4, 1, 0.5], desc: 'Restore 30 health.' },
];

/**
 * props: { n, charges: {reroll,banish,skip}, onDone() }
 * `charges` is mutated in place — it is the run's remaining charges, owned by
 * the router, so a reroll spent here is still spent at the next level.
 */
export function levelup(root, ctx, props = {}) {
  ensureStyles();
  const ns = ctx.ns || {};
  const world = ns.world || null;
  const charges = props.charges || { reroll: 0, banish: 0, skip: 0 };
  const want = Math.max(2, Math.min(5, props.n || 3));

  const scr = screenEl('screen--sheet ui-lu');
  const veil = el('div', 'ui-lu__veil');
  const inner = el('div', 'ui-lu__in');
  add(scr, veil, inner);
  root.appendChild(scr);

  let armed = false;          // banish mode: the next card tap banishes it
  let done = false;

  const offers = () => {
    if (!world || typeof world.offerUpgrades !== 'function') return FIXTURE_OFFERS.slice(0, want);
    const got = world.offerUpgrades(want) || [];
    return got.length ? got : FIXTURE_OFFERS.slice(0, want);
  };

  function finish() {
    if (done) return;
    done = true;
    if (props.onDone) props.onDone();
  }

  function choose(offer) {
    if (armed) return banish(offer);
    if (world && typeof world.chooseUpgrade === 'function') world.chooseUpgrade(offer.id);
    if (ctx.audio) { try { ctx.audio.sfx(offer.isNew ? 'evolve' : 'levelup'); } catch (_) {} }
    if (world && world.pendingLevels > 0) render();     // stacked level-ups: straight into the next
    else finish();
  }

  function banish(offer) {
    armed = false;
    if (charges.banish <= 0) return;
    charges.banish--;
    if (world && typeof world.banish === 'function') world.banish(offer.id);
    if (world && typeof world.rerollOffers === 'function') world.rerollOffers();
    if (ns.callout) ns.callout(offer.name + ' will not be offered again this run.');
    render();
  }

  function reroll() {
    if (charges.reroll <= 0) return;
    charges.reroll--;
    if (world && typeof world.rerollOffers === 'function') world.rerollOffers();
    render();
  }

  function skip() {
    if (charges.skip <= 0) return;
    charges.skip--;
    // `chooseUpgrade(null)` does not resolve the level; the Alms offer is the
    // sim's own "take nothing, take souls instead" path and always applies.
    if (world && typeof world.chooseUpgrade === 'function') world.chooseUpgrade('ns_alms');
    if (world && world.pendingLevels > 0) render();
    else finish();
  }

  function render() {
    clear(inner);
    const list = offers();
    scr.className = 'screen screen--sheet ui-lu ui-lu--n' + list.length + (armed ? ' ui-lu--arm' : '');

    const head = el('div', 'ui-lu__head');
    const lvl = world && world.player ? world.player.level : (props.level || 1);
    add(head, el('div', 'ui-lu__lv', 'LEVEL ' + lvl));
    add(head, el('div', 'ui-lu__hint', armed ? 'Tap one to banish it' : 'Choose one'));
    add(inner, head);

    const stack = el('div', 'stack');
    for (const o of list) {
      const accent = rgbOf(o.colour, o.kind === 'passive' ? 'var(--thread)' : 'var(--choir)');
      add(stack, card(ctx, {
        icon: o.tag || glyphFor(o),
        title: o.name,
        flag: o.isNew ? 'New' : null,
        sub: o.desc,
        note: armed ? null : evoHint(o, world),
        right: o.level > 0 ? 'LV ' + o.level : null,
        accent,
        onTap: () => choose(o),
        sound: armed ? 'uiDeny' : 'uiSelect',
      }));
    }
    add(inner, stack);

    const util = utilRow();
    if (util) add(inner, util);
  }

  function utilRow() {
    const any = charges.reroll > 0 || charges.banish > 0 || charges.skip > 0;
    if (!any) return null;                        // D9: no charges bought, no row
    const row = el('div', 'ui-lu__util');
    if (charges.reroll > 0) add(row, chargeBtn('Reroll', '↻', charges.reroll, reroll));
    if (charges.banish > 0) {
      add(row, chargeBtn(armed ? 'Cancel' : 'Banish', '⌦', charges.banish, () => { armed = !armed; render(); }));
    }
    if (charges.skip > 0) add(row, chargeBtn('Skip', '›', charges.skip, skip));
    return row;
  }

  function chargeBtn(label, glyph, n, fn) {
    const b = el('button', 'btn btn--small');
    b.type = 'button';
    add(b, el('span', 'ui-glyph', glyph), el('span', null, label), el('span', 'ui-lu__count num', n));
    return tap(b, ctx, fn, 'uiTap');
  }

  render();
  return { destroy() { done = true; scr.remove(); } };
}

function glyphFor(o) {
  if (o.kind === 'heal') return '+';
  if (o.kind === 'gold') return '◇';
  return (o.name || '?').slice(0, 3).toUpperCase();
}

/**
 * The one line that turns a numbers screen into a plan: "this passive is the
 * last thing your weapon needs". Silent unless it is genuinely true.
 */
function evoHint(offer, world) {
  const p = world && world.player;
  if (!p) return null;
  const W = DATA.WEAPONS, P = DATA.PASSIVES;
  const passives = p.passives || {};
  const owned = [];
  for (const w of p.weapons || []) owned.push(w);

  if (offer.kind === 'weapon') {
    const d = W[offer.id];
    if (!d || !d.evolvesTo) return null;
    const req = d.requires;
    const have = !req || (passives[req] | 0) > 0;
    if (offer.level >= MAX_WEAPON_LEVEL) {
      return have ? 'Evolves into ' + evoName(d) : 'Maxed — needs ' + nameOf(P, req);
    }
    if (have) return 'Evolution ready at level ' + MAX_WEAPON_LEVEL;
    return null;
  }

  if (offer.kind === 'passive' && !(passives[offer.id] | 0)) {
    for (const inst of owned) {
      const d = W[inst.id];
      if (!d || !d.evolvesTo || d.requires !== offer.id) continue;
      return inst.level >= MAX_WEAPON_LEVEL
        ? 'Completes ' + d.name + ' → ' + evoName(d)
        : 'Evolves ' + d.name + ' at level ' + MAX_WEAPON_LEVEL;
    }
  }
  return null;
}

function evoName(def) {
  return nameOf(DATA.EVOLUTIONS, def.evolvesTo) || nameOf(DATA.WEAPONS, def.evolvesTo) || 'its true form';
}

function nameOf(table, id) {
  const d = table && table[id];
  return (d && d.name) || id || '';
}
