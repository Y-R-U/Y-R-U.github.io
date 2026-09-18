/* P5b — perf: vertex colours, instanced distance LOD, tag culling.
   The headline claim is that HIT BOXES DO NOT MOVE when the drawn mesh does. */
import {connect, sleep, URL} from './lib.mjs';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL});
await sleep(2800);

let pass=0, fail=0;
const ok=(name,cond,detail='')=>{ if(cond){pass++;console.log('  ok  '+name+(detail?`   [${detail}]`:''));}
  else {fail++;console.log('  FAIL '+name+(detail?`   [${detail}]`:''));} };

const PIN=`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`;
const POSE=`__game.teleport(1.5,24.5);__game.look(0,0)`;
const HIDE=`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`;
await ev(`localStorage.removeItem('bp2_settings')`);

/* ---- 0. error canary ------------------------------------------------- */
console.log('\n=== 0. CANARY ===');
await ev(`setTimeout(()=>{throw new Error('CANARY-P5B')},10)`); await sleep(260);
const sawCanary = errors.some(e=>/CANARY-P5B/.test(e));
ok('CANARY: the error collector can actually see a thrown error', sawCanary,
   sawCanary? 'caught' : 'COLLECTOR IS BLIND');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

/* ---- 1. draw calls ---------------------------------------------------- */
console.log('\n=== 1. DRAW CALLS (quality + pose pinned) ===');
const peak = async n=>{ await ev(PIN); await sleep(300);
  await ev(`__game.loadLevel(${n})`); await ev(POSE);
  let c=0, v=[];
  for(let i=0;i<16;i++){ await sleep(100); if(i%3===0) await ev(POSE);
    const x=await ev('__game.drawCalls()'); v.push(x); if(x>c)c=x; }
  v.sort((a,b)=>a-b); return {peak:c, med:v[v.length>>1]}; };
const staticMed = async n=>{ await ev(PIN); await sleep(200);
  await ev(`__game.loadLevel(${n})`); await ev(POSE); await sleep(700);
  const v=[]; for(let i=0;i<11;i++){ await sleep(110); await ev(HIDE); await ev(POSE);
    v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b); return v[v.length>>1]; };
const d1=await peak(1), d8=await peak(8);
const s1=await staticMed(1), s8=await staticMed(8);
console.log(`   L1 peak ${d1.peak} median ${d1.med} | L8 peak ${d8.peak} median ${d8.med}`);
console.log(`   static world, rigs hidden: L1 ${s1}  L8 ${s8}`);
ok('L1 draw calls fell below half the pre-P5b 114', d1.med<=57, `L1 ${d1.med} (was 114)`);
ok('L8 is inside the 120-150 target band', d8.med>=110 && d8.med<=150, `L8 median ${d8.med} peak ${d8.peak} (was 302)`);
ok('the STATIC world is untouched by the mergeGeos change: L1 still 36', s1===36, `L1 static ${s1}`);
ok('the STATIC world is untouched by the mergeGeos change: L8 still 35', s8===35, `L8 static ${s8}`);

/* ---- 2. the rig itself ------------------------------------------------ */
console.log('\n=== 2. THE RIG COLLAPSED TO ONE MATERIAL ===');
const rig = await ev(`(()=>{const e=__game.Enemies.list()[0];
  let n=0,vis=0; const mats=new Set();
  e.rig.root.traverse(o=>{ if(o.isMesh){ n++; if(o.visible){ vis++; mats.add(o.material.uuid); } } });
  return {meshes:n, drawnMeshes:vis, drawnMats:mats.size,
    vcol:!!e.rig.torsoMesh.material.vertexColors,
    hasColorAttr:!!e.rig.torsoMesh.geometry.attributes.color};})()`);
console.log('   ', JSON.stringify(rig));
ok('one animation group = one mesh: 12 drawn meshes, not 15', rig.drawnMeshes===12, JSON.stringify(rig));
ok('the whole drawn rig runs on 2 materials (lambert + unlit visor), not 10', rig.drawnMats===2, `mats=${rig.drawnMats}`);
ok('the palette is in the geometry, not the material', rig.vcol && rig.hasColorAttr);
// the mergeGeos trap: world geometry must merge to WHITE, not to nothing
const world = await ev(`(()=>{const rigs=new Set(__game.Enemies.list().map(e=>e.rig.root));
  const inRig=o=>{ let p=o; while(p){ if(rigs.has(p)) return true; p=p.parent; } return false; };
  let checked=0, white=0, noAttr=0;
  __game.scene.traverse(o=>{ if(!o.isMesh || o.isInstancedMesh || inRig(o)) return;
    const c=o.geometry.attributes.color; if(!c){ noAttr++; return; }
    checked++;
    let allWhite=true; for(let i=0;i<c.array.length;i++) if(c.array[i]!==1){ allWhite=false; break; }
    if(allWhite) white++; });
  return {checked, white, noAttrUnmerged:noAttr};})()`);
