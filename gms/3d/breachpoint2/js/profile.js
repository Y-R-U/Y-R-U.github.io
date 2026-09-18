/* BREACHPOINT II — §PROFILE.  localStorage career save + the SP economy.
   Needs data.js (LEVELS / UPGRADES / UPG_TRACKS / CAMPAIGN_LEVELS); publishes BP2.Profile
   and BP2.upg — the rank lookup lives here because it reads the live profile. */
(function(){
'use strict';
const BP2 = window.BP2 = window.BP2 || {};
const {LEVELS, UPGRADES, UPG_TRACKS, CAMPAIGN_LEVELS, WEAPON_UNLOCK} = BP2;
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);

/* ---------------------------- §PROFILE — career save --------------- */
const Profile = (function(){
  const KEY='bp2_profile';
  /* P5a — the save is VERSIONED. v0 is every save written before this (no `v`
     field at all). A save is never discarded for being old: migrate() brings
     the raw object up to the current shape, load() fills anything still
     missing from the defaults, and a save that arrived at an older version is
     rewritten at the current one. Add a case to migrate() per version bump —
     v0 needs none, because v1 only added the field itself.
     P5c — v2 adds `fails` (consecutive losses per level, the stuck-player
     counter) and `recruit` (which clears were made on RECRUIT). Both are
     additive: a v1 save keeps every point, rank, unlock and clear it had. */
  const SCHEMA=2;
  const blank = ()=>({
    v:SCHEMA, sp:0, spent:0, trackSpent:0, level:0, cleared:{},
    ranks:{vitality:0, plating:0, marksman:0, steady:0, logistics:0, mobility:0},
    unlocked:['rifle'], trainingDone:false,
    fails:{}, recruit:{},
    stats:{kills:0, headshots:0, shots:0, hits:0, deaths:0, bestTime:{}}
  });
  let P = blank();
  const num = (v,d)=> (typeof v==='number' && isFinite(v)) ? v : d;
  const obj = v => (v && typeof v==='object' && !Array.isArray(v)) ? v : {};

  function migrate(j){
    let from = (typeof j.v==='number' && isFinite(j.v)) ? (j.v|0) : 0;
    if(from<0) from=0;
    // v0 -> v1: nothing to rename or rescale, the fields are the same ones.
    // v1 -> v2: `fails` and `recruit` are new maps; load() fills them from the
    //   defaults, so an old save arrives with both empty and loses nothing.
    // Future bumps go here, each stepping `from` on by one.
    return from;
  }

  function load(){
    const d = blank();
    let raw=null, from=SCHEMA;
    try{ raw = localStorage.getItem(KEY); }catch(e){}
    if(raw){
      let j=null;
      try{ j=JSON.parse(raw); }catch(e){ j=null; }
      if(j && typeof j==='object'){
        from = migrate(j);
        d.sp=num(j.sp,0); d.spent=num(j.spent,0); d.trackSpent=num(j.trackSpent,0);
        d.level=clamp(num(j.level,0)|0, 0, LEVELS.length-1);
        d.cleared=obj(j.cleared);
        for(const t of UPG_TRACKS) d.ranks[t]=clamp(num(obj(j.ranks)[t],0)|0,0,5);
        if(Array.isArray(j.unlocked)) d.unlocked=j.unlocked.filter(x=>typeof x==='string');
        if(d.unlocked.indexOf('rifle')<0) d.unlocked.push('rifle');
        d.trainingDone=!!j.trainingDone;
        const fl=obj(j.fails); for(const k in fl){ const v=num(fl[k],0)|0; if(v>0) d.fails[k]=v; }
        const rc=obj(j.recruit); for(const k in rc){ if(rc[k]) d.recruit[k]=true; }
        const st=obj(j.stats);
        d.stats={kills:num(st.kills,0), headshots:num(st.headshots,0), shots:num(st.shots,0),
                 hits:num(st.hits,0), deaths:num(st.deaths,0), bestTime:obj(st.bestTime)};
      }
    }
    P=d;
    if(raw && from!==SCHEMA) save();      // an old save is rewritten, not dropped
    return P;
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} return P; }
  load();

  return {
    KEY, SCHEMA,
    get:()=>P,
    load, save, migrate,
    reset(){ P=blank(); save(); return P; },
    award(n){ n=Math.round(num(n,0)); if(n>0){ P.sp+=n; save(); } return P.sp; },
    spend(n){ n=Math.round(num(n,0)); if(n<=0||P.sp<n) return false; P.sp-=n; P.spent+=n; save(); return true; },
    rank(track){ return clamp(num(P.ranks[track],0)|0,0,5); },
    setRank(track,r){ if(UPGRADES[track]){ P.ranks[track]=clamp(r|0,0,5); save(); } },
    isUnlocked(id){ return P.unlocked.indexOf(id)>=0; },
    unlock(id){ if(P.unlocked.indexOf(id)<0){ P.unlocked.push(id); save(); } },
    cleared(n){ return !!P.cleared[n]; },

    /* ------------------------------------- the stuck-player counter ------ */
    // Consecutive losses on one level. The debrief escalates on it (2/3/4+)
    // and a clear zeroes it. Nothing here changes the game's difficulty —
    // the counter only decides how much the debrief says.
    fails(n){ return num(P.fails[n],0)|0; },
    noteFail(n){ P.fails[n]=this.fails(n)+1; save(); return P.fails[n]; },
    clearFails(n){ if(P.fails[n]!==undefined){ delete P.fails[n]; save(); } return 0; },
    // RECRUIT is chosen, never granted: a clear made on it is labelled for ever
    markRecruit(n){ P.recruit[n]=true; save(); },
    onRecruit(n){ return !!P.recruit[n]; },

    /* ------------------------------------------------ the SP shop -------- */
    // what the next rank of a track costs, or null at rank 5
    costOf(track){ const u=UPGRADES[track]; if(!u) return null;
      const r=this.rank(track); return r>=u.costs.length? null : u.costs[r]; },
    buyRank(track){
      const cost=this.costOf(track);
      if(cost===null || P.sp<cost) return null;
      P.sp-=cost; P.spent+=cost; P.trackSpent+=cost;
      P.ranks[track]=this.rank(track)+1;
      save();
      return {track, rank:P.ranks[track], cost, sp:P.sp};
    },
    // a weapon needs its gate level cleared AND the cash
    weaponGate(id){
      const w=WEAPON_UNLOCK[id];
      if(!w) return null;
      return {cost:w.cost, level:w.level, levelName:(LEVELS[w.level]||{}).name||'',
        owned:this.isUnlocked(id), gated:w.level>0 && !P.cleared[w.level],
        afford:P.sp>=w.cost};
    },
    buyWeapon(id){
      const g=this.weaponGate(id);
      if(!g || g.owned || g.gated || !g.afford) return null;
      P.sp-=g.cost; P.spent+=g.cost;
      P.unlocked.push(id);
      save();
      return {id, cost:g.cost, sp:P.sp};
    },
    // D1: the gate is stat-based, so a wrong build must never be a dead end.
    // 80% of everything sunk into tracks comes back; weapon unlocks are kept.
    RESPEC_RATE:0.8,
    respecQuote(){ return Math.floor(P.trackSpent*0.8); },
    respec(){
      const refund=this.respecQuote();
      for(const t of UPG_TRACKS) P.ranks[t]=0;
      P.sp+=refund;
      P.spent=Math.max(0, P.spent-refund);
      P.trackSpent=0;
      save();
      return refund;
    },

    clearLevel(n, time, recruit){
      const first = !P.cleared[n];
      P.cleared[n]=true;
      if(recruit) P.recruit[n]=true;
      delete P.fails[n];                 // a clear zeroes the stuck counter
      if(time>0){ const b=P.stats.bestTime[n]; if(!b || time<b) P.stats.bestTime[n]=time; }
      if(n+1 < CAMPAIGN_LEVELS && P.level < n+1) P.level=n+1;
      save();
      return first;
    }
  };
})();

/* rank values for a track, at the profile's live rank unless one is forced */
function upg(track, rank){
  const u=UPGRADES[track];
  const r = rank===undefined ? Profile.rank(track) : rank;
  return u.ranks[clamp(r|0,0,u.ranks.length-1)];
}

BP2.Profile = Profile;
BP2.upg = upg;
})();
