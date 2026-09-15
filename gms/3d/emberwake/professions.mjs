import {level,addXP,fishHealing} from './state.mjs';

export const JOBS={
 wood:{skill:'Woodcutting',item:'wood',name:'Woodcutting',verb:'Cutting driftwood',seconds:2.4,xp:30,color:'#d4bc88'},
 ore:{skill:'Mining',item:'ore',name:'Mining',verb:'Mining copper',seconds:2.8,xp:35,color:'#eca773'},
 fish:{skill:'Fishing',item:'raw',name:'Fishing',verb:'Fishing silverfin',seconds:3.2,xp:40,color:'#97ead8'}
};
export const nextMastery=(s,skill)=>(s.mastery[skill]+1)*5;
export const canMaster=(s,skill)=>Object.hasOwn(s.mastery,skill)&&s.mastery[skill]<20&&level(s.xp[skill])>=nextMastery(s,skill);
export const cycleSeconds=(s,kind)=>JOBS[kind].seconds/Math.min(1.6,1+(level(s.xp[JOBS[kind].skill])-1)*.015);
export function gather(s,kind){
 const job=JOBS[kind];if(!job)return null;
 const rank=s.mastery[job.skill],count=kind==='fish'?1:1+Math.floor(rank/2);
 if(s.bag[job.item]+count>1e9)return null;
 s.bag[job.item]+=count;const up=addXP(s,job.skill,job.xp);
 return {job,count,up};
}
export function masteryBenefit(s,skill){
 const rank=s.mastery[skill];
 return skill==='Fishing'?`All fish: +${rank*2} sale coins · meals heal ${fishHealing(s)}. Next rank: +2 sale coins, +5 healing (100 max).`:
 `+${rank*2} sale coins · ${1+Math.floor(rank/2)} resources per cycle. Next rank: +2 sale coins; every second rank adds one resource.`;
}
export const GOODS={wood:{name:'Driftwood',skill:'Woodcutting',sell:2,buy:9},ore:{name:'Copper ore',skill:'Mining',sell:3,buy:11},raw:{name:'Raw silverfin',skill:'Fishing',sell:3,buy:10},fish:{name:'Cooked silverfin',skill:'Fishing',sell:6,buy:17}};
// Both prices follow mastery so buying a stack and selling it cannot generate coins.
export function price(s,item,side){const good=GOODS[item];return good&&['buy','sell'].includes(side)?good[side]+s.mastery[good.skill]*2:null;}
export function trade(s,item,side,quantity=1){
 if(!Object.hasOwn(GOODS,item)||!['buy','sell'].includes(side)||!Number.isSafeInteger(quantity)||quantity<1)return false;
 const total=price(s,item,side)*quantity;if(!Number.isSafeInteger(total))return false;
 if(side==='buy'){if(s.coins<total||s.bag[item]+quantity>1e9)return false;s.coins-=total;s.bag[item]+=quantity;}
 else{if(s.bag[item]<quantity||s.coins+total>1e9)return false;s.bag[item]-=quantity;s.coins+=total;}
 return true;
}

// Challenge state is transient. Only a completed challenge awards one eligible rank.
export function createChallenge(s,skill){
 if(!canMaster(s,skill))return null;
 const rank=s.mastery[skill],over=Math.min(20,level(s.xp[skill])-(rank+1)*5);
 return {skill,rank,over,elapsed:0,progress:0,tension:.22,status:'playing',hits:0,misses:0,cursor:0,target:4,sequence:0,cooldown:0};
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
 }else if(c.skill==='Woodcutting'){
  c.cursor=(Math.sin(c.elapsed*(2.2-c.over*.025)-Math.PI/2)+1)/2;
  if(c.elapsed>=30)c.status='escaped';
 }else if(c.elapsed>=30)c.status='escaped';
 return c;
}
export function strikeChallenge(c,cell){
 if(c.status!=='playing'||c.cooldown>0||c.skill==='Fishing')return false;
 c.cooldown=.3;
 const hit=c.skill==='Woodcutting'?Math.abs(c.cursor-.5)<=.14+c.over*.004:cell===c.target;
 if(hit){c.hits++;c.progress=c.hits/6;if(c.skill==='Mining'){c.sequence++;c.target=(c.target+2+c.sequence%5)%9;}if(c.hits>=6)c.status='won';}
 else{c.misses++;if(c.misses>=3)c.status='missed';}
 return hit;
}
export function awardMastery(s,c){
 if(!c||c.status!=='won'||s.mastery[c.skill]!==c.rank||!canMaster(s,c.skill))return false;
 s.mastery[c.skill]++;c.status='claimed';return true;
}
