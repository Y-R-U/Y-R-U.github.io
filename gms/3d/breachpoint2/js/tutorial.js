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
const CARDS_TOUCH = [
  ['◄►','LEFT THUMB','Drag anywhere on the left to move. Push it far out to sprint.'],
  ['◉','RIGHT THUMB','Drag or hold on the right to look. Keep it held off centre and you keep turning.'],
  ['••','DOUBLE-TAP RIGHT','Tap twice on the right to fire. Hold the second tap down to keep firing.'],
  ['⌁','HANDS FREE','Jumping, mantling, reloading and aiming happen on their own.'],
  ['1','WEAPON','The numbered buttons down the side swap weapons you have unlocked.'],
  ['❚❚','PAUSE','Top right. Settings and these cards live behind it.']
];
const CARDS_KEYS = [
  ['W','MOVE','WASD to move, SHIFT to sprint, SPACE to jump.'],
  ['◉','LOOK','Move the mouse. Click the view once to capture the pointer.'],
  ['1','FIRE','Mouse 1 fires, mouse 2 aims down the sights.'],
  ['R','RELOAD','R reloads. It also reloads itself when the magazine runs dry.'],
  ['1','WEAPONS','Keys 1–4, or the mouse wheel, for weapons you have unlocked.'],
  ['⎋','PAUSE','ESC pauses. Settings and these cards live behind it.']
];
function buildCards(){
  const list = IS_TOUCH? CARDS_TOUCH : CARDS_KEYS;
  $('ctrlCards').innerHTML = list.map(([ic,t,d])=>
    '<div class="ccard"><div class="ic">'+ic+'</div><div class="tx"><b>'+t+'</b><span>'+d+'</span></div></div>').join('');
}

/* ---------------------------- §STEPS ------------------------------------- */
// Every test reads a counter that the poll loop keeps from live game state.
const C = {moved:0, turned:0, shots:0, hits:0, reloads:0, ads:0, downs:0};
const STEPS = [
  {id:'move',   text:'MOVE',                hint: IS_TOUCH? 'Drag the left side of the screen' : 'W A S D',
   test:()=>C.moved>3},
  {id:'look',   text:'LOOK AROUND',         hint: IS_TOUCH? 'Drag or hold the right side' : 'Move the mouse',
   test:()=>C.turned>1.2},
  {id:'fire',   text:'FIRE',                hint: IS_TOUCH? 'Double-tap the right side' : 'Mouse 1',
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
}
function hideIntro(){ $('introScreen').classList.add('hidden'); }

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
    $('tutHint').textContent = s.hint;
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
  STEPS, showIntro, hideIntro, skip, beginRun,
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
