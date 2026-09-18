// Pure-numbers TTK/TTD check for BREACHPOINT II. No browser.
const SPEC = {
  tiers:{ paint:{hp:60,dmg:5,apPen:0,dtm:1,acc:.30}, militia:{hp:80,dmg:9,apPen:0,dtm:1,acc:.42},
    regular:{hp:100,dmg:14,apPen:.15,dtm:1,acc:.55}, veteran:{hp:130,dmg:19,apPen:.30,dtm:.90,acc:.66},
    shock:{hp:170,dmg:25,apPen:.45,dtm:.82,acc:.76}, praetor:{hp:220,dmg:32,apPen:.60,dtm:.74,acc:.85} }
};
const FIX = { tiers:{ paint:{hp:60,dmg:5,apPen:0,dtm:1,acc:.30}, militia:{hp:80,dmg:9,apPen:0,dtm:1,acc:.42},
    regular:{hp:100,dmg:12,apPen:.10,dtm:1,acc:.55}, veteran:{hp:130,dmg:15,apPen:.18,dtm:.90,acc:.66},
    shock:{hp:170,dmg:18,apPen:.26,dtm:.82,acc:.76}, praetor:{hp:220,dmg:22,apPen:.34,dtm:.74,acc:.85} } };

const PLATING=[{a:.50,p:50},{a:.58,p:90},{a:.66,p:140},{a:.74,p:200},{a:.82,p:270},{a:.90,p:350}];
const VIT=[100,125,150,180,215,260];
const MARK=[1,1.08,1.17,1.27,1.38,1.50];
const CUM=[0,150,500,1200,2500,4700];
// level: tier, attackers, soft SP target
const LV=[["militia",2,0,"L1 DOCK"],["regular",2,300,"L2 CONTAINER"],["regular",3,800,"L3 OVERLOOK"],
 ["veteran",3,1800,"L4 NIGHTFALL"],["veteran",4,3200,"L5 SUPPLY"],["shock",4,5000,"L6 SIEGE"],
 ["shock",5,7500,"L7 BLACKOUT"],["praetor",6,11000,"L8 BREACHPOINT"]];

// best split of SP across plating/vitality/marksman, maximising survival then damage
function build(sp){
  let best=null;
  for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
    const c=CUM[p]+CUM[v]+CUM[m]; if(c>sp) continue;
    const score=(VIT[v]/(1-PLATING[p].a))*1000+MARK[m];
    if(!best||score>best.score) best={p,v,m,c,score};
  }
  return best;
}
const RIFLE={dmg:23,rpm:735,mag:30};
function ttk(t,mark,mag){
  const per=RIFLE.dmg*MARK[mark]*t.dtm;
  const shots=Math.ceil(t.hp/per);
  return {shots, s:+(shots*(60/RIFLE.rpm)).toFixed(2), reload:shots>mag};
}
function ttd(t,pl,maxHp,att){
  const hr=t.acc*0.6;                     // fraction of rounds that connect
  const raw=att*4*hr*t.dmg/1.6;           // 4-round bursts every ~1.6 s
  const eff=Math.max(0,Math.min(.92,pl.a-t.apPen));
  const hpPerSec=raw*(1-eff);
  return {raw:+raw.toFixed(1), eff:+eff.toFixed(2), dps:+hpPerSec.toFixed(1), s:+(maxHp/hpPerSec).toFixed(1)};
}
for(const [name,SET] of [["AS SPECCED",SPEC],["PROPOSED FIX",FIX]]){
  console.log("\n=== "+name+" ===");
  console.log("level            build       effAbs  raw/s  hp/s   TTD    TTK(body)  boss TTK");
  for(const [tid,att,sp,lname] of LV){
    const t=SET.tiers[tid], b=build(sp), pl=PLATING[b.p];
    const d=ttd(t,pl,VIT[b.v],att);
    const k=ttk(t,b.m,30);
    const boss={hp:t.hp*2.2,dtm:t.dtm*0.85,dmg:t.dmg*1.25,apPen:t.apPen+0.10,acc:t.acc};
    const bk=ttk(boss,b.m,30);
    console.log(lname.padEnd(16)+`P${b.p}V${b.v}M${b.m}`.padEnd(12)+
      String(d.eff).padEnd(8)+String(d.raw).padEnd(7)+String(d.dps).padEnd(7)+
      (d.s+"s").padEnd(7)+(k.s+"s "+k.shots+"sh").padEnd(11)+bk.s+"s "+bk.shots+"sh"+(bk.reload?" RELOAD":""));
  }
}
