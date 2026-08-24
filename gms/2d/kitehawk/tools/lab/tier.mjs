import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
const runs = 60;
for (const force of ['', 'novice', 'competent', 'ace']) {
  setTierForce(force);
  const line = [];
  for (const pk of [0.30, 0.50, 0.70, 0.90]) {
    ACES.A12.k = 0.90;
    let w = 0;
    for (let i = 0; i < runs; i++) {
      const r = createDuel({}, { ace: 'A12', airframe: 'kitehawk', gun: 't5', seed: 7000 + i, k: pk }).run();
      if (r.winner === 'player') w++;
    }
    line.push(`pK${pk.toFixed(2)}:${(100 * w / runs).toFixed(0)}%`);
  }
  console.log(`  tier=${(force || 'by-k').padEnd(10)} vs aceK 0.90 (tier ${force || 'ace'})  ` + line.join('  '));
}
setTierForce('');
