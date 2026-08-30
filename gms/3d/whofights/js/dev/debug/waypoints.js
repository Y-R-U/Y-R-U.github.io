// Every place in a level worth jumping to, gathered from the documents rather than from the
// scene: a waypoint has to exist before the geometry does. Pure — node tests it.

import { TYPES } from '../../editor/scene.js';

const round = v => Math.round(v * 100) / 100;

// Yaw that faces (x,z) from (fx,fz). π faces −z, which is what the level document's start uses.
export const facing = (fx, fz, x, z) => Math.atan2(x - fx, z - fz);

export function shapeCentre(h, at = null) {
  if (h.attach) {
    const p = at ? at(h.attach) : null;
    return p ? { x: p.x, z: p.z, live: true } : null;
  }
  const s = h.shape;
  if (!s) return null;
  if (s.k === 'circle') return { x: s.x, z: s.z, r: s.r };
  return { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, r: Math.max(s.x1 - s.x0, s.z1 - s.z0) / 2 };
}

// `at(id)` is the live position of a placed character, when there is a world to ask.
export function waypoints(doc, cast = {}, at = null) {
  const out = [];
  const push = (group, id, label, x, z, yaw, note = '') =>
    out.push({ group, id, label, x: round(x), z: round(z), yaw: yaw || 0, note });

  if (doc?.start) push('Level', 'start', 'Player start', doc.start.x, doc.start.z, doc.start.yaw, 'where a new save begins');

  for (const h of doc?.hotspots || []) {
    const c = shapeCentre(h, at);
    if (!c) { push('Hotspots', h.id, h.name || h.id, 0, 0, 0, 'attached — not in the world right now'); continue; }
    // Stand a little short of an interact hotspot so arriving does not immediately fire it; an
    // enter hotspot is the opposite, you want to land inside it.
    const back = h.trigger === 'interact' || h.trigger === 'click' ? Math.min(c.r || 2.5, 2) : 0;
    push('Hotspots', h.id, h.name || h.id, c.x, c.z + back, facing(c.x, c.z + back, c.x, c.z),
      `${h.trigger}${c.live ? ' · live' : ''}${h.once ? ' · once' : ''}`);
  }

  for (const [id, c] of Object.entries(cast || {})) {
    const p = c?.place;
    if (!p || (doc?.id && p.level && p.level !== doc.id)) continue;
    const live = at ? at(id) : null;
    push('Characters', id, c.name || id, live?.x ?? p.x, (live?.z ?? p.z) + 2.2,
      facing(live?.x ?? p.x, (live?.z ?? p.z) + 2.2, live?.x ?? p.x, live?.z ?? p.z),
      live ? 'placed' : 'authored position');
  }

  for (const s of doc?.shots || []) {
    push('Camera shots', s.id, s.label || s.id, s.pos[0], s.pos[2],
      facing(s.pos[0], s.pos[2], s.look[0], s.look[2]), `${s.zone} · ${s.time}:00`);
  }

  for (const o of doc?.objects || []) {
    if (o.inside) continue;
    const d = TYPES[o.type] ? Math.max(...TYPES[o.type].plan(o.p)) + 4 : 8;
    push('Objects', `obj.${o.id}`, `#${o.id} ${o.type}${o.p?.text ? ` “${o.p.text}”` : ''}`,
      o.x, o.z + d, facing(o.x, o.z + d, o.x, o.z), `${o.zone} · ${round(o.x)}, ${round(o.z)}`);
  }

  return out;
}

export const groupsOf = list => [...new Set(list.map(w => w.group))];

export const nearestTo = (list, x, z) =>
  list.reduce((best, w) => {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    return !best || d < best.d ? { w, d } : best;
  }, null);
