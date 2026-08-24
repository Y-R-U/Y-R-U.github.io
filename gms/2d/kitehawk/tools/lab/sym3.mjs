import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
ACES.A12.hp = 220; ACES.A12.aggro = 1.2; ACES.A12.k = 0.90;
const runs = 500;
let w=0,l=0,d=0;
for (let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:41000+i,k:0.90}).run();
  if(r.winner==='player')w++;else if(r.winner==='ace')l++;else d++;}
const n=w+l;
console.log(`exact mirror k0.90, ${runs} duels: player ${w} ace ${l} draw ${d}`);
console.log(`  win rate incl draws ${(100*w/runs).toFixed(1)}%   excl draws ${(100*w/n).toFixed(1)}% +-${(100*Math.sqrt(0.25/n)).toFixed(1)}`);
