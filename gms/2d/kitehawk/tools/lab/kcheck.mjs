import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
ACES.A12.hp=220; ACES.A12.aggro=1.2;
const runs=Number(process.env.RUNS||240);
const seedSets=[9000,53000];
for(const force of ['competent','']){
  setTierForce(force);
  console.log(`tier=${force||'by-k (the shipped ladder)'}`);
  for(const k of [0.25,0.60,0.95]){
    ACES.A12.k=k;
    const out=[];
    for(const s0 of seedSets){
      let w=0,l=0;
      for(let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:s0+i,k:0.70,swap:(i&1)===1}).run();
        if(r.winner==='player')w++;else if(r.winner==='ace')l++;}
      out.push(100*w/Math.max(1,w+l));
    }
    console.log(`   aceK ${k.toFixed(2)}  player wins ${out.map(x=>x.toFixed(1)+'%').join(' / ')}  (two seed sets)`);
  }
}
setTierForce('');
