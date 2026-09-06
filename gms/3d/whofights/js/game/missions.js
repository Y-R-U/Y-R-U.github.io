// A contract, made playable.
//
// The board is nine jobs long and there is one arena. That is not a shortcut, it is the design:
// every mission is the same walled floor with a different sky over it, a different pair of
// surfaces underfoot, and something different standing in the far corner — and because
// js/game/bestiary.js builds forty-two monsters out of one body, "different" is a row of data
// rather than a new level, a new rig and a new set of colliders.
//
// So a mission varies along five axes and nothing else:
//
//   zone       light / neutral / dark — the whole palette of the walls, towers and floor
//   floor      what most of it is laid in
//   patch      what the four corner squares are, which is where anything that mends will stand
//   spawns     kind + variant + count, out of the bestiary
//   objective  what winning is: clear the floor, or last a given number of seconds
//
// Plus `waves`, which is the same spawn list arriving later rather than at the gate. Nine
// contracts that all say "kill everything in the room" is one afternoon nine times however
// different the monsters are, and half of the iron board's own writing is about *waiting* —
// walking a lamp round for eight nights, sitting with a ledger until it stops, holding a beacon.
// A contract that asks you to still be standing in fifty seconds is a different fight out of the
// same parts.
//
// Five axes is enough that the ninth iron contract does not feel like the first, and few enough
// that a tenth costs six lines. Varying an existing mission over time — the Society's board is
// meant to change — is changing those five things and nothing else.
//
// Pure. The document patching is a JSON transform and it is tested as one.

import { BOARDS } from './contracts.js';
import { describe } from './bestiary.js';
import { SURFACES } from './ground.js';

export const ARENA = 'arena';

// Where things stand. A ring on the far half of the floor, so a player who arrives at the gate has
// a moment to look at the room before anything reaches them.
export const RING = 13;
export const SPREAD = 2.1;      // radians the ring is spread across, centred away from the gate

export const OBJECTIVES = ['clear', 'survive'];
export const DEFAULT_OBJECTIVE = 'clear';

export const missionOf = jobId => jobFor(jobId)?.mission || null;

export const objectiveOf = m => (OBJECTIVES.includes(m?.objective) ? m.objective : DEFAULT_OBJECTIVE);

// How long a `survive` contract runs. Nonsense, or a `clear` one, is zero — the fight ends when
// the floor is clear and nothing is counting.
export const secondsOf = m =>
  (objectiveOf(m) === 'survive' ? Math.max(5, Math.round(+m.seconds || 45)) : 0);

export function jobFor(jobId) {
  for (const b of Object.values(BOARDS)) {
    const j = b.jobs.find(x => x.id === jobId);
    if (j) return { ...j, board: b.id, rank: b.rank };
  }
  return null;
}

export const playable = jobId => !!missionOf(jobId);

// Every spawn the mission asks for, expanded and placed. Deterministic: the same contract lays
// the same fight out every time it is taken, so a player who died to it can learn it.
//
// `turn` fans each wave from a different quarter of the ring, so the second group does not walk
// out of the footprints of the first.
export function spawnsOf(mission, group = null, turn = 0) {
  const list = [];
  for (const s of group || mission?.spawns || []) {
    for (let i = 0; i < Math.max(1, s.count || 1); i++) list.push({ kind: s.kind, variant: s.variant || 'none', name: s.name || null });
  }
  const n = list.length;
  return list.map((s, i) => {
    // Centred on the far side (−z) and fanned out from there. One monster stands dead ahead.
    const a = Math.PI + turn * (SPREAD * 0.9) + (n === 1 ? 0 : (i / (n - 1) - 0.5) * SPREAD);
    const x = +(Math.sin(a) * RING).toFixed(2);
    const z = +(Math.cos(a) * RING).toFixed(2);
    return {
      ...s, x, z,
      yaw: +(Math.atan2(-x, -z)).toFixed(3),
      scale: 1,
      zone: mission.zone || 'neutral',
    };
  });
}

// The groups that arrive after the gate, each already placed. Wave 0 is `spawns` and is in the
// level document; these are handed to js/game/combat.js `reinforce()` on the mission's own clock.
export function wavesOf(mission) {
  return (mission?.waves || [])
    .filter(w => w && Array.isArray(w.spawns) && w.spawns.length)
    .map((w, i) => ({ at: Math.max(0.5, +w.at || 10), spawns: spawnsOf(mission, w.spawns, i + 1) }))
    .sort((a, b) => a.at - b.at);
}

// Everything that will ever stand in the room, whenever it arrives.
export const allSpawns = mission => [...spawnsOf(mission), ...wavesOf(mission).flatMap(w => w.spawns)];

// What the whole room is worth, off the bestiary rather than authored beside it — swap a lesser
// elemental for a greater one and the contract pays more without anybody remembering to say so.
export const worthOf = mission =>
  allSpawns(mission).reduce((a, s) => a + describe(s).xp, 0);

// What the player is walking into, in one line, for the toast on arrival and the mission panel.
export function briefOf(jobId) {
  const job = jobFor(jobId);
  const m = job?.mission;
  if (!m) return null;
  const seen = new Map();
  for (const s of allSpawns(m)) {
    const d = describe(s);
    seen.set(d.name, (seen.get(d.name) || 0) + 1);
  }
  const parts = [...seen].map(([name, n]) => (n === 1 ? name : `${n} × ${name}`));
  const objective = objectiveOf(m);
  const seconds = secondsOf(m);
  return {
    job, mission: m, foes: parts.join(', '), worth: worthOf(m), note: m.note || job.blurb,
    objective, seconds, waves: wavesOf(m).length,
    // The one line the mission panel and the arrival toast both use, so they cannot disagree
    // about what the player is being asked to do.
    asks: objective === 'survive' ? `Stay standing for ${seconds} seconds` : 'Clear the floor',
  };
}

// The arena document, dressed for this contract. Takes the raw JSON off disk and returns raw JSON
// — js/editor/scene.js normalises it afterwards exactly as it would any authored level, so a
// mission cannot smuggle a field past the same validation every other level goes through.
export function patchArena(base, mission, job = null) {
  const doc = JSON.parse(JSON.stringify(base));
  const zone = mission.zone || 'neutral';
  const floor = SURFACES.includes(mission.floor) ? mission.floor : 'stone';
  const patch = SURFACES.includes(mission.patch) ? mission.patch : 'dirt';
  doc.name = job?.name || doc.name;
  doc.music = mission.music || doc.music;
  for (const d of doc.districts || []) d.zone = zone;
  for (const s of doc.shots || []) s.zone = zone;
  for (const o of doc.objects || []) {
    o.zone = zone;
    // The big square is the floor and the four small ones are the corners. Sized rather than
    // indexed, so re-laying the arena in the editor cannot silently swap them over.
    if (o.type === 'plot') o.p.surface = (o.p.w >= 30 ? floor : patch);
  }
  doc.foes = spawnsOf(mission);
  return doc;
}
