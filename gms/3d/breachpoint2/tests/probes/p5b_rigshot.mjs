import {connect, sleep} from './lib.mjs';
import {writeFileSync} from 'fs';
const base=process.argv[2], tag=process.argv[3];
const {send, ev} = await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:base+'/index.html'});
await sleep(2800);
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); await sleep(300);
const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(n,Buffer.from(r.result.data,'base64'));};
const solo=`(()=>{const G=__game,L=G.Enemies.list();L.forEach((e,i)=>{if(i>0&&e.active){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;}});
  document.getElementById('hud').style.display='none';return 1;})()`;
const put=(d,st)=>`(()=>{const G=__game,e=G.Enemies.list()[0];e.active=true;e.alive=true;e.hp=e.maxHp;e.rig.root.visible=true;
  e.state='${st}';e._aim=${st==='combat'?1:0};e.pos.set(0,G.groundAt(0,20-${d},4,0.3),20-${d});e.yaw=0;e.aimYaw=0;e.aimPitch=0;e.vel.set(0,0,0);e.walkPhase=0;
  G.teleport(0,20);G.look(0,0);return {d:+G.player.pos.distanceTo(e.pos).toFixed(1)};})()`;
await ev(`__game.loadLevel(1)`); await sleep(1200); await ev(solo);
for(const [d,st] of [[4,'patrol'],[4,'combat'],[26,'patrol'],[40,'patrol'],[40,'combat']]){
  await ev(put(d,st)); await sleep(650); await ev(put(d,st)); await sleep(350);
  await shot(`p5b_e${d}${st[0]}_${tag}.png`);
}
// boss, close
await ev(`__game.loadLevel(4)`); await sleep(1400);
const bn = await ev(`(()=>{const G=__game,L=G.Enemies.list();const b=L.filter(e=>e.active&&e.boss)[0];
  L.forEach(e=>{if(e!==b&&e.active){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;}});
  document.getElementById('hud').style.display='none';
  b.pos.set(0,G.groundAt(0,14,4,0.3),14);b.yaw=0;b.aimYaw=0;b.aimPitch=0;b.state='patrol';b._aim=0;b.vel.set(0,0,0);b.walkPhase=0;
  G.teleport(0,20);G.look(0,0);G.setLight(0);return b.name;})()`);
await sleep(900); await shot(`p5b_boss2_${tag}.png`);
// paintball targets
await ev(`__game.loadLevel(0)`); await sleep(1600);
await ev(`(()=>{const G=__game;document.getElementById('hud').style.display='none';
  const L=G.Enemies.list().filter(e=>e.active);L.forEach((e,i)=>{if(i>2){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;}});
  L.slice(0,3).forEach((e,i)=>{e.pos.set(-2.2+i*2.2,G.groundAt(-2.2+i*2.2,14,4,0.3),14);e.yaw=0;e.aimYaw=0;e.state='patrol';e._aim=0;e.vel.set(0,0,0);e.walkPhase=0;});
  G.teleport(0,20);G.look(0,0);return 1;})()`);
await sleep(900); await shot(`p5b_paint2_${tag}.png`);
console.log(tag,'boss',bn);
process.exit(0);
