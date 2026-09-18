import {writeFileSync} from 'fs';
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const win=(await send('Browser.getWindowForTarget')).result;
const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(n,Buffer.from(r.result.data,'base64'));};
const vp=async(w,h)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});await sleep(450);};

let rows=[];
for(const [w,h,tag] of [[390,844,'portrait'],[844,390,'landscape']]){
  await vp(w,h);
  await send('Page.navigate',{url:URL}); await sleep(3800);
  await ev(`localStorage.removeItem('bp2_profile')`);
  await ev(`(()=>{const P=BP2.Profile.get();P.trainingDone=true;P.cleared={0:1,1:1,2:1};P.level=3;P.sp=2400;BP2.Profile.save();return 1})()`);
  await send('Page.navigate',{url:URL}); await sleep(3800);
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);
  // the hub
  await ev(`BP2.Campaign.openHub('start')`); await sleep(500);
  await shot(`p4_hub_${tag}.png`);
  const hub = await ev(`(()=>{const c=document.querySelector('#hubScreen .card');const r=c.getBoundingClientRect();
    const cards=[...document.querySelectorAll('.lvcard')];
    const tiny=cards.filter(e=>parseFloat(getComputedStyle(e.querySelector('.nm')).fontSize)<11).length;
    return {w:innerWidth,h:innerHeight,cardW:Math.round(r.width),hscroll:document.documentElement.scrollWidth>innerWidth,
      scroll:c.scrollHeight>c.clientHeight, n:cards.length, tiny,
      btn:(()=>{const b=document.getElementById('btnHubDeploy').getBoundingClientRect();
        return {top:Math.round(b.top),bottom:Math.round(b.bottom),on:b.top>=0&&b.bottom<=innerHeight};})()};})()`);
  // in-round: capture HUD + boss bar + radio all at once
  await ev(`__game.loadLevel(3);__game.god(true)`); await sleep(1200);
  await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
    __game.teleport(1.5,24.5);__game.look(Math.PI,0);
    b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.state='combat';b.sawPlayer=true;
    BP2.Campaign.Radio.play([['CONTROL','HOLD THE OVERLOOK. THEY ARE COMING UP THE RAMP.',20]]);return 1})()`);
  await sleep(900);
  await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);return 1})()`);
  await sleep(400);
  await shot(`p4_hud_${tag}.png`);
  const hud = await ev(`(()=>{
    const R=id=>{const e=document.getElementById(id);if(!e||e.classList.contains('hidden'))return null;
      const b=e.getBoundingClientRect();return {l:Math.round(b.left),r:Math.round(b.right),t:Math.round(b.top),b:Math.round(b.bottom)};};
    const hit=(a,b)=>!!(a&&b&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b);
    const o=R('objHud'),bb=R('bossBar'),rd=R('radio'),mp=R('mapwrap'),tm=R('timer'),vt=R('vitals'),am=R('ammoBox'),wb=R('wbtns');
    return {vw:innerWidth,vh:innerHeight,obj:o,boss:bb,radio:rd,
      objOn:!!o&&o.l>=0&&o.r<=innerWidth&&o.b<=innerHeight,
      bossOn:!!bb&&bb.l>=0&&bb.r<=innerWidth&&bb.b<=innerHeight,
      radioOn:!!rd&&rd.l>=0&&rd.r<=innerWidth&&rd.b<=innerHeight,
      objVsMap:hit(o,mp), objVsBoss:hit(o,bb), bossVsMap:hit(bb,mp), bossVsTimer:hit(bb,tm),
      radioVsVitals:hit(rd,vt), radioVsAmmo:hit(rd,am), radioVsWbtns:hit(rd,wb)};})()`);
  rows.push({tag,hub,hud});
}
console.log(JSON.stringify(rows,null,1));
console.log('errors',errors);
await send('Emulation.clearDeviceMetricsOverride');
await send('Browser.setWindowBounds',{windowId:win.windowId,bounds:win.bounds});
ws.close();process.exit(0);
