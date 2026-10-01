// Review R1 (client) repros: state that leaks between sessions, dead saves, cache loot dupe.
// node tools/review_a_lifecycle.mjs  (needs the local server on :8861; uses headless Chrome on :9330)
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9330;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const out = {};

const temp = (name, seed, mode) => `({ id: null, temp: true, name: '${name}', seed: '${seed}', mode: '${mode}', difficulty: 'normal', source: 'local', mine: true })`;

async function fresh(pg) {
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
}
async function playTemp(pg, name, seed, mode) {
  await pg.eval(`window.__game.shell.play(${temp(name, seed, mode)}, { fresh: true })`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(500);
}
async function quit(pg) {
  await pg.eval(`(async()=>{ const S=window.__game.shell; S.pause(); await S.quit(); })()`, { timeout: 30000 });
  await pg.waitFor(`window.__game.shell.state === 'title'`);
}

const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);

  // ---------- A: die, quit without rebooting, start another world ----------
  await fresh(pg);
  await playTemp(pg, 'A', 'deadA', 'survival');
  await pg.game(`C.game.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,300));`);
  out.deathA = await pg.game(`return { survDead: C.game.survival.dead, playerDead: C.player.dead, overlay: [...document.querySelectorAll('h2')].some(e=>e.textContent==='SUIT OFFLINE') }`);
  await quit(pg);
  out.titleOverlay = await pg.game(`return [...document.querySelectorAll('h2')].some(e=>e.textContent==='SUIT OFFLINE')`);
  await playTemp(pg, 'B', 'liveB', 'survival');
  out.worldB = await pg.game(`
    const P=C.player; const y0=P.pos.y; P.teleport(P.pos.x, P.pos.y+6, P.pos.z);
    await new Promise(r=>setTimeout(r,1500));
    return { survDead: C.game.survival.dead, playerDead: P.dead, liftedY: y0+6, yAfter1500ms: +P.pos.y.toFixed(2),
      overlay: [...document.querySelectorAll('h2')].some(e=>e.textContent==='SUIT OFFLINE') }`);
  // the only way out the UI offers: the stale "Reboot suit" button
  out.worldBAfterReboot = await pg.game(`
    const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Reboot suit'); if (b) b.click();
    await new Promise(r=>setTimeout(r,800));
    return { clicked: !!b, playerDead: C.player.dead }`);
  await quit(pg);

  // ---------- B: a save taken while dead loads as a ghost ----------
  await fresh(pg);
  const meta = await pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.put({ name: 'Ghost', seed: 'ghost', mode: 'survival', data: null }); })()`);
  await pg.eval(`window.__game.shell.play(${JSON.stringify(meta)})`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await pg.game(`C.game.hurtPlayer(100, 'test'); await new Promise(r=>setTimeout(r,300)); await window.__game.shell.save('auto');`);
  await fresh(pg);  // page reload (tab closed and reopened)
  const metas = await pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.list(); })()`);
  const m2 = metas.find((m) => m.id === meta.id);
  await pg.eval(`window.__game.shell.play(${JSON.stringify(m2)})`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(4000);
  out.ghost = await pg.game(`return { survDead: C.game.survival.dead, integrity: C.game.survival.integrity, playerDead: C.player.dead,
    overlay: [...document.querySelectorAll('h2')].some(e=>e.textContent==='SUIT OFFLINE'),
    hurt: C.game.hurtPlayer(5,'test') }`);
  await quit(pg);

  // ---------- C: build-mode undo history crosses worlds ----------
  await fresh(pg);
  await playTemp(pg, 'BuildA', 'bA', 'build');
  const box = await pg.game(`
    const P=C.player.pos; const x=Math.floor(P.x)*4, z=Math.floor(P.z)*4+16, y=100*4;
    const min=[x,y,z], max=[x+8,y+8,z+8];
    C.brush.tools.edit(min, max, 1, 'fill');  // recorded: snapshot of air
    return { min, max, cellA: C.world.getCell(x>>2, y>>2, z>>2), undo: C.brush.tools.history.steps }`);
  out.undoA = box;
  await quit(pg);
  await playTemp(pg, 'BuildB', 'bB', 'build');
  out.undoB = await pg.game(`
    const [x,y,z]=${JSON.stringify(box.min)};
    C.world.ensureArea(x/4, z/4, 1);
    C.world.setBox([x,y,z],[x+8,y+8,z+8], 23, 'fill');   // B's own build at the same spot, not via the brush
    const before = C.world.getCell(x>>2,y>>2,z>>2);
    const stepsCarried = C.brush.tools.history.steps;
    const ok = C.brush.run('undo');
    return { stepsCarried, undoRan: ok, cellBefore: before, cellAfterUndo: C.world.getCell(x>>2,y>>2,z>>2) }`);

  // ---------- D: a volume pending in build mode leaks into a survival world ----------
  out.volA = await pg.game(`
    const P=C.player.pos; const sx=Math.floor(P.x*4), sy=Math.floor(P.y*4)+40, sz=Math.floor(P.z*4)+24;
    const hit={ sub:[sx,sy,sz], normal:[0,1,0], mat:1, dist:3, point:[sx/4,sy/4,sz/4] };
    C.brush.target = hit; C.brush._anchor={ hit }; C.brush._startVolume('touch');
    C.brush.vol.endHit = { ...hit, sub:[sx+40,sy,sz+40] }; C.brush._recalcVol(); C.brush.vol.pending = true;
    return { vol: !!C.brush.vol, modal: C.input.modal, box: C.brush.vol.box }`);
  await quit(pg);
  await playTemp(pg, 'SurvC', 'sC', 'survival');
  out.volB = await pg.game(`
    const inv=C.game.inv; inv.setSlot(0, C.game.items.id('lattice_planks'), 1); inv.select(0);
    const b=C.brush.vol && C.brush.vol.box;
    const r = { volLeaked: !!C.brush.vol, modal: C.input.modal, planksBefore: inv.count(C.game.items.id('lattice_planks')) };
    if (b) { C.world.ensureArea(b.min[0]/4, b.min[2]/4, 2); C.brush.confirm();
      r.cellsNowPlanks = C.world.readBox(b.min, b.max).data.filter(v=>v===C.game.items.get('lattice_planks').block).length/64; }
    r.planksAfter = inv.count(C.game.items.id('lattice_planks'));
    return r`);
  await quit(pg);

  // ---------- E: a 1/4-size player-placed cache rolls world loot ----------
  await playTemp(pg, 'SurvD', 'sD', 'survival');
  out.cache = await pg.game(`
    const g=C.game, inv=g.inv, cid=g.items.id('cache'), W=C.world, P=C.player.pos;
    inv.setSlot(0, cid, 2); inv.select(0);
    const cx=Math.floor(P.x)+3, cz=Math.floor(P.z)+3, cy=Math.ceil(W.surfaceY(cx+0.5,cz+0.5))+2;
    const place=(min,max)=>{ C.brush.setScale(max[0]-min[0]===1?0.25:1); return C.brush._doPlace({min,max},'fill'); };
    const full=[cx*4,cy*4,cz*4], q=[(cx+2)*4,cy*4,cz*4];
    const okFull=place(full,[full[0]+4,full[1]+4,full[2]+4]);
    const okQ=place(q,[q[0]+1,q[1]+1,q[2]+1]);
    const fill=(k)=>{ const s=g.stations.map.get(k); return s? s.inv.slots.filter(Boolean).length : 'none'; };
    const kFull=cx+','+cy+','+cz, kQ=(cx+2)+','+cy+','+cz;
    const before={ full: fill(kFull), quarter: fill(kQ) };
    g.stations.useBlock({ sub:[q[0],q[1],q[2]], mat: cid });
    await new Promise(r=>setTimeout(r,500));
    g.stations.close();
    return { okFull, okQ, cachesLeft: inv.count(cid), stationSlotsBeforeOpen: before, quarterAfterOpen: fill(kQ),
      loot: g.stations.map.get(kQ)?.inv.slots.filter(Boolean).map(s=>g.items.get(s.id).key+'x'+s.n) }`);
  await quit(pg);

  out.exceptions = pg.log.exceptions.slice(0, 10);
} finally {
  stopBrowser(PORT);
}
console.log(JSON.stringify(out, null, 1));
