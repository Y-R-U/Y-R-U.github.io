import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
ACES.A12.hp=220; ACES.A12.aggro=1.2; ACES.A12.k=0.90;
for (const af of ['kitehawk','harrier_tri']) {
  for (const s0 of [41000, 77000, 123000]) {
    let w=0,l=0,d=0;
    for(let i=0;i<200;i++){const r=createDuel({},{ace:'A12',airframe:af,gun:'t5',seed:s0+i,k:0.90,swap:(i&1)===1}).run();
      if(r.winner==='player')w++;else if(r.winner==='ace')l++;else d++;}
    const n=w+l;
    console.log(`  ${af.padEnd(12)} seed ${s0}  ${w}/${l} (draw ${d})  ${(100*w/n).toFixed(1)}% +-${(100*Math.sqrt(0.25/n)).toFixed(1)}`);
  }
}
