import { createWorld, ENEMY_BY_ID, playerType } from '../../js/sim/entities.js';
import { createAI } from '../../js/sim/ai.js';
import { createRNG } from '../../js/core/rng.js';
const DT=1/60;
const world = createWorld({ rng: createRNG(701) }, {});
world.arena.halfW = 1400;
const p = world.spawn(playerType('kite_b1','t2'), { id:'player', side:0, xM:0, yM:-450, speed:45, theta:0, morale:1, k:0.72 });
p.ai = createAI(p, { k:0.72, aggro:1.4 });
const es=[];
const types=['kestrel','kestrel','wasp','kestrel','shrike','wasp'];
for(let i=0;i<6;i++){
  const e=world.spawn(ENEMY_BY_ID[types[i]],{id:'e'+i,side:1,xM:300+i*55,yM:-430-(i%3)*40,speed:45,theta:Math.PI,
    morale:0.50+(i%4)*0.13,k:0.45+(i%3)*0.1,aggro:0.8+(i%3)*0.5});
  e.ai=createAI(e,{k:e.k,aggro:e.aggro}); es.push(e);
}
let mins = es.map(()=>9);
for(let i=0;i<60*120;i++){
  world.update(DT);
  es.forEach((e,j)=>{ if(e.alive&&!e.dead) mins[j]=Math.min(mins[j],e.morale); });
  if(!p.alive||p.dead) break;
}
console.log('min morale per enemy', mins.map(m=>m>8?'dead-early':m.toFixed(2)).join(' '));
console.log('states', es.map(e=>e.ai? Object.keys(e.ai.stats.states).join(',') : '-').join(' | '));
console.log('alive', es.filter(e=>e.alive&&!e.dead).length, 'dead', es.filter(e=>e.dead||!e.alive).length);
