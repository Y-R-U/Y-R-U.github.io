import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
const runs = 80;
console.log('mirror duel, both sides forced to one tier, player k 0.70 vs ace k varying');
for (const force of ['novice','competent','ace']) {
  setTierForce(force);
  const line=[];
  for (const ak of [0.30,0.50,0.70,0.90]) {
    ACES.A12.k = ak;
    let w=0;
    for (let i=0;i<runs;i++){ const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:8000+i,k:0.70}).run(); if(r.winner==='player')w++; }
    line.push(`aceK${ak.toFixed(2)}:${(100*w/runs).toFixed(0)}%`);
  }
  console.log(`  tier=${force.padEnd(10)} ` + line.join('  '));
}
ACES.A12.k=0.90; setTierForce('');