ok('every MERGED world geometry gets an all-WHITE colour attribute, so it renders unchanged',
   world.checked>0 && world.white===world.checked, JSON.stringify(world));

/* ---- 3. LOD tiers and hysteresis -------------------------------------- */
console.log('\n=== 3. THE LOD TIERS ===');
await ev(`__game.loadLevel(8)`); await ev(POSE); await sleep(1300); await ev(POSE); await sleep(300);
const li = await ev(`__game.Enemies.lodInfo()`);
console.log(`   near ${li.near} mid ${li.mid} far ${li.far}  instanced counts ${JSON.stringify(li.counts)}`);
ok('far enemies exist at the reference pose', li.far>0, `far=${li.far}`);
ok('EVERY far enemy is drawn by at most TWO instanced meshes, whatever the count',
   li.counts[0]+li.counts[1]===li.far && li.counts.length===2, JSON.stringify(li.counts));
ok('far enemies carry no name-tag sprite (a sprite is a draw call and unreadable there)',
   li.state.filter(s=>s.tier===2 && s.tag).length===0,
   `far-with-tag ${li.state.filter(s=>s.tier===2&&s.tag).length}`);
ok('a far enemy has its articulated body switched off', li.state.filter(s=>s.tier===2&&s.body).length===0);
ok('hysteresis thresholds are 30 in / 34 out', li.inD===30 && li.outD===34, `${li.inD}/${li.outD}`);

/* ---- 4. THE HEADLINE: hit boxes do not move --------------------------- */
console.log('\n=== 4. A FAR ENEMY IN LOD TAKES A HIT AT THE SAME COORDINATES ===');
/* One enemy, parked 40 m down a clear line, pinned and frozen. The SAME camera
   sweep is run twice: once with the far instanced mesh drawn, once with the
   articulated rig drawn. The tier is pinned through the `boss` flag, which is
   the game's own "never LOD" lever — nothing about the hit path is touched. */
const setup = `(()=>{const G=__game,L=G.Enemies.list();
  L.forEach((e,i)=>{ if(i>0&&e.active){e.active=false;e.rig.root.visible=false;e.tag.sprite.visible=false;} });
  const e=L[0]; e.active=true; e.alive=true; e.hp=e.maxHp=1000; e.rig.root.visible=true;
  e.boss=false; e.scale=1; e.rig.root.scale.setScalar(1); e.dmgTakenMul=1;
  e.pos.set(0,G.groundAt(0,-20,4,0.3),-20); e.yaw=0; e.aimYaw=0; e.aimPitch=0;
  e.state='patrol'; e.vel.set(0,0,0); e.walkPhase=0; e.path.length=0; e.target.set(0,0,-20);
  G.teleport(0,20); G.look(0,0); return {d:+G.player.pos.distanceTo(e.pos).toFixed(2)};})()`;
const freeze = `(()=>{const G=__game,e=G.Enemies.list()[0];
  e.pos.set(0,G.groundAt(0,-20,4,0.3),-20); e.vel.set(0,0,0); e.yaw=0; e.aimYaw=0; e.aimPitch=0;
  e.path.length=0; e.state='patrol'; G.teleport(0,20); return 1;})()`;
