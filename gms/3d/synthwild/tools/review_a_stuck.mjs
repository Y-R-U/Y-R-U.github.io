// Review R1 (client): a bio-sapling that grows while the player stands on it entombs the player.
// node tools/review_a_stuck.mjs
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9330;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
  await pg.eval(`window.__game.shell.play({ id: null, temp: true, name: 'T', seed: 'stuck', mode: 'survival', difficulty: 'normal', source: 'local', mine: true }, { fresh: true })`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(1500);
  const r = await pg.game(`
    const P=C.player, W=C.world, B=(await import('./js/data/blocks.js')).BLOCK;
    const x=Math.floor(P.pos.x), z=Math.floor(P.pos.z), y=Math.round(P.pos.y);
    // the sapling a kid planted and is standing in (plants have no collision)
    W.setBox([x*4,y*4,z*4],[x*4+4,y*4+4,z*4+4], B.BIO_SAPLING, 'fill');
    C.bus.emit('block:place', { minSub:[x*4,y*4,z*4], maxSub:[x*4+4,y*4+4,z*4+4], mat: B.BIO_SAPLING, mode:'fill', changed:64 });
    const e = C.game.farm.map.get(x+','+y+','+z); const tracked=!!e;
    const before = { x:+P.pos.x.toFixed(2), y:+P.pos.y.toFixed(2), z:+P.pos.z.toFixed(2) };
    const placed = W.growTree(x, y, z);     // what farm.update does once e.g >= SAPLING_TIME
    await new Promise(r=>setTimeout(r,2500));
    const ph=await import('./js/player/physics.js');
    const solid=(a,b,c)=>W.isSolidSub(a,b,c);
    return { tracked, placed, before, after: { x:+P.pos.x.toFixed(2), y:+P.pos.y.toFixed(2), z:+P.pos.z.toFixed(2) },
      feetCell: W.getCell(x,y,z), eyeCell: W.getCell(Math.floor(P.pos.x), Math.floor(P.pos.y+1.62), Math.floor(P.pos.z)),
      bodyInSolid: ph.boxHitsSolid(solid, ph.boxOf({x:P.pos.x,y:P.pos.y,z:P.pos.z,h:P.h})),
      canUnstick: ph.unstick(solid, {x:P.pos.x,y:P.pos.y,z:P.pos.z,h:P.h}),
      brushTarget: C.brush.target, breakTarget: C.brush.breakTarget, log: B.CARBON_LOG }`);
  console.log(JSON.stringify(r));
  const walk = {};
  for (const [code, dir] of [['KeyW','fwd'],['KeyA','left'],['KeyS','back'],['KeyD','right']]) {
    const p0 = await pg.game(`return C.player.pos.toArray().map(v=>+v.toFixed(2))`);
    await pg.keyDown(code, code.slice(3).toLowerCase());
    await sleep(1200);
    await pg.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.slice(3).toLowerCase() });
    walk[dir] = { from: p0, to: await pg.game(`return C.player.pos.toArray().map(v=>+v.toFixed(2))`) };
  }
  console.log(JSON.stringify(walk));
} finally {
  stopBrowser(PORT);
}
