import assert from 'node:assert/strict';
import {createQuality} from '../js/platform/quality.mjs';
export function quality(){
 const applied=[],q=createQuality({apply:(...v)=>applied.push(v)});q.start();
 for(let i=0;i<600;i++)q.sample(40);assert.equal(q.snapshot().tier,'emergency');assert.equal(q.snapshot().scale,.75);assert.equal(q.snapshot().failed,true);
 q.setMode('high');for(let i=0;i<300;i++)q.sample(40);assert.equal(q.snapshot().tier,'emergency');assert.ok(q.snapshot().emergencyOverride);
 const up=createQuality({apply:()=>{},initial:'low'});for(let i=0;i<7000;i++)up.sample(10);assert.equal(up.snapshot().tier,'high');
 const slow=createQuality({apply:()=>{}});for(let i=0;i<900;i++)slow.sample(23);assert.ok(slow.snapshot().scale<1||slow.snapshot().tier!=='standard');
 return {slow:q.snapshot(),recovery:up.snapshot().tier,changes:applied.length};
}
