/* P5d boot verification: file:// and http://, portrait 390x844 and landscape
   844x390.  The game boots straight onto #introScreen (it is a gate, and
   #startScreen stays hidden), and the thumb sticks are hold-drag — they live
   off-screen until a finger lands — so both are driven, not just measured.
   /favicon.ico is the BROWSER's own request and is not the game's error.     */
import {connect, sleep} from '/Users/aaronair/cc/yru/site/gms/3d/breachpoint2/tests/lib.mjs';
const FILE='file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html';
const HTTP='http://127.0.0.1:8777/gms/3d/breachpoint2/index.html';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const win = (await send('Browser.getWindowForTarget')).result;

let pass=0, fail=0, tid=100;
const ok=(n,c,d='')=>{ if(c){pass++;console.log('  ok   '+n+(d?`   [${d}]`:''));}
  else {fail++;console.log('  FAIL '+n+(d?`   [${d}]`:''));} };
// the ONLY 404 on this page is the browser's own /favicon.ico request (proved
// against the server log and the Network domain), and file:// never makes it.
const real = ()=>errors.filter(e=>!(/Failed to load resource/.test(e)&&/404/.test(e)));
const touch=async(type,x,y,id)=>send('Input.dispatchTouchEvent',
  {type, touchPoints: type==='touchEnd'?[]:[{x,y,id}]});

