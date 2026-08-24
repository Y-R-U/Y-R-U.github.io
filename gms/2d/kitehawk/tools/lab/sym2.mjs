import { createWorld, playerType, setTierForce } from '../../js/sim/entities.js';
import { createAI } from '../../js/sim/ai.js';
import { createRNG } from '../../js/core/rng.js';
const DT=1/60;
function fight(seed, flip, k) {
  const w = createWorld({ rng: createRNG(seed) }, {});
  w.arena.cloudLo=-560; w.arena.cloudHi=-420; w.arena.halfW=1000;
  const T = playerType('kitehawk','t5');
  const a = w.spawn(T,{id:'A',side:0,xM:flip?+400:-400,yM:-400,speed:40,theta:flip?Math.PI:0,k,morale:1});
  a.ai=createAI(a,{k,aggro:1.2});
  const b = w.spawn(T,{id:'B',side:1,xM:flip?-400:+400,yM:-400,speed:40,theta:flip?0:Math.PI,k,morale:1});
  b.ai=createAI(b,{k,aggro:1.2});
  for(let i=0;i<60*90;i++){ w.update(DT);
    for(const e of [a,b]){const f=e.flight; if(Math.abs(f.sx)>1000){f.sx=Math.sign(f.sx)*999;f.svx=-f.svx*0.6;f.theta=Math.atan2(f.svy,f.svx);}}
    if(a.dead||b.dead)break; }
  if(a.dead&&!b.dead)return 'B'; if(b.dead&&!a.dead)return 'A';
  return a.hp.structure>b.hp.structure?'A':b.hp.structure>a.hp.structure?'B':'draw';
}
for (const tier of ['','competent','ace']) {
  setTierForce(tier);
  for (const k of [0.70, 0.90]) {
    const r=[0,0];
    for (const flip of [false,true]) { let A=0,B=0;
      for(let s=0;s<60;s++){const x=fight(s,flip,k); if(x==='A')A++; else if(x==='B')B++;}
      r[flip?1:0]=`${A}/${B}`; }
    console.log(`  tier=${(tier||'by-k').padEnd(10)} k=${k}  A-starts-left ${r[0]}   A-starts-right ${r[1]}`);
  }
}
setTierForce('');
