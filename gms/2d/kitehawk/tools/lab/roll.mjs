import { createFlight } from '../../js/sim/flight.js';
import { createPilot } from '../../js/sim/pilot.js';
import { createRNG } from '../../js/core/rng.js';
import { REFERENCE } from '../../js/data/tables.js';
const DT=1/60, DEG=180/Math.PI;
function run(theta, roll, label, mirror) {
  const ctx={rng:createRNG(3)};
  const ac=createFlight(ctx,{airframe:REFERENCE,speed:45,yM:-600,theta,roll});
  const p=createPilot(ctx,{tier:'competent'});
  const dir=Math.cos(theta)>=0?1:-1;
  const pt={xM:0,yM:0};
  for(let i=0;i<60*6;i++){
    let tx=ac.sx+dir*200, ty=ac.sy-300;
    if(mirror && ac.roll<0){
      const b=Math.atan2(ty-ac.sy,tx-ac.sx);
      let dg=b-ac.gamma; dg=Math.atan2(Math.sin(dg),Math.cos(dg));
      const m=ac.gamma-dg, d=Math.hypot(tx-ac.sx,ty-ac.sy);
      tx=ac.sx+Math.cos(m)*d; ty=ac.sy+Math.sin(m)*d;
    }
    pt.xM=tx; pt.yM=ty; p.setIntent('point',pt);
    p.update(DT,ac); ac.update(DT);
  }
  console.log(`  ${label.padEnd(28)} alt ${(-ac.sy).toFixed(0)} m  v ${ac.speedSI.toFixed(1)}  gamma ${(ac.gamma*DEG).toFixed(0)}  roll ${ac.roll.toFixed(2)}`);
}
console.log('climb to a point 300 m above, 6 s, from 600 m / 45 m/s');
run(0, 1, 'heading +x, roll +1', false);
run(Math.PI, -1, 'heading -x, roll -1', false);
run(Math.PI, 1, 'heading -x, roll +1 (inverted)', false);
run(Math.PI, -1, 'heading -x, roll -1 MIRRORED', true);
