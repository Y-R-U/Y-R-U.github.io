/* P4b — LEVEL VARIETY.  Per-level container layouts, nav rebake, insertion
   points.  The bar for this phase is PATHING, not screenshots: a silently
   failing A* looks exactly like a working game in a screenshot.            */
import {connect,URL,sleep} from './lib.mjs';
const {send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
let pass=0, fail=0; const fails=[];
const ok=(name,cond,info)=>{ if(cond){pass++;console.log('PASS  '+name+(info?'   '+info:''));}
  else {fail++;fails.push(name);console.log('FAIL  '+name+'   '+(info||''));} };
const nav=async()=>{ await send('Page.navigate',{url:URL}); await sleep(2600);
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); await ev(`__game.start()`); await sleep(400); };
await nav();

/* ---- 0. error canary ---------------------------------------------------- */
try{ await ev(`(()=>{throw new Error('CANARY')})()`); }catch(e){}
await ev(`setTimeout(()=>{throw new Error('CANARY')},0)`); await sleep(400);
ok('CANARY(errors): the collector sees a thrown error', errors.some(e=>/CANARY/.test(e)),
   errors.filter(e=>/CANARY/.test(e))[0]?.slice(0,50));
const dropCanary=()=>{ for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1); };
dropCanary();

/* ---- 1. the layouts exist and only one is ever drawn -------------------- */
const LI = await ev(`(()=>({n:__game.LAYOUTS.length, names:__game.LAYOUTS.map(l=>l.name),
  pal:__game.LAYOUTS.map(l=>l.pal.length), cons:__game.LAYOUTS.map(l=>l.cons.length),
  meshes:__game.layoutInfo().meshes}))()`);
ok('five distinct container layouts are built at load', LI.n===5 && LI.names.length===5, LI.names.join(' / '));
ok('every layout is exactly 6 merged meshes (5 palette colours + 1 frame mesh)',
   LI.meshes.every(m=>m===6) && LI.pal.every(p=>p===5), `meshes=${LI.meshes} pal=${LI.pal} containers=${LI.cons}`);
const perLevel=[];
for(let n=0;n<=9;n++){
  perLevel.push(await ev(`(()=>{__game.loadLevel(${n});const i=__game.layoutInfo();
    return {n:${n}, lay:i.id, name:i.name, vis:i.visibleMeshes, on:i.solids, off:i.offSolids,
      cover:i.cover, bakes:i.bakes, colliders:i.colliders};})()`));
}
ok('exactly one layout is visible on every level (6 meshes, never 30)',
   perLevel.every(p=>p.vis===6), perLevel.map(p=>p.vis).join(','));
ok('the level table uses all five layouts', new Set(perLevel.map(p=>p.lay)).size===5,
   perLevel.map(p=>`L${p.n}:${p.lay}`).join(' '));
ok('the inactive layouts are switched off in solids[] as well as in the scene',
   perLevel.every(p=>p.on>0 && p.off>0) && new Set(perLevel.map(p=>p.on+p.off)).size===1,
   `on/off = ${perLevel.map(p=>p.on+'/'+p.off).join(' ')} (total ${perLevel[0].on+perLevel[0].off} container solids, always)`);
ok('NAV rebakes on every layout change and the cover set changes with it',
   new Set(perLevel.map(p=>p.cover)).size===5, perLevel.map(p=>`${p.name}:${p.cover}`).filter((v,i,a)=>a.indexOf(v)===i).join(' '));
ok('worldColliders is swapped, not grown: same length on every level',
   new Set(perLevel.map(p=>p.colliders)).size===1, String(perLevel[0].colliders));

/* ---- 2. the nav arrays are refilled, never reallocated ------------------ */
await ev(`(()=>{window.__nb=__game.NAV.blocked; window.__nc=__game.NAV.coverH;
  window.__nv=__game.NAV.cover; window.__nh=__game.NAV.heapSize(); return 1;})()`);
const beforeBakes = await ev(`__game.layoutInfo().bakes`);
for(const n of [2,3,4,5,6,7,8,1]) { await ev(`__game.loadLevel(${n})`); }
const navId = await ev(`(()=>({b:window.__nb===__game.NAV.blocked, c:window.__nc===__game.NAV.coverH,
  v:window.__nv===__game.NAV.cover, heap:window.__nh===__game.NAV.heapSize(), heapN:__game.NAV.heapSize(),
  cells:__game.NAV.N*__game.NAV.N, bakes:__game.layoutInfo().bakes}))()`);
