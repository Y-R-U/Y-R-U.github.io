/* BREACHPOINT II — §TUTORIAL.  Instruction overlay + the interactive drill.
     §CARDS     the control cards shown on the instruction screen
     §STEPS     the step list; each one advances on real game state
     §INTRO     the instruction screen (boot gate + CONTROLS from pause)
     §RUN       the poll loop, skip, and training completion
   Loads after engine.js and drives the game through window.__game. */
(function(){
'use strict';
const BP2 = window.BP2, G = window.__game;
if(!G){ return; }
const {Profile} = BP2;
const $ = id => document.getElementById(id);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints>0;
const TRAIN_SP = 300;
const TRAIN_MAG = 10;       // short drill magazine so the reload step arrives fast

/* ---------------------------- §CARDS ------------------------------------- */
/* Touch does NOT get a list of cards. It gets §ZONES below: the real touch
   zones drawn where they really are, over the paused play view. Desktop keeps
   its card grid — a keyboard has no zones to point at. */
const CARDS_KEYS = [
  ['W','MOVE','WASD to move, SHIFT to sprint, SPACE to jump.'],
  ['◉','LOOK','Move the mouse. Click the view once to capture the pointer.'],
  ['1','FIRE','Mouse 1 fires, mouse 2 aims down the sights.'],
  ['R','RELOAD','R reloads. It also reloads itself when the magazine runs dry.'],
  ['1','WEAPONS','Keys 1–4, or the mouse wheel, for weapons you have unlocked.'],
  ['⎋','PAUSE','ESC pauses. Settings and these cards live behind it.']
];
const NOTES_TOUCH = [
  'Jumping, mantling, reloading and aiming down the sights all happen on their own.',
  'The numbered buttons down the side swap weapons · ❚❚ top right pauses.'
];
function buildCards(){
  if(IS_TOUCH){
    $('ctrlCards').innerHTML = '';
    $('introNotes').innerHTML = NOTES_TOUCH.map(t=>'<div>'+t+'</div>').join('');
    return;
  }
  $('ctrlCards').innerHTML = CARDS_KEYS.map(([ic,t,d])=>
    '<div class="ccard"><div class="ic">'+ic+'</div><div class="tx"><b>'+t+'</b><span>'+d+'</span></div></div>').join('');
}

/* ---------------------------- §ZONES ------------------------------------- */
/* The instruction overlay. Left/right are never assumed: which half moves and
   where the split falls both come out of the input code itself. */
const lookSide = ()=> G.S.leftHanded? 'LEFT' : 'RIGHT';
const moveSide = ()=> G.S.leftHanded? 'RIGHT' : 'LEFT';

function zoneCopy(){
  const m = G.S.touchMode;
  const move = ['<b>ONE FINGER</b> anywhere in this half — press and drag to move.',
                'Push it far out and you <b>SPRINT</b>.'];
  if(m==='doubletap') return {move,
    lookTitle:'LOOK · DOUBLE-TAP TO FIRE', dots:1,
    look:['<b>ONE FINGER</b> — hold it off centre and the view keeps turning.',
          '<b>DOUBLE-TAP</b> in here to fire. Hold the second tap down to keep firing.'],
    key:'THE TAP THAT FIRES IS THE FINGER THAT LOOKS. SWITCH TO 2-FINGER IN SETTINGS TO LOOK AND SHOOT AT ONCE.'};
  if(m==='tapfire') return {move,
    lookTitle:'LOOK · TAP TO FIRE', dots:1,
    look:['<b>ONE FINGER</b> — hold it off centre and the view keeps turning.',
          '<b>A QUICK TAP</b> in here fires one round.'],
    key:'A TAP FIRES, A HOLD LOOKS — THE SAME FINGER DOES BOTH. SWITCH TO 2-FINGER IN SETTINGS TO LOOK AND SHOOT AT ONCE.'};
  return {move,
    lookTitle:'LOOK &amp; SHOOT', dots:2,
    look:['<b>❶ ONE FINGER</b> — hold it off centre and the view keeps turning. <b>It never lifts.</b>',
          '<b>❷ A SECOND FINGER</b> in here fires. Hold it down and it keeps firing.'],
    key:'KEEP THE LOOK FINGER DOWN AND PUT A SECOND FINGER BESIDE IT — YOU LOOK AND SHOOT AT THE SAME TIME.'};
}

function buildZones(){
  const c = zoneCopy();
  const dots = c.dots===2
    ? '<i class="idot">❶</i><i class="idot two">❷</i>'
    : '<i class="idot">❶</i>';
  $('introZones').innerHTML =
    '<div class="izone move"><div class="izlab">' +
      '<b class="zt">MOVE · '+moveSide()+'</b>' +
      '<div class="idots"><i class="idot">❶</i></div>' +
      '<div class="izl">'+c.move.map(t=>'<p>'+t+'</p>').join('')+'</div>' +
    '</div></div>' +
    '<div class="izone look"><div class="izlab">' +
      '<b class="zt">'+c.lookTitle+' · '+lookSide()+'</b>' +
      '<div class="idots">'+dots+'</div>' +
      '<div class="izl">'+c.look.map(t=>'<p>'+t+'</p>').join('')+'</div>' +
    '</div></div>';
  $('introKey').innerHTML = c.key;
}

/* Position the two rects from the live input geometry, then drop the label
   blocks into the gap between the heading above and the button row below. */
function layoutZones(){
  if(!IS_TOUCH) return;
  const z = $('introZones');
  const mv = z.querySelector('.izone.move'), lk = z.querySelector('.izone.look');
  if(!mv || !lk) return;
  const W = window.innerWidth, H = window.innerHeight;
  const split = G.Input.zoneSplit();
  const moveLeft = G.Input.zoneAt(1)==='move';
  const put=(el,x0,x1)=>{ el.style.left=x0+'px'; el.style.width=(x1-x0)+'px';
                          el.style.top='0px'; el.style.height=H+'px'; };
  if(moveLeft){ put(mv,0,split); put(lk,split,W); }
  else        { put(lk,0,split); put(mv,split,W); }
  const keyB = $('introKey').getBoundingClientRect();
  const footB= $('introNotes').getBoundingClientRect();
  const top = Math.max(keyB.bottom+9, H*0.14);
  const bot = Math.max(top+60, Math.min(footB.top-9, H-8));
  const labs = [...z.querySelectorAll('.izlab')];
  for(const el of labs){
    el.style.top = top.toFixed(1)+'px';
    el.style.height = (bot-top).toFixed(1)+'px';
    el.style.paddingTop = '0px';
    for(const k of el.children) k.style.minHeight = '';
  }
  // The two halves have to read as one diagram, so row i is the same height on
  // both sides. Without this the longer heading wraps to two lines and drags
  // that side's dots and copy a line lower than the other's.
  const rows = Math.max(...labs.map(el=>el.children.length));
  for(let i=0;i<rows;i++){
    let h=0;
    for(const el of labs){ const k=el.children[i]; if(k) h=Math.max(h, k.getBoundingClientRect().height); }
    for(const el of labs){ const k=el.children[i]; if(k) k.style.minHeight = h.toFixed(1)+'px'; }
  }
  // Then drop the pair to the bottom of the band, over where the thumbs they
  // describe actually rest. They only ride up if the copy outgrows the gap.
  const contentH = el => { const k=el.children;
    return k.length? k[k.length-1].getBoundingClientRect().bottom - k[0].getBoundingClientRect().top : 0; };
  let maxH=0; for(const el of labs) maxH=Math.max(maxH, contentH(el));
  const pad = Math.max(0, (bot-top)-maxH);
  for(const el of labs) el.style.paddingTop = pad.toFixed(1)+'px';
}

/* ---------------------------- §STEPS ------------------------------------- */
// Every test reads a counter that the poll loop keeps from live game state.
const C = {moved:0, turned:0, shots:0, hits:0, reloads:0, ads:0, downs:0};
// Touch hints are read live: they have to follow leftHanded and the fire mode.
const fireHint = ()=>{
  const m = G.S.touchMode;
  if(m==='doubletap') return 'Double-tap the '+lookSide().toLowerCase()+' side';
  if(m==='tapfire')   return 'Quick tap on the '+lookSide().toLowerCase()+' side';
  return 'Keep the look finger down, press a second finger beside it';
};
const STEPS = [
  {id:'move',   text:'MOVE',                hint: IS_TOUCH? ()=>'Drag the '+moveSide().toLowerCase()+' side of the screen' : 'W A S D',
   test:()=>C.moved>3},
  {id:'look',   text:'LOOK AROUND',         hint: IS_TOUCH? ()=>'Hold the '+lookSide().toLowerCase()+' side off centre' : 'Move the mouse',
   test:()=>C.turned>1.2},
  {id:'fire',   text:'FIRE',                hint: IS_TOUCH? fireHint : 'Mouse 1',
   test:()=>C.shots>=1},
  {id:'hit',    text:'HIT A TARGET',        hint:'Put paint on one of them',
   test:()=>C.hits>=1},
  {id:'reload', text:'RELOAD',              hint: IS_TOUCH? 'Empty the magazine — it reloads itself' : 'Press R, or empty the magazine',
   test:()=>C.reloads>=1},
  {id:'ads',    text:'AIM DOWN SIGHTS',     hint: IS_TOUCH? 'Sights come up on their own near a target' : 'Hold mouse 2',
   test:()=>C.ads>=1},
  {id:'down1',  text:'DOWN A TARGET',       hint:'Keep the paint on it',
   test:()=>C.downs>=1},
  {id:'down2',  text:'DOWN THE LAST TARGET',hint:'One left',
   test:()=>C.downs>=2}
];

let stepI=0, running=false, finished=false, skipped=false, lastAward=0;
let last={x:0,z:0,yaw:0,pitch:0,have:false}, prevWState='idle';

function resetCounters(){
  for(const k in C) C[k]=0;
  stepI=0; finished=false; skipped=false;
  last.have=false; prevWState='idle';
}

/* ---------------------------- §INTRO ------------------------------------- */
let introMode='boot';       // 'boot' = tap to start training, 'view' = close and go back
let introBack='pause';

function showIntro(mode, back){
  introMode = mode||'boot';
  introBack = back||'pause';
  buildCards();
  if(IS_TOUCH){ $('introScreen').classList.add('zones'); buildZones(); }
  $('startScreen').classList.add('hidden');
  $('endScreen').classList.add('hidden');
  $('pauseScreen').classList.add('hidden');
  $('setScreen').classList.add('hidden');
  $('warScreen').classList.add('hidden');
  const boot = introMode==='boot';
  $('introSub').textContent = boot? 'READ IT OR DON’T — ONE TAP AND YOU ARE IN' : 'HOW YOU FIGHT';
  $('btnIntroGo').textContent = boot? 'BEGIN TRAINING' : 'BACK';
  $('introPrompt').textContent = boot? (IS_TOUCH?'TAP ANYWHERE TO BEGIN':'CLICK ANYWHERE TO BEGIN') : '';
  $('introPrompt').style.display = boot? '' : 'none';
  $('introScreen').classList.remove('hidden');
  if(IS_TOUCH){ layoutZones(); requestAnimationFrame(layoutZones); }
}
function hideIntro(){ $('introScreen').classList.add('hidden'); }
window.addEventListener('resize', ()=>{
  if(IS_TOUCH && !$('introScreen').classList.contains('hidden')) requestAnimationFrame(layoutZones);
});
window.addEventListener('orientationchange', ()=>{
  if(IS_TOUCH && !$('introScreen').classList.contains('hidden')) setTimeout(layoutZones, 260);
});

function introAction(){
  if(introMode==='boot'){
    hideIntro();
    G.GAME.start(BP2.levelById(0));
    return;
  }
  hideIntro();
  if(introBack==='pause') $('pauseScreen').classList.remove('hidden');
  else if(introBack==='set') $('setScreen').classList.remove('hidden');
  else if(introBack==='end') $('endScreen').classList.remove('hidden');
  else $('startScreen').classList.remove('hidden');
}

/* ---------------------------- §RUN --------------------------------------- */
function setBar(on){ $('tutHud').classList.toggle('hidden', !on); }
const stepHint = s => !s? '' : (typeof s.hint==='function'? s.hint() : s.hint);

function paintStep(){
  const s = STEPS[stepI];
  const bar=$('tutHud');
  if(finished || !s){
    bar.classList.add('done');
    $('tutStep').textContent = 'TRAINING COMPLETE';
    $('tutHint').textContent = '';
  } else {
    bar.classList.remove('done');
    $('tutStep').textContent = (stepI+1)+'. '+s.text;
    $('tutHint').textContent = stepHint(s);
  }
  $('tutDots').innerHTML = STEPS.map((_,i)=>
    '<i class="'+(i<stepI?'on':(i===stepI&&!finished?'cur':''))+'"></i>').join('');
}

function beginRun(){
  resetCounters();
  running=true;
  // a short drill magazine: the reload step should take seconds, not a minute
  const rt=G.Weapons.runtime();
  if(rt[0]) rt[0].mag = Math.min(rt[0].mag, TRAIN_MAG);
  G.HUD.updateAmmo();
  setBar(true);
  paintStep();
  G.HUD.toast('PAINTBALL DRILL — YOU CANNOT BE KILLED IN HERE', 3.0);
}
function endRun(){ running=false; setBar(false); }

function sample(){
  const GA=G.GAME;
  if(GA.state!=='play'){ last.have=false; return; }
  const p=G.player;
  if(last.have){
    C.moved += Math.hypot(p.pos.x-last.x, p.pos.z-last.z);
    let dy=p.yaw-last.yaw;
    while(dy>Math.PI) dy-=Math.PI*2; while(dy<-Math.PI) dy+=Math.PI*2;
    C.turned += Math.abs(dy) + Math.abs(p.pitch-last.pitch)*0.6;
  }
  last.x=p.pos.x; last.z=p.pos.z; last.yaw=p.yaw; last.pitch=p.pitch; last.have=true;

  C.shots = GA.stats.shots;
  C.hits  = GA.stats.hits;
  const ws=G.Weapons.state();
  if(prevWState==='reload' && ws!=='reload') C.reloads++;
  prevWState=ws;
  if(G.Weapons.adsAmount()>0.6) C.ads=1;
  C.downs = GA.rosterSize - G.Enemies.aliveCount();
}

function tick(){
  requestAnimationFrame(tick);
  if(!running) return;
  // aborting out of the round takes the drill bar with it
  if(G.GAME.state==='end' || G.GAME.state==='menu'){ endRun(); return; }
  setBar(G.GAME.state==='play' || G.GAME.state==='pause');
  sample();
  if(!finished){
    let moved=false;
    while(stepI<STEPS.length && STEPS[stepI].test()){ stepI++; moved=true; }
    if(moved){
      paintStep();
      if(stepI>=STEPS.length) $('tutStep').textContent='ALL DRILLS DONE';
    }
  }
  maybeFinish();
}

function allStepsDone(){ return skipped || stepI>=STEPS.length; }

function maybeFinish(){
  if(finished || !running) return;
  if(!allStepsDone()) return;
  // read the roster live: this can be called from inside the kill that emptied it
  C.downs = G.GAME.rosterSize - G.Enemies.aliveCount();
  if(C.downs < G.GAME.rosterSize) return;     // 2 targets down, for real
  finish();
}

/* IMPROVEMENTS P6: the turn is not a screen. The PA cuts to an emergency
   broadcast MID-SENTENCE while the round is still live — you keep the
   controls, the targets stay where they fell, and the paint stays on the
   containers into level 1. One tap on the band ends the whole thing. */
let warRunning=false;
function finish(){
  if(finished) return;
  finished=true;
  const GA=G.GAME;
  const before = Profile.get().sp;
  Profile.award(TRAIN_SP);
  const P=Profile.get();
  P.trainingDone=true;
  Profile.save();
  Profile.clearLevel(0, GA.elapsed);           // marks L0 done and opens the dock
  lastAward = Profile.get().sp - before;
  paintStep();
  endRun();
  G.FX.savePaint();                            // the war arrives before the paint dries
  const acc = GA.stats.shots? (GA.stats.hits/GA.stats.shots*100) : 0;
  $('warBrief').innerHTML =
    'Targets down <b>'+C.downs+' / '+GA.rosterSize+'</b> &nbsp;·&nbsp; accuracy <b>'+acc.toFixed(0)+'%</b>'+
    ' &nbsp;·&nbsp; paint taken <b>'+GA.stats.paintHits+'</b><br>' +
    'Service points <b>+'+TRAIN_SP+'</b>. The shooting range is closed. Sector 7 is a front line.';
  warRunning=true;
  const after=()=>{
    warRunning=false;
    if(G.GAME.state==='play'){
      G.GAME.state='end'; G.GAME.ended=true;
      G.Input.clear();
      G.HUD.show(false);
      G.Input.setTouchUI(false);
      if(document.exitPointerLock) document.exitPointerLock();
    }
    if(BP2.Campaign) BP2.Campaign.openHub('start');
    else $('warScreen').classList.remove('hidden');
  };
  if(BP2.Campaign) BP2.Campaign.warBeat(after);
  else after();
}

function skip(){
  if(finished) return;
  skipped=true; stepI=STEPS.length;
  paintStep();
  // SKIP TRAINING means done with the drill, not "cheat the targets"
  const live=G.Enemies.list().filter(e=>e.active && e.alive);
  for(const e of live) G.Enemies.damage(e, e.maxHp*4, false, null);
  C.downs = G.GAME.rosterSize;
  maybeFinish();
}

/* ---------------------------- wiring ------------------------------------- */
function tapTarget(el, fn){
  if(!el) return;
  let done=false;
  el.addEventListener('touchstart', e=>{ e.stopPropagation(); e.preventDefault(); done=true; fn();
    setTimeout(()=>{done=false;},350); }, {passive:false});
  el.addEventListener('click', e=>{ e.stopPropagation(); if(!done) fn(); });
}
tapTarget($('btnSkipTut'), skip);
tapTarget($('btnIntroGo'), introAction);
tapTarget($('btnControls'), ()=>showIntro('view','pause'));
tapTarget($('btnControls2'), ()=>showIntro('view','set'));
// the campaign hub has taken this over; the screen is only the no-campaign fallback
tapTarget($('btnWarGo'), ()=>{
  $('warScreen').classList.add('hidden');
  if(BP2.Campaign){ BP2.Campaign.openHub('start'); return; }
  const L=BP2.levelById(Profile.get().level);
  $('startSub').innerHTML='MISSION '+L.id+' &nbsp;·&nbsp; '+L.sub;
  $('startBrief').innerHTML=L.name+' — <b>'+L.roster.reduce((n,r)=>n+(r.count||1),0)+' hostiles</b>.'+
    (L.time? '<br>'+Math.round(L.time/60*10)/10+' minutes.' : '<br>No clock.');
  $('startScreen').classList.remove('hidden');
});

// one tap anywhere on the instruction screen gets you in — but keep the same
// generous dead zone around the buttons the start screen uses
const nearButtons = e => !!(e.target.closest && e.target.closest('.btnrow'));
const intro=$('introScreen');
intro.addEventListener('touchstart', e=>{ e.stopPropagation(); }, {passive:false});
intro.addEventListener('touchend', e=>{
  e.stopPropagation();
  if(nearButtons(e)) return;
  e.preventDefault(); introAction();
}, {passive:false});
intro.addEventListener('click', e=>{ if(nearButtons(e)) return; introAction(); });
const war=$('warScreen');
war.addEventListener('touchstart', e=>{ e.stopPropagation(); }, {passive:false});

// every route into a round closes the instruction screen and re-arms the drill
const _startRound = G.GAME.startRound.bind(G.GAME);
G.GAME.startRound = function(levelDef){
  hideIntro();
  $('warScreen').classList.add('hidden');
  _startRound(levelDef);
  const GA=G.GAME;
  if(GA.paintball && !Profile.get().trainingDone) beginRun();
  else endRun();
};
G.GAME.onTrainingWin = function(){
  // the last target is down: training ends when the drill list is done too
  if(running) maybeFinish();
  else G.GAME.end(true, 'DRILL COMPLETE');
};

/* boot: a fresh recruit meets the controls before anything moves */
if(!Profile.get().trainingDone){
  showIntro('boot');
} else {
  buildCards();
}
requestAnimationFrame(tick);

const Tutorial = {
  STEPS, showIntro, hideIntro, skip, beginRun, layoutZones,
  hints:()=>STEPS.map(stepHint),
  // what the overlay actually drew, for comparison against Input's own zones
  zoneRects(){
    const out={};
    for(const el of $('introZones').querySelectorAll('.izone')){
      const b=el.getBoundingClientRect();
      out[el.classList.contains('move')?'move':'look'] =
        {left:+b.left.toFixed(1), right:+b.right.toFixed(1), top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1)};
    }
    return out;
  },
  introVisible:()=>!$('introScreen').classList.contains('hidden'),
  // the war beat is the radio over the live round now, not a screen
  warVisible:()=>warRunning || !$('warScreen').classList.contains('hidden'),
  warRunning:()=>warRunning,
  barVisible:()=>!$('tutHud').classList.contains('hidden'),
  award:()=>lastAward,
  state:()=>({
    running, finished, skipped, stepI,
    step: STEPS[stepI]? STEPS[stepI].id : null,
    total: STEPS.length,
    counters: Object.assign({}, C),
    trainingDone: Profile.get().trainingDone
  })
};
BP2.Tutorial = Tutorial;
G.Tutorial = Tutorial;
})();