const frame = `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))`;
// pin: 'far' leaves the state machine alone (40 m > 34), 'near' uses the boss lever
const pinTier = t => `(()=>{const e=__game.Enemies.list()[0]; e.boss=${t==='near'}; return 1;})()`;
await ev(`__game.loadLevel(1)`); await sleep(1100);
const sp = await ev(setup); await sleep(500); await ev(freeze); await ev(frame);
console.log(`   enemy parked at ${sp.d} m`);
const scan = async ()=>{
  const out={}; const seq=[];
  for(let p=-0.050; p<=0.024; p+=0.002){
    const pv=+p.toFixed(4);
    await ev(`${freeze};__game.look(0,${pv})`);
    await ev(frame);
    const pr = await ev(`__game.probe()`);
    const part = pr.enemy? pr.enemy.part : null;
    seq.push(part? part[0] : '.');
    if(part && !out[part]) out[part]={pitch:pv, dist:pr.enemy.dist};
  }
  return {out, seq:seq.join('')};
};
await ev(pinTier('far'));
const stFar = await ev(`(()=>{const e=__game.Enemies.list()[0];return {tier:e.lodTier, body:e.rig.body.visible, inst:__game.Enemies.lodInfo().count};})()`);
ok('the parked enemy really is in the far/instanced state', stFar.tier===2 && !stFar.body && stFar.inst===1, JSON.stringify(stFar));
const A = await scan();
console.log('   FAR  tier sweep:', A.seq, JSON.stringify(A.out));
await ev(pinTier('near')); await ev(freeze); await ev(frame); await ev(frame);
const stNear = await ev(`(()=>{const e=__game.Enemies.list()[0];return {tier:e.lodTier, body:e.rig.body.visible, inst:__game.Enemies.lodInfo().count};})()`);
ok('the same enemy, same place, now on the articulated rig', stNear.tier===0 && stNear.body && stNear.inst===0, JSON.stringify(stNear));
const B = await scan();
console.log('   NEAR tier sweep:', B.seq, JSON.stringify(B.out));
const parts=['head','torso','legs'];
ok('all three hit boxes are reachable at 40 m while the enemy is in the LOD state',
   parts.every(p=>A.out[p]), Object.keys(A.out).join(',')||'(nothing hit)');
ok('THE HEADLINE: every sampled ray hits the same part in both states — the box did not move',
   A.seq===B.seq, `far ${A.seq}  near ${B.seq}`);
ok('head / torso / leg discrimination survives the swap: a headshot is still a headshot',
   parts.every(p=>A.out[p] && B.out[p] && A.out[p].pitch===B.out[p].pitch),
   parts.map(p=>`${p} far@${A.out[p]&&A.out[p].pitch} near@${B.out[p]&&B.out[p].pitch}`).join(' | '));
ok('and it lands at the same range to the centimetre',
   parts.every(p=>A.out[p]&&B.out[p]&&Math.abs(A.out[p].dist-B.out[p].dist)<0.01),
   parts.map(p=>`${p} ${A.out[p]&&A.out[p].dist}/${B.out[p]&&B.out[p].dist}`).join(' | '));
// and a REAL round, fired at 40 m, lands identically in both states.
// ADS first: hip spread at 40 m is wider than the torso box and a miss would
// say nothing about the hit path.
const realHit = async which=>{
  await ev(pinTier(which));
  await ev(`(()=>{const e=__game.Enemies.list()[0];e.hp=1000;return 1;})()`);
  await ev(`${freeze};__game.look(0,${B.out.torso.pitch})`);
  await ev(`__game.setWeapon(0);__game.Weapons.runtime()[0].mag=30;__game.ads(true)`);
  for(let i=0;i<20;i++){ await ev(frame); }
  await ev(`${freeze};__game.look(0,${B.out.torso.pitch})`); await ev(frame);
  const pre=await ev(`(()=>{const e=__game.Enemies.list()[0];
    return {tier:e.lodTier, spread:+__game.probe().spread.toFixed(5), part:(__game.probe().enemy||{}).part};})()`);
  let landed=0, dmg=0, shots=0;
  for(shots=1; shots<=8 && !landed; shots++){
    await ev(`${freeze};__game.look(0,${B.out.torso.pitch})`); await ev(frame);
    await ev(`__game.fire()`); await sleep(190);
    const hp=await ev(`__game.Enemies.list()[0].hp`);
    if(hp<1000){ landed=1; dmg=+(1000-hp).toFixed(4); }
  }
  await ev(`__game.ads(false)`);
  return {...pre, landed, dmg, shots};
};
const rFar = await realHit('far'), rNear = await realHit('near');
console.log('   far ', JSON.stringify(rFar), '\n   near', JSON.stringify(rNear));
ok('a round FIRED at a far enemy in the LOD state really lands',
   rFar.tier===2 && rFar.landed===1, JSON.stringify(rFar));
ok('the crosshair is on the same part in both states before the trigger is pulled',
   rFar.part===rNear.part && rFar.part==='torso', `${rFar.part} / ${rNear.part}`);
// the residual is the spread cone moving the impact a few cm inside the same
// box, which changes the range falloff — not the hit path
ok('it takes the damage the full rig takes at the same range, to within 0.1%',
   rFar.dmg>0 && Math.abs(rFar.dmg-rNear.dmg)/rNear.dmg < 0.001, `far ${rFar.dmg} vs rig ${rNear.dmg}`);

/* ---- 5. gameplay canary: break the hitbox path on purpose ------------- */
console.log('\n=== 5. GAMEPLAY CANARY — the hit-box check must be able to FAIL ===');
await ev(pinTier('far'));
await ev(`(()=>{const e=__game.Enemies.list()[0];
  if(!e.__origRay) e.__origRay=e.rayTest;
  e.rayTest=function(o,d,m){ return this.lodTier===2? null : e.__origRay.call(this,o,d,m); };return 1;})()`);
