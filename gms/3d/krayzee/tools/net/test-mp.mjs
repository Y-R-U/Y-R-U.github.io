// Two-tab online test over raw CDP (port 9561) against a local krayzeenet and tools/net/sandbox.html.
//   node tools/net/test-mp.mjs            direct (WebRTC) run, relay run (?p2p=0), then the falsification run
//   node tools/net/test-mp.mjs --keep     leave Chrome running
// Needs the site served on http://localhost:8888 (repo root). Screenshots: docs/shots/net/.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_PORT = 9561, NET_PORT = 8738;
const SITE = 'http://localhost:8888/gms/3d/krayzee/tools/net/sandbox.html';
const NETURL = `ws://127.0.0.1:${NET_PORT}/gms/3d/krayzee/net`;
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SERVER = fileURLToPath(new URL('../../server/', import.meta.url));
const SHOTS = fileURLToPath(new URL('../../docs/shots/net/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bin = join(tmpdir(), 'krayzeenet-mp');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, stdio: 'inherit' });
const srv = spawn(bin, [], { env: { ...process.env, KRAYZEE_ADDR: `127.0.0.1:${NET_PORT}`, KRAYZEE_DEV_AUTH: '1', KRAYZEE_ICE_URL: 'off', KRAYZEE_GRACE_MS: '3000' }, stdio: 'ignore' });
execFileSync(CDP, ['start', '--port', String(CDP_PORT), '--idle', '120', '--max', '900', '--', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=WebRtcHideLocalIpsWithMdns'], { stdio: 'inherit' });

// Each tab gets its own window: a background tab is hidden, and a hidden host hands off (as it should).
let browser = null;
async function newWindow() {
  if (!browser) {
    const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const wait = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d.result); wait.delete(d.id); } };
    browser = { ws, send: (method, params) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
  }
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow: true });
  return { id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}` };
}

async function tab() {
  const t = await newWindow();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expr, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
    return false;
  };
  const point = async (sel) => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n || n.disabled) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const click = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  const tap = async (sel) => { const p = await point(sel); if (!p) throw new Error(`no tappable ${sel}`); await click(p); await sleep(200); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(r.data, 'base64')); };
  const close = () => { try { ws.close(); } catch (e) { /* closed */ } return fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`).catch(() => {}); };
  return { send, ev, until, tap, point, click, shot, close, errors, go: (q) => send('Page.navigate', { url: `${SITE}?${q}` }) };
}

