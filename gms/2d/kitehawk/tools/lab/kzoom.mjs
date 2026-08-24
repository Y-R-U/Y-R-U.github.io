import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
ACES.A12.hp=220; ACES.A12.aggro=1.2; setTierForce('competent');
const runs=100;
for(const k of [0.75,0.82,0.88,0.92,0.95,0.99]){
  ACES.A12.k=k;
  let w=0,l=0,as=0,ah=0,ps=0,ph=0,stall=0,gnd=0;
  for(let i=0;i<runs;i++){
    const d=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:9000+i,k:0.70,swap:(i&1)===1});
    const r=d.run(); if(r.winner==='player')w++;else if(r.winner==='ace')l++;
    const a=d.world.byId('ace'); if(a){as+=a.shotsFired;ah+=a.hits;stall+=a.flight.stallCount;}
    ps+=r.shots; ph+=r.hits;
    for(const c of r.causes) if(c==='ground') gnd++;
  }
  console.log(`  k ${k.toFixed(2)}  player ${(100*w/Math.max(1,w+l)).toFixed(1)}%  aceShots ${(as/runs).toFixed(0)} acc ${(ah/Math.max(1,as)).toFixed(3)}  playerShots ${(ps/runs).toFixed(0)} acc ${(ph/Math.max(1,ps)).toFixed(3)}  aceStalls ${(stall/runs).toFixed(1)}  groundLosses ${gnd}`);
}
setTierForce('');
