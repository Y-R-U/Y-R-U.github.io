// Tournament screen — C7 owns this file.
//
// Eight rungs, a ladder not a bracket: a win climbs one, a loss drops one but never below 1, and a
// rung-8 win completes the campaign. The table is `sim.ladderRungs` and NOT `config.LADDER`, which
// the sim stopped reading (HANDOFF_SIM R8) — config's shape has no room for the per-rung ordnance
// budget that is the difficulty dial, and the sim's curve is measured rather than guessed.
//
// Progression belongs to the save; this screen draws it and asks for a fight.

import * as sim from '../sim/index.js';
import { register } from './flow.js';

export function buildLadder(mount, save, opts = {}) {
  const root = document.createElement('div');
  root.className = 'screen screen-ladder';
  root.hidden = true;
  mount.appendChild(root);

  let handlers = { onFight: opts.onFight };
  let state = null;

  const ord = o => (o ? `${o.heavy} heavy${o.salvo ? ` · ${o.salvo} salvo` : ''}` : 'no ordnance');

  function render(s) {
    state = s || sim.newLadder();
    root.hidden = false;
    root.innerHTML = `
      <div class="sheet wide">
        <h1>Tournament</h1>
        <p class="hint">${state.complete
          ? 'Campaign complete — the ladder stays open.'
          : `Rung ${state.rung} of ${sim.ladderRungs.length}. A win climbs, a loss drops one.`}</p>
        <ol class="rungs">
          ${sim.ladderRungs.map(r => `
            <li class="${r.rung === state.rung ? 'now' : ''}${(state.best || 1) > r.rung ? ' beaten' : ''}">
              <b>${r.rung}</b>
              <span><i>${r.name}</i><s>${r.w}×${r.h} · ${r.fleet.length} ships · ${ord(r.ordnance)} · ${sim.TIER_NAMES[r.tier]}</s></span>
            </li>`).join('')}
        </ol>
        <div class="actions">
          <button class="link" data-back>Back</button>
          <button class="link" data-reset>Reset</button>
          <button data-manual>Place my fleet</button>
          <button class="big" data-fight>Fight ${sim.rungConfig(state.rung).name}</button>
        </div>
        <p class="foot">${state.wins || 0} won · ${state.losses || 0} lost · best rung ${state.best || 1}</p>
      </div>`;
    // the list scrolls after about six rungs, and a player on rung 7 must not have to find it
    root.querySelector('.rungs li.now')?.scrollIntoView({ block: 'center' });
    root.querySelector('[data-fight]').onclick = () => handlers.onFight?.(state.rung, false);
    root.querySelector('[data-manual]').onclick = () => handlers.onFight?.(state.rung, true);
    root.querySelector('[data-back]').onclick = () => handlers.onBack?.();
    root.querySelector('[data-reset]').onclick = () => handlers.onReset?.();
  }

  const api = {
    root,
    bind(h) { handlers = { ...handlers, ...h }; },
    render,
    get rung() { return (save.get('ladder', null) || sim.newLadder()).rung; },
    get opponent() { return sim.rungConfig(this.rung); },

    // Pure in the sim, persisted here — the one place a match result becomes progress.
    result(won) {
      const next = sim.applyLadderResult(save.get('ladder', null) || sim.newLadder(), won);
      save.set('ladder', next);
      return next;
    },

    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    fight() { handlers.onFight?.(this.rung, false); },
  };

  register('ladder', api);
  return api;
}
