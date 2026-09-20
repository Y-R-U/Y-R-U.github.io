import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect,BASE} from './cdp.mjs';
const evidence=fileURLToPath(new URL('../docs/evidence/',import.meta.url));await mkdir(evidence,{recursive:true});

// Plays the whole fishing loop through the real DOM: the cast button, the real
// input module's reel, the tension bar, the notice, and localStorage.
const p=await connect();
const read=()=>p.eval(`({phase:sunwake.fishing.phase,tension:sunwake.fishing.tension,progress:sunwake.fishing.progress,
  xp:sunwake.fishing.xp,level:sunwake.fishing.level,canCast:sunwake.fishing.canCast,
  state:document.getElementById('fish-state').textContent,hint:document.getElementById('fish-hint').textContent,
  skill:document.getElementById('fish-skill').textContent,castLabel:document.getElementById('cast').textContent.trim(),
  castDisabled:document.getElementById('cast').disabled,liveHidden:document.getElementById('fishing-live').hidden,
  panelHidden:document.getElementById('fishing').hidden,
  mark:document.getElementById('tension-mark').style.getPropertyValue('--mark'),
  band:document.getElementById('tension-band').style.getPropertyValue('--band-width'),
  taut:document.getElementById('fishing').classList.contains('taut'),
  notice:document.getElementById('notice').hidden?null:document.getElementById('notice').textContent})`);
try{
 const id=(await p.send('Page.addScriptToEvaluateOnNewDocument',{source:'try{localStorage.clear()}catch{}'})).identifier;
 await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__');
 assert.equal(await p.eval('window.__SUNWAKE_BOOTED__'),true,await p.eval('window.__SUNWAKE_FAILED__'));
 await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:id});

 assert.equal((await read()).panelHidden,true,'the fishing panel is up on the title screen');
 await p.eval(`document.getElementById('start').click()`);
 let s=await read();
 assert.equal(s.panelHidden,false);assert.equal(s.liveHidden,true);
 assert.equal(s.castDisabled,false,'cannot cast from a boat sitting still');
 assert.match(s.castLabel,/Cast a line/);
 assert.match(s.skill,/Fishing 1 · 0 xp/);

 // Under way, casting is refused — from the real boat state, not a flag.
 await p.eval(`sunwakeTest.setPose({});sunwakeTest.setInput({throttle:1,steer:0});sunwakeTest.advance(120)`);
 s=await read();
 assert.equal(s.castDisabled,true,'the cast button stayed live at speed');
 assert.equal(s.canCast,false);
 await p.eval(`document.getElementById('cast').click()`);
 assert.equal((await read()).phase,'idle','a cast went out while making way');

 // Stop and cast for real.
 await p.eval(`sunwakeTest.setPose({});sunwakeTest.setInput({throttle:0,steer:0});sunwakeTest.advance(1)`);
 await p.eval(`document.getElementById('cast').click()`);
 s=await read();
 assert.equal(s.phase,'waiting','the cast button did not put a line out');
 assert.equal(s.liveHidden,false,'the tension panel did not open');
 assert.match(s.castLabel,/Reel in and stow/);
 assert.match(s.state,/Waiting for a bite/);

 // Fight it through the REAL input module: hold space when slack, release when
 // tight. Nothing here touches core/fishing.mjs directly.
 await p.eval(`window.__fight=(ticks)=>{const t=sunwakeTest;let held=false;
   for(let k=0;k<ticks;k++){const f=sunwake.fishing;if(f.phase==='idle')break;
     const want=f.tension<.5;
     if(want!==held){held=want;dispatchEvent(new KeyboardEvent(held?'keydown':'keyup',{code:'Space',bubbles:true}));}
     t.setInput({throttle:0,steer:0});t.advance(1);}
   dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}));
   return sunwake.fishing;}`);
 let bitten=false,landed=false;
 for(let i=0;i<14&&!landed;i++){
  await p.eval('window.__fight(40)');
  s=await read();
  if(s.phase==='fighting'){
   bitten=true;
   assert.ok(s.mark&&parseFloat(s.mark)>0,'the tension mark is not being positioned');
   assert.ok(s.band&&parseFloat(s.band)>0,'the safe band has no width');
   assert.match(s.hint,/tension|tight|slack/i);
   if(i===0||!landed)await p.shot(evidence+'p2-fishing-fight.png');
  }
  if(s.xp>0)landed=true;
 }
 assert.ok(bitten,'nothing ever bit');
 assert.ok(landed,'a well-played fight never landed a fish');
 s=await read();
 assert.equal(s.phase,'idle','the rod was not stowed after landing');
 assert.equal(s.liveHidden,true,'the tension panel stayed open after the fish was in');
 assert.match(s.castLabel,/Cast a line/,'the cast button still says reel in after landing');
 assert.ok(s.xp>0);assert.match(s.skill,new RegExp(String(s.xp)+' xp'));
 assert.ok(s.notice&&/kg.*xp/.test(s.notice),'no catch notice: '+s.notice);
 await p.shot(evidence+'p2-fishing-landed.png');

 // It is in the save, the save is still version 1, and it survives a reload.
 const saved=JSON.parse(await p.eval(`localStorage.getItem('sunwake-v1')`));
 assert.equal(saved.version,1,'the save version changed — existing voyages would be discarded');
 assert.ok(saved.fishing.xp>0,'the catch was not saved');
 assert.equal(saved.fishing.casts,1,'the cast refused while under way still burned a cast');
 await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await p.wait('window.__SUNWAKE_BOOTED__');
 await p.eval(`document.getElementById('start').click()`);
 const after=await read();
 assert.equal(after.xp,saved.fishing.xp,'xp did not survive a reload');
 assert.equal(after.phase,'idle','a reload resumed mid-cast');

 // A save written before fishing existed must still load and start at zero.
 // The strip has to happen in a fresh document BEFORE main.mjs runs: editing
 // localStorage on the live page and then navigating does nothing, because the
 // game saves on `pagehide` and writes the fishing block straight back.
 const strip=(await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{const v=JSON.parse(localStorage.getItem('sunwake-v1'));if(v){delete v.fishing;localStorage.setItem('sunwake-v1',JSON.stringify(v));}}catch{}`})).identifier;
 await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__');
 await p.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:strip});
 assert.equal(await p.eval(`'fishing' in JSON.parse(localStorage.getItem('sunwake-v1'))&&JSON.parse(localStorage.getItem('sunwake-v1')).fishing.xp>0`),false,'the legacy save was not actually stripped — this case proves nothing');
 assert.equal(await p.eval('window.__SUNWAKE_BOOTED__'),true,'a pre-fishing save stopped the game booting');
 await p.eval(`document.getElementById('start').click()`);
 const legacy=await read();
 assert.equal(legacy.xp,0,'a pre-fishing save did not migrate to a fresh angler');
 assert.equal(legacy.level,1);
 assert.equal(await p.eval(`document.getElementById('start').textContent`),'Continue voyage ↗','the old voyage was thrown away');

 assert.deepEqual(p.errors,[],'Browser errors: '+JSON.stringify(p.errors));
 console.log('PASS fishing-browser',JSON.stringify({xp:after.xp,level:after.level,notice:s.notice},null,2));
}finally{await p.close();}