for(const [proto,url] of [['file://',FILE],['http://',HTTP]]){
  for(const [orient,w,h] of [['portrait',390,844],['landscape',844,390]]){
    console.log(`\n=== ${proto} ${orient} ${w}x${h} ===`);
    await send('Emulation.setDeviceMetricsOverride',
      {width:w,height:h,deviceScaleFactor:2,mobile:true,
       screenOrientation:{type:orient==='portrait'?'portraitPrimary':'landscapePrimary',
                          angle:orient==='portrait'?0:90}});
    errors.length=0;
    await send('Page.navigate',{url:url+'?boot='+orient}); await sleep(3200);
    const tag=`${proto}${orient}`;

    const boot = await ev(`(()=>{const g=window.__game;
      return {three:typeof THREE!=='undefined', game:!!g, bp2:!!window.BP2,
        canvas:!!document.querySelector('#app canvas'),
        modules:document.querySelectorAll('script[type="module"]').length,
        state:g&&g.GAME.state, dc:g&&g.drawCalls(),
        loadGone:(document.getElementById('loadWrap').className||'').includes('hidden')};})()`);
    ok(`${tag}: THREE, BP2 and __game up, a canvas drawing, loading panel gone`,
       boot.three&&boot.game&&boot.bp2&&boot.canvas&&boot.loadGone, JSON.stringify(boot));
    ok(`${tag}: zero type="module" script tags`, boot.modules===0, 'modules='+boot.modules);

    const gate = await ev(`(()=>{const d=document.documentElement,b=document.body;
      const el=document.getElementById('introScreen');
      const go=document.getElementById('btnIntroGo');
      const r=go.getBoundingClientRect();
      const off=[...el.querySelectorAll('*')].filter(e=>{const q=e.getBoundingClientRect();
        return q.width>2 && (q.left<-1 || q.right>d.clientWidth+1);}).map(e=>e.id||e.className);
      let tiny=0, sample='';
      for(const e of el.querySelectorAll('*')){
        const q=e.getBoundingClientRect(); if(q.width<1||q.height<1) continue;
        if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) continue;
        const fs=parseFloat(getComputedStyle(e).fontSize);
        if(fs<10){tiny++; if(!sample) sample=(e.id||e.className)+'@'+fs+'px';} }
      return {shown:!el.classList.contains('hidden'),
        hs:Math.max(d.scrollWidth,b.scrollWidth)-d.clientWidth,
        vs:el.scrollHeight>el.clientHeight+1,
        go:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
        vw:d.clientWidth, vh:d.clientHeight, off:off.length, offWhat:off.slice(0,3), tiny, sample};})()`);
    ok(`${tag}: the instruction gate is up and nothing overflows it sideways`,
       gate.shown && gate.hs<=0 && gate.off===0, JSON.stringify({hs:gate.hs,off:gate.off,w:gate.offWhat}));
    ok(`${tag}: BEGIN TRAINING is inside the viewport and thumb-sized`,
       gate.go.x>=0 && gate.go.y>=0 && gate.go.x+gate.go.w<=gate.vw+1 &&
       gate.go.y+gate.go.h<=gate.vh+1 && gate.go.h>=40,
       `${gate.go.w}x${gate.go.h} at ${gate.go.x},${gate.go.y} in ${gate.vw}x${gate.vh}`);
    ok(`${tag}: no text under 10px on the gate`, gate.tiny===0, gate.tiny?gate.sample:'none');

    // through the gate with a real tap
    await touch('touchStart', gate.go.x+gate.go.w/2, gate.go.y+gate.go.h/2, ++tid);
    await touch('touchEnd', 0,0, tid);
    await sleep(1800);
    const played = await ev(`(()=>{const el=document.getElementById('introScreen');
      return {gateShut:el.classList.contains('hidden'), state:__game.GAME.state};})()`);
    ok(`${tag}: one tap on BEGIN TRAINING shuts the gate and starts the drill`,
       played.gateShut && played.state==='play', JSON.stringify(played));

    // the hold-drag sticks: they only exist under a finger
    // one finger at a time — a hold-drag stick is raised where the finger lands
    const half = Math.round(gate.vw/2);
    const probeStick = async (id, px, py) => {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id}]});
      await sleep(260);
      const r = await ev(`(()=>{const d=document.documentElement;
        const g=id=>{const e=document.getElementById(id); const b=e.getBoundingClientRect();
          const cs=getComputedStyle(e);
          return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),
                  shown:cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity)>0.05};};
        return {stick:g('stick'), lstick:g('lstick'), reload:g('btnReload'), pause:g('btnPause'),
          vw:d.clientWidth, vh:d.clientHeight,
          hs:Math.max(d.scrollWidth,document.body.scrollWidth)-d.clientWidth};})()`);
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await sleep(180);
      return r;
    };
    const L = await probeStick(++tid, Math.round(half*0.45), Math.round(gate.vh*0.75));
    const R = await probeStick(++tid, Math.round(half*1.5),  Math.round(gate.vh*0.6));
    const sticks = {stick:L.stick, lstick:R.lstick, reload:L.reload, pause:L.pause,
                    vw:L.vw, vh:L.vh, hs:L.hs};
    const inView=o=>o&&o.shown&&o.x>=-2&&o.y>=-2&&o.x+o.w<=sticks.vw+2&&o.y+o.h<=sticks.vh+2&&o.w>=40&&o.h>=40;
    ok(`${tag}: a finger on each half raises both thumb sticks, fully on screen`,
       inView(sticks.stick)&&inView(sticks.lstick),
       `move ${JSON.stringify(sticks.stick)} look ${JSON.stringify(sticks.lstick)}`);
    ok(`${tag}: RELOAD and PAUSE are on screen at >=40px`,
       inView(sticks.reload)&&inView(sticks.pause),
       `reload ${sticks.reload.w}x${sticks.reload.h}@${sticks.reload.x},${sticks.reload.y} · pause ${sticks.pause.w}x${sticks.pause.h}@${sticks.pause.x},${sticks.pause.y}`);
    ok(`${tag}: no horizontal page scroll, in the gate or in play`,
       gate.hs<=0 && sticks.hs<=0, `gate ${gate.hs}px · play ${sticks.hs}px`);

    ok(`${tag}: ZERO console errors (favicon.ico is the browser's own request)`,
       real().length===0, real().length? real().slice(0,3).join(' | ') : 'clean');
    await ev(`setTimeout(()=>{throw new Error('CANARY-BOOT-${orient}')},10)`); await sleep(400);
    ok(`${tag}: CANARY — the collector was alive for all of that`,
       errors.some(e=>/CANARY-BOOT/.test(e)), errors.some(e=>/CANARY-BOOT/.test(e))?'seen':'COLLECTOR BLIND');
  }
}
await send('Emulation.clearDeviceMetricsOverride');
await send('Browser.setWindowBounds',{windowId:win.windowId, bounds:{width:win.bounds.width,height:win.bounds.height}});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
