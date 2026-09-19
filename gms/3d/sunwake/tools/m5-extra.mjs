import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const p=await connect(),report={crossings:[]};
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');
 for(const sign of [-1,1])for(const boundary of [256,384]){
  await p.eval(`sunwakeTest.setPose({x:${sign*(boundary-8)},z:0,yaw:${sign*Math.PI/2}});sunwakeTest.setInput({throttle:1});sunwakeTest.advance(300)`);
  const s=await p.eval('sunwake');assert.ok(sign*s.x>boundary);assert.ok(s.clearance>=-1e-6);report.crossings.push({sign,boundary,x:s.x,origin:s.origin});
 }
 await p.eval('sunwakeTest.setPose({x:1e7,z:-1e7,yaw:-Math.PI/2});sunwakeTest.setInput({throttle:1});sunwakeTest.advance(120)');
 for(let i=0;i<30;i++)await p.eval('sunwakeTest.advance(1)');
 report.large=await p.eval('sunwake');report.probe=await p.eval('sunwakeTest.probeWaves()');
 assert.ok(report.large.clearance>=-1e-6);await p.shot(new URL('../docs/evidence/m5-large.png',import.meta.url).pathname);
 assert.deepEqual(p.errors,[]);report.errors=p.errors;console.log('PASS M5 signed boundary sailing and large world');
}finally{await writeFile(new URL('../docs/evidence/m5-extra.json',import.meta.url),JSON.stringify(report,null,2));await p.close();}
