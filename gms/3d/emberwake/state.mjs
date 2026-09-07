export const SKILLS=['Melee','Magic','Woodcutting','Mining','Fishing','Smithing'];
export const threshold=level=>50*(level-1)*level;
export const level=xp=>Math.floor((1+Math.sqrt(1+4*xp/50))/2);
export const fresh=()=>({version:2,region:'lab',name:'Alex',gender:'male',labStep:0,mainStage:0,relays:[],mainKills:[],ledger:false,reinforced:false,clues:[],stage:0,hp:100,mana:100,x:0,z:18,weapon:0,crafted:false,magic:false,xp:Object.fromEntries(SKILLS.map(s=>[s,0])),bag:{wood:0,ore:0,raw:0,fish:3,embers:0},training:[0,0,0],kills:[],bossDead:false,beacon:false,belt:0,skills:0,muted:false});
export function addXP(s,skill,amount){const before=level(s.xp[skill]);s.xp[skill]+=amount;return level(s.xp[skill])>before}
export function ready(s){return[s.stage===0,s.bag.wood>=2&&s.bag.ore>=2,s.crafted,s.training[0]>=3&&s.training[1]>=3,s.training[2]>=3,s.kills.length>=3,s.bossDead,s.beacon][s.stage]||false}
export function forge(s){if(s.crafted)return false;if(s.bag.wood<2||s.bag.ore<2)return false;s.bag.wood-=2;s.bag.ore-=2;s.crafted=true;addXP(s,'Smithing',120);return true}
export function eat(s){if(s.bag.fish<1||s.hp>=100)return false;s.bag.fish--;s.hp=Math.min(100,s.hp+45);return true}
export const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[<>\p{Cc}\p{Cf}]/gu, '').trim().slice(0,24) || 'Alex';
export function repair(s,id){
 if(s.mainStage!==1||!['relay1','relay2','relay3'].includes(id)||s.relays.includes(id)||s.bag.wood<1||s.bag.ore<1)return false;
 s.bag.wood--;s.bag.ore--;s.relays.push(id);addXP(s,'Smithing',65);return true;
}
export function validate(raw){
 const d=fresh();if(!raw||![1,2].includes(raw.version))return null;
 for(const key of ['stage','hp','mana','x','z','weapon','belt','skills'])if(!Number.isFinite(raw[key]))return null;
 if(!Number.isInteger(raw.stage)||raw.stage<0||raw.stage>8||!Array.isArray(raw.training)||raw.training.length!==3||!raw.training.every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(raw.kills)||!raw.kills.every(n=>Number.isInteger(n)&&n>=0&&n<3))return null;
 if(!SKILLS.every(k=>Number.isFinite(raw.xp?.[k])&&raw.xp[k]>=0)||!Object.keys(d.bag).every(k=>Number.isFinite(raw.bag?.[k])&&raw.bag[k]>=0))return null;
 const s={...d,...raw,version:2};
 if(raw.version===1){s.region='island';s.labStep=3;s.name='Traveller';}
 if(!['lab','island','mainland'].includes(s.region)||!['male','female'].includes(s.gender))return null;
 if(!Number.isInteger(s.mainStage)||s.mainStage<0||s.mainStage>6||!Number.isInteger(s.labStep)||s.labStep<0||s.labStep>3)return null;
 if(!Array.isArray(s.relays)||!s.relays.every(id=>['relay1','relay2','relay3'].includes(id))||!Array.isArray(s.mainKills)||!s.mainKills.every(id=>[10,11,12].includes(id))||!Array.isArray(s.clues)||!s.clues.every(id=>typeof id==='string'))return null;
 s.name=cleanName(s.name);s.hp=Math.max(1,Math.min(100,s.hp));s.mana=Math.max(0,Math.min(100,s.mana));
 for(const k of ['weapon','belt','skills'])s[k]=Math.max(0,Math.min(2,Math.floor(s[k])));
 for(const k of ['kills','mainKills','relays','clues'])s[k]=[...new Set(s[k])];return s;
}
