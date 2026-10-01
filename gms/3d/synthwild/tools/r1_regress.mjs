// Review R1 regression tests (browser). Each block is a reviewer repro turned into a pass/fail check.
//   node tools/r1_regress.mjs [A1,A2,...]     needs the local server on :8861; headless Chrome on :9331
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9331;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
let pass = 0, fail = 0;
const ok = (id, c, msg, detail) => {
  if (c) pass++; else fail++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${id} ${msg}${c ? '' : '  ' + JSON.stringify(detail)}`);
};

const temp = (name, seed, mode) => `({ id: null, temp: true, name: '${name}', seed: '${seed}', mode: '${mode}', difficulty: 'normal', source: 'local', mine: true })`;
const OVERLAY = `[...document.querySelectorAll('h2')].some(e=>e.textContent==='SUIT OFFLINE')`;
const popTitles = `[...document.querySelectorAll('.sw-pop h3')].map(e=>e.textContent)`;

async function fresh(pg, q = '?nointro') {
  await pg.goto(BASE + q);
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
}
async function playTemp(pg, name, seed, mode) {
  await pg.eval(`window.__game.shell.play(${temp(name, seed, mode)}, { fresh: true })`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(500);
}
async function playMeta(pg, meta) {
  await pg.eval(`window.__game.shell.play(${JSON.stringify(meta)})`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(500);
}
async function quit(pg) {
  await pg.eval(`(async()=>{ const S=window.__game.shell; S.pause(); await S.quit(); })()`, { timeout: 30000 });
  await pg.waitFor(`window.__game.shell.state === 'title'`);
}
const newLocal = (pg, name, seed, mode) => pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.put({ name: '${name}', seed: '${seed}', mode: '${mode}', data: null }); })()`);
const falls = (pg) => pg.game(`
  const P=C.player; const y0=P.pos.y; P.teleport(P.pos.x, P.pos.y+6, P.pos.z);
  await new Promise(r=>setTimeout(r,1500));
  return { playerDead: P.dead, survDead: C.game.survival.dead, dropped: +(y0+6-P.pos.y).toFixed(2), overlay: ${OVERLAY} }`);