ok('blocked / coverH / cover[] are the SAME objects after 8 relayouts (refilled, not reallocated)',
   navId.b && navId.c && navId.v, JSON.stringify({blocked:navId.b,coverH:navId.c,cover:navId.v}));
ok('the A* heap is never resized and still dwarfs the cell count',
   navId.heap && navId.heapN===navId.cells*10+1, `heap=${navId.heapN} cells=${navId.cells}`);
ok('every relayout actually rebaked', navId.bakes-beforeBakes>=5, `${beforeBakes} -> ${navId.bakes}`);

/* ---- 3. THE HEADLINE: every enemy can path to the insertion point ------- */
const PATHS=[];
for(let n=0;n<=9;n++){
  PATHS.push(await ev(`(()=>{__game.loadLevel(${n});
    const ins=__game.insertPoint();
    const es=__game.enemyInfo();
    let bad=0, worst=null, steps=0;
    for(const e of es){
      const r=__game.navPath(e.x,e.z,ins.x,ins.z);
      const near = r.end? Math.hypot(r.end.x-ins.x, r.end.z-ins.z) : 99;
      if(!r.ok || near>2.0){ bad++; if(!worst) worst={e:e.name,x:e.x,z:e.z,ok:r.ok,near:+near.toFixed(2)}; }
      steps+=r.steps;
    }
    return {n:${n}, lay:__game.layout(), name:__game.layoutInfo().name, count:es.length, bad, worst,
      avgSteps:Math.round(steps/Math.max(1,es.length)), ins};})()`));
}
for(const p of PATHS)
  ok(`L${p.n} (${p.name}): all ${p.count} enemies path to the insertion point`,
     p.bad===0 && p.count>0, `bad=${p.bad} avg ${p.avgSteps} waypoints${p.worst?' worst '+JSON.stringify(p.worst):''}`);

/* ---- 4. and they actually CLOSE — a dead A* is enemies standing still --- */
const CLOSE=[];
for(const n of [1,2,3,4,5,6,7,8]){
  await ev(`(()=>{__game.loadLevel(${n});__game.god(true);
    __game.Enemies.list().forEach(e=>{if(e.active&&e.alive){e.state='combat';e.sawPlayer=true;e.stateT=0;
      e.lastSeen.copy(__game.player.pos);}});return 1;})()`);
  const d0 = await ev(`(()=>{const p=__game.player.pos;return __game.enemyInfo().map(e=>Math.hypot(e.x-p.x,e.z-p.z));})()`);
  let moved=0;
  for(let i=0;i<20;i++){ await sleep(250);
    moved = await ev(`(()=>{const p=__game.player.pos;let s=0;
      for(const e of __game.Enemies.list()) if(e.active&&e.alive) s+=Math.hypot(e.pos.x-e.spawnX0,e.pos.z-e.spawnZ0)||0;
      return s;})()`).catch(()=>0);
  }
  const d1 = await ev(`(()=>{const p=__game.player.pos;return __game.enemyInfo().map(e=>Math.hypot(e.x-p.x,e.z-p.z));})()`);
  const closed = d0.map((d,i)=> d - d1[i]);
  const gained = closed.filter(c=>c>1.0).length;
  CLOSE.push({n, tot:d0.length, gained, med:+closed.slice().sort((a,b)=>a-b)[closed.length>>1].toFixed(2)});
}
for(const c of CLOSE)
  ok(`L${c.n}: the roster actually moves toward the insertion point over 5 s`,
     c.gained >= Math.ceil(c.tot*0.4), `${c.gained}/${c.tot} closed >1 m, median gain ${c.med} m`);

