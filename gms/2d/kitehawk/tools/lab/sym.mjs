import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
ACES.A12.hp = 220; ACES.A12.aggro = 1.2;
const runs = 120;
for (const k of [0.50, 0.70, 0.90]) {
  ACES.A12.k = k;
  let w=0,l=0,d=0;
  for (let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:2200+i,k}).run();
    if(r.winner==='player')w++;else if(r.winner==='ace')l++;else d++;}
  console.log(`  exact mirror, both k ${k.toFixed(2)}:  player ${w}  ace ${l}  draw ${d}   -> ${(100*w/runs).toFixed(1)}%`);
}
