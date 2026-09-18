const PLATING=[{a:.50,p:50},{a:.58,p:90},{a:.66,p:140},{a:.74,p:200},{a:.82,p:270},{a:.90,p:350}];
const VIT=[100,125,150,180,215,260], MARK=[1,1.08,1.17,1.27,1.38,1.50], CUM=[0,150,500,1200,2500,4700];
function build(sp){let b=null;for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
  const c=CUM[p]+CUM[v]+CUM[m]; if(c>sp)continue;
  const s=(VIT[v]/(1-PLATING[p].a))*1000+MARK[m]; if(!b||s>b.s)b={p,v,m,s};} return b;}
function row(t,att,sp){const b=build(sp),pl=PLATING[b.p];
  const hr=t.acc*0.6, raw=att*4*hr*t.dmg/1.6;
  const eff=Math.max(0,Math.min(.92,pl.a-t.apPen)), dps=raw*(1-eff);
  return {b,eff:+eff.toFixed(2),raw:+raw.toFixed(1),dps:+dps.toFixed(1),ttd:+(VIT[b.v]/dps).toFixed(1)};}

// V3: proposed apPen + damage, AND late attacker counts pulled back (quality not volume)
const T={ militia:{dmg:9,apPen:0,acc:.42}, regular:{dmg:12,apPen:.10,acc:.55},
  veteran:{dmg:15,apPen:.18,acc:.66}, shock:{dmg:18,apPen:.26,acc:.76}, praetor:{dmg:22,apPen:.34,acc:.85} };
const VARIANTS={
 "B  fix dmg/apPen only":      [["militia",2,0],["regular",2,300],["regular",3,800],["veteran",3,1800],["veteran",4,3200],["shock",4,5000],["shock",5,7500],["praetor",6,11000]],
 "C  + attackers capped at 4": [["militia",2,0],["regular",2,300],["regular",3,800],["veteran",3,1800],["veteran",3,3200],["shock",4,5000],["shock",4,7500],["praetor",4,11000]],
 "D  C + softer SP targets":   [["militia",2,0],["regular",2,300],["regular",3,700],["veteran",3,1500],["veteran",3,2600],["shock",4,4000],["shock",4,5800],["praetor",4,8000]],
};
const NAMES=["L1 DOCK","L2 CONTAINER","L3 OVERLOOK","L4 NIGHTFALL","L5 SUPPLY","L6 SIEGE","L7 BLACKOUT","L8 BREACHPOINT"];
for(const [vn,LV] of Object.entries(VARIANTS)){
  console.log("\n=== "+vn+" ===");
  LV.forEach(([tid,att,sp],i)=>{const r=row(T[tid],att,sp);
    console.log(NAMES[i].padEnd(16)+`P${r.b.p}V${r.b.v}M${r.b.m}`.padEnd(10)+("att "+att).padEnd(7)+
      ("eff "+r.eff).padEnd(10)+("raw "+r.raw).padEnd(11)+("hp/s "+r.dps).padEnd(12)+"TTD "+r.ttd+"s");});
}
