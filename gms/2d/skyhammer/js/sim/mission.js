// Objectives, progress and the win test. CONTRACTS §12 objective types.

import { ENEMIES } from '../data/enemies.js';

function label(o) {
  switch (o.type) {
    case 'destroy': return `Destroy ${o.tag || o.kind} x${o.count}`;
    case 'kill':    return `Shoot down ${o.kind} x${o.count}`;
    case 'survive': return `Survive ${o.seconds}s`;
    case 'land':    return `Land on the ${o.padId}`;
    case 'collect': return `Collect ${o.count} supplies`;
    default:        return o.type;
  }
}

// CONTRACTS §15.2. `kill` is an exact alias of `destroy`; kind and tag are a conjunction.
function matches(o, ent) {
  if (o.type === 'destroy' || o.type === 'kill') {
    if (o.kind && ent.kind !== o.kind) return false;
    if (o.tag && !(ent.def && ent.def.tag === o.tag)) return false;
    return !!(o.kind || o.tag);
  }
  if (o.type === 'collect') return ent.kind === 'balloon';
  return false;
}

export function makeMission(world) {
  const objs = (world.level.objectives || []).map((o) => ({
    ...o, have: 0, need: o.count || 1, done: false, label: label(o),
  }));
  for (const o of objs) if (o.type === 'survive') { o.need = o.seconds; o.have = 0; }

  const m = {
    objectives: objs,
    complete: false,

    /**
     * Mark ents that count toward an unfinished objective. The HUD's minimap ticks and
     * off-screen chevron key off this, so the matching rule stays in one place (§15.2)
     * rather than being reimplemented in the UI against the level data.
     */
    tag(w) {
      for (const e of w.ents) {
        if (e.dead) { e.objective = false; continue; }
        let hit = false;
        for (const o of objs) {
          if (o.done || o.type === 'survive') continue;
          if (o.type === 'land') { if (e.kind === 'pad' && e.padId === o.padId) hit = true; continue; }
          if (matches(o, e)) { hit = true; break; }
        }
        e.objective = hit;
      }
    },

    onKill(w, ent) {
      let changed = false;
      for (const o of objs) {
        if (o.done || o.type === 'survive' || o.type === 'land') continue;
        if (matches(o, ent)) { o.have++; changed = true; if (o.have >= o.need) { o.done = true; w.push({ e: 'ui', what: 'objective', label: o.label, done: true }); } }
      }
      if (changed) m.check(w);
    },

    onLand(w, padId) {
      for (const o of objs) {
        if (o.type === 'land' && !o.done && (!o.padId || o.padId === padId)) {
          o.done = true; o.have = 1;
          w.push({ e: 'ui', what: 'objective', label: o.label, done: true });
        }
      }
      m.check(w);
    },

    step(w, dt) {
      for (const o of objs) {
        if (o.type === 'survive' && !o.done) {
          o.have += dt;
          if (o.have >= o.need) { o.done = true; w.push({ e: 'ui', what: 'objective', label: o.label, done: true }); }
        }
      }
      m.check(w);
    },

    check(w) {
      if (m.complete) return;
      if (objs.length && objs.every((o) => o.done)) { m.complete = true; w.win(); }
    },

    /**
     * How many more of each objective's target could still exist. The harness
     * turns a shortfall into a non-zero exit — an unreachable objective is the
     * failure mode that a green pass count hides.
     */
    shortfall(w) {
      const out = [];
      for (const o of objs) {
        if (o.done || o.type === 'survive' || o.type === 'land') continue;
        let avail = 0;
        for (const e of w.ents) if (!e.dead && matches(o, e)) avail++;
        for (const wv of (w.level.waves || [])) {
          if (w.spawner.triggered(wv)) continue;
          const row = ENEMIES[wv.def || wv.kind];
          if (row && matches(o, { kind: row.kind, def: row })) avail += (wv.n || 1);
        }
        const missing = o.need - o.have - avail;
        if (missing > 0) out.push({ label: o.label, have: o.have, need: o.need, avail, missing });
      }
      return out;
    },
  };
  return m;
}
