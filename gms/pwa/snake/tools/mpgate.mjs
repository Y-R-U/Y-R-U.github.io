#!/usr/bin/env node
/**
 * Multiplayer gate: a real room server, a static server and several headless
 * Chrome players, driven through real clicks where a player would click.
 *
 *   node gms/pwa/snake/tools/mpgate.mjs            (from the repo root)
 *
 * Builds the Go server into a temp dir, so it needs `go` on PATH.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const ROOT = resolve(GAME, '../../..');
const NET_PORT = 8113, WEB_PORT = 8865, CDP_PORT = 9247;
const tmp = mkdtempSync(join(tmpdir(), 'mpgate-'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    cond ? pass++ : fail++;
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- offline cache list
// Every file index.html (or a dynamic import) loads must be in sw.js's ASSETS,
// or the installed PWA boots offline with a hole in it; and nothing stale.
{
    const sw = readFileSync(join(GAME, 'sw.js'), 'utf8');
    const assets = new Set([...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')));
    const html = readFileSync(join(GAME, 'index.html'), 'utf8');
    const refs = new Set(['', 'index.html']);
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^(https?:|\/|#|data:)/.test(m[1])) refs.add(m[1].replace(/^\.\//, ''));
    for (const f of readdirSync(join(GAME, 'js'))) {
        for (const m of readFileSync(join(GAME, 'js', f), 'utf8').matchAll(/import\(\s*'\.\/([^']+)'\s*\)/g)) refs.add('js/' + m[1]);
    }
    const manifest = JSON.parse(readFileSync(join(GAME, 'manifest.json'), 'utf8'));
    for (const i of manifest.icons || []) refs.add(i.src.replace(/^\.\//, ''));
    const missing = [...refs].filter(r => !assets.has(r));
    const extra = [...assets].filter(a => !refs.has(a));
    const gone = [...assets].filter(a => a && !existsSync(join(GAME, a)));
    ok('sw.js ASSETS matches what index.html loads', !missing.length && !extra.length && !gone.length,
        JSON.stringify({ missing, extra, gone }));
}

// ---------------------------------------------------------------- servers
execFileSync('go', ['build', '-o', join(tmp, 'snakenet'), '.'], { cwd: join(GAME, 'server') });
const procs = [];
let netProc = null;
const startNet = () => {
    netProc = spawn(join(tmp, 'snakenet'), [], { env: { ...process.env, SNAKENET_ADDR: `127.0.0.1:${NET_PORT}`, SNAKENET_INTERNAL_ADDR: `127.0.0.1:${NET_PORT + 1000}` }, stdio: ['ignore', 'ignore', process.env.NETLOG ? 'inherit' : 'ignore'] });
    procs.push(netProc);
};
startNet();
procs.push(spawn('python3', ['-m', 'http.server', String(WEB_PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
const cleanup = () => {
    for (const p of procs) try { p.kill(); } catch (e) {}
    try { execFileSync(process.env.HOME + '/.claude/bin/cdp', ['stop', String(CDP_PORT)], { stdio: 'ignore' }); } catch (e) {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

execFileSync(process.env.HOME + '/.claude/bin/cdp', ['start', '--port', String(CDP_PORT), '--idle', '120', '--max', '900', '--',
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], { stdio: 'ignore' });
await sleep(800);

// ---------------------------------------------------------------- CDP
const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let msgId = 0;
const waiting = new Map();
ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++msgId;
    waiting.set(id, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const BASE = `http://127.0.0.1:${WEB_PORT}/gms/pwa/snake/?test&net=ws://127.0.0.1:${NET_PORT}/gms/pwa/snake/net`;

async function player(name, extra = '') {
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 1, mobile: false }, sessionId);
    const p = {
        name, targetId, sessionId,
        async go(url) {
            await send('Page.navigate', { url }, sessionId);
            await this.until(`!!(window.game && window.game.rooms)`, 8000);
            await this.eval(`(() => { localStorage.clear(); const i = document.getElementById('username-input'); i.value = ${JSON.stringify(name)}; })()`);
            // Test players circle gently and players' snakes are armoured, so
            // nobody dies by accident halfway through a check. __armor is
            // switched off for the one deliberate death.
            await this.eval(`(() => {
                window.__armor = true;
                const inv = Snake.prototype.isInvulnerable;
                Snake.prototype.isInvulnerable = function () { return (window.__armor && !!this.owner) || inv.call(this); };
                game.input.update = (dt, a) => a + 0.03;
            })()`);
        },
        async eval(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
            if (r.exceptionDetails) throw new Error(name + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
            return r.result.value;
        },
        async until(expr, ms = 6000) {
            const end = Date.now() + ms;
            while (Date.now() < end) {
                try { if (await this.eval(expr)) return true; } catch (e) {}
                await sleep(100);
            }
            return false;
        },
        click(sel) { return this.eval(`document.querySelector(${JSON.stringify(sel)}).click()`); },
        async close() { await send('Target.closeTarget', { targetId }); }
    };
    await p.go(BASE + extra);
    return p;
}

const stats = async () => (await fetch(`http://127.0.0.1:${NET_PORT}/gms/pwa/snake/net/stats`)).json();
const pos = `(() => { const p = game.player; return p && p.alive ? { x: p.x, y: p.y, nid: p.nid, m: p.mass } : null; })()`;

try {
    // ------------------------------------------------ Alice starts a private room
    const A = await player('Alice');
    await A.click('#rooms-btn');
    ok('rooms screen opens', await A.until(`document.getElementById('rooms-screen').classList.contains('active')`));
    ok('room list arrives', await A.until(`/No rooms open|room-row/.test(document.getElementById('rooms-list').innerHTML)`));
    await A.click('.rooms-tabs button[data-tab="new"]');
    await A.eval(`document.getElementById('rooms-name').value = 'Family'`);
    await A.eval(`document.querySelector('#rooms-toggles input[data-key="baseSpeed"]').checked = false`);
    await A.click('#rooms-create');
    ok('creator is host and playing', await A.until(`game.mp.role === 'host' && game.state === 'playing' && !!game.player`));
    const code = await A.eval(`game.net.code`);
    ok('private room has a 6-char code', /^[A-Z2-9]{6}$/.test(code || ''), code);
    ok('share card is up for the creator', await A.eval(`document.getElementById('room-share').classList.contains('show')`));
    ok('room setting reached the room', await A.eval(`game.mp.allowed('baseSpeed') === false && game.mp.allowed('boost') === true`));

    // ------------------------------------------------ Bob follows the share link
    const B = await player('Bob', `&room=${code}`);
    ok('share link opens rooms with the code filled', await B.until(`document.getElementById('rooms-code').value === ${JSON.stringify(code)}`));
    await B.until(`game.net && game.net.connected`, 4000);
    await B.click('#rooms-join');
    ok('Bob joins as a follower', await B.until(`game.mp.role === 'follow'`));
    const gotWorld = await B.until(`game.mp.synced && game.player && game.player.alive && game.state === 'playing'`, 8000);
    ok('Bob gets the world and his own snake', gotWorld, gotWorld ? '' : JSON.stringify(await B.eval(`({ synced: game.mp.synced, role: game.mp.role, state: game.state, host: game.net.hostId, members: game.net.members.length, pend: game.net.link(game.net.hostId)?.pending.size, recv: game.net.link(game.net.hostId)?.recvSeq })`)));
    ok('Bob sees the arena (bots + Alice)', await B.eval(`game.snakes.length`) >= 9, String(await B.eval(`game.snakes.length`)));
    ok('Bob holds the food', await B.eval(`game.world.food.length`) > 500, String(await B.eval(`game.world.food.length`)));
    const direct = await B.until(`game.net.link(game.net.hostId) && game.net.link(game.net.hostId).direct`, 10000);
    ok('direct WebRTC link opens', direct, direct ? '' : JSON.stringify(await B.eval(`(() => { const l = game.net.link(game.net.hostId); return l && { att: l.attempts, failed: l.failed, pc: l.pc && l.pc.connectionState, ice: l.pc && l.pc.iceConnectionState, sig: l.pc && l.pc.signalingState, offerer: l.offerer, u: l.dcU && l.dcU.readyState, r: l.dcR && l.dcR.readyState }; })()`)));

    const st = await stats();
    ok('stats count the room and players', st.rooms === 1 && st.players === 2, JSON.stringify(st));

    // Bob steers; the host's copy of Bob's snake follows his own view of it.
    await B.eval(`game.input.update = () => 1.2`);
    await sleep(1500);
    const bobLocal = await B.eval(pos);
    const bobOnHost = await A.eval(`(() => { const s = game.mp.byNid.get(${bobLocal.nid}); return s ? { x: s.x, y: s.y } : null; })()`);
    const drift = bobOnHost ? Math.hypot(bobLocal.x - bobOnHost.x, bobLocal.y - bobOnHost.y) : 1e9;
    ok("host tracks Bob's snake where Bob sees it", drift < 60, `${drift.toFixed(1)}px ` + (drift < 60 ? '' : JSON.stringify({ bobLocal, bobOnHost, hostRole: await A.eval('game.mp.role'), bobRole: await B.eval('game.mp.role'), log: await A.eval('window.__netlog'), rtt: await A.eval(`game.net.link(${JSON.stringify(await B.eval('game.net.id'))})?.rtt`) })));

    // Knock Bob's own copy 150px sideways: the host must pull its copy over to
    // where Bob's browser says he is, not carry on along its own track.
    await B.eval(`(() => { const p = game.player; p.x += 150 * Math.cos(p.angle + 1.57); p.y += 150 * Math.sin(p.angle + 1.57); p._initBody(); })()`);
    let drift2 = 1e9, t2 = Date.now();
    while (Date.now() - t2 < 2000) {
        const bl = await B.eval(pos);
        const bh = await A.eval(`(() => { const s = game.mp.byNid.get(${bobLocal.nid}); return s ? { x: s.x, y: s.y } : null; })()`);
        drift2 = bh ? Math.hypot(bl.x - bh.x, bl.y - bh.y) : 1e9;
        if (drift2 < 40) break;
        await sleep(100);
    }
    ok("host follows Bob's correction", drift2 < 40, `${drift2.toFixed(1)}px after ${Date.now() - t2}ms`);

    // Alice on Bob's screen sits about one interpolation delay behind her real spot.
    const aliceReal = await A.eval(pos);
    const aliceOnBob = await B.eval(`(() => { const s = game.mp.byNid.get(${aliceReal.nid}); return s ? { x: s.x, y: s.y } : null; })()`);
    const lagPx = aliceOnBob ? Math.hypot(aliceReal.x - aliceOnBob.x, aliceReal.y - aliceOnBob.y) : 1e9;
    ok('Bob draws Alice close behind real time', lagPx < 80, `${lagPx.toFixed(1)}px`);

    // ------------------------------------------------ Bob's own browser judges his head
    await B.eval(`window.__armor = false`);
    const bobDeath = await B.eval(`(() => {
        const other = game.snakes.find(s => s.alive && s !== game.player && s.segCount > 6);
        const i = Math.floor(other.segCount / 2);
        game.player.x = other.segX[i]; game.player.y = other.segY[i];
        game.input.update = () => game.player.angle;
        return other.nid;
    })()`);
    const died = await B.until(`!game.player.alive && game.resolved`, 3000);
    ok("Bob dies running into a body he can see", died, died ? '' : JSON.stringify(await B.eval(`({ alive: game.player.alive, state: game.state, off: game.mp.clockOff, role: game.mp.role, synced: game.mp.synced, inv: game.player.isInvulnerable(), pu: Object.keys(game.player.powerups), x: game.player.x, y: game.player.y })`)));
    ok("host removes Bob's snake when told", await A.until(`!game.mp.byNid.has(${bobLocal.nid})`, 3000));
    ok('death screen offers Leave room', await B.until(`document.getElementById('death-menu-btn').textContent === 'Leave room'`, 3000));
    await B.until(`document.getElementById('death-screen').classList.contains('active')`, 3000);
    await B.click('#play-again-btn');
    ok('Bob respawns in the room', await B.until(`game.player && game.player.alive && game.state === 'playing'`, 5000));
    await B.eval(`window.__armor = true; game.input.update = (dt, a) => a + 0.03`);

    // ------------------------------------------------ Bob's socket to the room server drops
    await B.until(`game.net.link(game.net.hostId) && game.net.link(game.net.hostId).direct`, 5000);
    const bobId = await B.eval(`game.net.id`);
    await B.eval(`window.__keepLink = game.net.link(game.net.hostId); window.__closedSeen = false; game.net.on('closed', () => { window.__closedSeen = true; })`);
    await A.eval(`window.__memberEvents = 0; game.net.on('members', () => window.__memberEvents++)`);
    await B.eval(`game.net._dropSocket()`);
    ok('dropped socket shows the reconnecting pill', await B.until(`document.getElementById('reconnect-pill').classList.contains('show')`, 1500));
    const back = await B.until(`game.net.connected && !game.net.reconnecting && !document.getElementById('reconnect-pill').classList.contains('show')`, 8000);
    ok('Bob reconnects quietly', back, back ? '' : JSON.stringify(await B.eval(`({ log: window.__netlog, id: game.net.id, room: !!game.net.room })`)));
    ok('same identity, same room, still playing', await B.eval(`game.net.id === ${JSON.stringify(bobId)} && game.inRoom && game.mp.role === 'follow' && game.state === 'playing' && !window.__closedSeen`));
    ok('the direct link was never torn down', await B.eval(`game.net.link(game.net.hostId) === window.__keepLink && window.__keepLink.direct`));
    ok("the host never saw Bob leave", await A.eval(`window.__memberEvents === 0 && game.net.members.length === 2`), String(await A.eval(`window.__memberEvents`)));

    // ------------------------------------------------ Cara quick-joins and ends up in her own public room
    const C = await player('Cara');
    await C.click('#rooms-btn');
    await C.until(`game.net && game.net.connected`, 4000);
    await C.click('#rooms-auto');
    ok('AUTO JOIN starts a public room', await C.until(`game.mp.role === 'host' && !game.net.code`, 5000));
    const st2 = await stats();
    ok('stats now 2 rooms, 3 players', st2.rooms === 2 && st2.players === 3, JSON.stringify(st2));
    await C.eval(`game.net.list()`);
    const row = await C.until(`/Family/.test(document.getElementById('rooms-list').innerHTML) || game.rooms._lastList?.some(r => r.name === 'Family')`, 3000);
    const leaked = await C.eval(`JSON.stringify(game.rooms._lastList || []).includes(${JSON.stringify(code)})`);
    ok('room list shows the private room by name, never its code', row && !leaked);
    const snapBytes = await A.eval(`game.mp._encodeSnapshot(performance.now()).length`);
    ok('a snapshot is small', snapBytes < 600, `${snapBytes} bytes · ${(snapBytes * 20 / 1024).toFixed(1)} KB/s per player`);

    // ------------------------------------------------ Dan joins the family room over the relay only
    const D = await player('Dan', `&p2p=0&room=${code}`);
    await D.until(`game.net && game.net.connected`, 4000);
    await D.click('#rooms-join');
    ok('Dan (relay only) gets the world', await D.until(`game.mp.synced && game.player && game.player.alive`, 8000));
    await sleep(1200);
    ok('Dan is relayed, not direct', await D.eval(`!game.net.link(game.net.hostId).direct`));
    ok("the pill says relayed", await D.until(`/relayed/.test(document.getElementById('net-pill').textContent)`, 3000));
    ok('Dan still receives snapshots', await D.eval(`game.mp.clockOff !== null && game.mp.hist.size > 5`));

    // ------------------------------------------------ the host vanishes
    const before = await B.eval(`({ bots: game.snakes.filter(s => s.alive && !s.owner).length, food: game.world.food.length, mine: game.player.nid, mass: game.player.mass })`);
    await A.close();
    ok('next in line (Bob) takes over within ~2s', await B.until(`game.mp.role === 'host'`, 4000));
    const after = await B.eval(`({ bots: game.snakes.filter(s => s.alive && !s.owner).length, food: game.world.food.length, mine: game.player && game.player.nid, alive: !!(game.player && game.player.alive), mass: game.player && game.player.mass })`);
    ok('the bots carry on', after.bots >= before.bots - 2, `${before.bots} → ${after.bots}`);
    ok('the food carries on', Math.abs(after.food - before.food) < 120, `${before.food} → ${after.food}`);
    ok('Bob keeps his snake and his mass', after.alive && after.mine === before.mine && Math.abs(after.mass - before.mass) < 30, `${before.mass.toFixed(1)} → ${after.mass?.toFixed(1)}`);
    ok('Dan resyncs to the new host', await D.until(`game.mp.synced && game.mp.clockOff !== null && game.player && game.player.alive`, 6000));
    ok("Alice's snake is gone from the arena", await B.until(`!game.snakes.some(s => s.alive && s.name === 'Alice')`, 3000));
    const t0 = await B.eval(`game.snakes.filter(s=>!s.owner&&s.alive).map(s=>s.x+s.y).reduce((a,b)=>a+b,0)`);
    await sleep(500);
    const t1 = await B.eval(`game.snakes.filter(s=>!s.owner&&s.alive).map(s=>s.x+s.y).reduce((a,b)=>a+b,0)`);
    ok('the new host is simulating', Math.abs(t1 - t0) > 1);

    // ------------------------------------------------ planned handoff (host's tab hidden)
    if (process.env.NETLOG) console.log('ids', JSON.stringify({ B: await B.eval('game.net.id'), D: await D.eval('game.net.id') }));
    await B.eval(`game.net.handoff('test')`);
    ok('handoff: Dan becomes host at once', await D.until(`game.mp.role === 'host'`, 2000));
    await sleep(1500);
    const handoffs = l => (l || []).filter(x => x.startsWith('handoff:'));
    const logs = { B: handoffs(await B.eval('window.__netlog')), D: handoffs(await D.eval('window.__netlog')) };
    if (process.env.NETLOG) console.log('after-handoff', JSON.stringify(logs));
    ok('no handoffs beyond the one asked for', (logs.B || []).length === 1 && !(logs.D || []).length, JSON.stringify(logs));
    ok('handoff: Bob is a follower again and synced', await B.until(`game.mp.role === 'follow' && game.mp.synced && game.mp.clockOff !== null`, 5000));
    ok('handoff: Bob still has his snake', await B.eval(`!!(game.player && game.player.alive && game.player.nid === ${before.mine})`));

    // ------------------------------------------------ the room server restarts
    const ids = { B: await B.eval(`game.net.id`), D: await D.eval(`game.net.id`) };
    netProc.kill();
    await sleep(1500);
    startNet();
    const rejoined = async P => P.until(`game.net.connected && !game.net.reconnecting && game.inRoom && game.net.room`, 12000);
    const rb = await rejoined(B), rd = await rejoined(D), rc = await rejoined(C);
    ok('after a server restart everyone rejoins their room', rb && rd && rc, JSON.stringify({ B: await B.eval('window.__netlog'), D: await D.eval('window.__netlog'), C: await C.eval('window.__netlog') }));
    ok('restart: same ids, same code, same host', await B.eval(`game.net.id === ${JSON.stringify(ids.B)} && game.net.code === ${JSON.stringify(code)} && game.mp.role === 'follow'`) &&
        await D.eval(`game.net.id === ${JSON.stringify(ids.D)} && game.mp.role === 'host'`));
    ok('restart: Bob still synced to Dan', await B.until(`game.mp.synced && game.player && game.player.alive && game.state === 'playing'`, 5000));
    const st3 = await stats();
    // Family (Bob, Dan) and Cara's public room, nothing else.
    ok('restart: the server counts the rebuilt rooms', st3.rooms === 2 && st3.players === 3 && await B.eval(`game.net.members.length === 2`), JSON.stringify(st3));

    // ------------------------------------------------ leaving
    await D.click('#rooms-btn').catch(() => {});
    await B.eval(`game.leaveRoom()`);
    ok('leaving returns to the menu', await B.until(`game.state === 'menu' && !game.inRoom && document.getElementById('menu-screen').classList.contains('active')`));
    ok("leaver's snake removed for the others", await D.until(`!game.snakes.some(s => s.alive && s.name === 'Bob')`, 3000));

    // ------------------------------------------------ solo still works
    await B.click('#play-btn');
    ok('solo PLAY still works', await B.until(`game.state === 'playing' && !game.inRoom && game.snakes.length === 1 + 15`, 3000));
} catch (e) {
    fail++;
    console.log('FAIL  harness: ' + e.message);
}

console.log(`\n${pass} pass, ${fail} fail`);
ws.close();
process.exit(fail ? 1 : 0);
