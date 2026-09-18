import {connect,URL,sleep} from './lib.mjs';
const {ws,ev,send}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL}); await sleep(3000);
const r=await ev(`(()=>{const A=__game.Armoury,B=window.BP2;
 const at=(n,p,v)=>{const s=A.survivalAt(n,p,v);return {n,p,v,sec:+s.seconds.toFixed(2),txt:A.fmtSec(s.seconds),
   band:A.BANDS[A.band(s.seconds)].label,hp:+s.hpPerHit.toFixed(2),rounds:+s.rounds.toFixed(3),
   arm:+s.armourSec.toFixed(2),pool:s.pool,maxHp:s.maxHp}};
 const old=(n,p,v)=>{const lvl=B.levelById(n),t=B.TIERS[A.mainTier(lvl)];
   const r=lvl.maxAttackers*4*(t.accuracy*0.6)/1.6; return +(B.UPGRADES.vitality.ranks[v].maxHp/(r*__game.gateCalc(A.mainTier(lvl),p,false).hp)).toFixed(1)};
 return {l1max:at(1,5,5), l1max_old:old(1,5,5), l1p5v0:at(1,5,0), l7p5v0:at(7,5,0), l8p5v0:at(8,5,0),
   l6p41:at(6,4,1), l6p51:at(6,5,1), l6p43:at(6,4,3), l6p40:at(6,4,0),
   pairs:[[1,5,5],[4,2,3],[6,4,1],[8,5,5]].map(([n,p,v])=>at(n,p,v)),
   sp:B.LEVELS.map(l=>l.spTarget)};})()`);
console.log(JSON.stringify(r,null,1));
ws.close();process.exit(0);
