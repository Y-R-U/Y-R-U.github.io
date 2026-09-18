/* BREACHPOINT II — §CAMPAIGN.  Everything the campaign phase shows the player.
     §RADIO     queued lower-third lines. Never blocks play, one tap kills the queue
     §WAR       the conscription beat that ends the paintball drill
     §OBJHUD    the capture / hold / wave meter
     §BOSS      announce banner + health bar. Shape first, colour second
     §HUB       the campaign screen: cards, lock state, threat readout
   Loads after armoury.js and drives the game through window.__game. */
(function(){
'use strict';
const BP2 = window.BP2, G = window.__game, T = window.THREE;
if(!G) return;
const {Profile, LEVELS, TIERS, levelById, CAMPAIGN_LEVELS} = BP2;
const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints>0;

function tapTarget(el, fn){
  if(!el) return;
  let done=false;
  el.addEventListener('touchstart', e=>{ e.stopPropagation(); e.preventDefault(); done=true; fn();
    setTimeout(()=>{done=false;},350); }, {passive:false});
  el.addEventListener('click', e=>{ e.stopPropagation(); if(!done) fn(); });
}

/* ---------------------------- §RADIO ------------------------------------- */
/* A band, a callsign and one line. It talks while you move: no pause, no
   pointer lock change, no modal. The band itself is the only thing that eats a
   tap, and that tap ends the whole queue — never just the line you were on. */
const Radio = (function(){
  const el={wrap:$('radio'), band:$('radioBand'), who:$('radioWho'), line:$('radioLine'), skip:$('radioSkip')};
  let q=[], cur=null, t=0, onEnd=null, seq=0;

  function show(item){
    cur=item; t=item.dur;
    el.who.textContent=item.who;
    el.line.innerHTML=item.text;
    el.wrap.classList.toggle('pa', !!item.pa);
    el.skip.textContent = q.length? (IS_TOUCH?'TAP TO SKIP':'CLICK TO SKIP') : '';
    el.wrap.classList.remove('hidden');
    if(item.onShow) item.onShow();
  }
  function hide(){ cur=null; el.wrap.classList.add('hidden'); }
  function next(){
    if(!q.length){ hide(); const f=onEnd; onEnd=null; if(f) f(); return; }
    show(q.shift());
  }
  function update(dt){
    if(!cur) return;
    t-=dt;
    if(t<=0) next();
  }
  return {
    // lines: [callsign, text, seconds, {pa, onShow}]
    play(lines, done){
      seq++;
      q = lines.map(l=>({who:l[0], text:l[1], dur:l[2]||3.4,
                         pa:!!(l[3]&&l[3].pa), onShow:l[3]&&l[3].onShow}));
      onEnd = done || null;
      next();
      return seq;
    },
    skip(){
      if(!cur && !q.length) return false;
      q.length=0; hide();
      const f=onEnd; onEnd=null; if(f) f();
      return true;
    },
    update,
    active:()=>!!cur,
    remaining:()=>q.length + (cur?1:0),
    state:()=>({active:!!cur, who:cur?cur.who:null, text:cur?el.line.textContent:'', queued:q.length})
  };
})();
tapTarget($('radioBand'), ()=>Radio.skip());

/* ---------------------------- §WAR --------------------------------------- */
/* IMPROVEMENTS P6: the PA you have been half-listening to cuts to an emergency
   broadcast MID-SENTENCE. No tanks, no montage. The round does not end — you
   keep the controls the whole way through, and the paint stays on the walls. */
const WAR_LINES = [
  ['PARK PA', '— and that is nine minutes left on the yellow side, so if somebody would actually tell Ryan that the bunker is not—', 4.2, {pa:true}],
  ['EMERGENCY BROADCAST', 'THIS IS NOT A TEST. ALL CIVILIAN MOVEMENT IN SECTOR 7 IS SUSPENDED AS OF THIS BROADCAST.', 4.4,
   {onShow(){ G.setLight('overcast'); }}],
  ['EMERGENCY BROADCAST', 'PERSONS ON THE SECOND SCHEDULE: REPORT TO YOUR NEAREST MUSTER POINT. DO NOT RETURN HOME FIRST.', 4.2],
  ['CPL VANCE', 'You are the one with the range record on the board behind you. Congratulations. That is your qualification.', 4.6],
  ['CPL VANCE', 'Same yard. Same rifle, near enough. The paint does come off, eventually.', 3.8],
  ['CONTROL', 'DOCK SEVEN IS CONTESTED. TAKE THE QUAY AND HOLD IT. YOU ARE ON THE CLOCK FROM NOW ON.', 4.4]
];
let warPlayed=false;
function warBeat(done){
  warPlayed=true;
  Radio.play(WAR_LINES, ()=>{ G.setLight('overcast'); if(done) done(); });
}

/* ---------------------------- §OBJHUD ------------------------------------ */
const OBJ_LABEL = {capture:'CAPTURE THE QUAY', hold:'HOLD THE GROUND',
                   waves:'REPEL THE WAVES', eliminate:'ELIMINATE'};
const CIRC = 2*Math.PI*31;
const objEl={wrap:$('objHud'), arc:$('objArc'), pct:$('objPct'), lb:$('objLabel'), st:$('objState')};
function updateObjHud(){
  const GA=G.GAME;
  if(GA.state!=='play' || GA.paintball){ objEl.wrap.classList.add('hidden'); return; }
  const o=G.OBJ.state();
  if(o.kind==='eliminate'){ objEl.wrap.classList.add('hidden'); return; }
  objEl.wrap.classList.remove('hidden');
  if(o.kind==='waves'){
    objEl.arc.style.strokeDashoffset = String(CIRC*(1 - o.wave/o.waves));
    objEl.pct.textContent = o.wave+'/'+o.waves;
    objEl.lb.textContent = OBJ_LABEL.waves;
    objEl.st.textContent = o.alive+' STANDING';
    objEl.wrap.classList.remove('contested');
    objEl.wrap.classList.toggle('full', o.done);
    return;
  }
  const f=o.frac;
  objEl.arc.style.strokeDashoffset = String(CIRC*(1-f));
  objEl.pct.textContent = Math.round(f*100)+'%';
  objEl.lb.textContent = OBJ_LABEL[o.kind]||'OBJECTIVE';
  objEl.wrap.classList.toggle('contested', o.contest>0);
  objEl.wrap.classList.toggle('full', f>=1);
  objEl.st.textContent = o.contest>0 ? ('CONTESTED ×'+o.contest)
    : o.inside ? 'HOLDING' : 'GET IN THE ZONE';
}

/* ---------------------------- §BOSS -------------------------------------- */
/* IMPROVEMENTS 5: a boss is announced by NAME and marked by shape — the
   diamond, the bracketed tag, the banner. The red is the last cue, not the
   first, because two of these levels are at night. */
const bossEl={bar:$('bossBar'), name:$('bossName'), tag:$('bossTag'), fill:$('bossFill'),
              banner:$('bossBanner'), bn:$('bbName'), bs:$('bbSub')};
const _bv = T? new T.Vector3() : null;
const _bc = T? new T.Vector3() : null;
let announced={}, bannerT=0, barHold=0, lastBoss=null;
/* P5a: the announce is LATCHED. It used to fire only on the frame the boss
   first entered the frustum, so a player who never looked that way — likely on
   the night and fog levels — was never told there was a boss at all. Now it
   fires on first sight OR after ANN_DELAY seconds of the boss being alive and
   near enough to matter, whichever comes first. */
const ANN_DELAY=3.0, ANN_RANGE=42;
let annT={};

function bossOnScreen(e){
  if(!T) return false;
  const cam=G.camera;
  _bv.set(e.pos.x, e.pos.y+1.25, e.pos.z).project(cam);
  if(_bv.z>1 || Math.abs(_bv.x)>1.08 || Math.abs(_bv.y)>1.08) return false;
  cam.getWorldPosition(_bc);
  return G.losClear(_bc.x,_bc.y,_bc.z, e.pos.x, e.pos.y+1.25, e.pos.z);
}
function announce(e){
  const t=TIERS[e.tierId];
  bossEl.bn.textContent=e.name;
  bossEl.bs.textContent=(t?t.label:'')+' COMMANDER · '+Math.round(e.maxHp)+' HP';
  bossEl.banner.classList.remove('hidden');
  bannerT=3.0;
  G.HUD.toast('HIGH VALUE TARGET — '+e.name, 3.0);
}
function updateBoss(dt){
  const GA=G.GAME;
  if(bannerT>0){ bannerT-=dt; if(bannerT<=0) bossEl.banner.classList.add('hidden'); }
  if(GA.state!=='play'){ bossEl.bar.classList.add('hidden'); return; }
  let shown=null;
  for(const e of G.Enemies.list()){
    if(!e.active || !e.alive || !e.boss) continue;
    const vis=bossOnScreen(e);
    if(vis || e.sawPlayer){
      if(!shown || (vis && !shown.vis)) shown={e, vis};
    }
    if(!announced[e.name]){
      const near = e.sawPlayer ||
        Math.hypot(e.pos.x-G.player.pos.x, e.pos.z-G.player.pos.z) <= ANN_RANGE;
      if(near) annT[e.name]=(annT[e.name]||0)+dt;
      if(vis || (annT[e.name]||0)>=ANN_DELAY){ announced[e.name]=1; announce(e); }
    }
  }
  if(shown){ barHold=2.0; lastBoss=shown.e; }
  else if(barHold>0) barHold-=dt;
  const e = shown? shown.e : (barHold>0? lastBoss : null);
  if(!e || !e.alive){ bossEl.bar.classList.add('hidden'); return; }
  bossEl.bar.classList.remove('hidden');
  bossEl.name.textContent=e.name;
  bossEl.tag.textContent=(TIERS[e.tierId]?TIERS[e.tierId].label:'')+' COMMANDER';
  bossEl.fill.style.width=Math.max(0, Math.min(100, e.hp/e.maxHp*100))+'%';
}

/* ---------------------------- §HUB --------------------------------------- */
const HUB_SCREENS=['startScreen','endScreen','pauseScreen','setScreen','armScreen','cfmScreen',
                   'hubScreen','introScreen','warScreen'];
let hubSel = 0, hubBack='start';

function unlocked(lvl){
  if(lvl.id===0) return true;
  if(lvl.endless) return Profile.cleared(CAMPAIGN_LEVELS-1);
  return Profile.cleared(lvl.id-1);
}
function lockReason(lvl){
  if(lvl.endless) return 'Clear MISSION '+(CAMPAIGN_LEVELS-1)+' — '+LEVELS[CAMPAIGN_LEVELS-1].name+' — to open ENDLESS.';
  return 'Clear MISSION '+(lvl.id-1)+' — '+LEVELS[lvl.id-1].name+' — to reach this one.';
}
const OBJ_TEXT = {
  eliminate: lvl=>'ELIMINATE · every hostile in the sector',
  capture:   lvl=>'CAPTURE · clear the zone, then hold it '+(lvl.hold||0)+'s',
  hold:      lvl=>'HOLD · stay in the zone for '+(lvl.hold||0)+'s under fire',
  waves:     lvl=>'WAVES · '+(lvl.waves||1)+' waves, each one lands on the last'
};
function fmtTime(s){
  if(!s) return '—';
  const m=Math.floor(s/60), sec=Math.floor(s%60);
  return m+':'+(sec<10?'0':'')+sec;
}
function rosterCount(lvl){ return lvl.roster.reduce((n,r)=>n+(r.count||1),0); }

function levelCard(lvl){
  const open=unlocked(lvl), done=Profile.cleared(lvl.id), sel=lvl.id===hubSel;
  const A=G.Armoury;
  // one shared survival model — §SURVIVAL in armoury.js
  const sv = A? A.survival(lvl) : null;
  const hp = sv? sv.hpPerHit : 0;
  const bi = sv? A.band(sv.seconds) : 0;
  const bandName = A? A.BANDS[bi].label : '';
  const best=Profile.get().stats.bestTime[lvl.id];
  // career total, not just what has been spent — the readout is "are you strong
  // enough for this", and SP in the bank counts toward that
  const power=Profile.get().sp + Profile.get().spent;
  const rec=lvl.spTarget||0;
  // a clear made on RECRUIT is labelled for ever — that is the whole reason
  // RECRUIT is honest where silently weakening the enemies would not be
  const rcr = done && Profile.onRecruit(lvl.id);
  const tag = !open? '<span class="st">LOCKED</span>'
    : rcr? '<span class="st rcr">RECRUIT</span>'
    : done? '<span class="st rep">REPLAY</span>'
    : '<span class="st next">NEXT</span>';
  const rows = [];
  rows.push('<b>'+rosterCount(lvl)+'</b> hostile'+(rosterCount(lvl)===1?'':'s')
    + (lvl.roster.filter(r=>r.boss).length? ' · <b>'+lvl.roster.filter(r=>r.boss).map(r=>r.name).join(', ')+'</b>' : '')
    + ' · ' + (lvl.time? '<b>'+Math.round(lvl.time/60*10)/10+'</b> min' : '<b>no clock</b>'));
  rows.push('LIGHT <b>'+String(lvl.light).toUpperCase()+'</b> · BEST <b>'+fmtTime(best)+'</b>'
    + (rcr? ' · CLEARED ON <b style="color:#ffb07a">RECRUIT</b>' : ''));
  rows.push('POWER <b>'+(rec? rec+' SP' : 'no kit needed')+'</b> recommended · you have <b'
    + (rec && power<rec? ' style="color:#b08a3a"' : '') + '>'+power+' SP</b>'
    + (rec && power<rec? ' — under-equipped' : ''));
  return '<div class="lvcard'+(sel?' sel':'')+(open?'':' locked')+(done?' done':'')+'" data-lvl="'+lvl.id+'">'+
    '<div class="r1"><span class="no">'+(lvl.endless?'∞':'M'+lvl.id)+'</span>'+
      '<span class="nm">'+lvl.name+'</span>'+tag+'</div>'+
    '<div class="ob">'+(OBJ_TEXT[lvl.objective]||OBJ_TEXT.eliminate)(lvl)+'</div>'+
    '<div class="mt">'+rows.join('<br>')+'</div>'+
    (open? '<div class="thr">you survive <b>~'+(sv? A.fmtSec(sv.seconds):'—')+'</b> of open ground · <b class="sev'+bi+'">'+bandName+'</b>'+
             '<span class="thr2">'+hp.toFixed(1)+' HP per hit · '+(sv?sv.attackers:0)+' firing at once</span></div>'
         : '<div class="lk">'+lockReason(lvl)+'</div>')+
    '</div>';
}
function refreshHub(){
  const P=Profile.get();
  if(!unlocked(levelById(hubSel))) hubSel = P.level;
  $('hubSub').innerHTML='SECTOR 7 &nbsp;·&nbsp; '+Object.keys(P.cleared).filter(k=>+k>0).length+
    ' / '+(CAMPAIGN_LEVELS-1)+' MISSIONS CLEARED &nbsp;·&nbsp; '+P.sp+' SP';
  $('hubBody').innerHTML = LEVELS.filter(l=>l.id>0).map(levelCard).join('');
  const L=levelById(hubSel);
  $('btnHubDeploy').textContent = Profile.cleared(hubSel)? 'REPLAY M'+hubSel : 'DEPLOY M'+hubSel;
  $('hubThreat').innerHTML='';
  scrollToSelected();
}
// offsetTop is 0 while the screen is display:none, so this has to run AFTER the
// hub is on screen as well as on every in-place refresh
function scrollToSelected(){
  const body=$('hubBody'), card=body.querySelector('.lvcard.sel');
  if(!card) return;
  // rect delta, not offsetTop: the offsetParent is the card shell, not the list
  body.scrollTop = Math.max(0,
    body.scrollTop + card.getBoundingClientRect().top - body.getBoundingClientRect().top - 8);
}
function openHub(from){
  hubBack = from || hubBack;
  if(!unlocked(levelById(hubSel))) hubSel = Profile.get().level;
  if(hubSel<1) hubSel = Math.max(1, Profile.get().level);
  for(const id of HUB_SCREENS) $(id) && $(id).classList.add('hidden');
  refreshHub();
  $('hubScreen').classList.remove('hidden');
  scrollToSelected();
}
function closeHub(){
  $('hubScreen').classList.add('hidden');
  const back={start:'startScreen', end:'endScreen', pause:'pauseScreen'}[hubBack]||'startScreen';
  $(back).classList.remove('hidden');
}
function deployHub(){
  const L=levelById(hubSel);
  if(!unlocked(L)){ G.HUD.toast('MISSION LOCKED', 1.4); return; }
  $('hubScreen').classList.add('hidden');
  announced={}; annT={};
  G.GAME.start(L);
}
$('hubBody').addEventListener('click', e=>{
  const c=e.target.closest && e.target.closest('.lvcard');
  if(!c) return;
  e.stopPropagation();
  const id=+c.dataset.lvl;
  if(!unlocked(levelById(id))){ G.HUD.toast('MISSION LOCKED', 1.4); return; }
  if(hubSel===id){ deployHub(); return; }
  hubSel=id; refreshHub();
});
$('hubScreen').addEventListener('touchstart', e=>{ e.stopPropagation(); }, {passive:false});
tapTarget($('btnHubDeploy'), deployHub);
tapTarget($('btnHubArm'), ()=>G.Armoury.open('hub'));
// SETTINGS from the hub has to come BACK to the hub — the engine's own close
// handler only knows start/end/pause, so finish the job after it runs.
let setFromHub=false;
tapTarget($('btnHubSet'), ()=>{
  setFromHub=true;
  $('hubScreen').classList.add('hidden');
  $('setScreen').classList.remove('hidden');
});
$('btnSetClose').addEventListener('click', ()=>{
  if(!setFromHub) return;
  setFromHub=false;
  $('startScreen').classList.add('hidden');
  openHub(hubBack);
});
tapTarget($('btnCampaign'),  ()=>openHub('start'));
tapTarget($('btnCampaign2'), ()=>openHub('end'));

/* --------------------- round start / end hooks --------------------------- */
const _start = G.GAME.start.bind(G.GAME);
G.GAME.start = function(levelDef){
  announced={}; annT={}; bannerT=0; barHold=0;
  bossEl.banner.classList.add('hidden');
  bossEl.bar.classList.add('hidden');
  Radio.skip();
  _start(levelDef);
  const L=G.GAME.level;
  if(!G.GAME.paintball){
    // CONTROL only ever gives you the objective
    setTimeout(()=>{
      if(G.GAME.state!=='play') return;
      Radio.play([['CONTROL', G.OBJ.banner(), 3.6]]);
    }, 900);
  }
};
// the campaign hub, not the start screen, is where a finished round lands
const _end = G.GAME.end.bind(G.GAME);
G.GAME.end = function(won, reason){
  Radio.skip();
  bossEl.bar.classList.add('hidden');
  bossEl.banner.classList.add('hidden');
  _end(won, reason);
};

/* ---------------------------- tick --------------------------------------- */
let _last=performance.now();
function tick(t){
  requestAnimationFrame(tick);
  let dt=(t-_last)/1000; _last=t;
  if(dt>0.25) dt=0.25;
  Radio.update(dt);
  updateObjHud();
  updateBoss(dt);
}
requestAnimationFrame(tick);

const Campaign = {
  Radio, warBeat, openHub, closeHub, refreshHub,
  unlocked, lockReason, levelCard,
  deploy:deployHub,
  select(n){ hubSel=n|0; if(!$('hubScreen').classList.contains('hidden')) refreshHub(); return hubSel; },
  selected:()=>hubSel,
  hubVisible:()=>!$('hubScreen').classList.contains('hidden'),
  bossVisible:()=>!bossEl.bar.classList.contains('hidden'),
  bannerVisible:()=>!bossEl.banner.classList.contains('hidden'),
  bossState:()=>({bar:!bossEl.bar.classList.contains('hidden'),
                  banner:!bossEl.banner.classList.contains('hidden'),
                  name:bossEl.name.textContent, tag:bossEl.tag.textContent,
                  bannerName:bossEl.bn.textContent, bannerSub:bossEl.bs.textContent,
                  fill:bossEl.fill.style.width}),
  objHud:()=>({visible:!objEl.wrap.classList.contains('hidden'), pct:objEl.pct.textContent,
               label:objEl.lb.textContent, state:objEl.st.textContent,
               contested:objEl.wrap.classList.contains('contested'),
               offset:objEl.arc.style.strokeDashoffset}),
  warPlayed:()=>warPlayed,
  state:()=>({sel:hubSel, hub:!$('hubScreen').classList.contains('hidden'),
              radio:Radio.state(),
              unlocked:LEVELS.map(l=>unlocked(l))})
};
BP2.Campaign = Campaign;
G.Campaign = Campaign;
})();