/* ---- 5. nothing is spawned, covered or objectived inside a solid -------- */
const GEOM=[];
for(let n=0;n<=9;n++){
  GEOM.push(await ev(`(()=>{__game.loadLevel(${n});
    const badSpawn=__game.enemyInfo().filter(e=>__game.pointBlocked(e.x,e.y+0.25,e.y+1.5,e.z,0.02)||__game.navBlocked(e.x,e.z)).length;
    const cov=__game.NAV.cover;
    let badCover=0;
    for(let i=0;i<cov.length;i++) if(__game.pointBlocked(cov[i].x,0.3,1.55,cov[i].z,0.30)) badCover++;
    const z=__game.objState().zone;
    let zoneBad=null;
    if(z){ zoneBad={blocked:__game.navBlocked(z.x,z.z),
      solid:__game.pointBlocked(z.x,0.25,1.6,z.z,0.30)}; }
    const ins=__game.insertPoint();
    const insBad = __game.pointBlocked(ins.x, (ins.y||0)+0.25, (ins.y||0)+1.5, ins.z, 0.02);
    return {n:${n}, badSpawn, badCover, cover:cov.length, zoneBad, insBad,
      insideAfterSpawn:__game.insideSolid()};})()`));
}
ok('no enemy spawn point lands inside an active solid or a blocked cell, on any level',
   GEOM.every(g=>g.badSpawn===0), GEOM.map(g=>`L${g.n}:${g.badSpawn}`).join(' '));
ok('no cover point sits inside an active solid, on any level',
   GEOM.every(g=>g.badCover===0), GEOM.map(g=>`L${g.n}:${g.badCover}/${g.cover}`).join(' '));
ok('the player insertion point is clear on every level (and the spawn does not wedge)',
   GEOM.every(g=>!g.insBad && !g.insideAfterSpawn), GEOM.map(g=>`L${g.n}:${g.insBad?'BLOCKED':'ok'}`).join(' '));
const zl = GEOM.filter(g=>g.zoneBad);
ok('every objective zone centre is free ground in its own layout',
   zl.length>0 && zl.every(g=>!g.zoneBad.blocked && !g.zoneBad.solid),
   zl.map(g=>`L${g.n}:${JSON.stringify(g.zoneBad)}`).join(' '));

/* ---- 6. a zone the layout walled off would be unwinnable ---------------- */
const zoneReach = async n => ev(`(()=>{__game.loadLevel(${n});
  const z=__game.objState().zone, ins=__game.insertPoint();
  const NAVg=__game.NAV, C=NAVg.CELL;
  let free=0, reach=0;
  for(let dx=-z.r; dx<=z.r; dx+=C) for(let dz=-z.r; dz<=z.r; dz+=C){
    if(Math.hypot(dx,dz)>z.r) continue;
    const x=z.x+dx, zz=z.z+dz;
    if(NAVg.isBlockedWorld(x,zz)) continue;
    free++;
    const r=__game.navPath(ins.x,ins.z,x,zz);
    if(r.ok && r.end && Math.hypot(r.end.x-x,r.end.z-zz)<C) reach++;
  }
  return {n:${n}, free, reach, frac:+(reach/Math.max(1,free)).toFixed(3)};})()`);
const zr1 = await zoneReach(1), zr3 = await zoneReach(3);
ok('L1 capture zone: its open ground is reachable from the insertion point',
   zr1.free>40 && zr1.frac>0.95, JSON.stringify(zr1));
ok('L3 hold zone: its open ground is reachable from the insertion point',
   zr3.free>40 && zr3.frac>0.95, JSON.stringify(zr3));

/* CANARY(gameplay): wall the L1 zone off and prove the check above FAILS.  */
const walled = await ev(`(()=>{__game.loadLevel(1);
  window.__nSolids=__game.solids.length;
  // a closed box around the capture zone: the quay kerb already seals the east
  const W=[[8.2,2,0.8,26],[17,-8.2,18,0.8],[17,12.2,18,0.8]];
  for(const [x,z,w,d] of W) __game.solids.push({x0:x-w/2,x1:x+w/2,y0:0,y1:3,z0:z-d/2,z1:z+d/2,climb:false});
  __game.NAV.bake();
  const z=__game.objState().zone, ins=__game.insertPoint(), C=__game.NAV.CELL;
  let free=0, reach=0;
  for(let dx=-z.r; dx<=z.r; dx+=C) for(let dz=-z.r; dz<=z.r; dz+=C){
    if(Math.hypot(dx,dz)>z.r) continue;
    const x=z.x+dx, zz=z.z+dz;
    if(__game.NAV.isBlockedWorld(x,zz)) continue;
    free++;
    const r=__game.navPath(ins.x,ins.z,x,zz);
    if(r.ok && r.end && Math.hypot(r.end.x-x,r.end.z-zz)<C) reach++;
  }
  return {free, reach, frac:+(reach/Math.max(1,free)).toFixed(3)};})()`);
