import {level,addXP,fishHealing} from './state.mjs';

export const JOBS={
 wood:{skill:'Woodcutting',item:'wood',name:'Woodcutting',verb:'Cutting driftwood',seconds:2.4,xp:30,color:'#d4bc88'},
 ore:{skill:'Mining',item:'ore',name:'Mining',verb:'Mining copper',seconds:2.8,xp:35,color:'#eca773'},
 fish:{skill:'Fishing',item:'raw',name:'Fishing',verb:'Fishing silverfin',seconds:3.2,xp:40,color:'#97ead8'},
 fire:{skill:'Cooking',item:'fish',name:'Cooking',verb:'Cooking silverfin',seconds:2.2,xp:35,color:'#e7ba77'},
 forge:{skill:'Smithing',item:'ingot',name:'Smithing',verb:'Working the forge',seconds:3.2,xp:55,color:'#f0a274'}
};
export const nextMastery=(s,skill)=>(s.mastery[skill]+1)*5;
export const canMaster=(s,skill)=>Object.hasOwn(s.mastery,skill)&&s.mastery[skill]<20&&level(s.xp[skill])>=nextMastery(s,skill);
export const cycleSeconds=(s,kind)=>JOBS[kind].seconds/(Math.min(1.6,1+(level(s.xp[JOBS[kind].skill])-1)*.015)*(1+(s.tools[JOBS[kind].skill]||0)*.2));
export function gather(s,kind){
 const job=JOBS[kind];if(!job||!['wood','ore','fish'].includes(kind))return null;
 const rank=s.mastery[job.skill],count=kind==='fish'?1:1+Math.floor(rank/2);
 if(s.bag[job.item]+count>1e9)return null;
 s.bag[job.item]+=count;const up=addXP(s,job.skill,job.xp);
 return {job,count,up};
}
export function masteryBenefit(s,skill){
 const rank=s.mastery[skill];
 if(skill==='Cooking')return `All meals heal ${fishHealing(s)}. Next rank: +3 healing (100 max). Every rank cooks 5% faster.`;
 if(skill==='Smithing')return `Ingots: up to +${rank*2} sale coins. Every rank smiths 5% faster. Temper blades for permanent melee damage.`;
 return skill==='Fishing'?`All fish: +${rank*2} sale coins · meals heal ${fishHealing(s)}. Next rank: +2 sale coins, +5 healing (100 max).`:
 `+${rank*2} sale coins · ${1+Math.floor(rank/2)} resources per cycle. Next rank: +2 sale coins; every second rank adds one resource.`;
}
export const GOODS={wood:{name:'Driftwood',skill:'Woodcutting',sell:2,buy:9},ore:{name:'Copper ore',skill:'Mining',sell:3,buy:11},raw:{name:'Raw silverfin',skill:'Fishing',sell:3,buy:10},fish:{name:'Cooked silverfin',skill:'Fishing',sell:6,buy:17},ingot:{name:'Copper ingot',skill:'Smithing',sell:8,buy:35}};
// Both prices follow mastery so buying a stack and selling it cannot generate coins.
export function price(s,item,side){const good=GOODS[item];if(!good||!['buy','sell'].includes(side))return null;let value=good[side]+s.mastery[good.skill]*2;if(item==='ingot'&&side==='sell')value=Math.min(value,2*price(s,'ore','buy')+price(s,'wood','buy')-1);return value;}
export function trade(s,item,side,quantity=1){
 if(!Object.hasOwn(GOODS,item)||!['buy','sell'].includes(side)||!Number.isSafeInteger(quantity)||quantity<1)return false;
 const total=price(s,item,side)*quantity;if(!Number.isSafeInteger(total))return false;
 if(side==='buy'){if(s.coins<total||s.bag[item]+quantity>1e9)return false;s.coins-=total;s.bag[item]+=quantity;}
 else{if(s.bag[item]<quantity||s.coins+total>1e9)return false;s.bag[item]-=quantity;s.coins+=total;}
 return true;
}

