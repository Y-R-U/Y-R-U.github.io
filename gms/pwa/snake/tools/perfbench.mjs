#!/usr/bin/env node
/**
 * Frame-cost bench: a late-game arena (big snakes, a full field of pellets),
 * then _update() and _render() timed separately, in real GPU-backed Chrome.
 *
 *   node gms/pwa/snake/tools/perfbench.mjs [rootDir ...]
 *
 * Each root is a directory served as the site root (default: this repo), so a
 * baseline copy can be compared with the working tree in the same run.
 */
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const roots = process.argv.slice(2).length ? process.argv.slice(2) : [resolve(HERE, '../../../..')];
const CDP = 9262;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
process.on('exit', () => {
    for (const p of procs) try { p.kill(); } catch (e) {}
    try { execFileSync(process.env.HOME + '/.claude/bin/cdp', ['stop', String(CDP)], { stdio: 'ignore' }); } catch (e) {}
});

roots.forEach((root, i) => procs.push(spawn('python3', ['-m', 'http.server', String(8870 + i), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' })));
execFileSync(process.env.HOME + '/.claude/bin/cdp', ['start', '--port', String(CDP), '--idle', '120', '--max', '600', '--', '--use-angle=metal'], { stdio: 'ignore' });
await sleep(900);

const v = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const W = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && W.has(m.id)) { W.get(m.id)(m); W.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; W.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const SETUP = `(() => {
    // Deterministic-enough late game: the player at 4,000 mass, every bot
    // between 300 and 3,000, the field topped up to the pellet cap.
    let seed = 7;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    game._startGame();
    game.player.setMass ? game.player.setMass(4000) : (game.player.mass = 4000, game.player._recomputeSize());
    game.player._initBody();
    for (const s of game.snakes) {
        if (s === game.player) continue;
        const m = 300 + Math.random() * 2700;
        s.mass = m; s._recomputeSize(); s.x = game.player.x + (Math.random() - 0.5) * 2400; s.y = game.player.y + (Math.random() - 0.5) * 1600; s._initBody();
    }
    const pellets = [];
    for (let i = 0; i < 1600; i++) pellets.push({ x: game.player.x + (Math.random() - 0.5) * 3000, y: game.player.y + (Math.random() - 0.5) * 2000, color: game.snakes[i % game.snakes.length].skin.colors[0], radius: 6 + Math.random() * 10, value: 5 });
    game.world.addDeathPellets(pellets);
    game.camera.zoom = game.camera.targetZoom = game.player.levelZoom;
    game.camera.x = game.player.x; game.camera.y = game.player.y;
    game.player.isInvulnerable = () => true;
    game.paused = true;
    return { snakes: game.snakes.length, food: game.world.food.length, zoom: game.camera.zoom };
})()`;

const MEASURE = `(() => {
    const N = 240;
    const t = (fn) => { const a = performance.now(); for (let i = 0; i < N; i++) fn(); return (performance.now() - a) / N; };
    // Warm up both paths before timing.
    for (let i = 0; i < 30; i++) { game._update(16.7, performance.now()); game._render(); }
    const upd = t(() => game._update(16.7, performance.now()));
    const ren = t(() => { game._render(); game.renderer.ctx.getImageData(0, 0, 1, 1); });
    const r = game.renderer, c = game.camera;
    const flush = () => r.ctx.getImageData(0, 0, 1, 1);
    const food = t(() => { r.drawFood(game.world.food, c); flush(); });
    const snakes = t(() => { for (const s of game.snakes) r.drawSnake(s, c, s === game.player); flush(); });
    const hud = t(() => { r.drawHUD(game.player, game.snakes, 1000); r.drawMinimap(game.player, game.snakes, c); flush(); });
    const grid = t(() => { r.clear(); r.drawGrid(c); r.drawBoundary(c); flush(); });
    const clr = t(() => { r.clear(); flush(); });
    const gr = t(() => { r.drawGrid(c); flush(); });
    const bd = t(() => { r.drawBoundary(c); flush(); });
    const rest = t(() => { r.drawPowerups(game.world.powerups, c); r.drawParticles(game.particles, c); r.drawBoundaryWarning(game.player); r.drawJoystick(game.input.getJoystickData()); flush(); });
    const nothing = t(() => { flush(); });
    return { update: +upd.toFixed(3), render: +ren.toFixed(3), food: +food.toFixed(2), snakes: +snakes.toFixed(2), hud: +hud.toFixed(2), grid: +grid.toFixed(2), clr: +clr.toFixed(2), gr: +gr.toFixed(2), bd: +bd.toFixed(2), rest: +rest.toFixed(2), nothing: +nothing.toFixed(2) };
})()`;

for (let i = 0; i < roots.length; i++) {
    for (const vp of [{ w: 1280, h: 800, dpr: 2, label: 'laptop 2x' }, { w: 400, h: 860, dpr: 3, label: 'phone 3x' }]) {
        const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
        const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
        await send('Network.enable', {}, sessionId);
        await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
        await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.dpr > 2 }, sessionId);
        await send('Page.navigate', { url: `http://127.0.0.1:${8870 + i}/gms/pwa/snake/?test` }, sessionId);
        await sleep(1500);
        const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result.result.value;
        const info = await ev(SETUP);
        const runs = [];
        for (let k = 0; k < 3; k++) runs.push(await ev(MEASURE));
        const best = key => Math.min(...runs.map(r => r[key])).toFixed(2);
        console.log(`${roots[i]}  ${vp.label}  snakes ${info.snakes} food ${info.food}  update ${best('update')}ms  render ${best('render')}ms  [food ${best('food')} snakes ${best('snakes')} hud ${best('hud')} bg ${best('grid')} = clear ${best('clr')} grid ${best('gr')} edge ${best('bd')}; rest ${best('rest')}; readback ${best('nothing')}]`);
        await send('Target.closeTarget', { targetId });
    }
}
process.exit(0);
