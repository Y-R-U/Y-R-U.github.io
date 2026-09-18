import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:''));};
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
await send('Page.navigate',{url:'about:blank'});await sleep(300);errors.length=0;
await send('Page.navigate',{url:URL});await sleep(3500);
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`);
await send('Page.navigate',{url:URL});await sleep(3500);
const a=await ev(`({intro:BP2.Tutorial.introVisible(),state:__game.GAME.state,
  cards:[...document.querySelectorAll('.ccard b')].map(e=>e.textContent),
  touchRows:[...document.querySelectorAll('#setBody .setrow .n')].map(e=>e.textContent).filter(t=>/How you shoot/.test(t)).length})`);
ok('desktop boots into the instruction screen', a.intro && a.state==='menu', JSON.stringify({i:a.intro,s:a.state}));
ok('desktop shows the keyboard cards, not the thumb cards', a.cards.join()==='MOVE,LOOK,FIRE,RELOAD,WEAPONS,PAUSE', a.cards.join());
ok('touch-only settings rows stay hidden on desktop', a.touchRows===0, String(a.touchRows));
await ev(`document.getElementById('btnIntroGo').click()`); await sleep(1200);
const b=await ev(`({state:__game.GAME.state,lvl:__game.levelInfo().id,step:BP2.Tutorial.state().step,bar:BP2.Tutorial.barVisible()})`);
ok('one click begins the drill on desktop', b.state==='play'&&b.lvl===0&&b.step==='move'&&b.bar, JSON.stringify(b));
// keyboard: W moves, R reloads, 2 must not switch weapons
await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
// poll while the key is held: a headless window with no CDP traffic throttles
// requestAnimationFrame, and dt is clamped to 0.06, so the world runs in slow
// motion and the drill counter under-reads. This is the harness, not the game.
// hold until the step actually advances (or 3 s), polling to keep rAF alive
for(let i=0;i<20;i++){ await sleep(150);
  if(await ev('BP2.Tutorial.state().counters.moved') > 3.2) break; }
await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
await sleep(300);
const c=await ev('BP2.Tutorial.state()');
ok('holding W advances the MOVE step', c.stepI>=1 && c.counters.moved>3, `step=${c.step} moved=${c.counters.moved.toFixed(2)}`);
const d=await ev(`(()=>{__game.setWeapon(1);return {i:__game.Weapons.index(),id:__game.Weapons.current().id};})()`);
ok('locked weapons ignore the 1-4 keys', d.i===0 && d.id==='rifle', JSON.stringify(d));
await sleep(500);
ok('zero console errors on the desktop path', errors.length===0, errors.join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();
