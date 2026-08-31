// data/characters.json — DEV_CONTRACT §7. Loads the cast, spawns the ones with a `place` in this
// level on whichever of the two rigs their `body` names, and answers "where is <id>?" for the
// hotspot runtime.
//
// A character with `body: "none"` is a voice and nothing else: a narrator, or an NPC that has not
// been promoted yet. Promotion is `body: "robed"` plus a `place` — no other change.

const ROBES = ['light', 'neutral', 'dark'];
const ZI = { light: 0, neutral: 1, dark: 2 };
const BODIES = ['robed', 'dummy', 'none'];

export function normaliseCast(raw) {
  const warnings = [];
  const out = {};
  const src = raw?.characters && typeof raw.characters === 'object' ? raw.characters : {};
  for (const [id, c] of Object.entries(src)) {
    if (!c || typeof c !== 'object') { warnings.push(`${id}: not an object`); continue; }
    const body = BODIES.includes(c.body) ? c.body : 'none';
    const robe = ROBES.includes(c.robe) ? c.robe : 'neutral';
    out[id] = {
      id,
      name: String(c.name || id),
      body,
      robe,
      height: clamp(c.height, 0.85, 1.20, 1),
      build: clamp(c.build, 0.85, 1.20, 1),
      gender: ['f', 'm', 'x'].includes(c.gender) ? c.gender : 'x',
      sex: c.sex === 'f' ? 'f' : 'm',
      skin: typeof c.skin === 'string' ? c.skin : null,
      hood: c.hood === 'down' ? 'down' : 'up',
      voice: typeof c.voice === 'string' ? c.voice : null,
      voiceSpeed: clamp(c.voiceSpeed, 0.7, 1.3, 1),
      voicePitch: clamp(c.voicePitch, -4, 4, 0),
      barks: c.barks && typeof c.barks === 'object' ? c.barks : {},
      place: c.place ? {
        level: String(c.place.level || ''),
        x: +c.place.x || 0,
        z: +c.place.z || 0,
        yaw: +c.place.yaw || 0,
        inside: Number.isInteger(+c.place.inside) ? +c.place.inside : null,
        wander: c.place.wander ? {
          x0: +c.place.wander.x0, x1: +c.place.wander.x1,
          z0: +c.place.wander.z0, z1: +c.place.wander.z1,
          speed: +c.place.wander.speed || 0.8,
        } : null,
      } : null,
    };
    if (body !== 'none' && !out[id].place) warnings.push(`${id}: has a body but nowhere to stand`);
    // The dummy rig is one mesh, not a seat in the crowd pool, so it does not stroll. A wander box
    // on one is authored data nothing reads, which has to be said out loud rather than silently
    // producing a figure that stands still where the author asked for one that walks.
    if (body === 'dummy' && out[id].place?.wander) warnings.push(`${id}: the dummy rig does not wander — the box is ignored`);
  }
  return { cast: out, warnings };
}

const clamp = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : def);

export class Characters {
  // `people` is js/world/people.js and `dummies` is js/world/dummies.js — the two rigs of §7.
  // `world` answers floorOf(houseId) for a body standing indoors.
  constructor(cast, { people, dummies, world, level }) {
    this.cast = cast;
    this.people = people;
    this.dummies = dummies;
    this.bodies = new Map();
    for (const c of Object.values(cast)) {
      if (c.body === 'none' || !c.place || (level && c.place.level !== level)) continue;
      const fixY = c.place.inside ? world?.floorOf(c.place.inside) : null;
      if (c.body === 'dummy') {
        if (!dummies) { console.warn(`characters: ${c.id} is a dummy but no dummy rig was passed`); continue; }
        const d = dummies.place({ id: c.id, sex: c.sex, skin: c.skin,
          x: c.place.x, z: c.place.z, yaw: c.place.yaw, scale: c.height,
          ...(fixY == null ? {} : { fixY }) });
        if (d) this.bodies.set(c.id, d);
        continue;
      }
      const w = c.place.wander;
      const a = people.place({
        npc: c.id,
        zi: ZI[c.robe] ?? 1,
        // DEV_CONTRACT §7: gender is metadata and orders the voice list — it must not pick a mesh.
        // This used to map f → variant 1, the stout body, which also has no staff.
        vi: 0,
        kind: w ? 'stroll' : 'idle',
        x: c.place.x, z: c.place.z,
        heading: c.place.yaw,
        speed: w ? w.speed : 0,
        turn: w ? 0.22 : 0.09,
        box: w ? [w.x0, w.x1, w.z0, w.z1] : null,
        scale: c.height,
        // the house whose footprint this body is legitimately standing inside — see people.js
        indoor: c.place.inside || 0,
        ...(fixY == null ? {} : { fixY }),
      });
      if (a) this.bodies.set(c.id, a);
    }
  }

  get(id) { return this.cast[id] || null; }
  body(id) { return this.bodies.get(id) || null; }

  // The hotspot runtime's `characterAt`.
  at(id) {
    const a = this.bodies.get(id);
    return a ? { x: a.x, z: a.z, y: a.y ?? 0 } : null;
  }

  report() {
    return [...this.bodies].map(([id, a]) => ({ id, x: +a.x.toFixed(2), z: +a.z.toFixed(2) }));
  }
}

export async function loadCast(url = 'data/characters.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return normaliseCast(await r.json());
}