ok('CANARY(gameplay): a solid wall across the L1 zone makes the reachability check FAIL',
   !(walled.free>40 && walled.frac>0.95), JSON.stringify(walled));
const unwalled = await ev(`(()=>{__game.solids.length=window.__nSolids;__game.NAV.bake();
  __game.loadLevel(1);
  const z=__game.objState().zone, ins=__game.insertPoint(), C=__game.NAV.CELL;
  let free=0,reach=0;
  for(let dx=-z.r; dx<=z.r; dx+=C) for(let dz=-z.r; dz<=z.r; dz+=C){
    if(Math.hypot(dx,dz)>z.r) continue;
    const x=z.x+dx, zz=z.z+dz;
    if(__game.NAV.isBlockedWorld(x,zz)) continue;
    free++; const r=__game.navPath(ins.x,ins.z,x,zz);
    if(r.ok&&r.end&&Math.hypot(r.end.x-x,r.end.z-zz)<C) reach++;
  }
  return {free,reach,frac:+(reach/Math.max(1,free)).toFixed(3)};})()`);
ok('and the same check passes again once the wall is removed',
   unwalled.free>40 && unwalled.frac>0.95, JSON.stringify(unwalled));

/* ---- 7. every objective type still completes on every level that uses it - */
const killWave = `(()=>{const l=__game.Enemies.list().filter(e=>e.active&&e.alive);
  for(const e of l) __game.Enemies.damage(e,9999,'head'); return 1;})()`;
const endState = ()=>ev(`(()=>({ended:__game.GAME.ended,won:__game.GAME.won,reason:__game.GAME.endReason||'',
  obj:__game.objState()}))()`).catch(()=>null);
// ELIMINATE: L2 (STACKS), L4 / L7 (FUNNEL), L8 (QUAY WALL)
for(const n of [2,4,7,8]){
  await nav();
  await ev(`__game.god(true);__game.loadLevel(${n})`); await sleep(400);
  await ev(killWave); await sleep(900);
  const st = await ev(`(()=>({alive:__game.Enemies.aliveCount(), done:__game.objState().done,
    state:__game.GAME.state}))()`);
  ok(`ELIMINATE completes on L${n} (${perLevel[n].name})`, st.alive===0 && st.done, JSON.stringify(st));
}
// CAPTURE: L1
await nav();
await ev(`__game.god(true);__game.loadLevel(1)`); await sleep(400);
await ev(killWave); await sleep(600);
let cap=null;
for(let i=0;i<70 && !(cap&&cap.done); i++){ await sleep(400);
  cap = await ev(`(()=>{__game.teleport(18,2);return __game.objState();})()`); }
ok('CAPTURE still completes on L1 with the YARD layout and the new insertion point',
   cap && cap.done, JSON.stringify({frac:cap&&cap.frac, done:cap&&cap.done}));
// HOLD: L3, through the real data path with a shortened meter
await nav();
const holdRes = await ev(`(()=>{BP2.LEVELS[3].hold=5;__game.god(true);__game.loadLevel(3);
  return __game.objState();})()`); await sleep(400);
await ev(killWave); await sleep(600);
let hold=null;
for(let i=0;i<40 && !(hold&&hold.done); i++){ await sleep(400);
  hold = await ev(`(()=>{const z=__game.objState().zone;__game.teleport(z.x,z.z);return __game.objState();})()`); }
await ev(`BP2.LEVELS[3].hold=45`);
ok('HOLD still completes on L3 with the OPEN GROUND layout',
   hold && hold.done, JSON.stringify({need:holdRes.need, frac:hold&&hold.frac, done:hold&&hold.done}));
