import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createChatter,voiceFor} from '../js/core/chatter.mjs';
const clips=[];for(const voice of ['crumb','spud','peas','titch','general'])for(const event of ['move','hold','join','fire','idle','win'])for(let i=0;i<3;i++)clips.push({id:`${voice}-${event}-${i}`,voice,event,text:event,file:'test.mp3'});
const make=()=>({units:[{id:0,rosterId:0,team:'blue',hp:100,active:true},{id:1,rosterId:1,team:'blue',hp:100,active:true}]});
const tests={
 'dead soldiers never answer'(factory){const w=make(),d=factory(clips,()=>0);w.units[0].hp=0;assert.equal(d.offer('move',w,100,{unit:0}),false);},
 'death invalidates a queued reply'(factory){const w=make(),d=factory(clips,()=>0);d.offer('move',w,100,{unit:0});w.units[0].hp=0;assert.equal(d.take(w,101),null);},
 'urgent danger outranks idle'(factory){const w=make(),d=factory(clips,()=>0);d.offer('idle',w,100,{unit:0,priority:10});d.offer('fire',w,100,{unit:1,priority:95});d.offer('idle',w,100,{unit:0,priority:10});assert.equal(d.take(w,100).event,'fire');},
 'urgent danger interrupts a low priority line'(factory){const w=make(),d=factory(clips,()=>0);d.offer('fire',w,100,{unit:0,priority:95});assert.equal(d.take(w,100,{priority:10}).event,'fire');},
 'commands supersede queued welcome or idle chatter'(factory){const w=make(),d=factory(clips,()=>0);d.offer('idle',w,100,{unit:0,priority:35});d.offer('move',w,100,{unit:0,priority:60});assert.equal(d.snapshot().queued.length,1);assert.equal(d.take(w,100,{priority:35}).event,'move');},
 'ordinary replies never overlap speech'(factory){const w=make(),d=factory(clips,()=>0);d.offer('move',w,100,{unit:0,priority:60});assert.equal(d.take(w,100,{priority:60}),null);},
 'stale orders expire'(factory){const w=make(),d=factory(clips,()=>0);d.offer('move',w,100,{unit:0,ttl:2});assert.equal(d.take(w,103),null);},
 'rapid toggles invalidate the old hold acknowledgement'(factory){const w=make(),d=factory(clips,()=>0);w.units[0].active=false;d.offer('hold',w,100,{unit:0,active:false});w.units[0].active=true;assert.equal(d.take(w,101),null);},
 'spam stays bounded and category cooldown applies'(factory){const w=make(),d=factory(clips,()=>0);for(let i=0;i<100;i++)d.offer('move',w,100,{unit:0});assert.equal(d.snapshot().queued.length,1);assert.ok(d.take(w,100));assert.equal(d.offer('move',w,101,{unit:0}),false);},
 'repeated commands use different takes'(factory){const w=make(),d=factory(clips,()=>0),ids=[];for(const t of [100,106,112]){assert.ok(d.offer('move',w,t,{unit:0}));ids.push(d.take(w,t).clip.id);}assert.equal(new Set(ids).size,3);},
 'reset clears all pending speech'(factory){const w=make(),d=factory(clips,()=>0);d.offer('fire',w,100,{unit:0,priority:95});d.clear();assert.equal(d.take(w,100),null);},
 'empty manifest is a silent fallback'(factory){const d=factory([],()=>0);assert.equal(d.offer('move',make(),100),false);assert.equal(d.take(make(),100),null);},
 'campaign narrator does not require surviving soldiers'(factory){const w={units:[]},d=factory(clips,()=>0);assert.equal(d.offer('win',w,100,{voice:'general'}),true);assert.equal(d.take(w,100).voice,'general');},
};
const passed=[];for(const [name,test]of Object.entries(tests)){test(createChatter);passed.push(name);console.log('PASS',name);}
assert.equal(voiceFor({id:0,rosterId:7}),'titch');assert.equal(voiceFor({id:90,escort:true}),'biscuit');
const source=await readFile(new URL('../js/core/chatter.mjs',import.meta.url),'utf8');
const mutants=[['dead guard removed',source.replace("u.hp>0","true"),'dead soldiers never answer'],['priority reversed',source.replace('b.priority-a.priority','a.priority-b.priority'),'urgent danger outranks idle'],['expiry removed',source.replace('q.expires>now','true'),'stale orders expire']];
const falsified=[];
for(const [name,code,test]of mutants){assert.notEqual(code,source);const bad=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));assert.throws(()=>tests[test](bad.createChatter),assert.AssertionError,`Gate must reject ${name}`);falsified.push(name);console.log('REJECTED MUTANT',name);}
await writeFile(new URL('../docs/evidence/voices-unit.json',import.meta.url),JSON.stringify({passed,falsified},null,2));
