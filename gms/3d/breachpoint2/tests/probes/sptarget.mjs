// pure-node copy of the P5a survival model, to pick spTargets that make the
// TTD curve monotone. Tables copied from js/data.js; verified against the page.
const TIERS={
  militia:{dmg:9,apPen:0.00,accuracy:0.42,reaction:0.85},
  regular:{dmg:12,apPen:0.10,accuracy:0.55,reaction:0.65},
  veteran:{dmg:15,apPen:0.18,accuracy:0.66,reaction:0.52},
  shock:{dmg:18,apPen:0.26,accuracy:0.76,reaction:0.42},
  praetor:{dmg:22,apPen:0.34,accuracy:0.85,reaction:0.34}};
const PLATE=[{pool:50,absorb:0.50,delay:6.0,regen:0},{pool:90,absorb:0.58,delay:5.2,regen:8},
  {pool:140,absorb:0.66,delay:4.4,regen:12},{pool:200,absorb:0.74,delay:3.6,regen:16},
  {pool:270,absorb:0.82,delay:2.8,regen:22},{pool:350,absorb:0.90,delay:2.0,regen:30}];
const VIT=[100,125,150,180,215,260];
const CUM=[0,150,500,1200,2500,4700];
const LV=[null,
 {n:1,tier:'militia',att:2,sp:0},   {n:2,tier:'regular',att:2,sp:300},
 {n:3,tier:'regular',att:3,sp:800}, {n:4,tier:'veteran',att:3,sp:1800},
 {n:5,tier:'veteran',att:3,sp:3200},{n:6,tier:'shock',att:4,sp:5000},
 {n:7,tier:'shock',att:4,sp:7500},  {n:8,tier:'praetor',att:4,sp:11000}];
const clamp=(v,a,b)=>v<a?a:(v>b?b:v), lerp=(a,b,t)=>a+(b-a)*t;
const HIT_RATE=0.6, CD_MEAN=1.175, CD_FAR=0.5, GAP=0.115;
const cad=t=>{const n=4+(t.accuracy>0.7?1:0); const cd=(CD_MEAN+CD_FAR)*lerp(1,t.reaction,0.5);
  return n/Math.max(cd,(n-1)*GAP);};
function surv(tierId,att,p,v){
  const t=TIERS[tierId], pl=PLATE[p];
  const ab=clamp(pl.absorb-t.apPen,0,0.92);
  const rounds=att*cad(t)*(t.accuracy*HIT_RATE);
  const maxHp=VIT[v], hpW=t.dmg*(1-ab), hpN=t.dmg;
  const gap=1/rounds;
  const regen=(pl.regen>0&&gap>pl.delay)?pl.regen*(gap-pl.delay):0;
  const toArm=Math.max(0,t.dmg*ab-regen);
  const armSec=toArm>0? pl.pool/(rounds*toArm):Infinity;
  const hpLost=hpW*rounds*armSec;
  return hpLost>=maxHp? maxHp/(rounds*hpW) : armSec+(maxHp-hpLost)/(rounds*hpN);
}
function bestAt(l,sp){
  let best=null;
  for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
    if(CUM[p]+CUM[v]+CUM[m]>sp) continue;
    const s=surv(l.tier,l.att,p,v), sc=s*1000+m;
    if(!best||sc>best.sc) best={p,v,m,s,sc,cost:CUM[p]+CUM[v]+CUM[m]};
  }
  return best;
}
const earn=n=>300+125*n*(n-1);        // training + first clears, no bonuses
function show(targets,label){
  console.log('\n'+label);
  console.log('lvl tier      att  spT    earnable  build     TTD');
  let prev=Infinity, mono=true;
  for(let n=1;n<=8;n++){ const l=LV[n], sp=targets[n], b=bestAt(l,sp);
    if(!(b.s<prev)) mono=false; prev=b.s;
    console.log(('L'+n).padEnd(4)+l.tier.padEnd(10)+String(l.att).padEnd(5)+String(sp).padEnd(7)+
      String(earn(n)).padEnd(10)+('P'+b.p+'V'+b.v+'M'+b.m).padEnd(10)+b.s.toFixed(2)+'s'); }
  console.log('monotone: '+mono);
  return mono;
}
const cur={}; for(let n=1;n<=8;n++) cur[n]=LV[n].sp;
show(cur,'=== CURRENT spTargets, NEW model ===');

// keep L1-L4, L6, L8 where they are; find the largest L5 and L7 that still
// leave the curve strictly decreasing (a target should never go UP, the player
// cannot earn more than the level before plus that level's own payout)
const t2=Object.assign({},cur);
const ttd=n=>bestAt(LV[n],t2[n]).s;
for(const n of [5,7]){
  let bestSp=t2[n-1];
  for(let sp=t2[n-1]; sp<=t2[n+1]; sp+=50){
    const s=surv(LV[n].tier,LV[n].att,bestAt(LV[n],sp).p,bestAt(LV[n],sp).v);
    if(s < ttd(n-1)) bestSp=sp;                     // still below the level before
  }
  t2[n]=bestSp;
}
show(t2,'=== AFTER: L5 and L7 pulled down ===');
console.log('\nproposed: '+JSON.stringify(t2));