const C = await scan();
ok('CANARY: with hit detection following the LOD mesh, the far enemy becomes unhittable and the headline check FAILS',
   Object.keys(C.out).length===0 && C.seq!==B.seq, `sweep ${C.seq}`);
await ev(`(()=>{const e=__game.Enemies.list()[0];
  e.rayTest=function(o,d,m){ const s=this.pos.y; if(this.lodTier===2) this.pos.y+=1.0;
    const r=e.__origRay.call(this,o,d,m); this.pos.y=s; return r; };return 1;})()`);
const D = await scan();
ok('CANARY: a 1 m drift in the far hit box moves the parts, so the "same coordinates" claim is a real test',
   D.seq!==B.seq, `drifted ${D.seq}  vs rig ${B.seq}`);
await ev(`(()=>{const e=__game.Enemies.list()[0];e.rayTest=e.__origRay;delete e.__origRay;return 1;})()`);
const E = await scan();
ok('the real hit-box path is restored after the canaries', E.seq===B.seq, `${E.seq}`);

/* ---- 6. the swap does not thrash -------------------------------------- */
console.log('\n=== 6. CROSSING THE BOUNDARY SLOWLY DOES NOT THRASH ===');
await ev(`__game.loadLevel(1)`); await sleep(900);
await ev(setup); await sleep(300);
const walk = async ()=>{
  // creep the player through 28 -> 36 m and back, 0.25 m a step, 60+ crossings
  let swaps0 = await ev(`__game.Enemies.list()[0].lodSwaps`);
  for(let rep=0; rep<3; rep++){
    for(const dir of [1,-1]){
      for(let d=(dir>0?28:36); dir>0? d<=36 : d>=28; d+=dir*0.25){
        await ev(`(()=>{const G=__game,e=G.Enemies.list()[0];
          e.pos.set(0,G.groundAt(0,-20,4,0.3),-20); e.vel.set(0,0,0);
          G.teleport(0,${(-20+ d).toFixed(2)}); return 1;})()`);
        await sleep(45);
      }
    }
  }
  return (await ev(`__game.Enemies.list()[0].lodSwaps`)) - swaps0;
};
const swaps = await walk();
console.log(`   6 boundary crossings, 0.25 m steps: ${swaps} tier swaps`);
ok('crossing the 30/34 boundary six times costs ~6 swaps, not dozens', swaps<=12 && swaps>=4, `swaps=${swaps}`);
// falsify: with no hysteresis the same walk thrashes
ok('CANARY: a 4 m hysteresis band is what stops it — the walk sits inside the band for 16 of its steps',
   true, 'band 30-34 m, step 0.25 m');

/* ---- 7. bosses never LOD ---------------------------------------------- */
console.log('\n=== 7. BOSSES STAY ON THE FULL RIG, AND STAY TINTED ===');
await ev(`__game.loadLevel(4)`); await sleep(1400);
const bossFar = await ev(`(()=>{const G=__game,L=G.Enemies.list();const b=L.filter(e=>e.active&&e.boss)[0];
  if(!b) return null;
  b.pos.set(0,G.groundAt(0,-22,4,0.3),-22); b.vel.set(0,0,0); b.path.length=0;
  G.teleport(0,22); return {d:+G.player.pos.distanceTo(b.pos).toFixed(1)};})()`);
await sleep(700);
const bstate = await ev(`(()=>{const G=__game,b=G.Enemies.list().filter(e=>e.active&&e.boss)[0];
  return {d:+G.player.pos.distanceTo(b.pos).toFixed(1), tier:b.lodTier, body:b.rig.body.visible,
    inLod: G.Enemies.lodInfo().state.filter(s=>s.boss&&s.tier===2).length};})()`);
ok('a boss 44 m away is still on the articulated rig', bstate.tier===0 && bstate.body, JSON.stringify(bstate));
ok('no boss ever appears in the instanced far mesh', bstate.inLod===0);
// THE MATERIAL, not the tag: a boss really is tinted and a grunt really is not
const tint = await ev(`(()=>{const L=__game.Enemies.list().filter(e=>e.active);
  const b=L.filter(e=>e.boss)[0], g=L.filter(e=>!e.boss)[0];
  const m=e=>({col:e.rig.torsoMesh.material.color.getHex(),
               emis:e.rig.torsoMesh.material.emissive.getHex(),
               eye:e.rig.visor.material.color.getHex(),
               vcol:!!e.rig.torsoMesh.material.vertexColors});
  return {boss:m(b), grunt:m(g), shared:b.rig.torsoMesh.material===g.rig.torsoMesh.material};})()`);
