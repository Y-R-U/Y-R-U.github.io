import {connect, sleep, URL} from '../lib.mjs';
const {send, ev} = await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL+'?cv='+Date.now()});
await sleep(3200);

const CANDS = JSON.parse(process.argv[2] || '{}');
const out = await ev(`(()=>{const g=__game, A=g.Armoury, U=g.UPGRADES.plating.costs;
  const cum=[0]; for(let i=0;i<U.length;i++) cum.push(cum[i]+U[i]);
  const cand=${JSON.stringify(CANDS)};
  const rows=[];
  for(let n=1;n<=8;n++){
    const lvl=g.LEVELS[n];
    const B = cand[n]!==undefined ? cand[n] : lvl.spTarget;
    let best=null;
    for(let p=0;p<=5;p++) for(let v=0;v<=5;v++){
      if(cum[p]+cum[v] > B) continue;
      const s=A.survival(lvl,p,v).seconds;
      if(!best || s>best.s) best={p,v,s,cost:cum[p]+cum[v]};
    }
    rows.push({n, name:lvl.name, att:lvl.maxAttackers, budget:B,
               build:'P'+best.p+'V'+best.v, cost:best.cost, sec:+best.s.toFixed(2)});
  }
  return {rows, cum};})()`);
console.log('cum rank cost:', out.cum.join(' '));
for(const r of out.rows) console.log(`L${r.n} ${r.name.padEnd(15)} att${r.att} budget ${String(r.budget).padStart(6)} -> ${r.build} (${r.cost} SP)  ${r.sec}s`);
console.log('curve:', out.rows.map(r=>r.sec).join(' · '));
process.exit(0);
