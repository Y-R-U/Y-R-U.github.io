import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
ACES.A12.hp = 220; ACES.A12.aggro = 1.2;
const runs = 120;
const win = () => { let w=0,l=0;
  for(let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:9000+i,k:0.70,swap:(i&1)===1}).run();
    if(r.winner==='player')w++;else if(r.winner==='ace')l++;}
  return w/Math.max(1,w+l); };
console.log('ACE side varies, player fixed at k 0.70 / tier competent');
console.log('  A: tier held COMPETENT for both, ace k varies');
setTierForce('competent');
for(const k of [0.25,0.55,0.75,0.95]){ ACES.A12.k=k; console.log(`     aceK ${k.toFixed(2)}  player wins ${(100*win()).toFixed(1)}%`); }
console.log('  B: ace k held 0.70, TIER varies for both');
ACES.A12.k=0.70;
for(const t of ['novice','competent','ace']){ setTierForce(t); console.log(`     tier ${t.padEnd(10)} player wins ${(100*win()).toFixed(1)}%`); }
setTierForce('');
