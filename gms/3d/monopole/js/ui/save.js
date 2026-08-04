// Autosave to localStorage, and the Resume prompt that offers it back on boot.
//
// The envelope carries two versions. `f` is this file's envelope shape; `sv` is the sim state
// shape from js/sim/state.js. Either one moving invalidates every save written before it. On top
// of that the state is walked against the live content pack, because a build that renames a ship
// class or drops a commodity leaves a save that parses cleanly and then throws three ticks later.
// Anything that fails is deleted, not repaired.

import content from '../sim/content.js';
import { SAVE_VERSION } from '../sim/state.js';
import { definePanel, panels } from './panels.js';
import { esc, cr, crShort, pct, ago, quarterLabel } from './format.js';

const KEY = 'monopole.save.v1';
const FORMAT = 1;

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ f: FORMAT, sv: SAVE_VERSION, at: Date.now(), state }));
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch {}
  return null;
}

export function readSave() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let env = null;
  try { env = JSON.parse(raw); } catch { return clearSave(); }
  if (!env || env.f !== FORMAT || env.sv !== SAVE_VERSION || !readable(env.state)) return clearSave();
  return { state: env.state, at: env.at || 0 };
}

function readable(s) {
  try {
    if (!s || typeof s !== 'object') return false;
    if (typeof s.week !== 'number' || typeof s.cash !== 'number') return false;
    if (!Array.isArray(s.ships) || !Array.isArray(s.log) || !Array.isArray(s.contracts)) return false;
    if (!s.sites || !s.market || !s.share || !s.tactics || !s.rival || !s.hist) return false;

    const sys = content.get('system', s.system);
    if (!sys) return false;
    for (const site of sys.sites) if (!s.sites[site.id]) return false;
    for (const c of content.all('commodity')) if (!s.market[c.id]) return false;
    for (const sh of s.ships) if (!content.get('ship', sh.class)) return false;
    for (const site of Object.values(s.sites)) {
      for (const m of site.modules || []) if (!content.get('module', m)) return false;
    }
    const ids = [...(s.tactics.owned || []), ...(s.tactics.unlocked || []), ...(s.tactics.banned || []),
      ...(s.tactics.offered || []), ...(s.tactics.active || []).map(a => a.id)];
    for (const id of ids) if (!content.get('tactic', id)) return false;
    return true;
  } catch { return false; }
}

// main.js owns no part of this: screens.js imports the file, and the wiring happens on the task
// after main.js's synchronous body has finished building the sim and the scene.
export function initSave() {
  const skip = new URLSearchParams(location.search);
  if (skip.has('sr') || skip.has('shot') || skip.has('panel')) return;

  setTimeout(() => {
    const sim = panels.sim;
    if (!sim || sim.fixture) return;
    const saved = readSave();

    sim.on(kind => {
      if (kind !== 'tick') return;
      // the prompt is still up, so the fresh game behind it must not overwrite what it is offering
      if (panels.isOpen('resume')) return;
      if (sim.state.over) clearSave();
      else writeSave(sim.state);
    });

    if (!saved) return;
    sim.on(kind => { if (kind === 'speed' && sim.speed !== 0 && panels.isOpen('resume')) sim.setSpeed(0); });
    sim.setSpeed(0);
    panels.open('resume', { saved });
  }, 0);
}

definePanel({
  id: 'resume',
  title: 'A run in progress',
  group: 'company',
  fixture: sim => ({ saved: { state: sim.state, at: Date.now() - 1000 * 60 * 47 } }),

  render(props, api) {
    const s = props.saved?.state;
    if (!s) return `<div class="pad"><p class="dim">Nothing saved.</p></div>
      <div class="sheet-cta"><button class="primary" data-sheet-close>Close</button></div>`;

    return `
<div class="pad">
  <div class="card resume-card">
    <div class="card-top"><b>Ferrous Line</b><s>saved ${esc(ago(props.saved.at))}</s></div>
    <div class="resume-week"><em>${s.week}</em><s>weeks in · ${esc(quarterLabel(s.week))}</s></div>
    <ul class="facts wide">
      <li><s>Share</s><em>${pct(s.share.player, 1)}</em></li>
      <li><s>Cash</s><em>${crShort(s.cash)}</em></li>
      <li><s>Debt</s><em>${crShort(s.debt)}</em></li>
    </ul>
    <ul class="facts">
      <li><s>Hulls</s><em>${s.ships.length}</em></li>
      <li><s>Tactics held</s><em>${(s.tactics.owned || []).length}</em></li>
    </ul>
  </div>

  <p class="dim">It is picked up exactly where the week ended — the same ships in the same places,
  the same debt, the same regulator.</p>
  <p class="foot-note">There is one save slot. Starting fresh throws this run away for good.</p>
</div>

${props.confirm ? `
<div class="sheet-cta">
  <button data-a="keep">Keep it</button>
  <button class="primary danger" data-a="fresh">Discard and start fresh</button>
</div>` : `
<div class="sheet-cta">
  <button data-a="ask">New run</button>
  <button class="primary" data-a="resume">Resume week ${s.week}</button>
</div>`}`;
  },

  mount(el, props, api) {
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      const act = t.dataset.a;
      if (act === 'ask') { props.confirm = true; return api.rerender(); }
      if (act === 'keep') { props.confirm = false; return api.rerender(); }
      if (act === 'resume') {
        api.sim.load(props.saved.state);
        api.close();
        api.sim.setSpeed(1);
        return;
      }
      if (act === 'fresh') {
        clearSave();
        api.sim.reset(newSeed());
        api.close();
        api.sim.setSpeed(1);
      }
    });
  },
});

// a replay on the same seed replays the same weather; every fresh run gets its own
export function newSeed() { return 1 + Math.floor(Math.random() * 999999); }

export default { readSave, writeSave, clearSave, initSave, newSeed };
