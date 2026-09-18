import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,validate,threshold,fishHealing,eat} from '../state.mjs';
import {gather,canMaster,nextMastery,createChallenge,stepChallenge,strikeChallenge,awardMastery,price,trade,cycleSeconds} from '../professions.mjs';

test('version 2 journeys migrate with supplies, story and XP intact',()=>{
 const s=fresh();Object.assign(s,{version:2,region:'mainland',mainStage:4,coins:undefined,mastery:undefined});s.xp.Fishing=2400;s.bag.raw=18;
 const v=validate(JSON.parse(JSON.stringify(s)));assert.equal(v.version,4);assert.equal(v.coins,20);assert.equal(v.mastery.Fishing,0);assert.equal(v.bag.raw,18);assert.equal(v.xp.Fishing,2400);assert.equal(v.mainStage,4);
});
test('new saves reject invalid currency and unearned ranks',()=>{
 const s=fresh();for(const coins of [-1,1.5,Infinity,1e9+1])assert.equal(validate({...s,coins}),null);
 for(const rank of [-1,1,NaN,1.5])assert.equal(validate({...s,mastery:{...s.mastery,Fishing:rank}}),null);
 assert.equal(validate({...s,mastery:null}),null);
});
test('mastery opens at level 5 and catches up one rank at a time',()=>{
 const s=fresh();assert(!canMaster(s,'Fishing'));assert.equal(createChallenge(s,'Fishing'),null);
 s.xp.Fishing=threshold(5)-1;assert(!canMaster(s,'Fishing'));s.xp.Fishing++;assert(canMaster(s,'Fishing'));
 const c=createChallenge(s,'Fishing');assert(!awardMastery(s,c));c.status='won';assert(awardMastery(s,c));assert.equal(s.mastery.Fishing,1);assert(!awardMastery(s,c));assert(!canMaster(s,'Fishing'));assert.equal(nextMastery(s,'Fishing'),10);
 s.xp.Fishing=threshold(15);for(let rank=2;rank<=3;rank++){const c=createChallenge(s,'Fishing');c.status='won';assert(awardMastery(s,c));assert.equal(s.mastery.Fishing,rank);}assert(!canMaster(s,'Fishing'));
});
test('fishing mastery upgrades all stored meals and future catches',()=>{
 const s=fresh();s.xp.Fishing=threshold(5);s.hp=1;const c=createChallenge(s,'Fishing');c.status='won';awardMastery(s,c);
 assert.equal(fishHealing(s),50);assert.equal(price(s,'raw','sell'),5);assert.equal(price(s,'fish','sell'),8);eat(s);assert.equal(s.hp,51);
 gather(s,'fish');assert.equal(s.bag.raw,1);assert.equal(s.xp.Fishing,1040);
});
test('wood and mining mastery provide deterministic extra yield',()=>{
 const s=fresh();s.mastery.Woodcutting=2;s.mastery.Mining=4;
 assert.equal(gather(s,'wood').count,2);assert.equal(gather(s,'ore').count,3);assert.equal(s.bag.wood,2);assert.equal(s.bag.ore,3);assert.equal(s.xp.Mining,35);
 const slow=cycleSeconds(s,'fish');s.xp.Fishing=threshold(20);assert(cycleSeconds(s,'fish')<slow);
});
test('shop transactions are atomic and cannot sell story items or mint coins',()=>{
 const s=fresh(),before=structuredClone(s);assert(!trade(s,'wood','buy',99));assert(!trade(s,'wood','sell'));assert(!trade(s,'embers','sell'));assert(!trade(s,'fish','sell',-1));assert(!trade(s,'fish','gift'));assert(!trade(s,'fish','sell',.5));assert.deepEqual(s,before);
 for(const rank of [0,1,10,20]){s.mastery.Fishing=rank;s.coins=100;assert(trade(s,'fish','buy'));assert(trade(s,'fish','sell'));assert(s.coins<100);}
 s.bag.wood=10;assert(trade(s,'wood','sell',10));assert.equal(s.bag.wood,0);
});
function runFish(over=0,control=c=>c.tension<.7){const s=fresh();s.xp.Fishing=threshold(5+over);const c=createChallenge(s,'Fishing');for(let i=0;i<1500&&c.status==='playing';i++)stepChallenge(c,.025,control(c));return c;}
test('holding forever snaps the line; releasing forever loses the fish',()=>{assert.equal(runFish(0,()=>true).status,'snapped');assert.equal(runFish(0,()=>false).status,'escaped');});
test('managed fishing tension wins and overlevelling makes it faster',()=>{const a=runFish(),b=runFish(10);assert.equal(a.status,'won');assert.equal(b.status,'won');assert(b.elapsed<a.elapsed);});
test('woodcutting needs timed hits and three misses end a challenge',()=>{
 const s=fresh();s.xp.Woodcutting=threshold(5);let c=createChallenge(s,'Woodcutting');
 for(let i=0;i<1500&&c.status==='playing';i++){stepChallenge(c,.025);if(Math.abs(c.cursor-.5)<.04)strikeChallenge(c);}assert.equal(c.status,'won');assert.equal(c.hits,6);
 c=createChallenge(s,'Woodcutting');for(let i=0;i<3;i++){c.cursor=0;c.cooldown=0;strikeChallenge(c);}assert.equal(c.status,'missed');assert(!awardMastery(s,c));
});
test('mining targets change and six correct strikes earn exactly one rank',()=>{
 const s=fresh();s.xp.Mining=threshold(5);const c=createChallenge(s,'Mining');
 for(let i=0;i<6;i++){const prev=c.target;c.cooldown=0;assert(strikeChallenge(c,c.target));if(i<5)assert.notEqual(prev,c.target);}
 assert(awardMastery(s,c));assert(!awardMastery(s,c));assert.equal(validate(s).mastery.Mining,1);
});
