import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
const evidence=new URL('../docs/evidence/',import.meta.url).pathname,report={date:new Date().toISOString(),checks:[]};
const p=await connect();
async function click(selector){const r=await p.eval(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...r}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);}
async function ground(x,z){const point=await p.eval(`tinpotTest.project(${x},${z})`);await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...point}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);}
function pass(name){report.checks.push(name);console.log('PASS',name);}
try{
 await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
 assert.equal(await p.eval('tinpot.speech.available'),148,'All voice clips must be installed');
 await p.eval("localStorage.removeItem('tinpot.test.campaign');localStorage.removeItem('tinpot.audio')");await p.send('Page.reload',{ignoreCache:true});await p.wait('window.__TINPOT_BOOTED__');
 assert.equal(await p.eval('tinpot.speech.spoken'),0,'No attract-screen voice before a gesture');
 pass('full cast installed; title stays quiet before interaction');
 await click('[data-action="start"]');
 await p.wait("tinpot.speech.speaking && tinpot.speech.last.event==='brief0'",10000);
 await sleep(400);assert.ok(await p.eval('tinpot.speech.duck')>.8);assert.ok(await p.eval('tinpot.audio.voices.some(v=>v.volume>0&&v.volume<tinpot.audio.settings.music*.45)'));
 report.briefing=await p.eval('tinpot.speech');pass('real MP3 briefing plays and ducks the music');
 await click('[data-action="deploy"]');await sleep(300);
 assert.notEqual(await p.eval('tinpot.speech.current?.event'),'brief0','Briefing must stop on deploy');
 await p.wait('!tinpot.speech.speaking && !tinpot.speech.loading',10000);
 await ground(0,6);await p.wait("tinpot.speech.speaking && tinpot.speech.last.event==='move'",6000);
 assert.ok(await p.eval("document.querySelector('.unit-card.on-radio')"));
 await p.shot(evidence+'voices-speaking-390.png');pass('real ground command triggers a voiced reply and card indicator');
 await click('.pause');await sleep(180);assert.equal(await p.eval('tinpot.speech.speaking'),false);assert.equal(await p.eval('tinpot.speech.queued.length'),0);pass('pause cancels playback and pending orders');
 await click('.pause');await p.eval("tinpotTest.fixture('m4')");await sleep(200);await click('.unit-toggle[data-id="1"]');
 await p.wait("tinpot.speech.speaking && tinpot.speech.last.event==='hold'",6000);assert.equal(await p.eval('tinpot.speech.current.unit'),1);pass('individual card order uses the commanded soldier');
 await p.eval("tinpotTest.fixture('m2')");await sleep(200);await p.eval("tinpotTest.voice('idle',0)");await p.wait("tinpot.speech.speaking && tinpot.speech.last.event==='idle'",6000);
 await p.eval('tinpotTest.smite(1)');await sleep(200);assert.notEqual(await p.eval('tinpot.speech.current?.unit'),0);pass('a dead soldier cannot finish his queued or playing joke');
 await p.eval("tinpotTest.fixture('m2')");await sleep(200);
 // A fresh quiet fixture must produce its own timed chatter; do not inject the event.
 const idleBefore=await p.eval('tinpot.speech.spoken');
 await p.wait(`tinpot.speech.spoken>${idleBefore} && tinpot.speech.history.some(x=>x.event==='idle'&&x.at>performance.now()/1000-3)`,65000);
 pass('idle chatter happens naturally in quiet gameplay');
 await p.eval("tinpotTest.fixture('title')");await sleep(150);await click('[data-action="settings"]');
 await p.eval(`(()=>{const i=document.querySelector('[data-volume="voice"]');i.value='0';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.equal(await p.eval("JSON.parse(localStorage.getItem('tinpot.audio')).voice"),0);
 await click('[data-action="settings-close"]');await click('[data-action="start"]');await sleep(800);assert.equal(await p.eval('tinpot.speech.speaking'),false);assert.equal(await p.eval('tinpot.speech.queued.length'),0);
 await p.send('Page.reload',{ignoreCache:true});await p.wait('window.__TINPOT_BOOTED__');await sleep(200);assert.equal(await p.eval('tinpot.audio.settings.voice'),0);pass('speech mute persists across reload and prevents voice playback');
 await p.eval("tinpotTest.fixture('title')");await sleep(100);await click('[data-action="settings"]');
 for(const [width,height]of [[320,568],[390,844],[430,932]]){
  await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});await sleep(150);
  const bounds=await p.eval(`[...document.querySelectorAll('.volume-controls input')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}})`);
  for(const b of bounds){assert.ok(b.x>=0&&b.right<=width&&b.y>=0&&b.bottom<=height,JSON.stringify(b));assert.ok(b.h>=44);}
  assert.equal(await p.eval('document.documentElement.scrollWidth'),width);
  const overlap=await p.eval(`(()=>{const a=document.querySelector('.sound-heading').getBoundingClientRect(),b=document.querySelector('.volume-controls').getBoundingClientRect(),c=document.querySelector('.screen-bottom').getBoundingClientRect();return a.bottom>b.top||b.bottom>c.top;})()`);
  assert.equal(overlap,false,'settings must fit '+width+'x'+height);
  await p.shot(evidence+'voices-settings-'+width+'.png');
 }
 pass('voice settings fit 320/390/430px phones');
 // Restore normal sound in the isolated browser profile for the other game gates.
 await p.eval(`(()=>{const i=document.querySelector('[data-volume="voice"]');i.value='.85';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.deepEqual(p.errors,[]);assert.ok(p.requests.filter(r=>r.url.startsWith('http')).every(r=>r.url.startsWith(new URL(BASE).origin)));
 report.mp3Requests=p.requests.filter(r=>r.url.includes('/audio/voices/')&&r.url.includes('.mp3')).map(r=>r.url);assert.ok(report.mp3Requests.length>=4);
 report.snapshot=await p.eval('tinpot.speech');report.passed=true;pass('local MP3 requests, zero console/network/shader errors');
}catch(error){report.error=error.stack;report.snapshot=await p.eval('window.tinpot');await p.shot(evidence+'voices-failure.png');throw error;}
finally{await writeFile(evidence+'voices-browser.json',JSON.stringify(report,null,2));await p.close();}
