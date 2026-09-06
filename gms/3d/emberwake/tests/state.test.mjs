import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,forge,eat,addXP,level,threshold,validate,ready} from '../state.mjs';
test('forge consumes exactly the required materials and cannot duplicate rewards',()=>{const s=fresh();assert.equal(forge(s),false);s.bag.wood=3;s.bag.ore=2;assert(forge(s));assert.equal(s.bag.wood,1);assert.equal(s.bag.ore,0);assert.equal(s.xp.Smithing,120);assert.equal(forge(s),false);assert.equal(s.xp.Smithing,120)});
test('levels and remaining XP agree at every boundary',()=>{for(let n=1;n<100;n++){assert.equal(level(threshold(n)),n);if(n>1)assert.equal(level(threshold(n)-1),n-1)}});
test('food is consumed only when healing and cannot over-heal',()=>{let s=fresh();assert.equal(eat(s),false);assert.equal(s.bag.fish,3);s.hp=90;assert(eat(s));assert.equal(s.hp,100);assert.equal(s.bag.fish,2);s.bag.fish=0;s.hp=20;assert.equal(eat(s),false)});
test('story requires both melee styles and magic practice',()=>{let s=fresh();s.stage=3;s.training=[3,2,0];assert.equal(ready(s),false);s.training[1]++;assert(ready(s));s.stage=4;assert.equal(ready(s),false);s.training[2]=3;assert(ready(s));s.stage=5;s.kills=[0,1];assert.equal(ready(s),false);s.kills.push(2);assert(ready(s))});
test('save validation rejects broken progress and survives JSON round trip',()=>{let s=fresh();addXP(s,'Magic',180);assert.deepEqual(validate(JSON.parse(JSON.stringify(s))),s);assert.equal(validate({...s,stage:99}),null);assert.equal(validate({...s,xp:{}}),null);assert.equal(validate({...s,training:['bad',0,0]}),null);assert.equal(validate(null),null)});
