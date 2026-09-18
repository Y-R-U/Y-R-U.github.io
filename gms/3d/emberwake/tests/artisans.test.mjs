import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,validate,threshold,fishHealing} from '../state.mjs';
import {craft,recipeInfo,workSeconds,createChallenge,stepChallenge,strikeChallenge,awardMastery,price,trade,buyTool,toolCost} from '../professions.mjs';

test('version 3 migration preserves earned gathering mastery and adds artisan defaults',()=>{
 const s=fresh();s.version=3;s.xp.Fishing=threshold(10);s.mastery.Fishing=2;s.coins=357;s.bag.raw=42;
 delete s.xp.Cooking;delete s.bag.ingot;delete s.mastery.Cooking;delete s.mastery.Smithing;delete s.tools;delete s.bladeTier;
 const v=validate(s);assert.equal(v.version,4);assert.equal(v.mastery.Fishing,2);assert.equal(v.coins,357);assert.equal(v.bag.raw,42);assert.equal(v.xp.Cooking,0);assert.equal(v.bladeTier,0);assert.equal(v.tools.Mining,0);
});
test('malformed version 4 equipment and missing artisan fields are rejected',()=>{
 const s=fresh();assert.equal(validate({...s,bladeTier:6}),null);assert.equal(validate({...s,tools:{...s.tools,Fishing:-1}}),null);assert.equal(validate({...s,mastery:{Fishing:0}}),null);
 const v=structuredClone(s);delete v.bag.ingot;assert.equal(validate(v),null);
});
test('cooking consumes exactly one raw fish and awards XP without duplicating food',()=>{
 const s=fresh(),before=structuredClone(s);assert.equal(craft(s,'meal'),null);assert.deepEqual(s,before);
 s.bag.raw=2;assert(craft(s,'meal'));assert.equal(s.bag.raw,1);assert.equal(s.bag.fish,4);assert.equal(s.xp.Cooking,35);assert(craft(s,'meal'));assert.equal(craft(s,'meal'),null);assert.equal(s.xp.Cooking,70);
});
test('Smithing preserves the tutorial gate and gives precise ingredient shortages',()=>{
 const s=fresh();s.bag.wood=s.bag.ore=5;assert.match(recipeInfo(s,'ingot').reason,/first copper blades/);assert.equal(craft(s,'ingot'),null);
 s.crafted=true;assert(craft(s,'ingot'));assert.equal(s.bag.wood,4);assert.equal(s.bag.ore,3);assert.equal(s.bag.ingot,1);assert.equal(s.xp.Smithing,55);
 s.bag.ore=0;assert.match(recipeInfo(s,'ingot').reason,/2 copper ore/);
});
test('tempering gives bounded permanent tiers and checks the next level/cost atomically',()=>{
 const s=fresh();s.crafted=true;s.bag.ingot=100;s.bag.wood=100;assert.equal(craft(s,'temper'),null);
 s.xp.Smithing=threshold(2);assert(craft(s,'temper'));assert.equal(s.bladeTier,1);assert.equal(s.bag.ingot,98);assert.equal(s.bag.wood,99);assert.equal(craft(s,'temper'),null);
 s.xp.Smithing=threshold(20);for(let i=0;i<4;i++)assert(craft(s,'temper'));assert.equal(s.bladeTier,5);const before=structuredClone(s);assert.equal(craft(s,'temper'),null);assert.deepEqual(s,before);assert(validate(s));
});
test('Cooking mastery improves stored meals and both artisan ranks speed production',()=>{
 const s=fresh();const cook=workSeconds(s,'fire'),smith=workSeconds(s,'forge');s.mastery.Cooking=2;s.mastery.Smithing=2;
 assert.equal(fishHealing(s),51);assert(workSeconds(s,'fire')<cook);assert(workSeconds(s,'forge')<smith);s.mastery.Fishing=20;assert.equal(fishHealing(s),100);
});
test('buying ingredients then crafting and selling is loss-making at any mastery mix',()=>{
 for(const fish of [0,1,20])for(const smith of [0,1,20])for(const gather of [0,1,20]){
  const s=fresh();s.crafted=true;s.coins=10000;s.mastery.Fishing=fish;s.mastery.Smithing=smith;s.mastery.Woodcutting=s.mastery.Mining=gather;
  const before=s.coins;assert(trade(s,'raw','buy'));assert(craft(s,'meal'));assert(trade(s,'fish','sell'));assert(s.coins<before);
  const start=s.coins;assert(trade(s,'ore','buy',2));assert(trade(s,'wood','buy'));assert(craft(s,'ingot'));assert(trade(s,'ingot','sell'));assert(s.coins<start);assert(price(s,'ingot','buy')>price(s,'ingot','sell'));
 }
});
test('tool purchases charge once per tier, accelerate work and stop at tier 3',()=>{
 const s=fresh();assert(!buyTool(s,'Fishing'));s.coins=10000;const base=workSeconds(s,'fish');
 for(let rank=1;rank<=3;rank++){const before=s.coins,cost=toolCost(s,'Fishing');assert(buyTool(s,'Fishing'));assert.equal(s.coins,before-cost);assert.equal(s.tools.Fishing,rank);}
 assert(!buyTool(s,'Fishing'));assert(!buyTool(s,'Cooking'));assert(workSeconds(s,'fish')<base);assert(validate(s));
});
function cooking(control){const s=fresh();s.xp.Cooking=threshold(5);const c=createChallenge(s,'Cooking');for(let i=0;i<1500&&c.status==='playing';i++)stepChallenge(c,.025,control(c));return c;}
test('Cooking needs heat management; constant heat burns, no heat times out',()=>{assert.equal(cooking(()=>true).status,'burnt');assert.equal(cooking(()=>false).status,'escaped');assert.equal(cooking(c=>c.heat<.58).status,'won');});
test('Smithing targets alternate and six timed strikes earn mastery exactly once',()=>{
 const s=fresh();s.xp.Smithing=threshold(5);const c=createChallenge(s,'Smithing');
 for(let i=0;i<1500&&c.status==='playing';i++){stepChallenge(c,.025);if(Math.abs(c.cursor-(c.hits%2?.3:.7))<.035)strikeChallenge(c);}
 assert.equal(c.status,'won');assert(awardMastery(s,c));assert(!awardMastery(s,c));assert.equal(s.mastery.Smithing,1);
});
