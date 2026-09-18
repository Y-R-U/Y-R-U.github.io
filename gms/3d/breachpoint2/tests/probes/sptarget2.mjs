const TIERS={militia:{dmg:9,apPen:0,accuracy:0.42,reaction:0.85},regular:{dmg:12,apPen:0.10,accuracy:0.55,reaction:0.65},
 veteran:{dmg:15,apPen:0.18,accuracy:0.66,reaction:0.52},shock:{dmg:18,apPen:0.26,accuracy:0.76,reaction:0.42},
 praetor:{dmg:22,apPen:0.34,accuracy:0.85,reaction:0.34}};
const BOSS={dmg:1.25,apPen:0.10};
const PLATE=[{pool:50,absorb:0.50,delay:6,regen:0},{pool:90,absorb:0.58,delay:5.2,regen:8},{pool:140,absorb:0.66,delay:4.4,regen:12},
 {pool:200,absorb:0.74,delay:3.6,regen:16},{pool:270,absorb:0.82,delay:2.8,regen:22},{pool:350,absorb:0.90,delay:2,regen:30}];
const VIT=[100,125,150,180,215,260], CUM=[0,150,500,1200,2500,4700];
const LV=[null,{tier:'militia',att:2,bosses:0},{tier:'regular',att:2,bosses:1},{tier:'regular',att:3,bosses:1},
 {tier:'veteran',att:3,bosses:1},{tier:'veteran',att:3,bosses:1},{tier:'shock',att:4,bosses:1},
 {tier:'shock',att:4,bosses:2},{tier:'praetor',att:4,bosses:1}];
const clamp=(v,a,b)=>v<a?a:(v>b?b:v), lerp=(a,b,t)=>a+(b-a)*t;
const HR=0.6,CD=1.175,FAR=0.5,GAP=0.115;
const cad=t=>{const n=4+(t.accuracy>0.7?1:0);return n/Math.max((CD+FAR)*lerp(1,t.reaction,0.5),(n-1)*GAP);};
// slots: [{dmg, ab, rate}] ; rate = rounds LANDING per second for that slot
function ttd(l,p,v,withBoss){
  const t=TIERS[l.tier], pl=PLATE[p], slots=[];
  const nb = withBoss? Math.min(l.bosses, l.att) : 0;
  for(let i=0;i<l.att;i++){
    const boss = i<nb;
    const dmg=t.dmg*(boss?BOSS.dmg:1), pen=clamp(t.apPen+(boss?BOSS.apPen:0),0,0.95);
    const ab=clamp(pl.absorb-pen,0,0.92);
    slots.push({dmg, ab, rate:cad(t)*(t.accuracy*HR)});
  }
  const maxHp=VIT[v];
  const armDrain=slots.reduce((s,x)=>s+x.rate*x.dmg*x.ab,0);
  const hpWith=slots.reduce((s,x)=>s+x.rate*x.dmg*(1-x.ab),0);
  const hpNone=slots.reduce((s,x)=>s+x.rate*x.dmg,0);
  const armSec=armDrain>0? pl.pool/armDrain : Infinity;
  const lost=hpWith*armSec;
  return lost>=maxHp? maxHp/hpWith : armSec+(maxHp-lost)/hpNone;
}
function best(l,sp,wb){let b=null;
  for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
    if(CUM[p]+CUM[v]+CUM[m]>sp)continue; const s=ttd(l,p,v,wb), sc=s*1000+m;
    if(!b||sc>b.sc)b={p,v,m,s,sc};} return b;}
const EARN=[0,300,550,1050,1800,2800,4050,5550,7300];
function show(tg,wb,label){
  let prev=Infinity,mono=true,out=[];
  for(let n=1;n<=8;n++){const b=best(LV[n],tg[n],wb); if(!(b.s<prev))mono=false; prev=b.s;
    out.push('L'+n+' sp'+tg[n]+' P'+b.p+'V'+b.v+'M'+b.m+' '+b.s.toFixed(2)+'s');}
  console.log(label+(wb?' [boss counted]':' [boss ignored]')+'  monotone='+mono+'\n  '+out.join('\n  '));
}
const CUR=[0,0,300,800,1800,3200,5000,7500,11000];
show(CUR,false,'current targets');
show(CUR,true,'current targets');
show(EARN,false,'earnable targets');
show(EARN,true,'earnable targets');
