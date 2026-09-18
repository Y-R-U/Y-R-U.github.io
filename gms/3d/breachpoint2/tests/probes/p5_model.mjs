/* P5a — the survival model against the REAL damagePlayer pipeline.
   1. per-tier fire cadence, derived in-page from the engine's own fire loop
   2. the greedy build at each level's spTarget, and the model's TTD
   3. the SAME builds driven through damagePlayer in real time, with the game's
      own updatePlayer running (so the real armour regen rule applies)
   4. the margin between the two, per level                                  */
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'}); await sleep(300);
await send('Page.navigate',{url:URL}); await sleep(3200);
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings');localStorage.removeItem('bp2_paint')`);
await send('Page.navigate',{url:URL}); await sleep(3200);
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);

/* ---- 1. cadence: a Monte-Carlo run of the engine's own fire loop vs the model */
const cad = await ev(`(()=>{
  const B=window.BP2, A=window.__game.Armoury;
  const rand=(a,b)=>a+Math.random()*(b-a), randi=(a,b)=>Math.floor(rand(a,b+1));
  const lerp=(a,b,t)=>a+(b-a)*t;
  // this mirrors §ENEMIES' firing block line for line
  function loop(t, far, secs, dt){
    let fireCD=0, burst=0, burstT=0, shots=0, time=0;
    for(let i=0,n=Math.round(secs/dt); i<n; i++){
      fireCD-=dt;
      if(burst>0){ burstT-=dt; if(burstT<=0){ shots++; burst--; burstT=0.115; } }
      else if(fireCD<=0){ burst=randi(3,5)+(t.accuracy>0.7?1:0); burstT=0;
        fireCD=(rand(0.75,1.6)+(far?0.5:0))*lerp(1,t.reaction,0.5); }
      time+=dt;
    }
    return shots/time;
  }
  const out=[];
  for(const k of ['militia','regular','veteran','shock','praetor']){
    const t=B.TIERS[k];
    out.push({tier:k, close:+loop(t,false,20000,1/60).toFixed(3),
      far:+loop(t,true,20000,1/60).toFixed(3), model:+A.cadenceOf(t).toFixed(3),
      burst:A.burstOf(t), flat:2.5,
      land:+(A.cadenceOf(t)*t.accuracy*A.MODEL.HIT_RATE).toFixed(3),
      flatLand:+(4*(t.accuracy*0.6)/1.6).toFixed(3)});
  }
  return out;
})()`);
console.log('\n=== 1. PER-TIER FIRE CADENCE (rounds FIRED per second, one attacker) ===');
console.log('tier      burst  sim<=22m  sim>22m  model  old-flat   landing/s  old landing/s');
for(const c of cad) console.log(c.tier.padEnd(10)+String(c.burst).padEnd(7)+String(c.close).padEnd(10)+
  String(c.far).padEnd(9)+String(c.model).padEnd(7)+String(c.flat).padEnd(11)+
  String(c.land).padEnd(11)+c.flatLand);

/* ---- 2. greedy build + model TTD at each level's spTarget ---------------- */
const table = await ev(`(()=>{
  const B=window.BP2, G=window.__game, A=G.Armoury;
  const CUM=[0,150,500,1200,2500,4700];
  const out=[];
  for(let n=1;n<=8;n++){
    const lvl=B.levelById(n), sp=lvl.spTarget;
    let best=null;
    for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
      const c=CUM[p]+CUM[v]+CUM[m]; if(c>sp) continue;
      const sec=A.survival(lvl,p,v).seconds;
      const score=sec*1000+m;               // marksman only breaks ties
      if(!best||score>best.score) best={p,v,m,c,score};
    }
    const s=A.survival(lvl,best.p,best.v);
    out.push({n, name:lvl.name, sp, build:'P'+best.p+'V'+best.v+'M'+best.m,
      p:best.p, v:best.v, att:s.attackers, tier:s.tier, eff:+s.effAbsorb.toFixed(2),
      hpHit:+s.hpPerHit.toFixed(2), fired:+s.fired.toFixed(2), rounds:+s.rounds.toFixed(2),
      pool:s.pool, armourSec:+s.armourSec.toFixed(1), maxHp:s.maxHp,
      ttd:+s.seconds.toFixed(2), band:A.BANDS[A.band(s.seconds)].label});
  }
  return out;
})()`);

