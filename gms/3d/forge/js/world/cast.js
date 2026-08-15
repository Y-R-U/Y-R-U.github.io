// The named cast as fixed bodies on the people rig. The ambient crowd is untouched; what changes is
// that Bel is the same body every time you look.

import { ZONE_IDS } from './zones.js';
// field.js, not terrain.js: the same zoneAt with no renderer import, so a node test can reach it.
import { zoneAt } from './field.js';

const hash = id => id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);

export class Cast {
  constructor(people, entries = []) {
    this.people = people;
    this.bodies = new Map();
    for (const e of entries) {
      const zi = e.town ? ZONE_IDS.indexOf(e.town) : zoneAt(e.x, e.z);
      const h = hash(e.id);
      this.bodies.set(e.id, people.place({
        npc: e.id, x: e.x, z: e.z, heading: e.ry || 0,
        zi: zi < 0 ? 1 : zi, vi: h & 1,
        phase: (h >>> 3) % 40, gait: ((h >>> 7) % 628) / 100,
        scale: 0.94 + ((h >>> 11) % 14) / 100, tone: 0.9 + ((h >>> 15) % 20) / 100,
      }));
    }
  }

  at(id) { return this.bodies.get(id) || null; }

  targets(range = 4) {
    const out = [];
    for (const [id, a] of this.bodies) out.push({ id, kind: 'talk', label: 'talk', x: a.x, z: a.z, range });
    return out;
  }
}