export const RECIPES={
 meal:{station:'fire',name:'Cook silverfin',skill:'Cooking',level:1,xp:35,ingredients:{raw:1},output:'fish',description:'A warm meal. Fishing and Cooking mastery improve every meal you own.'},
 ingot:{station:'forge',name:'Smelt copper ingot',skill:'Smithing',level:1,xp:55,ingredients:{ore:2,wood:1},output:'ingot',description:'Refine copper for stronger blades, or sell surplus ingots.'},
 temper:{station:'forge',name:'Temper blades',skill:'Smithing',level:2,xp:90,ingredients:{ingot:2,wood:1},description:'Permanent +2 sword and dagger damage per tier. Five tiers available.'}
};
export function recipeInfo(s,id){
 const r=RECIPES[id];if(!r)return null;
 const ingredients=id==='temper'?{ingot:2+s.bladeTier*2,wood:1+s.bladeTier}:r.ingredients;
 const requiredLevel=id==='temper'?2+s.bladeTier*3:r.level;
 const shortage=Object.entries(ingredients).filter(([item,n])=>s.bag[item]<n).map(([item,n])=>`${n-s.bag[item]} ${GOODS[item].name.toLowerCase()}`);
 const reason=r.station==='forge'&&!s.crafted?'Forge your first copper blades for Edda first.':id==='temper'&&s.bladeTier>=5?'Blades are fully tempered.':level(s.xp[r.skill])<requiredLevel?`${r.skill} level ${requiredLevel} required.`:shortage.length?`Need ${shortage.join(' and ')}.`:r.output&&s.bag[r.output]>=1e9?'No room for the result.':'';
 return {...r,ingredients,requiredLevel,reason,available:!reason};
}
export function craft(s,id){
 const r=recipeInfo(s,id);if(!r?.available)return null;
 for(const [item,n]of Object.entries(r.ingredients))s.bag[item]-=n;
 if(r.output)s.bag[r.output]++;else s.bladeTier++;
 const up=addXP(s,r.skill,r.xp);
 return {job:{...JOBS[r.station],xp:r.xp,item:r.output||'blade tier'},count:1,up};
}
export const workSeconds=(s,kind)=>cycleSeconds(s,kind)/(['fire','forge'].includes(kind)?1+s.mastery[JOBS[kind].skill]*.05:1);
export const toolCost=(s,skill)=>Object.hasOwn(s.tools,skill)&&s.tools[skill]<3?60*3**s.tools[skill]:null;
export function buyTool(s,skill){const cost=toolCost(s,skill);if(cost===null||s.coins<cost)return false;s.coins-=cost;s.tools[skill]++;return true;}

// Challenge state is transient. Only a completed challenge awards one eligible rank.
export function createChallenge(s,skill){
 if(!canMaster(s,skill))return null;
 const rank=s.mastery[skill],over=Math.min(20,level(s.xp[skill])-(rank+1)*5);
 return {skill,rank,over,elapsed:0,progress:0,tension:.22,heat:.3,status:'playing',hits:0,misses:0,cursor:0,target:4,sequence:0,cooldown:0};
}
export function stepChallenge(c,dt,held=false){
 if(c.status!=='playing'||!Number.isFinite(dt)||dt<=0)return c;
 dt=Math.min(.05,dt);c.elapsed+=dt;c.cooldown=Math.max(0,c.cooldown-dt);
 if(c.skill==='Fishing'){
  const surge=.035*(1+Math.sin(c.elapsed*2.1));
  c.tension=Math.max(0,c.tension+dt*(held?.24+surge-c.over*.004:-.40));
  c.progress=Math.max(0,c.progress+dt*(held?.115+c.over*.002:-.048));
  if(c.tension>=1)c.status='snapped';
  else if(c.progress>=1)c.status='won';
  else if(c.elapsed>=35)c.status='escaped';
 }else if(c.skill==='Cooking'){
  c.heat=Math.max(0,c.heat+dt*(held?.29:-.19));
  if(Math.abs(c.heat-.58)<=.13+c.over*.003)c.progress+=dt/(9-c.over*.1);
  if(c.heat>=1)c.status='burnt';else if(c.progress>=1)c.status='won';else if(c.elapsed>=30)c.status='escaped';
 }else if(c.skill==='Smithing'){
  c.cursor=(Math.sin(c.elapsed*(2.5-c.over*.03)-Math.PI/2)+1)/2;
  if(c.elapsed>=30)c.status='escaped';
 }else if(c.skill==='Woodcutting'){
  c.cursor=(Math.sin(c.elapsed*(2.2-c.over*.025)-Math.PI/2)+1)/2;
  if(c.elapsed>=30)c.status='escaped';
 }else if(c.elapsed>=30)c.status='escaped';
 return c;
}
export function strikeChallenge(c,cell){
 if(c.status!=='playing'||c.cooldown>0||['Fishing','Cooking'].includes(c.skill))return false;
 c.cooldown=.3;
 const hit=c.skill==='Woodcutting'?Math.abs(c.cursor-.5)<=.14+c.over*.004:c.skill==='Smithing'?Math.abs(c.cursor-(c.hits%2?.3:.7))<=.12+c.over*.003:cell===c.target;
 if(hit){c.hits++;c.progress=c.hits/6;if(c.skill==='Mining'){c.sequence++;c.target=(c.target+2+c.sequence%5)%9;}if(c.hits>=6)c.status='won';}
 else{c.misses++;if(c.misses>=3)c.status='missed';}
 return hit;
}
export function awardMastery(s,c){
 if(!c||c.status!=='won'||s.mastery[c.skill]!==c.rank||!canMaster(s,c.skill))return false;
 s.mastery[c.skill]++;c.status='claimed';return true;
}
