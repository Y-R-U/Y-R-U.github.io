const tiers=['emergency','low','standard','high'];
const percentile=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))]||0;
// Frame times and elapsed time are injected, making adaptation reproducible in Node.
export function createQuality({apply,initial='standard',mode='auto'}){
 let tier=initial,scale=1,frames=[],slow=0,fast=0,elapsed=0,lastChange=-30,nextStats=0,stats={p50:0,p90:0,p99:0,fps:0},changes=[],failed=false;
 function commit(value,resolution,reason){if(value===tier&&resolution===scale)return;tier=value;scale=resolution;lastChange=elapsed;slow=0;fast=0;frames=[];changes.push({seconds:elapsed,tier,scale,reason});if(changes.length>40)changes.shift();apply(tier,scale);}
 function down(reason){const index=tiers.indexOf(tier);if(index>0)commit(tiers[index-1],index===1?.75:1,reason);else if(scale>.75)commit(tier,.75,reason);}
 return {start(){apply(tier,scale);},setMode(value){mode=value;frames=[];slow=0;fast=0;if(value!=='auto')commit(value,1,'selected');},reset(){frames=[];slow=0;fast=0;},
  sample(ms){if(!Number.isFinite(ms)||ms<=0||ms>1000)return;elapsed+=ms/1000;frames.push(ms);if(frames.length>180)frames.shift();
   if(frames.length>=30){const mean=frames.slice(-30).reduce((a,b)=>a+b,0)/30;if(mean>30&&elapsed-lastChange>=1){down('30-frame floor');}}
   if(elapsed<nextStats)return;nextStats=elapsed+.5;
   const sorted=[...frames].sort((a,b)=>a-b);stats={p50:percentile(sorted,.5),p90:percentile(sorted,.9),p99:percentile(sorted,.99),fps:1000/(frames.reduce((a,b)=>a+b,0)/Math.max(1,frames.length))};
   if(frames.length<30)return;
   failed=tier==='emergency'&&scale===.75&&stats.p90>33.3;
   if(frames.length<180)return;
   slow=stats.p90>20?slow+.5:0;fast=stats.p90<15?fast+.5:0;
   if(slow>=3){if(scale>.75)commit(tier,Math.max(.75,Math.round((scale-.1)*100)/100),'sustained p90');else down('sustained p90');}
   if(mode==='auto'&&fast>=20&&elapsed-lastChange>=30){if(scale<1)commit(tier,Math.min(1,scale+.1),'headroom');else if(tiers.indexOf(tier)<3)commit(tiers[tiers.indexOf(tier)+1],1,'headroom');}
  },snapshot(){return {...stats,tier,scale,mode,emergencyOverride:mode!=='auto'&&tier!==mode,failed,changes:[...changes]};}};
}
