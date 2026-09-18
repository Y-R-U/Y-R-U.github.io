const PORT=9223; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(); const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errors.push(m.params.args.map(a=>a.value).join(' '));};
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));
  return r.result.result.value;};
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html'});
await sleep(3500);

// 1. win condition on the 2-target training level
console.log('--- win flow, L0 (2 targets)');
await ev(`__game.Profile.reset(); __game.loadLevel(0)`);
await sleep(600);
await ev(`__game.Enemies.list().filter(e=>e.active).forEach(e=>__game.Enemies.damage(e, 999, false, null))`);
await sleep(1500);
console.log(await ev(`({state:__game.GAME.state, ended:__game.GAME.ended, kills:__game.GAME.stats.kills, roster:__game.GAME.rosterSize,
  title:document.getElementById('endTitle').textContent, sub:document.getElementById('endSub').textContent,
  statRow:document.querySelector('#statGrid .stat .v').textContent, sp:__game.Profile.get().sp,
  cleared:__game.Profile.get().cleared, nextLevel:__game.Profile.get().level})`));

// 2. live combat + armour gate + regen, rank 0 vs rank 5
for(const [rank,lvl] of [[0,1],[5,1],[5,8]]){
  await ev(`__game.Profile.setRank('plating',${rank}); __game.loadLevel(${lvl});
    __game.teleport(-8,-6); __game.Enemies.list().filter(e=>e.active).forEach(e=>{e.pos.set(-8+Math.random()*6-3,e.pos.y,-12+Math.random()*4);e.state='combat';e.sawPlayer=true;e.reaction=0;});
    __game.GAME.graceT=0;`);
  const before = await ev(`({hp:__game.player.hp, ar:+__game.player.armor.toFixed(1), max:__game.player.armorMax})`);
  await sleep(6000);
  const after = await ev(`({hp:+__game.player.hp.toFixed(1), ar:+__game.player.armor.toFixed(1), state:__game.GAME.state, attackers:__game.Enemies.attackerCount()})`);
  // stop the shooting and watch regen
  await ev(`__game.god(true)`);
  await sleep(5000);
  const regen = await ev(`({ar:+__game.player.armor.toFixed(1), hp:+__game.player.hp.toFixed(1)})`);
  await ev(`__game.god(false)`);
  console.log(`plating r${rank} on L${lvl}: before`, before, '-> after 6s', after, '-> +5s no-damage regen', regen);
}
console.log('errors:', errors.length? errors.slice(0,5) : '(none)');
ws.close(); process.exit(0);