ok('and LEVELS[3].hold is put back to 45', await ev(`BP2.LEVELS[3].hold`)===45);
// WAVES: L5 (QUAY WALL, 2 waves) and L6 (STACKS, 3 waves)
for(const [n,w] of [[5,2],[6,3]]){
  await nav();
  await ev(`__game.god(true);__game.loadLevel(${n})`); await sleep(400);
  const seen=[await ev('__game.objState()')];
  for(let k=1;k<w;k++){ await ev(killWave); await sleep(1000); seen.push(await ev('__game.objState()')); }
  await ev(killWave); await sleep(1100);
  const fin = await ev('__game.objState()');
  ok(`WAVES: all ${w} waves land and the round completes on L${n} (${perLevel[n].name})`,
     seen.every((sv,i)=>sv.wave===i+1 && sv.alive>0) && fin.done,
     seen.map(sv=>`w${sv.wave}:${sv.alive}`).join(' -> ')+` done=${fin.done}`);
}

/* ---- 8. draw calls do not grow with the number of layouts -------------- */
await nav();
const POSE=`__game.teleport(1.5,24.5);__game.look(0,0)`;
const medDraw = async ()=>{ const v=[];
  for(let i=0;i<9;i++){ await sleep(120);
    await ev(`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;});${POSE}`);
    v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b); return v[v.length>>1]; };
await ev(`__game.loadLevel(1);${POSE}`); await sleep(800);
const one = await medDraw();
await ev(`(()=>{for(const m of __game.scene.children) if(m.name&&m.name.indexOf('layout')===0) m.visible=false;return 1;})()`);
const none = await medDraw();
await ev(`(()=>{for(const m of __game.scene.children) if(m.name&&m.name.indexOf('layout')===0) m.visible=true;return 1;})()`);
const all5 = await medDraw();
console.log(`   static world, rigs hidden: no layout ${none} | one layout ${one} | all five ${all5}`);
ok('one layout costs exactly 6 draw calls — the six cont buckets it replaced', one-none===6, `${none} -> ${one}`);
ok('building five layouts does NOT grow the frame: only the visible one is drawn',
   all5-none===30 && one-none===6, `all five would be ${all5}, the game draws ${one}`);
// the headline number, from the reference pose the 112/114 figures came from
await nav();
const peak = async n =>{ await ev(`__game.loadLevel(${n});${POSE}`); let c=0;
  for(let i=0;i<16;i++){ await sleep(100); if(i%3===0) await ev(POSE);
    const v=await ev('__game.drawCalls()'); if(v>c)c=v; } return c; };
const p1=await peak(1), p8=await peak(8);
// P5b rebased the live figures (vertex colours + instanced distance LOD).
// The exact one is `one` above: the static world at the reference pose, 36.
ok('L1 draw calls at the reference pose are inside the post-P5b band (was 114)',
   p1>=36 && p1<=70, `calls=${p1}`);
// NOTE (P5b): this is a PEAK over ~1.6 s. Pre-P5b a rig cost the same wherever it
// stood, so the peak only sampled the frustum; now it also samples how close the
// squad has crowded, and a peak lands well above the median. The 120-150 target is
// on the MEDIAN with the pose pinned (p5b_test 1) — allow the peak more room.
ok('L8 peak is inside the post-P5b band (median target 120-150; was ~305)',
   p8>=110 && p8<=180, `calls=${p8}`);

/* ---- 9. the carried item: endless maxAttackers 6 -> 4 ------------------ */
const ma = await ev(`__game.LEVELS.map(l=>l.maxAttackers).join(',')`);
// REBASED BY P5c: this check's own claim is the ENDLESS 6 -> 4 carry, which is
// untouched. L5 went 3 -> 4 in P5c (coordinator's call, see PIPELINE).
ok('maxAttackers table is 1,2,2,3,3,4,4,4,4,4 (endless still 4, L5 raised by P5c)',
   ma==='1,2,2,3,3,4,4,4,4,4', ma);
ok('and the live endless level reports 4',
   await ev(`(()=>{__game.loadLevel(9);return __game.levelInfo().maxAttackers;})()`)===4);

/* ---- 10. insertion points really are per level ------------------------- */
const INS = await ev(`__game.LEVELS.map(l=>({n:l.id,x:l.insert.x,z:l.insert.z,y:l.insert.y||0,yaw:+l.insert.yaw.toFixed(3)}))`);
const uniq = new Set(INS.map(i=>i.x+','+i.z)).size;
ok('at least seven distinct insertion points across ten levels', uniq>=7, `${uniq} distinct: `+INS.map(i=>`L${i.n}(${i.x},${i.z})`).join(' '));
ok('L3 inserts you ON the parapet (y 4.4) and L4 inside the building at ground level',
   INS[3].y===4.4 && INS[4].y===0 && INS[4].x<-20, JSON.stringify([INS[3],INS[4]]));
