import {connect, sleep} from './lib.mjs';
import {writeFileSync} from 'fs';
const base = process.argv[2], tag = process.argv[3];
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:base+'/index.html'});
await sleep(2800);
const PIN = `__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`;
await ev(PIN); await sleep(300);
const shot = async name=>{ const r=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(`${name}`, Buffer.from(r.result.data,'base64')); };
// 1. the yard itself, rigs hidden — this is the mergeGeos claim
await ev(`__game.loadLevel(1);__game.teleport(1.5,24.5);__game.look(0,0)`); await sleep(1100);
await ev(`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`);
await sleep(500);
await ev(`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`);
await sleep(250);
await shot(`p5b_yard_${tag}.png`);
// 2. a lone enemy, close, pinned + frozen (rig detail)
await ev(`(()=>{const G=__game;G.loadLevel(1);G.teleport(0,10);G.look(Math.PI,0);
  const L=G.Enemies.list();L.forEach((e,i)=>{if(i>0&&e.active){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;}});
  const e=L[0];e.active=true;e.alive=true;e.rig.root.visible=true;e.pos.set(0,G.groundAt(0,3,4,0.3),3);e.yaw=Math.PI;e.aimYaw=Math.PI;e.state='patrol';e.vel.set(0,0,0);return 1;})()`);
await sleep(900); await shot(`p5b_rig_near_${tag}.png`);
// 3. the same enemy at 26 m (mid band) and 40 m (far band)
for(const d of [26,40]){
  await ev(`(()=>{const G=__game,e=G.Enemies.list()[0];e.pos.set(0,G.groundAt(0,${d},4,0.3),${d});e.yaw=Math.PI;e.aimYaw=Math.PI;e.vel.set(0,0,0);G.teleport(0,0);G.look(Math.PI,0);return 1;})()`);
  await sleep(700); await shot(`p5b_rig_${d}m_${tag}.png`);
}
// 4. the boss, close
await ev(`(()=>{const G=__game;G.loadLevel(4);return 1;})()`); await sleep(1200);
await ev(`(()=>{const G=__game,L=G.Enemies.list();const b=L.filter(e=>e.active&&e.boss)[0];
  L.forEach(e=>{if(e!==b&&e.active){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;}});
  b.pos.set(0,G.groundAt(0,3,4,0.3),3);b.yaw=Math.PI;b.aimYaw=Math.PI;b.state='patrol';b.vel.set(0,0,0);
  G.teleport(0,10);G.look(Math.PI,0);G.setLight(0);return b.name;})()`);
await sleep(900); await shot(`p5b_boss_${tag}.png`);
// 5. the paintball drill
await ev(`(()=>{const G=__game;G.loadLevel(0);G.teleport(1.5,24.5);G.look(0,0);return G.paintball();})()`);
await sleep(1400); await shot(`p5b_paint_${tag}.png`);
console.log(tag,'errors',errors.filter(e=>!/CANARY/.test(e)).length, errors.slice(0,2));
process.exit(0);
