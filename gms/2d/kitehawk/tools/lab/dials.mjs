import { createDuel } from '../../js/modes/duel.js';
import { ACES, setDialLock } from '../../js/sim/ai.js';
import { setTierForce } from '../../js/sim/entities.js';
ACES.A12.hp=220; ACES.A12.aggro=1.2; setTierForce('competent');
const runs=160;
const win=(k)=>{ ACES.A12.k=k; let w=0,l=0;
  for(let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:9000+i,k:0.70,swap:(i&1)===1}).run();
    if(r.winner==='player')w++;else if(r.winner==='ace')l++;}
  return 100*w/Math.max(1,w+l); };
const cases = [
  ['all dials live (control)', {}],
  ['react LOCKED 0.33 s',      { react: 0.33 }],
  ['aim error LOCKED (0.45, 2.5deg)', { aimLead: 0.45, aimAng: 2.5 }],
  ['fireCone LOCKED 8.7deg',   { fireCone: 8.7 * Math.PI/180 }],
  ['check-six LOCKED 2.1 s',   { six: 2.1 }],
];
for (const [name, lock] of cases) {
  setDialLock({ react:0, aimLead:-1, aimAng:-1, fireCone:0, six:0 });
  setDialLock(lock);
  const lo = win(0.25), hi = win(0.95);
  console.log(`  ${name.padEnd(34)} k0.25 ${lo.toFixed(1)}%   k0.95 ${hi.toFixed(1)}%   gradient ${(lo-hi).toFixed(1)} pts`);
}
setDialLock({ react:0, aimLead:-1, aimAng:-1, fireCone:0, six:0 }); setTierForce('');