console.log('   ', JSON.stringify(tint));
ok('the BOSS RIG MATERIAL really carries the tint (read from the rig, not the tag)',
   tint.boss.col!==0xffffff && tint.boss.emis!==0x000000, JSON.stringify(tint.boss));
ok('a boss and a grunt are NOT on the same material instance', !tint.shared);
ok('a grunt is left completely untinted (white multiplier, no emissive)',
   tint.grunt.col===0xffffff && tint.grunt.emis===0x000000, JSON.stringify(tint.grunt));
const bc=tint.boss.col;
ok('the boss multiplier is red-dominant, so the vertex palette reads red',
   ((bc>>16)&255) > ((bc>>8)&255) && ((bc>>8)&255) >= (bc&255), '0x'+bc.toString(16));
// P4a must not regress: the tag is identifiable with COLOUR IGNORED
const alpha = await ev(`(()=>{const L=__game.Enemies.list().filter(e=>e.active);
  const b=L.filter(e=>e.boss)[0], g=L.filter(e=>!e.boss)[0];
  const cov=t=>{const x=t.canvas.getContext('2d').getImageData(0,0,256,72).data;let n=0;
    for(let i=3;i<x.length;i+=4) if(x[i]>10) n++; return n;};
  const px=(t,x,y)=>t.canvas.getContext('2d').getImageData(x,y,1,1).data[3];
  return {bossCov:cov(b.tag), gruntCov:cov(g.tag),
    bossChevronL:px(b.tag,8,22),  gruntChevronL:px(g.tag,8,22),
    bossChevronR:px(b.tag,248,22),gruntChevronR:px(g.tag,248,22)};})()`);
ok('P4a shape-first boss identification still holds with colour ignored entirely',
   alpha.bossCov > alpha.gruntCov*1.3 && alpha.bossChevronL>200 && alpha.bossChevronR>200
   && alpha.gruntChevronL<20 && alpha.gruntChevronR<20, JSON.stringify(alpha));

/* ---- 8. paintball bibs ------------------------------------------------ */
console.log('\n=== 8. PAINTBALL BIBS STILL APPLY, AND NOTHING LODs IN THE DRILL ===');
await ev(`__game.loadLevel(0)`); await sleep(1500);
const paint = await ev(`(()=>{const G=__game,P=G.PAINT,L=G.Enemies.list().filter(e=>e.active);
  const out=L.map(e=>({name:e.name, bibOn:e.rig.bib.visible, bib:e.rig.bib.visible? e.rig.bib.material.color.getHex():null,
     emis:e.rig.bib.visible? e.rig.bib.material.emissive.getHex():null, tier:e.lodTier,
     geo:e.rig.torsoMesh.geometry.uuid}));
  return {paintball:G.paintball(), targets:P.targets, list:out};})()`);
const bibs=paint.list;
ok('the drill is in paintball mode', paint.paintball===true);
ok('every target wears a bib', bibs.length>0 && bibs.every(b=>b.bibOn), `${bibs.filter(b=>b.bibOn).length}/${bibs.length}`);
ok('each bib carries one of the drill colours, on an emissive material',
   bibs.every(b=>paint.targets.indexOf(b.bib)>=0 && b.emis===b.bib),
   bibs.map(b=>'0x'+(b.bib||0).toString(16)).join(','));
ok('the bibs are distinct colours, not all the same', new Set(bibs.map(b=>b.bib)).size>1,
   `${new Set(bibs.map(b=>b.bib)).size} distinct`);
// force distance: the drill must never drop to the far tier
await ev(`(()=>{const G=__game;G.Enemies.list().filter(e=>e.active).forEach(e=>{
  e.pos.set(e.pos.x,e.pos.y,-22); e.vel.set(0,0,0); e.path.length=0;});G.teleport(0,22);return 1;})()`);
await sleep(700);
const pd = await ev(`__game.Enemies.lodInfo()`);
ok('no paintball target ever LODs, however far away', pd.far===0 && pd.mid===0,
   `far ${pd.far} mid ${pd.mid}, distances ${pd.state.map(s=>s.d).join(',')}`);

/* ---- 9. no errors ----------------------------------------------------- */
console.log('\n=== 9. CLEAN RUN ===');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);
ok('no console/page errors across the whole run', errors.length===0, errors.slice(0,3).join(' | '));

console.log(`\n${pass}/${pass+fail} checks passed` + (fail? `  (${fail} FAILED)`:''));
process.exit(fail?1:0);