async function run(mode) {
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label + (cond || !extra ? '' : ` — ${extra}`)); console.log(`${cond ? 'ok  ' : 'FAIL'} [${mode}] ${label}${cond || !extra ? '' : ` — ${extra}`}`); };
  const extra = mode === 'relay' ? '&p2p=0' : '';
  const A = await tab(), B = await tab();
  try {
    await A.go(`net=${encodeURIComponent(NETURL)}&name=Dirk&voices=toff,bubba&rank=king&uid=dirk-${mode}${extra}${mode === 'falsify' ? '&freeze=1' : ''}`);
    await B.go(`net=${encodeURIComponent(NETURL)}&name=Mo&g=f&voices=toff,bubba&uid=mo-${mode}${extra}`);
    ok(await A.until('window.__sb?.net.connected') && await B.until('window.__sb?.net.connected'), 'both tabs reach the room server');

    await A.tap('[data-a="create"]');
    ok(await A.until('!!document.querySelector(".kzn-type[data-type=\\"court\\"][aria-pressed=\\"true\\"]")'), 'create screen shows room types (court default)');
    await A.tap('[data-a="ok"]');
    ok(await A.until('__sb.net.room && document.querySelector(".kzn").dataset.view === "room"'), 'host lands in the room view');
    const code = await A.ev('document.querySelector("[data-s=code]").textContent');
    ok(/^[A-HJ-NP-Z2-9]{6}$/.test(code), 'room code shown', code);

    await B.tap('#kzn-code');
    await B.send('Input.insertText', { text: code.toLowerCase() });
    await B.tap('[data-a="join"]');
    ok(await B.until('__sb.net.room?.members.length === 2') && await A.until('__sb.net.room?.members.length === 2'), 'second tab joins by code');
    const voices = await B.ev('__sb.net.room.members.map(m => m.voice).join()');
    ok(voices === 'toff,bubba', 'first favourite to the host, fallback to the next', voices);
    ok(await B.ev('(() => { const c = document.querySelector(".kzn-voice[data-v=toff]"); return c.disabled && c.dataset.taken === "1" && /Taken by Dirk/.test(c.textContent); })()'), "host's voice card is greyed with the holder's name");
    ok(await B.until('[...document.querySelectorAll(".kzn-players li")].some(li => /Dirk/.test(li.textContent) && li.querySelector(".kzn-crown svg"))'), 'player list shows the host crown, titles and names');

    // Voice conflict: both tap the same free card in the same instant.
    const pa = await A.point('.kzn-voice[data-v=tex]'), pb = await B.point('.kzn-voice[data-v=tex]');
    await Promise.all([A.click(pa), B.click(pb)]);
    await sleep(700);
    const owners = await A.ev('__sb.net.room.members.filter(m => m.voice === "tex").map(m => m.name)');
    ok(owners.length === 1, 'simultaneous voice tap: exactly one winner', JSON.stringify(owners));
    // The loser either lost the race at the server (told who holds it) or its card was already greyed when tapped.
    const L = owners[0] === 'Dirk' ? B : A, win = owners[0];
    const lost = await L.ev('JSON.stringify({ claims: __sb.claims, msg: document.querySelector(".kzn-msg").textContent, card: document.querySelector(".kzn-voice[data-v=tex]").textContent })');
    const lj = JSON.parse(lost), refused = lj.claims.find((c) => c.voice === 'tex' && !c.ok);
    ok(new RegExp(`Taken by ${win}`).test(lj.card) && (!refused || (refused.byName === win && /taken by/i.test(lj.msg))), 'loser is told who holds it', lost);
    if (refused) console.log(`     [${mode}] the tap race reached the server: ${win} won, the other was refused`);
    await A.shot(`lobby-room-${mode}.png`);

    await B.tap('[data-a="ready"]');
    ok(await A.until('__sb.net.room.members.find(m => m.name === "Mo")?.rdy === true'), 'ready tick reaches the host');
    await A.tap('[data-a="start"]');
    ok(await A.until('__sb.flying') && await B.until('__sb.flying'), 'host Start puts both tabs in flight');

    const bId = await B.ev('__sb.net.id'), aId = await A.ev('__sb.net.id');
    await sleep(1800);
    const s1 = await B.ev(`__sb.remotePos(${JSON.stringify(aId)})`), a1 = await A.ev('__sb.localAt()');
    await sleep(1000);
    const s2 = await B.ev(`__sb.remotePos(${JSON.stringify(aId)})`), a2 = await A.ev('__sb.localAt()');
    const moved = s1 && s2 ? Math.hypot(s2.x - s1.x, s2.z - s1.z) : 0;
    const err = s2 ? Math.hypot(s2.x - a2.x, s2.z - a2.z) : 1e9;
    ok(moved > 30, "B sees A's plane move", `moved ${moved.toFixed(1)} m in 1 s`);
    ok(s2?.st === 'interp' && err < 40, "B's view of A tracks A (interpolated, behind by the render delay)", `state ${s2?.st}, ${err.toFixed(1)} m off`);
    const r1 = await A.ev(`__sb.remotePos(${JSON.stringify(bId)})`);
    await sleep(600);
    const r2 = await A.ev(`__sb.remotePos(${JSON.stringify(bId)})`);
    ok(r1 && r2 && Math.hypot(r2.x - r1.x, r2.z - r1.z) > 15, "A sees B's plane move");
    const clk = await Promise.all([A.ev('__sb.net.roomTime()'), B.ev('__sb.net.roomTime()')]);
    ok(Math.abs(clk[0] - clk[1]) < 60, 'room clocks agree', `${Math.round(clk[0] - clk[1])} ms`);
    const links = await B.ev('__sb.net.linkSummary()');
    if (mode === 'relay') ok(links.relayed === 1, 'p2p=0: traffic goes through the relay', JSON.stringify(links));
    else ok(links.relayed === 0, 'WebRTC data channel is up (direct)', JSON.stringify(links));
    ok(await B.ev('__sb.net.claim && true') && await B.ev('(() => { __sb.net.claim("nan"); return true; })()'), 'claim sent in flight');
    await sleep(400);
    ok(await B.ev('__sb.net.me.voice !== "nan"'), 'no voice change while airborne (D5)');
    await A.shot(`sky-${mode}.png`);

    // Host leaves: closing the tab says goodbye, the guest takes over at once.
    const ep = await B.ev('__sb.net.room.epoch');
    await A.close();
    ok(await B.until('__sb.net.isHost && __sb.net.room.members.length === 1', 4000), 'host closes the tab → the guest becomes host');
    ok((await B.ev('__sb.net.room.epoch')) > ep, 'epoch bumped on handoff');
    await B.ev('document.getElementById("toLobby").click()');
    await sleep(300);
    ok(await B.ev('!!document.querySelector(`.kzn-players li[data-id="${__sb.net.id}"] .kzn-crown svg`)'), 'lobby shows the crown on the new host');
    await B.shot(`handoff-${mode}.png`);
    ok(!A.errors.length && !B.errors.length, 'no page errors', [...A.errors, ...B.errors].join(' | '));
  } catch (e) {
    ok(false, 'run threw', e.message);
  } finally {
    await A.close(); await B.close();
  }
  return { fails, passes };
}

// Phone-size screenshots of the lobby screens, and no horizontal overflow at 390 px.
async function phoneShots() {
  const P = await tab();
  await P.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await P.go(`net=${encodeURIComponent(NETURL)}&name=Phone&rank=king&uid=phone`);
  await P.until('window.__sb?.net.connected');
  await sleep(400);
  await P.shot('phone-home.png');
  await P.tap('[data-a="create"]');
  await sleep(300);
  await P.shot('phone-create.png');
  const wide = await P.ev('document.querySelector(".kzn-body").scrollWidth > document.querySelector(".kzn-body").clientWidth + 1');
  await P.tap('[data-a="ok"]');
  await P.until('__sb.net.room');
  await sleep(300);
  await P.shot('phone-room.png');
  const wide2 = await P.ev('document.querySelector(".kzn-body").scrollWidth > document.querySelector(".kzn-body").clientWidth + 1');
  await P.close();
  console.log(`${!wide && !wide2 ? 'ok  ' : 'FAIL'} phone 390 px: lobby has no horizontal overflow`);
  return wide || wide2 ? 1 : 0;
}

let bad = 0;
try {
  bad += await phoneShots();
  for (const mode of ['direct', 'relay']) bad += (await run(mode)).fails.length;
  // Falsification: A sends a frozen plane. The movement check must fail, or it was never measuring anything.
  const f = await run('falsify');
  const caught = f.fails.some((x) => x.startsWith("B sees A's plane move"));
  console.log(`${caught ? 'ok  ' : 'FAIL'} falsify: a frozen plane fails "B sees A's plane move"`);
  if (!caught) bad++;
} finally {
  srv.kill();
  if (!process.argv.includes('--keep')) { try { execFileSync(CDP, ['stop', String(CDP_PORT)], { stdio: 'ignore' }); } catch (e) { /* stopped */ } }
}
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
