// P4c — measure the TTD curve from the RUNNING GAME, three ways.
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'}); await sleep(400);
await send('Page.navigate',{url:URL}); await sleep(3600);
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings');localStorage.removeItem('bp2_paint')`);
await send('Page.navigate',{url:URL}); await sleep(3600);
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);

// 1. the greedy optimiser, run against the REAL tables in the page
const table = await ev(`(()=>{
  const B=window.BP2, G=window.__game, A=G.Armoury;
  const CUM=[0,150,500,1200,2500,4700];
  const VIT=r=>B.UPGRADES.vitality.ranks[r].maxHp;
  // soft SP targets per campaign level, from LEVELS itself
  const out=[];
  for(let n=1;n<=8;n++){
    const lvl=B.levelById(n), sp=lvl.spTarget;
    // greedy: maximise effective HP = maxHp / (1 - effAbsorb) at this level's tier
    const tier=A.mainTier(lvl);
    let best=null;
    for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
      const c=CUM[p]+CUM[v]+CUM[m]; if(c>sp) continue;
      const ab=G.gateCalc(tier,p,false).effAbsorb;
      const score=(VIT(v)/(1-ab))*1000+B.UPGRADES.marksman.ranks[m].dmg;
      if(!best||score>best.score) best={p,v,m,c,score};
    }
    const s=A.survival(lvl,best.p,best.v);
    out.push({n, name:lvl.name, build:'P'+best.p+'V'+best.v+'M'+best.m, att:s.attackers,
      tier:s.tier, eff:+s.effAbsorb.toFixed(2), hpHit:+s.hpPerHit.toFixed(2),
      raw:+s.rawDps.toFixed(1), hps:+s.hpDps.toFixed(1), maxHp:s.maxHp,
      ttd:+s.seconds.toFixed(1), band:A.BANDS[A.band(s.seconds)].label});
  }
  return out;
})()`);

// 2. the same builds, but run through the REAL damagePlayer pipeline (armour pool included)
const real = await ev(`(async()=>{
  const B=window.BP2, G=window.__game, A=G.Armoury, P=B.Profile;
  const rows=[];
  for(const r of ${JSON.stringify(table)}){
    const lvl=B.levelById(r.n);
    const p=+r.build[1], v=+r.build[3];
    P.setRank('plating',p); P.setRank('vitality',v);
    G.applyRanks();
    G.loadLevel(r.n);
    await new Promise(z=>setTimeout(z,120));
    P.setRank('plating',p); P.setRank('vitality',v);
    G.applyRanks();
    // reset the player to full and drive the model's rounds through damagePlayer
    G.god(false);
    G.player.hp=G.upg('vitality',v).maxHp; G.player.armor=G.upg('plating',p).pool;
    G.player.alive=true; G.GAME.state='play'; G.GAME.paintball=false; G.GAME.graceT=0;
    const t=G.TIERS[r.tier];
    const dt=0.02, rounds=r.att*4*(t.accuracy*0.6)/1.6;   // rounds/s landing
    let time=0, guard=0;
    while(G.player.alive && guard++ < 60000){
      G.hurt(t.dmg*rounds*dt, t.apPen);
      G.player.regenT=0;
      time+=dt;
    }
    rows.push({n:r.n, build:r.build, pool:G.upg('plating',p).pool, ttdReal:+time.toFixed(1)});
    G.god(true);
  }
  return rows;
})()`);

// 3. the game's own fire cadence, read off the AI code's constants
console.log('\\n=== MEASURED IN-GAME TTD (shared survival model, from gateCalc + LEVELS) ===');
console.log('lvl name              build    tier     att eff  hp/hit raw/s  hp/s  maxHp  TTD   band');
for(const r of table) console.log(
  ('L'+r.n).padEnd(4)+r.name.padEnd(18)+r.build.padEnd(9)+r.tier.padEnd(9)+
  String(r.att).padEnd(4)+String(r.eff).padEnd(5)+String(r.hpHit).padEnd(7)+
  String(r.raw).padEnd(7)+String(r.hps).padEnd(6)+String(r.maxHp).padEnd(7)+
  (r.ttd+'s').padEnd(6)+r.band);

console.log('\\n=== SAME BUILDS THROUGH THE REAL damagePlayer PIPELINE (armour pool depletes) ===');
for(const r of real){ const m=table.find(t=>t.n===r.n);
  console.log(('L'+r.n).padEnd(4)+r.build.padEnd(9)+('pool '+r.pool).padEnd(11)+
    ('model '+m.ttd+'s').padEnd(14)+'real '+r.ttdReal+'s'); }

console.log('\\nERRORS: '+JSON.stringify(errors));
ws.close(); process.exit(0);
