// Walking something home. Pure: quest definitions and two positions in, a new follow state and at
// most one event out. `js/world/escorts.js` owns the bodies and `session.js` turns the handle.

import { openSteps } from './quest.js';

export const ESCORT = {
  follow: 3.4,      // how far behind it settles once it has caught up
  pickup: 6,        // walk this close and it starts following, or picks the walk up again
  lose: 30,         // beyond this it starts falling behind for good
  grace: 6,         // …but only after this many seconds of it
  hurry: 12,        // past this it breaks into a hurry, which is what keeps a walk from being a wait
  hurryMul: 1.5,
  // Arriving is being inside the destination *and* having been walked this far from where the
  // escort began. Fen stands 2.6 m from the edge of `lac.mill`, so without it the ferry crossing
  // credits for two steps sideways.
  travel: 12,
};

// How fast each body walks to keep up. The player walks at 5 m/s and sprints at 8.5, so everything
// here falls behind a sprint and closes again once the gap passes `hurry`. Here rather than in
// js/world/escorts.js because that file imports three and nothing could check these numbers.
export const SPEED = { person: 4.7, fowl: 3.6, wagon: 3.8 };

// What an escorted body's own animation runs at while it is being carried — a walk cycle, not the
// speed it travels at, which is the caller's business. `heading` is null on a frame the rules did
// not move it, which is how a crowd figure is told to stand still instead of drifting.
export function carriedGait(body, heading) {
  if (heading === null || heading === undefined) return 0;
  return body === 'fowl' ? 0.46 : SPEED[body] * 0.4;
}

export const newEscort = (npc, path) => ({ npc, path, phase: 'wait', from: null, away: 0 });

// Which escort actors the world should have bodies for: anything a quest in progress mentions,
// so the wagon is standing at the spur before the step that walks it is the live one.
export function escortActors(defs, quests) {
  const out = new Set();
  for (const [qid, rec] of Object.entries(quests || {})) {
    if (rec.s !== 'active' && rec.s !== 'turnin') continue;
    for (const s of defs?.[qid]?.steps || []) {
      for (const o of s.objectives || []) if (o.k === 'escort') out.add(o.npc);
    }
  }
  return [...out].sort();
}

// Which of them is actually being walked right now: an open step with the escort objective still
// short. Same shape as `handovers` — the live step is the only authority.
export function escortWants(defs, quests, ctx) {
  const out = [];
  for (const [qid, rec] of Object.entries(quests || {})) {
    const def = defs?.[qid];
    if (!def) continue;
    for (const s of openSteps(def, rec, ctx)) {
      const counts = rec.c?.[s.id] || [];
      s.objectives.forEach((o, i) => {
        if (o.k !== 'escort' || (counts[i] || 0) >= o.target) return;
        if (out.some(w => w.npc === o.npc)) return;
        out.push({ npc: o.npc, path: o.path, quest: qid, step: s.id });
      });
    }
  }
  return out;
}

export const escortEvent = st => ({ t: 'escort', npc: st.npc, path: st.path });

// §9.4's `arm` names an escort actor the way it names a prop — `arm lac.henhouse.hen` — so the
// last segment is the actor. Here rather than in js/world/escorts.js so the corpus can be checked
// against it in node.
export const escortActorOf = id => String(id).split('.').pop();

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// One actor's frame. Never mutates: the caller keeps the returned state and moves the body to the
// returned position. `inPath` is the caller's containment test against the destination area.
export function stepEscort(st, dt, { px, pz, ax, az, inPath = false, speed = 3.5 } = {}) {
  const d = dist(ax, az, px, pz);
  const out = { ...st };
  let event = null;

  if (out.phase === 'done') return { state: out, x: ax, z: az, heading: null, event };
  if (out.phase === 'wait' || out.phase === 'lost') {
    if (d > ESCORT.pickup) return { state: out, x: ax, z: az, heading: null, event };
    if (out.phase === 'lost') event = 'found';
    out.phase = 'follow';
    out.away = 0;
    out.from = out.from || { x: ax, z: az };
    return { state: out, x: ax, z: az, heading: null, event };
  }

  if (d > ESCORT.lose) {
    out.away = out.away + dt;
    if (out.away >= ESCORT.grace) {
      out.phase = 'lost';
      return { state: out, x: ax, z: az, heading: null, event: 'lost' };
    }
  } else out.away = 0;

  let x = ax, z = az, heading = null;
  if (d > ESCORT.follow) {
    const cap = speed * (d > ESCORT.hurry ? ESCORT.hurryMul : 1);
    const step = Math.min(cap, (d - ESCORT.follow) * 1.4) * dt;
    x = ax + (px - ax) / d * step;
    z = az + (pz - az) / d * step;
    heading = Math.atan2(px - ax, pz - az);
  }

  const from = out.from || { x, z };
  if (inPath && dist(x, z, from.x, from.z) >= ESCORT.travel) {
    out.phase = 'done';
    event = 'arrive';
  }
  return { state: out, x, z, heading, event };
}
