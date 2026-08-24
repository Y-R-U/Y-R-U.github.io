import { AIRFRAMES } from '../../js/data/tables.js';
import { createDuel } from '../../js/modes/duel.js';
const runs = 200;
let w=0,l=0; const rows=[];
for (const af of AIRFRAMES) {
  let a=0,b=0;
  for(let i=0;i<runs;i++){const r=createDuel({},{ace:'A12',airframe:af.id,gun:'t5',seed:9000+i,k:0.70,swap:(i&1)===1}).run();
    if(r.winner==='player')a++;else if(r.winner==='ace')b++;}
  w+=a;l+=b; rows.push(`${af.id} ${(100*a/Math.max(1,a+b)).toFixed(0)}%`);
}
const n=w+l;
console.log(`C7 pooled: player ${w} ace ${l} -> ${(100*w/n).toFixed(1)}% +-${(100*Math.sqrt(0.25/n)).toFixed(1)}   [${rows.join('  ')}]`);
