// D19 "LANDED — DEMAND IT": where a stopped plane may finish the flight, by difficulty. Pure, layout-driven.
import { RUNWAYS, APRON, STANDS } from '../world/layout.js';

export const FINISH = { stopKt: 5, nearRunwayM: 300, standRadiusM: 45, spotRadiusM: 25 };
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
const PROTECTION_DIFF = { rubber: 'easy', partial: 'medium', realistic: 'hard' };
export const difficultyFor = ({ difficulty, protection } = {}) => (DIFFICULTIES.includes(difficulty) ? difficulty : PROTECTION_DIFF[protection] || 'easy');

// Distance (m) from (x, z) to a runway's paved rectangle; 0 inside.
function runwayDist(rw, x, z) {
  const h = (rw.heading * Math.PI) / 180, ax = Math.sin(h), az = -Math.cos(h);
  const dx = x - rw.center[0], dz = z - rw.center[2];
  const along = dx * ax + dz * az, across = dx * az - dz * ax;
  const oa = Math.max(0, Math.abs(along) - rw.length / 2), oc = Math.max(0, Math.abs(across) - rw.width / 2);
  return Math.hypot(oa, oc);
}
const onApron = (x, z, m = 0) => Math.abs(x - APRON.center[0]) <= APRON.size[0] / 2 + m && Math.abs(z - APRON.center[2]) <= APRON.size[1] / 2 + m;
const nearStand = (x, z) => STANDS.some((s) => Math.hypot(x - s.position[0], z - s.position[2]) <= FINISH.standRadiusM);

// The default designated spot for Hard: the middle stand, right in front of the terminal.
export const DEFAULT_SPOT = { x: STANDS[3].position[0], z: STANDS[3].position[2], r: FINISH.spotRadiusM, id: STANDS[3].id };

// p = { x, z, surface }; spot = { x, z, r } (Hard's designated spot). Returns { ok, reason }.
export function finishZone(difficulty, p, spot = DEFAULT_SPOT) {
  const d = difficultyFor({ difficulty });
  const { x, z } = p;
  if (p.surface === 'water' || p.surface === 'building') return { ok: false, reason: 'Not here, surely' };
  if (d === 'easy') {
    const near = RUNWAYS.some((rw) => runwayDist(rw, x, z) <= FINISH.nearRunwayM);
    return near ? { ok: true, reason: '' } : { ok: false, reason: 'Land nearer a runway' };
  }
  if (d === 'medium') {
    const ok = p.surface === 'runway' || RUNWAYS.some((rw) => runwayDist(rw, x, z) === 0) || onApron(x, z);
    return ok ? { ok: true, reason: '' } : { ok: false, reason: 'Stop on a runway or the terminal apron' };
  }
  const atSpot = spot && Math.hypot(x - spot.x, z - spot.z) <= (spot.r || FINISH.spotRadiusM);
  const ok = atSpot || (onApron(x, z) && nearStand(x, z));
  return ok ? { ok: true, reason: '' } : { ok: false, reason: 'Taxi to the terminal' };
}