/* ---- 3. the same builds through the real pipeline, in real time ---------- */
const real=[];
for(const r of table){
  const res = await ev(`(async()=>{
    const B=window.BP2, G=window.__game, A=G.Armoury, P=B.Profile;
    const sleep=ms=>new Promise(z=>setTimeout(z,ms));
    const n=${r.n}, p=${r.p}, v=${r.v};
    P.setRank('plating',p); P.setRank('vitality',v); G.applyRanks();
    G.god(true); G.loadLevel(n); await sleep(200); G.applyRanks();
    const lvl=B.levelById(n), t=B.TIERS[A.mainTier(lvl)];
    const s=A.survival(lvl,p,v);
    const gap=1000/s.rounds;
    G.GAME.paintball=false; G.GAME.state='play'; G.GAME.graceT=1e6;   // nobody else shoots
    G.player.alive=true;
    G.player.hp=G.upg('vitality',v).maxHp; G.player.armor=G.upg('plating',p).pool;
    G.player.regenT=0;
    G.god(false);
    const t0=performance.now(); let hits=0, poolEmptyAt=-1, regenSeen=0;
    let lastArm=G.player.armor;
    while(G.player.alive && performance.now()-t0 < 240000){
      await sleep(gap);
      const before=G.player.armor;
      if(before>lastArm) regenSeen+=before-lastArm;
      G.hurt(t.dmg, t.apPen); hits++;
      lastArm=G.player.armor;
      if(poolEmptyAt<0 && G.player.armor<=0) poolEmptyAt=hits*gap/1000;
      G.GAME.graceT=1e6;
    }
    const wall=(performance.now()-t0)/1000;
    G.god(true); G.GAME.state='menu';
    return {n, hits, gap:+gap.toFixed(1), rounds:+s.rounds.toFixed(3),
            roundTtd:+(hits/s.rounds).toFixed(2), wall:+wall.toFixed(2),
            poolEmptyAt:+poolEmptyAt.toFixed(2), regenSeen:+regenSeen.toFixed(1),
            model:+s.seconds.toFixed(2), modelArmourSec:+s.armourSec.toFixed(2)};
  })()`);
  real.push(res);
  console.log('   L'+res.n+' driven: '+res.hits+' rounds, real '+res.roundTtd+'s vs model '+res.model+'s');
}

console.log('\n=== 2+3. TTD AT EACH LEVEL SP TARGET — MODEL vs REAL damagePlayer ===');
console.log('lvl name              spT    build     tier     att land/s hp/hit pool  poolOut  MODEL   REAL    diff   band');
let worst=0;
for(const r of table){
  const q=real.find(x=>x.n===r.n);
  const d=(q.roundTtd-r.ttd)/q.roundTtd*100;
  if(Math.abs(d)>Math.abs(worst)) worst=d;
  console.log(('L'+r.n).padEnd(4)+r.name.padEnd(18)+String(r.sp).padEnd(7)+r.build.padEnd(10)+
    r.tier.padEnd(9)+String(r.att).padEnd(4)+String(r.rounds).padEnd(7)+String(r.hpHit).padEnd(7)+
    String(r.pool).padEnd(6)+String(q.poolEmptyAt).padEnd(9)+
    (r.ttd+'s').padEnd(8)+(q.roundTtd+'s').padEnd(8)+(d>=0?'+':'')+d.toFixed(1)+'%   '+r.band);
}
console.log('worst model-vs-real margin: '+worst.toFixed(1)+'%');
const mono = table.every((r,i)=> i===0 || table[i-1].ttd > r.ttd);
console.log('monotone L1->L8: '+mono+'   curve: '+table.map(r=>r.ttd).join(' '));
console.log('wall clock per level: '+real.map(r=>r.wall).join(' '));
console.log('regen seen during sustained fire: '+real.map(r=>r.regenSeen).join(' '));

console.log('\nERRORS: '+JSON.stringify(errors.filter(e=>!/CANARY/.test(e))));
ws.close(); process.exit(0);
