import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'});await sleep(300);errors.length=0;
await ev(`localStorage.clear()`).catch(()=>{});
await send('Page.navigate',{url:URL});await sleep(3500);
await ev(`__game.Profile.reset()`);
await send('Page.navigate',{url:URL});await sleep(3500);
await ev(`document.getElementById('btnIntroGo').click()`);await sleep(900);
await ev(`document.getElementById('btnSkipTut').click()`);await sleep(1300);
console.log('war', await ev(`({war:BP2.Tutorial.warVisible(),brief:document.getElementById('warBrief').textContent.slice(0,90)})`));
await ev(`document.getElementById('btnWarGo').click()`);await sleep(400);
console.log('start', await ev(`({start:!document.getElementById('startScreen').classList.contains('hidden'),
 sub:document.getElementById('startSub').textContent, brief:document.getElementById('startBrief').textContent, lvl:__game.Profile.get().level})`));
await ev(`document.getElementById('btnStart').click()`);await sleep(1200);
console.log('deploy', await ev(`({lvl:__game.levelInfo().id,alive:__game.Enemies.aliveCount(),paint:__game.paintball(),bar:BP2.Tutorial.barVisible(),allowed:__game.weaponAllowed()})`));
console.log('errors', errors);
ws.close();