const tests = {
  async A1(pg) {
    await fresh(pg);
    const meta = await newLocal(pg, 'Ghost', 'ghost', 'survival');
    await playMeta(pg, meta);
    await pg.game(`C.game.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,300)); await window.__game.shell.save('auto');`);
    await fresh(pg);
    const m2 = (await pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.list(); })()`)).find((m) => m.id === meta.id);
    await playMeta(pg, m2);
    await sleep(1500);
    const r = await pg.game(`return { survDead: C.game.survival.dead, integrity: C.game.survival.integrity, playerDead: C.player.dead, overlay: ${OVERLAY} }`);
    const alive = !r.survDead && r.integrity > 0 && !r.playerDead;
    ok('A1', alive || (r.survDead && r.overlay), 'a save taken while dead loads alive (or with the death screen)', r);
    if (alive) ok('A1', (await pg.game(`return C.game.hurtPlayer(5,'test')`)) > 0, 'the reloaded player can be hurt');
    await quit(pg);
  },

  async A2(pg) {
    await fresh(pg);
    await playTemp(pg, 'A', 'deadA', 'survival');
    await pg.game(`C.game.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,300));`);
    await quit(pg);
    ok('A2', !(await pg.eval(OVERLAY)), 'death overlay is gone on the title screen');
    await playTemp(pg, 'B', 'liveB', 'survival');
    const r = await falls(pg);
    ok('A2', !r.playerDead && !r.overlay && r.dropped > 1, 'next world after quitting dead: player falls, no stale overlay', r);
    await quit(pg);
    // leave a Siege mini-game inside its 2 s auto-respawn window
    await pg.eval(`window.__game.shell.playMinigame('siege')`, { timeout: 60000 });
    await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.session.mode === 'minigame'`, { timeout: 30000 });
    await sleep(800);
    const died = await pg.game(`C.session.mgSurvival = true; C.game.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,200)); const d={ surv: C.game.survival.dead, player: C.player.dead }; await window.__game.shell.quit({ toMenu: true }); return d;`);
    await pg.waitFor(`window.__game.shell.state === 'title'`);
    await playTemp(pg, 'C', 'liveC', 'survival');
    const r2 = await falls(pg);
    ok('A2', died.surv && !r2.playerDead && r2.dropped > 1 && !r2.overlay, 'leaving a mini-game while dead leaves a clean player', { died, r2 });
    await quit(pg);
  },

  async A3(pg) {
    await fresh(pg);
    await playTemp(pg, 'T', 'dupe', 'survival');
    await sleep(500);
    const r = await pg.game(`
      const g=C.game, inv=g.inv, cid=g.items.id('cache'), W=C.world, P=C.player.pos, br=C.brush;
      inv.setSlot(0, cid, 2); inv.select(0);
      const cx=Math.floor(P.x)+3, cz=Math.floor(P.z)+3, cy=Math.ceil(W.surfaceY(cx+0.5,cz+0.5))+2;
      br.setScale(1);
      br._doPlace({ min:[cx*4,cy*4,cz*4], max:[cx*4+4,cy*4+4,cz*4+4] }, 'fill');
      br.setScale(0.25);
      for (let i=0;i<6;i++) { const s=[cx*4+(i&3), cy*4+3, cz*4+(i>>2)]; br._doBreak({ min:s, max:[s[0]+1,s[1]+1,s[2]+1] }); }
      const loot = g.drops.list.filter(d=>d.id!==cid).map(d=>g.items.get(d.id).key+'x'+d.n);
      const cacheBack = g.drops.list.filter(d=>d.id===cid).reduce((a,d)=>a+d.n,0);
      // a 1/4 cache placed by the player must open empty
      const q=[(cx+2)*4, cy*4, cz*4];
      br._doPlace({ min:q, max:[q[0]+1,q[1]+1,q[2]+1] }, 'fill');
      const kQ=(cx+2)+','+cy+','+cz;
      const registered = g.stations.map.has(kQ);
      g.stations.useBlock({ sub:q, mat: cid });
      await new Promise(r=>setTimeout(r,400));
      g.stations.close();
      return { loot, cacheBack: +cacheBack.toFixed(3), registered, quarterSlots: g.stations.map.get(kQ)?.inv.slots.filter(Boolean).length ?? 'none' }`);
    ok('A3', r.loot.length === 0, 'sub-breaking an empty placed cache spills no loot', r);
    ok('A3', Math.abs(r.cacheBack - 1) < 1e-6, 'the whole cache comes back as one item', r);
    ok('A3', r.registered && r.quarterSlots === 0, 'a 1/4 placed cache registers empty and never rolls loot', r);
    await quit(pg);
  },

  async A4A6(pg) {
    await fresh(pg);
    await playTemp(pg, 'BuildA', 'bA', 'build');
    const box = await pg.game(`
      const P=C.player.pos; const x=Math.floor(P.x)*4, z=Math.floor(P.z)*4+16, y=100*4;
      const min=[x,y,z], max=[x+8,y+8,z+8];
      C.brush.tools.edit(min, max, 1, 'fill');
      const sx=Math.floor(P.x*4), sy=Math.floor(P.y*4)+40, sz=Math.floor(P.z*4)+24;
      const hit={ sub:[sx,sy,sz], normal:[0,1,0], mat:1, dist:3, point:[sx/4,sy/4,sz/4] };
      C.brush.target = hit; C.brush._anchor={ hit }; C.brush._startVolume('touch');
      C.brush.vol.endHit = { ...hit, sub:[sx+40,sy,sz+40] }; C.brush._recalcVol(); C.brush.vol.pending = true;
      return { min, max }`);
    await quit(pg);
    await playTemp(pg, 'BuildB', 'bB', 'build');
    const u = await pg.game(`
      const [x,y,z]=${JSON.stringify(box.min)};
      C.world.ensureArea(x/4, z/4, 1);
      C.world.setBox([x,y,z],[x+8,y+8,z+8], 23, 'fill');
      const steps = C.brush.tools.history.steps;
      C.brush.run('undo');
      return { steps, cellAfterUndo: C.world.getCell(x>>2,y>>2,z>>2), vol: !!C.brush.vol, modal: C.input.modal }`);
    ok('A4', u.steps === 0 && u.cellAfterUndo === 23, 'undo history does not cross worlds', u);
    ok('A6', !u.vol && !u.modal, 'a pending volume does not cross worlds', u);
    await quit(pg);
    await playTemp(pg, 'SurvC', 'sC', 'survival');
    const v = await pg.game(`
      const inv=C.game.inv, pid=C.game.items.id('lattice_planks'); inv.setSlot(0, pid, 1); inv.select(0);
      const P=C.player.pos; const sx=Math.floor(P.x*4), sy=Math.floor(P.y*4)+40, sz=Math.floor(P.z*4)+24;
      const hit={ sub:[sx,sy,sz], normal:[0,1,0], mat:1, dist:3, point:[sx/4,sy/4,sz/4] };
      C.brush.target = hit; C.brush._anchor={ hit }; C.brush._startVolume('touch');
      C.brush.vol.endHit = { ...hit, sub:[sx+40,sy,sz+40] }; C.brush._recalcVol(); C.brush.vol.pending = true;
      const b=C.brush.vol.box; C.brush.confirm();
      return { planks: inv.count(pid), cells: C.world.readBox(b.min, b.max).data.filter(m=>m===C.game.items.get(pid).block).length, modal: C.input.modal }`);
    ok('A6', v.cells === 0 && v.planks === 1 && !v.modal, 'a forced volume confirm in Survival places nothing for free', v);
    await quit(pg);
  },

  async A5(pg) {
    await fresh(pg);
    const meta = await newLocal(pg, 'Race', 'race', 'survival');
    await playMeta(pg, meta);
    const r = await pg.eval(`(async()=>{
      const a=(await import('./js/net/api.js')).api, orig=a.local.put;
      let inflight=0, max=0, calls=0;
      a.local.put = async (o) => { calls++; inflight++; max=Math.max(max,inflight); try { await new Promise(r=>setTimeout(r,150)); return await orig(o); } finally { inflight--; } };
      const S=window.__game.shell;
      const ps=[S.save('auto'), S.save('pause'), S.save('hide'), S.save('hide')];
      const res = await Promise.all(ps);
      const late = await S.save('auto');
      a.local.put = orig;
      return { putCalls: calls, maxConcurrentPuts: max, res, late };
    })()`);
    ok('A5', r.maxConcurrentPuts === 1 && r.putCalls === 3 && r.res.every((x) => x === true) && r.late === true, 'saves never run in parallel (1 in flight + 1 coalesced)', r);
    await quit(pg);
  },

  async A7(pg) {
    await fresh(pg);
    const meta = await newLocal(pg, 'Keep', 'keep', 'build');
    await playMeta(pg, meta);
    const r = await pg.eval(`(async()=>{
      const G=window.__game, C=G.ctx, a=(await import('./js/net/api.js')).api;
      const P=C.player.pos, x=Math.floor(P.x)*4, z=Math.floor(P.z)*4+12, y=90*4;
      C.world.setBox([x,y,z],[x+16,y+16,z+16], 1, 'fill');
      window.__origPut=a.local.put; a.local.put = async () => { throw Object.assign(new Error('QuotaExceededError'), { code: 'quota' }); };
      G.shell.playMinigame('parkour');
      await new Promise(r=>setTimeout(r,1200));
      return { popups: ${popTitles}, state: G.shell.state, mode: C.session.mode };
    })()`);
    ok('A7', r.popups.some((t) => /fail/i.test(t)) && r.mode === 'build', 'a failed save before a mini-game asks first', r);
    const r2 = await pg.eval(`(async()=>{
      const G=window.__game, C=G.ctx, a=(await import('./js/net/api.js')).api;
      const b=[...document.querySelectorAll('.sw-pop button')].find(e=>e.textContent==='Cancel'); b && b.click();
      await new Promise(r=>setTimeout(r,800));
      a.local.put = window.__origPut;
      return { state: G.shell.state, mode: C.session.mode, world: !!C.world, metaId: G.shell.meta && G.shell.meta.id };
    })()`);
    ok('A7', r2.mode === 'build' && r2.world && r2.metaId === meta.id && (r2.state === 'playing' || r2.state === 'paused'), 'Cancel keeps the world open', r2);
    await quit(pg);
  },

  async A10(pg) {
    await fresh(pg, '');
    const r = await pg.eval(`(async()=>{
      (await import('./js/ui/settings.js')).settings.set('introSeen', false);
      const E=(await import('./js/main.js')).game, S=window.__game.shell, orig=E.start;
      let starts=0; E.start = function(...a){ starts++; return orig.apply(this, a); };
      const m=${temp('Twice', 'twice', 'survival')};
      S.play(m, { fresh: true }); S.play(m, { fresh: true });
      await new Promise(r=>setTimeout(r,600));
      const intros=document.querySelectorAll('.sw-intro').length;
      for (const b of document.querySelectorAll('.sw-intro .skip')) b.click();
      for (let i=0;i<150 && S.state!=='playing';i++) await new Promise(r=>setTimeout(r,200));
      await new Promise(r=>setTimeout(r,1500));
      E.start = orig;
      return { intros, starts, state: S.state };
    })()`, { timeout: 60000 });
    ok('A10', r.intros === 1 && r.starts === 1 && r.state === 'playing', 'double-tap Play runs one intro and one start', r);
    await quit(pg);
    const r2 = await pg.eval(`(async()=>{
      const S=window.__game.shell; S.runIntro(true); S.runIntro(true);
      await new Promise(r=>setTimeout(r,500));
      const n=document.querySelectorAll('.sw-intro').length;
      for (const b of document.querySelectorAll('.sw-intro .skip')) b.click();
      await new Promise(r=>setTimeout(r,800));
      return { n, state: S.state };
    })()`);
    ok('A10', r2.n === 1 && r2.state === 'title', 'double-tap on the intro replay opens one intro', r2);
  },

  async A11(pg) {
    await fresh(pg);
    const meta = await newLocal(pg, 'Gone', 'goneSeed', 'build');
    await playMeta(pg, meta);
    const r = await pg.eval(`(async()=>{
      const a=(await import('./js/net/api.js')).api, S=window.__game.shell;
      await a.local.remove(${JSON.stringify(meta.id)});      // deleted from another tab
      const p = S.save('pause');
      await new Promise(r=>setTimeout(r,600));
      const pops = ${popTitles};
      const b=[...document.querySelectorAll('.sw-pop button')].find(e=>/copy/i.test(e.textContent)); b && b.click();
      const res = await p;
      const list = await a.local.list();
      return { pops, res, names: list.map(m=>m.name), copy: list.filter(m=>/copy/.test(m.name)).map(m=>({ seed: m.seed, mode: m.mode })), metaName: S.meta && S.meta.name };
    })()`, { timeout: 30000 });
    ok('A11', r.pops.length > 0 && !r.names.includes('New world'), 'saving a world deleted elsewhere asks instead of recreating "New world"', r);
    ok('A11', r.copy.length === 1 && r.copy[0].seed === 'goneSeed' && r.copy[0].mode === 'build', 'Save as copy keeps seed and mode', r);
    await quit(pg);
  },

  async A12(pg) {
    await fresh(pg);
    await playTemp(pg, 'Pod', 'podless', 'survival');
    const r = await pg.game(`
      const g=C.game, W=C.world, P=C.player.pos;
      const x=Math.floor(P.x)+4, z=Math.floor(P.z)+4, y=Math.ceil(W.surfaceY(x+0.5,z+0.5));
      g.setSpawn({ x: x+0.5, y: y+1, z: z+0.5 });   // a pod that is not there any more
      g.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,300));
      g.respawn(); await new Promise(r=>setTimeout(r,500));
      const ws=W.spawn;
      return { pos: [P.x, P.y, P.z].map(v=>+v.toFixed(2)), ws, fake: [x+0.5, y+1, z+0.5], spawnPoint: g.spawnPoint,
        toasts: [...document.querySelectorAll('.sw-toast')].map(e=>e.textContent) }`);
    const atWorld = Math.hypot(r.pos[0] - r.ws[0], r.pos[2] - r.ws[2]) < 1.5;
    ok('A12', atWorld && !r.spawnPoint && r.toasts.some((t) => /pod/i.test(t)), 'respawn with a missing pod falls back to the landing site and says so', r);
    const s = await pg.game(`
      const P=C.player, W=C.world, B=(await import('./js/data/blocks.js')).BLOCK, F=(await import('./js/game/farm.js'));
      const x=Math.floor(P.pos.x), z=Math.floor(P.pos.z), y=Math.round(P.pos.y);
      W.setBox([x*4,(y-1)*4,z*4],[x*4+4,y*4,z*4+4], B.PHOTOMOSS, 'fill');
      W.setBox([x*4,y*4,z*4],[x*4+4,y*4+4,z*4+4], B.BIO_SAPLING, 'fill');
      C.bus.emit('block:place', { minSub:[x*4,y*4,z*4], maxSub:[x*4+4,y*4+4,z*4+4], mat: B.BIO_SAPLING, mode:'fill', changed:64 });
      const farm=C.game.farm, e=farm.map.get(x+','+y+','+z);
      if (!e) return { tracked: false };
      e.g = F.SAPLING_TIME + 1; farm.tickT = 0; farm.update(0.01);
      const ph=await import('./js/player/physics.js');
      const inSolid = ph.boxHitsSolid((a,b,c)=>W.isSolidSub(a,b,c), ph.boxOf({x:P.pos.x,y:P.pos.y,z:P.pos.z,h:P.h}));
      const still = W.getCell(x,y,z) === B.BIO_SAPLING;
      P.teleport(P.pos.x + 9, W.surfaceY(P.pos.x + 9, P.pos.z) + 0.02, P.pos.z);
      e.g = F.SAPLING_TIME + 1; farm.tickT = 0; farm.update(0.01);
      return { tracked: true, inSolid, deferred: still, grewLater: W.getCell(x,y,z) === B.CARBON_LOG }`);
    ok('A12', s.tracked && !s.inSolid && s.deferred && s.grewLater, 'a sapling defers growing into the player and grows once they step away', s);
    await quit(pg);
  },

  // QA M1: a refused or never-held pointer lock must not pause; a real unlock (Esc) still does, except in a countdown.
  async M1(pg) {
    await fresh(pg);
    await pg.eval(`window.__game.shell.playMinigame('parkour')`, { timeout: 60000 });
    await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.session.mode === 'minigame'`, { timeout: 30000 });
    const r = await pg.game(`
      const S=window.__game.shell, I=C.input, st=()=>S.state;
      I.device='mouse';
      const fire=(t)=>document.dispatchEvent(new Event(t));
      fire('pointerlockchange'); fire('pointerlockerror'); await new Promise(r=>setTimeout(r,350));
      const noLockHeld = st();
      I.locked=true; I._reqT=performance.now(); fire('pointerlockchange'); await new Promise(r=>setTimeout(r,350));
      const freshUnlock = st();
      const counting = !!C.session.mgCountdown;
      I.locked=true; I._reqT=0; fire('pointerlockchange'); await new Promise(r=>setTimeout(r,350));
      const inCountdown = st();
      for (let i=0;i<50 && C.session.mgCountdown;i++) await new Promise(r=>setTimeout(r,100));
      I.locked=true; I._reqT=0; fire('pointerlockchange'); await new Promise(r=>setTimeout(r,350));
      const realEsc = st();
      return { noLockHeld, freshUnlock, counting, inCountdown, realEsc }`);
    ok('M1', r.noLockHeld === 'playing' && r.freshUnlock === 'playing' && (!r.counting || r.inCountdown === 'playing') && r.realEsc === 'paused',
      'refused/never-held/just-requested locks and countdowns never pause; a real unlock still does', r);
    await pg.game(`await window.__game.shell.quit()`);
  },

  // QA M4: the command bar must not slide sideways under a tap.
  async M4(pg) {
    await fresh(pg);
    await playTemp(pg, 'Cmd', 'cmd', 'survival');
    const r = await pg.game(`
      window.__game.shell.pause(); C.ui.cmd.open('/');
      const chip=()=>[...document.querySelectorAll('.mg-cmd-hints button')].find(b=>b.textContent.startsWith('/help'));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const a=chip().getBoundingClientRect().x;
      await new Promise(r=>setTimeout(r,400));
      const b=chip().getBoundingClientRect().x;
      C.ui.cmd.close(); window.__game.shell.resume();
      return { early: +a.toFixed(1), settled: +b.toFixed(1) }`);
    const r2 = await pg.game(`
      window.__game.shell.pause(); C.ui.cmd.open('/');
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return [...document.querySelectorAll('.mg-cmd-hints button')].map(b=>{ const q=b.getBoundingClientRect(); return { t: b.textContent.split(' ')[0], x: q.x + q.width / 2, y: q.y + q.height / 2 }; }).find(c=>c.t==='/help')`);
    await pg.tap(r2.x, r2.y);
    await sleep(150);
    const val = await pg.eval(`document.querySelector('.mg-cmd input') && document.querySelector('.mg-cmd input').value`);
    ok('M4', Math.abs(r.early - r.settled) < 1 && /^\/help/.test(val || ''), 'command chips are where they look from the first frame; an instant tap hits /help', { r, val });
    await pg.game(`C.ui.cmd.close(); window.__game.shell.resume();`);
    await quit(pg);
  },
};

const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  for (const [id, fn] of Object.entries(tests)) {
    if (only && ![...only].some((o) => id.includes(o))) continue;
    try { await fn(pg); } catch (e) { ok(id, false, 'threw', e.message); }
    await pg.evalSafe(`document.querySelectorAll('.sw-scrim').forEach(e=>e.remove())`);
  }
  if (pg.log.exceptions.length) console.log('page exceptions:', JSON.stringify(pg.log.exceptions.slice(0, 8)));
} finally {
  stopBrowser(PORT);
}
console.log(`r1_regress: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
