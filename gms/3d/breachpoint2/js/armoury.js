/* BREACHPOINT II — §ARMOURY.  The upgrade screen, the threat readout and respec.
     §THREAT    how long this level lets you live, and what one round costs
     §SURVIVAL  the shared survival-time model (the hub reads it too)
     §STUCK     the escalating debrief — what the game says when you keep losing
     §TRACKS    the six upgrade rows
     §WEAPONS   the SP unlock ladder
     §CONFIRM   respec / reset progress, on a screen, never an alert()
   Loads after engine.js and drives the game through window.__game. */
(function(){
'use strict';
const BP2 = window.BP2, G = window.__game;
if(!G) return;
const {Profile, upg, UPGRADES, UPG_TRACKS, WEAPON_UNLOCK, LEVELS, TIERS, levelById} = BP2;
const $ = id => document.getElementById(id);
const clamp = (v,a,b)=> v<a?a:(v>b?b:v);

let back='start';          // the screen to put back when the armoury closes
const SCREENS=['startScreen','endScreen','pauseScreen','setScreen','armScreen','cfmScreen','hubScreen'];
const screenId = {start:'startScreen', end:'endScreen', pause:'pauseScreen', set:'setScreen',
                  hub:'hubScreen'};

/* ---------------------------- §THREAT ------------------------------------ */
/* IMPROVEMENTS 1 + 1b. gateCalc() knows what one round costs. On its own that
   number says "buy PLATING", which BALANCE.md shows is a trap: at L6 a maxed
   plate with vitality 1 survives less time than a balanced build costing the
   same SP. So the headline is SURVIVAL TIME and HP-per-hit is the footnote.

   §SURVIVAL is the one source of truth for that model — the hub reads it too.
   Model: sustained exposure with no cover; every attacker the level lets fire
   at once shoots at the cadence §ENEMIES actually uses, and
   `tier accuracy x HIT_RATE` of those rounds land.

   P5a — the cadence is now DERIVED from the engine's own fire loop instead of
   a flat 4 rounds / 1.6 s. §ENEMIES fires `randi(3,5)` rounds (+1 above
   accuracy 0.7) spaced SHOT_GAP apart, then waits `rand(0.75,1.6)` s — mean
   CD_MEAN — plus CD_FAR past 22 m, all scaled by `lerp(1, reaction, 0.5)`.
   fireCD runs DURING the burst, so the period is max(cooldown, burst length),
   not their sum. The model takes the past-22 m branch: that is where sustained
   exposure in this yard actually happens (the live L1 fight sat at ~21 m), and
   it is the branch the flat 2.5/s was closest to.
   HIT_RATE is still invented — see BALANCE.md. */
const BURST_BASE=4, BURST_ACC=0.7, SHOT_GAP=0.115,
      CD_MEAN=1.175, CD_FAR=0.5, REACT_MIX=0.5, HIT_RATE=0.6;
const lerp=(a,b,t)=>a+(b-a)*t;
const burstOf = t => BURST_BASE + (t.accuracy>BURST_ACC? 1 : 0);
// rounds FIRED per second by one attacker of this tier
function cadenceOf(t){
  const n=burstOf(t);
  const cd=(CD_MEAN+CD_FAR)*lerp(1, t.reaction, REACT_MIX);
  return n/Math.max(cd, (n-1)*SHOT_GAP);
}
// kept for anything that still wants the old headline pair
const BURST = BURST_BASE, CADENCE = CD_MEAN + CD_FAR;

const BANDS = [
  {min:30, label:'TRIVIAL'},
  {min:15, label:'LIGHT'},
  {min:8,  label:'SERIOUS'},
  {min:4,  label:'SEVERE'},
  {min:0,  label:'LETHAL'}
];
function band(sec){ for(let i=0;i<BANDS.length;i++) if(sec>=BANDS[i].min) return i; return 4; }
function pips(i){ return '<span class="pips sev'+i+'">'+'▓'.repeat(i+1)+'░'.repeat(4-i)+'</span>'; }
function fmtSec(s){
  if(!isFinite(s) || s>=999) return '999+ s';
  return (s>=20? Math.round(s) : Math.round(s*10)/10)+' s';
}

// the level the player is actually up against, and its main tier
function focusLevel(){
  const C=BP2.Campaign;
  const n = (C && C.selected()>0) ? C.selected() : Profile.get().level;
  const lvl = levelById(n);
  return lvl.id===0 ? levelById(Math.min(1, LEVELS.length-1)) : lvl;
}
function mainTier(lvl){
  let best=null;
  for(const r of lvl.roster){ if(r.boss) continue; if(!best || (r.count||1)>(best.count||1)) best=r; }
  return (best||lvl.roster[0]).tier;
}
function bossTier(lvl){ const b=lvl.roster.filter(r=>r.boss)[0]; return b? b.tier : null; }

// HP per hit this level's rounds cost at a given plating rank
function threatAt(lvl, rank){
  return G.gateCalc(mainTier(lvl), rank, false).hp;
}

/* ---------------------------- §SURVIVAL ---------------------------------- */
/* The ONE function. Ranks default to the live profile.
   The armour POOL is modelled, not just the absorb fraction: below PLATING 4
   the pool empties long before the player does and every round after that
   lands at full damage. Two phases, so the printed number matches what
   damagePlayer actually does. Regen only counts when the gap between landed
   rounds is longer than the plating delay — sustained fire never is, but a
   two-attacker militia level can be, so the rule is in the model. */
function survival(lvl, platingRank, vitRank){
  const pr = platingRank===undefined? Profile.rank('plating') : clamp(platingRank|0,0,5);
  const vr = vitRank===undefined?     Profile.rank('vitality') : clamp(vitRank|0,0,5);
  const tid = mainTier(lvl), t = TIERS[tid];
  const g = G.gateCalc(tid, pr, false);
  const att = Math.max(1, lvl.maxAttackers||1);
  const fired  = att*cadenceOf(t);                          // rounds fired per second
  const rounds = fired*(t.accuracy*HIT_RATE);               // rounds landing per second
  const maxHp = upg('vitality', vr).maxHp;
  const pl = upg('plating', pr), pool = pl.pool, ab = g.effAbsorb;

  const gap = rounds>0? 1/rounds : Infinity;
  const regenPerRound = (pl.regen>0 && gap>pl.delay)? pl.regen*(gap-pl.delay) : 0;
  const toArmour = Math.max(0, g.dmg*ab - regenPerRound);   // net pool drain per round
  const hpWith = g.hp;                                       // HP per round, armour up
  const hpWithout = g.dmg;                                   // HP per round, pool empty

  let seconds, armourSec;
  if(rounds<=0){ seconds=Infinity; armourSec=Infinity; }
  else {
    armourSec = toArmour>0 ? pool/(rounds*toArmour) : Infinity;
    const hpLost = hpWith*rounds*armourSec;                  // HP spent while the pool held
    if(!(hpLost<maxHp)) seconds = maxHp/(rounds*hpWith);     // dead before the pool empties
    else seconds = armourSec + (maxHp-hpLost)/(rounds*hpWithout);
  }
  return {level:lvl.id, tier:tid, plating:pr, vitality:vr, attackers:att,
          hpPerHit:g.hp, effAbsorb:g.effAbsorb, fired:fired, rounds:rounds,
          rawDps:rounds*g.dmg, hpDps:rounds*g.hp, maxHp:maxHp, pool:pool,
          armourSec:armourSec, seconds:seconds};
}
const survivalAt = (n, p, v) => survival(levelById(n), p, v);

function paintThreat(){
  const lvl=focusLevel();
  const s=survival(lvl), b=band(s.seconds);
  const bt=bossTier(lvl);
  const boss = bt? G.gateCalc(bt, s.plating, true).hp : null;
  $('armThreat').innerHTML =
    '<div class="thr-t">NEXT DEPLOYMENT · MISSION '+lvl.id+'</div>'+
    '<div class="thr-l">'+lvl.name+' &nbsp;·&nbsp; '+(TIERS[mainTier(lvl)].label)+'</div>'+
    '<div class="thr-n">you survive <b>~'+fmtSec(s.seconds)+'</b> <span>OF OPEN GROUND HERE</span> '+
      pips(b)+' <span class="sev'+b+'">'+BANDS[b].label+'</span></div>'+
    // the hit count is pool-aware too: HP/hit only holds while the armour does
    '<div class="thr-sub">their rounds cost you <b style="color:#cbd6da;font-weight:normal">'+
      s.hpPerHit.toFixed(1)+' HP</b> per hit &nbsp;·&nbsp; '+
      Math.ceil(s.seconds*s.rounds)+' hits at '+s.maxHp+' HP &nbsp;·&nbsp; '+
      s.attackers+' firing at once'+
      (boss!==null? ' &nbsp;·&nbsp; the boss hits for <b style="color:#ff8a7e;font-weight:normal">'+boss.toFixed(1)+' HP</b>' : '')+
      '</div>';
}

// what the next rank of a defensive track is worth, and what the same SP would
// buy on the other one. This is the line that stops the plating trap.
function ranksFor(track, sp){
  let r=Profile.rank(track), spent=0;
  while(r<5 && spent+BP2.UPG_COSTS[r]<=sp){ spent+=BP2.UPG_COSTS[r]; r++; }
  return r;
}
function secWith(lvl, track, rank){
  return track==='plating' ? survival(lvl, rank, undefined).seconds
                           : survival(lvl, undefined, rank).seconds;
}
function survivalDelta(track){
  const lvl=focusLevel(), r=Profile.rank(track), nm=UPGRADES[track].name;
  const now=survival(lvl).seconds;
  if(r>=5) return '<div class="gate">'+nm+' 5 &nbsp;·&nbsp; '+lvl.name+': '+fmtSec(now)+
    ' of open ground. Nothing left to buy.</div>';
  const cost=BP2.UPG_COSTS[r];
  const next=secWith(lvl, track, r+1);
  let out='<div class="gate">'+nm+' '+r+' → '+(r+1)+' &nbsp;·&nbsp; '+lvl.name+': '+fmtSec(now)+
    ' → <b style="color:#7ee081;font-weight:normal">'+fmtSec(next)+'</b> of open ground';
  const other = track==='plating'? 'vitality' : 'plating';
  const to = ranksFor(other, cost);
  if(to>Profile.rank(other)){
    const alt=secWith(lvl, other, to);
    out += '<br>the same '+cost+' SP in '+UPGRADES[other].name+' '+Profile.rank(other)+' → '+to+': '+
      '<b style="color:'+(alt>next?'#7ee081':'#8a7c5a')+';font-weight:normal">'+fmtSec(alt)+'</b>'+
      (alt>next? ' &nbsp;— buys more' : '');
  }
  return out+'</div>';
}

/* ---------------------------- §STUCK ------------------------------------- */
/* IMPROVEMENTS "THE STUCK PLAYER". The whole game is a gate, so being stuck is
   a first-class state, not an edge case. The debrief escalates on CONSECUTIVE
   losses on one level (Profile.fails, zeroed by a clear) and NOTHING ELSE
   CHANGES: no rubber-banding, no paid skip, and the size of the wall is always
   printed as a number. RECRUIT is deliberately never mentioned here — a
   difficulty offered at the moment you lose is not a chosen one.
     1  nothing. Losing once is playing.
     2  this level's survival readout, with the single best SP purchase.
     3  + the honest line: what you get now against what the target build gets.
     4+ + the replay route: which cleared mission pays best per minute.        */
const STUCK_READOUT=2, STUCK_HONEST=3, STUCK_ROUTE=4;
const cumCost = r => { let c=0; for(let i=0;i<(r|0);i++) c+=BP2.UPG_COSTS[i]; return c; };
const commas = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const mmss = s => Math.floor(s/60)+':'+(Math.floor(s%60)<10?'0':'')+Math.floor(s%60);

/* The single best next rank for surviving THIS level — seconds bought per SP,
   through the same model the readout prints. Only PLATING and VITALITY are
   candidates: they are the only two tracks §SURVIVAL can actually see, and
   recommending a track the number cannot measure would be guessing. */
function bestBuy(lvl){
  const now=survival(lvl).seconds;
  let best=null;
  for(const track of ['plating','vitality']){
    const r=Profile.rank(track);
    if(r>=5) continue;
    const cost=BP2.UPG_COSTS[r], sec=secWith(lvl, track, r+1);
    const rate=(sec-now)/cost;
    if(!best || rate>best.rate)
      best={track, name:UPGRADES[track].name, from:r, to:r+1, cost, sec, gain:sec-now, rate};
  }
  if(!best) return null;
  const sp=Profile.get().sp;
  best.now=now; best.afford=sp>=best.cost; best.short=Math.max(0, best.cost-sp);
  return best;
}

/* What this level's spTarget actually buys, greedy over the same two tracks.
   This is the "most people clear it around N seconds" number, and it is
   derived, not asserted — it is the model run on the recommended build. */
function targetBuild(lvl){
  let best=null;
  const B=lvl.spTarget|0;
  for(let p=0;p<=5;p++) for(let v=0;v<=5;v++){
    const cost=cumCost(p)+cumCost(v);
    if(cost>B) continue;
    const sec=survival(lvl,p,v).seconds;
    if(!best || sec>best.sec) best={p, v, cost, sec};
  }
  return best;
}

/* Which cleared mission pays best per minute, counted off the REAL award paths
   in §GAME: a replay clear is 100 x level, a kill 10 x level, a boss +120. */
function replayRoute(){
  const P=Profile.get();
  let best=null;
  for(const lvl of LEVELS){
    if(lvl.id<1 || lvl.endless || !P.cleared[lvl.id]) continue;
    const roster=lvl.roster.reduce((n,r)=>n+(r.count||1),0);
    const bosses=lvl.roster.filter(r=>r.boss).length;
    const sp=100*lvl.id + 10*lvl.id*roster + 120*bosses;
    const secs=P.stats.bestTime[lvl.id] || (lvl.time? lvl.time*0.6 : 180);
    const rate=sp/(secs/60);
    if(!best || rate>best.rate) best={id:lvl.id, name:lvl.name, sp, secs, rate};
  }
  return best;
}

function debriefData(levelIdx, fails){
  const lvl=levelById(levelIdx|0);
  const n=Math.max(0, fails|0);
  const tier = n>=STUCK_ROUTE? 3 : n>=STUCK_HONEST? 2 : n>=STUCK_READOUT? 1 : 0;
  const P=Profile.get();
  const power=P.sp+P.spent;
  const d={level:lvl.id, name:lvl.name, fails:n, tier, power,
           spTarget:lvl.spTarget|0, shortfall:Math.max(0,(lvl.spTarget|0)-power)};
  if(!tier || lvl.paintball) { d.tier=0; return d; }
  d.survival=survival(lvl);
  d.band=band(d.survival.seconds);
  d.best=bestBuy(lvl);
  if(tier>=2) d.target=targetBuild(lvl);
  if(tier>=3){
    d.route=replayRoute();
    if(d.route && d.best) d.runs=Math.ceil(d.best.cost/d.route.sp);
  }
  return d;
}

function debrief(levelIdx, fails){
  const d=debriefData(levelIdx, fails);
  if(!d.tier) return '';
  const s=d.survival, b=d.band, out=[];
  out.push('<div class="dbh">STILL HELD &nbsp;·&nbsp; '+d.fails+' LOSSES IN A ROW ON '+d.name+'</div>');
  out.push('<div class="dbn">you survive <b>~'+fmtSec(s.seconds)+'</b> of open ground here '+
    pips(b)+' <span class="sev'+b+'">'+BANDS[b].label+'</span></div>');
  out.push('<div class="dbs">'+s.hpPerHit.toFixed(1)+' HP a hit &nbsp;·&nbsp; '+
    s.attackers+' firing at once &nbsp;·&nbsp; '+s.maxHp+' HP and '+s.pool+' armour</div>');
  if(d.best){
    out.push('<div class="dbbuy"><span class="tag">BEST BUY</span> '+d.best.name+' '+d.best.from+' → '+
      d.best.to+' &nbsp;·&nbsp; <b>'+commas(d.best.cost)+' SP</b> &nbsp;·&nbsp; '+
      fmtSec(d.best.now)+' → <b class="up">'+fmtSec(d.best.sec)+'</b>'+
      (d.best.afford? ' &nbsp;— you can afford it now'
                    : ' &nbsp;— <span class="short">'+commas(d.best.short)+' SP short</span>')+'</div>');
  }
  if(d.tier>=2 && d.target){
    out.push('<div class="dbt">At your build this mission gives you <b>'+fmtSec(s.seconds)+
      '</b> of open ground. The build it is balanced around — PLATING '+d.target.p+', VITALITY '+
      d.target.v+', '+commas(d.target.cost)+' SP — gets <b>'+fmtSec(d.target.sec)+'</b>.'+
      (d.shortfall>0
        ? ' You have earned <b>'+commas(d.power)+' SP</b>; this one is built for <b>'+
          commas(d.spTarget)+'</b>. The wall is <b>'+commas(d.shortfall)+' SP</b> high.'
        : ' You have earned <b>'+commas(d.power)+' SP</b> against its <b>'+commas(d.spTarget)+
          '</b> — the points are there, the ranks are not.')+'</div>');
  }
  if(d.tier>=3){
    out.push(d.route
      ? '<div class="dbr"><span class="tag">THE LONG WAY ROUND</span> replay <b>M'+d.route.id+' '+
        d.route.name+'</b> — about <b>'+commas(d.route.sp)+' SP</b> a run at your best time of '+
        mmss(d.route.secs)+', <b>'+commas(d.route.rate)+' SP a minute</b>'+
        (d.runs? '. <b>'+d.runs+'</b> run'+(d.runs===1?'':'s')+' pays for '+d.best.name+' '+d.best.to+'.' : '.')+
        '</div>'
      : '<div class="dbr"><span class="tag">THE LONG WAY ROUND</span> nothing is cleared to replay yet — '+
        'every kill here still pays, win or lose.</div>');
  }
  return '<div class="debrief t'+d.tier+'">'+out.join('')+'</div>';
}

/* ---------------------------- §TRACKS ------------------------------------ */
// current -> next, in real units, showing only what actually moves
function deltaLine(track){
  const r=Profile.rank(track);
  const cur=G.rankReadout(track,r);
  if(r>=5) return '<div class="delta"><em>MAXED · </em>'+cur.map(([l,v])=>l+' <b>'+v+'</b>').join(' &nbsp;·&nbsp; ')+'</div>';
  const nxt=G.rankReadout(track,r+1);
  const parts=[];
  for(let i=0;i<cur.length;i++){
    if(String(cur[i][1])===String(nxt[i][1])) continue;
    parts.push(cur[i][0]+' '+cur[i][1]+' <em>→</em> <b>'+nxt[i][1]+'</b>');
  }
  return '<div class="delta">'+(parts.join(' &nbsp;·&nbsp; ')||'—')+'</div>';
}
function trackRow(track){
  const u=UPGRADES[track], r=Profile.rank(track), cost=Profile.costOf(track);
  const sp=Profile.get().sp;
  const maxed=cost===null;
  const afford=!maxed && sp>=cost;
  const btn = maxed? '<button class="buy max" disabled>RANK 5<span class="c">MAX</span></button>'
    : '<button class="buy'+(afford?'':' no')+'" data-buy="'+track+'">'+(afford?'BUY':'NEED SP')+'<span class="c">'+cost+'</span></button>';
  return '<div class="arow" data-track="'+track+'">'+
    '<div class="top"><div><div class="nm">'+u.name+' '+r+'</div><div class="bl">'+u.blurb+'</div></div>'+btn+'</div>'+
    '<div class="rk">'+[0,1,2,3,4].map(i=>'<i class="'+(i<r?'on':'')+'"></i>').join('')+'</div>'+
    deltaLine(track)+
    ((track==='plating'||track==='vitality')? survivalDelta(track) : '')+
    '</div>';
}

/* ---------------------------- §WEAPONS ----------------------------------- */
function weaponRow(id){
  const d=G.WDEF.filter(w=>w.id===id)[0]; if(!d) return '';
  const g=Profile.weaponGate(id);
  let btn, gate='';
  if(g.owned) btn='<button class="buy max" disabled>ISSUED<span class="c">✔</span></button>';
  else if(g.gated){
    btn='<button class="buy no" disabled>LOCKED<span class="c">'+g.cost+'</span></button>';
    gate='<div class="gate">Clear MISSION '+g.level+' — '+g.levelName+' — to unlock this weapon.</div>';
  } else {
    btn='<button class="buy'+(g.afford?'':' no')+'" data-wpn="'+id+'">'+(g.afford?'BUY':'NEED SP')+'<span class="c">'+g.cost+'</span></button>';
    gate='<div class="gate">MISSION '+g.level+' cleared.</div>';
  }
  return '<div class="arow"><div class="top"><div><div class="nm">'+d.name+'</div>'+
    '<div class="bl">'+d.mag+' ROUND MAG &nbsp;·&nbsp; '+d.dmg.toFixed(0)+' DAMAGE &nbsp;·&nbsp; x'+d.hsMul.toFixed(1)+' HEAD</div></div>'+
    btn+'</div>'+gate+'</div>';
}

/* ---------------------------- render ------------------------------------- */
function refresh(){
  const P=Profile.get();
  $('armSP').innerHTML=P.sp+'<em>'+P.trackSpent+' INVESTED IN TRACKS</em>';
  $('armSub').textContent='SERVICE POINTS AVAILABLE';
  paintThreat();
  const locked=Object.keys(WEAPON_UNLOCK).filter(id=>id!=='rifle');
  $('armBody').innerHTML =
    '<div class="arhead">UPGRADE TRACKS</div>'+
    UPG_TRACKS.map(trackRow).join('')+
    '<div class="arhead">WEAPONS</div>'+
    locked.map(weaponRow).join('')+
    (G.GAME.state==='pause' ? '<div class="spnote">Purchases apply on your next deployment.</div>' : '');
  const q=Profile.respecQuote();
  $('btnRespec').textContent = q>0? 'RESPEC · +'+q+' SP' : 'RESPEC';
  $('btnRespec').style.opacity = q>0? '1' : '.5';
}

function open_(from){
  back = from || back;
  for(const id of SCREENS) $(id).classList.add('hidden');
  refresh();
  $('armScreen').classList.remove('hidden');
}
function close_(){
  $('armScreen').classList.add('hidden');
  $(screenId[back]||'startScreen').classList.remove('hidden');
}

/* ---------------------------- buying ------------------------------------- */
function buyTrack(track){
  const r=Profile.buyRank(track);
  if(!r){ G.HUD.toast('NOT ENOUGH SERVICE POINTS', 1.4); refresh(); return; }
  G.applyRanks();           // so the armoury's own readouts are honest immediately
  refresh();
}
function buyWeapon(id){
  const r=Profile.buyWeapon(id);
  if(!r){ refresh(); return; }
  G.HUD.weaponButtons();    // P2 owns which weapons exist; just tell it to redraw
  refresh();
}

/* ---------------------------- §CONFIRM ----------------------------------- */
let cfmYes=null, cfmBack='arm';
function askConfirm(o){
  cfmYes=o.onYes; cfmBack=o.back||'arm';
  $('cfmTitle').innerHTML=o.title;
  $('cfmSub').textContent=o.sub||'';
  $('cfmBody').innerHTML=o.body||'';
  $('btnCfmYes').textContent=o.yes||'CONFIRM';
  for(const id of SCREENS) $(id).classList.add('hidden');
  $('cfmScreen').classList.remove('hidden');
}
function closeConfirm(){
  $('cfmScreen').classList.add('hidden');
  if(cfmBack==='arm') $('armScreen').classList.remove('hidden');
  else $(screenId[cfmBack]||'startScreen').classList.remove('hidden');
}
// D1: the design hard-gates by stat, so a wrong build must never be a dead end
function confirmRespec(){
  const q=Profile.respecQuote();
  const ranks=UPG_TRACKS.filter(t=>Profile.rank(t)>0).map(t=>UPGRADES[t].name+' '+Profile.rank(t));
  askConfirm({
    title:'RE<span>SPEC</span>', sub:'STRIP THE PLATE, KEEP THE WEAPONS', yes:'REFUND +'+q+' SP',
    body:(ranks.length? 'Resets <b>'+ranks.join('</b>, <b>')+'</b> to rank 0.<br>' : 'Nothing is invested yet.<br>')+
      'You invested <b>'+Profile.get().trackSpent+' SP</b> in tracks and get <b>'+q+' SP</b> back — 80%.<br>'+
      'Weapon unlocks are kept.',
    onYes(){ const got=Profile.respec(); G.applyRanks(); refresh(); G.HUD.toast('RESPEC · +'+got+' SP', 2.0); }
  });
}
function confirmReset(){
  const P=Profile.get();
  askConfirm({
    title:'RESET <span>PROGRESS</span>', sub:'THIS CANNOT BE UNDONE', yes:'WIPE CAREER', back:'set',
    body:'Deletes <b>'+P.sp+' SP</b>, every rank, every weapon unlock and every cleared mission.<br>'+
      'Your settings are kept. You start again in the training yard.',
    onYes(){
      Profile.reset();
      G.applyRanks();
      G.HUD.weaponButtons();
      G.HUD.toast('PROGRESS RESET', 2.0);
    }
  });
}

/* ---------------------------- wiring ------------------------------------- */
function tapTarget(el, fn){
  if(!el) return;
  let done=false;
  el.addEventListener('touchstart', e=>{ e.stopPropagation(); e.preventDefault(); done=true; fn();
    setTimeout(()=>{done=false;},350); }, {passive:false});
  el.addEventListener('click', e=>{ e.stopPropagation(); if(!done) fn(); });
}
tapTarget($('btnArmoury'),  ()=>open_('end'));
tapTarget($('btnArmoury2'), ()=>open_('pause'));
tapTarget($('btnArmClose'), close_);
tapTarget($('btnRespec'),   confirmRespec);
tapTarget($('btnCfmNo'),    closeConfirm);
tapTarget($('btnCfmYes'),   ()=>{ const f=cfmYes; cfmYes=null; closeConfirm(); if(f) f(); });

// the rows are rebuilt on every purchase, so the buttons are delegated
function rowTap(e){
  const b=e.target.closest && e.target.closest('.buy');
  e.stopPropagation();
  if(!b || b.disabled) return;
  e.preventDefault();
  if(b.dataset.buy) buyTrack(b.dataset.buy);
  else if(b.dataset.wpn) buyWeapon(b.dataset.wpn);
}
let rowDone=false;
$('armBody').addEventListener('touchstart', e=>{ rowDone=true; rowTap(e); setTimeout(()=>{rowDone=false;},350); }, {passive:false});
$('armBody').addEventListener('click', e=>{ if(!rowDone) rowTap(e); });
// stray taps on either screen must not reach the window handler that deploys
for(const id of ['armScreen','cfmScreen'])
  $(id).addEventListener('touchstart', e=>{ e.stopPropagation(); }, {passive:false});

const Armoury = {
  open:open_, close:close_, refresh,
  confirmRespec, confirmReset,
  threatAt, focusLevel, mainTier, band, fmtSec,
  debrief, debriefData, bestBuy, targetBuild, replayRoute,
  STUCK:{READOUT:STUCK_READOUT, HONEST:STUCK_HONEST, ROUTE:STUCK_ROUTE},
  survival, survivalAt, survivalDelta, BANDS,
  MODEL:{BURST, CADENCE, HIT_RATE, BURST_BASE, BURST_ACC, SHOT_GAP, CD_MEAN, CD_FAR, REACT_MIX},
  cadenceOf, burstOf,
  buyTrack, buyWeapon,
  visible:()=>!$('armScreen').classList.contains('hidden'),
  confirmVisible:()=>!$('cfmScreen').classList.contains('hidden'),
  state:()=>({
    sp:Profile.get().sp, trackSpent:Profile.get().trackSpent,
    ranks:Object.assign({}, Profile.get().ranks),
    unlocked:Profile.get().unlocked.slice(),
    level:focusLevel().id, threat:+threatAt(focusLevel(), Profile.rank('plating')).toFixed(3),
    survive:+survival(focusLevel()).seconds.toFixed(3)
  })
};
BP2.Armoury = Armoury;
G.Armoury = Armoury;
})();
