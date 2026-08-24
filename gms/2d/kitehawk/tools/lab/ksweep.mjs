import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
const runs = 60;
console.log('mirror duel (A12, kitehawk t5, both 220 HP, same airframe+gun)');
for (const pk of [0.30, 0.50, 0.70, 0.90]) {
  const line = [];
  for (const ak of [0.30, 0.50, 0.70, 0.90]) {
    ACES.A12.k = ak;
    let w = 0;
    for (let i = 0; i < runs; i++) {
      const r = createDuel({}, { ace: 'A12', airframe: 'kitehawk', gun: 't5', seed: 7000 + i, k: pk }).run();
      if (r.winner === 'player') w++;
    }
    line.push(`aceK ${ak.toFixed(2)}: ${(100 * w / runs).toFixed(0)}%`);
  }
  console.log(`  playerK ${pk.toFixed(2)}  ` + line.join('   '));
}
ACES.A12.k = 0.90;
