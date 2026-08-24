/* Gate C7 across every airframe, both ways round. The row that detects the
   whole symmetry defect family. */
import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { AIRFRAMES } from '../../js/data/tables.js';
const runs = Number(process.env.RUNS || 200);
ACES.A12.hp = 220; ACES.A12.aggro = 1.2; ACES.A12.k = 0.90;
let tw = 0, tl = 0, td = 0;
for (const af of AIRFRAMES) {
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < runs; i++) {
    const r = createDuel({}, { ace: 'A12', airframe: af.id, gun: 't5', seed: 41000 + i,
                               k: 0.90, swap: (i & 1) === 1 }).run();
    if (r.winner === 'player') w++; else if (r.winner === 'ace') l++; else d++;
  }
  tw += w; tl += l; td += d;
  const n = Math.max(1, w + l);
  console.log(`  ${af.id.padEnd(13)} player ${String(w).padStart(3)}  ace ${String(l).padStart(3)}  draw ${String(d).padStart(3)}  -> ${(100 * w / n).toFixed(1)}% of decisive  +-${(100 * Math.sqrt(0.25 / n)).toFixed(1)}`);
}
const n = tw + tl;
console.log(`  ${'ALL'.padEnd(13)} player ${tw}  ace ${tl}  draw ${td}  -> ${(100 * tw / n).toFixed(1)}%  +-${(100 * Math.sqrt(0.25 / n)).toFixed(1)}`);