const faced = await ev(`(()=>{__game.loadLevel(3);const p=__game.player;
  return {y:+p.pos.y.toFixed(2), yaw:+p.yaw.toFixed(3), fwdX:+(-Math.sin(p.yaw)).toFixed(2)};})()`);
ok('and the player really spawns up there facing out over the yard',
   faced.y>4 && faced.fwdX>0.8, JSON.stringify(faced));

/* ---- 11. the layouts change PLAY, not just scenery ---------------------- */
await nav();
// How much of the yard does each layout let the parapet cover? 154 sample
// points, ray-traced from a body standing on the platform. The first version
// of this check aimed at x=10, which is INSIDE the YARD corridor rows — it
// read 0/16 on YARD and on THE STACKS and "passed" without distinguishing
// them. Sample the whole yard instead.
const GRID = `(()=>{const out=[];
  for(let i=0;i<__game.LAYOUTS.length;i++){ __game.setLayout(i);
    let clear=0,n=0;
    for(let x=-6; x<=20; x+=2) for(let z=-16; z<=14; z+=3){ n++;
      if(__game.losClear(EYEX,EYEY,-2, x,1.5,z)) clear++; }
    out.push({name:__game.LAYOUTS[i].name, pct:Math.round(100*clear/n), clear, n}); }
  return out;})()`;
const fromPerch = await ev(GRID.replace('EYEX','-15.2').replace('EYEY','6.0'));
const fromYard  = await ev(GRID.replace('EYEX','-12').replace('EYEY','1.62'));
console.log('   yard covered FROM THE PARAPET: '+fromPerch.map(c=>`${c.name} ${c.pct}%`).join(' · '));
console.log('   yard covered FROM THE GROUND:  '+fromYard.map(c=>`${c.name} ${c.pct}%`).join(' · '));
const byName = Object.fromEntries(fromPerch.map(c=>[c.name,c.pct]));
ok('THE STACKS blinds the parapet — its blinder wall takes the perch out of the fight (V4)',
   byName['THE STACKS'] <= 5 && byName['YARD'] >= 25,
   `STACKS ${byName['THE STACKS']}% vs the YARD baseline ${byName['YARD']}%`);
ok('OPEN GROUND does the opposite: the perch sees most of the map (V4)',
   byName['OPEN GROUND'] >= 60 && byName['OPEN GROUND'] > byName['THE STACKS']*8,
   `OPEN GROUND ${byName['OPEN GROUND']}% vs STACKS ${byName['THE STACKS']}%`);
ok('every layout gives a different answer to "where can you shoot from"',
   new Set(fromPerch.map(c=>c.pct)).size===5, fromPerch.map(c=>c.pct).join(','));
const blockCounts = await ev(`(()=>{const out=[];
  for(let i=0;i<__game.LAYOUTS.length;i++){ __game.setLayout(i);
    let b=0; const N=__game.NAV.N;
    for(let k=0;k<N*N;k++) if(__game.NAV.blocked[k]) b++;
    out.push({name:__game.LAYOUTS[i].name, blocked:b, cover:__game.NAV.cover.length}); }
  return out;})()`);
console.log('   nav footprint per layout: '+blockCounts.map(b=>`${b.name} ${b.blocked} blocked / ${b.cover} cover`).join(' · '));
ok('every layout gives the nav grid a different shape',
   new Set(blockCounts.map(b=>b.blocked)).size===5, blockCounts.map(b=>b.blocked).join(','));
// connectivity: flood-fill the free cells the way A* is allowed to walk them.
// Two diagonals prove almost nothing; a stranded pocket is what actually bites,
// because an enemy spawned in one stands still for the whole round.
const comp = await ev(`(()=>{const out=[];
  const N=__game.NAV.N, B=__game.NAV.blocked;
  for(let li=0;li<__game.LAYOUTS.length;li++){ __game.setLayout(li);
    const seen=new Uint8Array(N*N);
    let free=0, best=0, comps=0;
    for(let k=0;k<N*N;k++) if(!B[k]) free++;
    for(let k0=0;k0<N*N;k0++){
      if(B[k0]||seen[k0]) continue;
      comps++;
      let n=0; const st=[k0]; seen[k0]=1;
      while(st.length){ const c=st.pop(); n++;
        const cx=c%N, cy=(c/N)|0;
        for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){
          if(!ox&&!oy) continue;
          const nx=cx+ox, ny=cy+oy;
          if(nx<0||ny<0||nx>=N||ny>=N) continue;
          const ni=ny*N+nx;
          if(B[ni]||seen[ni]) continue;
          if(ox&&oy && (B[cy*N+nx]||B[ny*N+cx])) continue;   // A* cannot cut corners
          seen[ni]=1; st.push(ni);
        } }
      if(n>best) best=n;
    }
    out.push({name:__game.LAYOUTS[li].name, free, main:best, comps, stranded:free-best});
  }
  return out;})()`);
console.log('   nav connectivity: '+comp.map(c=>`${c.name} ${c.main}/${c.free} (${c.comps} comps, ${c.stranded} stranded)`).join(' · '));
// YARD is the PRE-P4b container list, so whatever it strands is inherent to the
// permanent world (crane feet, kerb corners), not to the layout system. Every
// layout has to be at least as connected as that baseline.
const base = comp[0];
ok('no layout strands more than 2% of the yard, and none is worse than the pre-P4b YARD baseline',
   comp.every(c=>c.main/c.free >= 0.98) && comp.every(c=>c.stranded <= base.stranded+40),
   comp.map(c=>`${c.name} ${(100*c.main/c.free).toFixed(1)}%`).join(' · '));
// the thing that actually matters: the level's own insertion point is in the
// main component, so every spawn the game makes can reach the player.
const insMain = await ev(`(()=>{const out=[];
  for(let n=0;n<10;n++){ __game.loadLevel(n);
    const ins=__game.insertPoint();
    // walk out to all four corners from the insertion point
    let ok=true, steps=0;
    for(const [cx,cz] of [[-27,-27],[-27,24],[24,-27],[24,24]]){
      const r=__game.navPath(ins.x,ins.z,cx,cz); if(!r.ok) ok=false; steps+=r.steps; }
    out.push({n, lay:__game.layout(), ok, steps}); }
  return out;})()`);
console.log('   insertion point -> all four corners: '+insMain.map(c=>`L${c.n} ${c.steps}`).join(' · '));
ok('from every level\'s insertion point the whole yard is walkable — all four corners',
   insMain.every(c=>c.ok), JSON.stringify(insMain));

/* ---- 12. the training paint does not end up hanging in mid-air ---------- */
await nav();
const paint = await ev(`(()=>{
  // seven fake training splats on the YARD corridor container at (8.4,-3)
  const out=[];
  for(let i=0;i<7;i++) out.push({p:[7.10, 1.0+i*0.2, -3.0+ (i-3)*0.3],
    q:[0,0.7071,0,0.7071], s:0.3, c:0x39a0d8});
  localStorage.setItem('bp2_paint', JSON.stringify(out));
  return out.length;})()`);
const seat = async n => ev(`(()=>{__game.FX.clearPaint&&0;__game.loadLevel(${n});
  const ms=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.polygonOffsetFactor===-5&&o.visible);
  let floating=0, seated=0;
  for(const m of ms){ const p=m.position;
    if(p.y<0.12){ seated++; continue; }
    if(__game.pointBlocked(p.x,p.y-0.06,p.y+0.06,p.z,0.16)) seated++; else floating++; }
  return {n:${n}, vis:ms.length, floating, seated, persist:__game.FX.persistCount()};})()`);
const pr1 = await seat(1), pr2 = await seat(2), pr3 = await seat(3);
console.log('   paint after relayout: '+JSON.stringify([pr1,pr2,pr3]));
ok('training paint survives the layout swap with nothing left hanging in mid-air',
   pr1.vis>0 && pr2.vis>0 && pr3.vis>0 && pr1.floating===0 && pr2.floating===0 && pr3.floating===0,
   JSON.stringify([pr1,pr2,pr3]));
await ev(`localStorage.removeItem('bp2_paint')`);

dropCanary();
ok('zero errors across every level load, relayout and objective run',
   errors.length===0, errors.slice(0,3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed` + (fail?'  -> '+fails.join(', '):''));
process.exit(0);
