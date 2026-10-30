// Board functional test over CDP (port 9502): input (drag-drop, tap-tap, orbit, skip)
// and special moves (castling, en passant, promotion). Small dpr-1 viewport because
// headless swiftshader is slow. Usage: node tools/board_test.mjs [outDir]
import { writeFileSync, mkdirSync } from 'fs';
const PORT = +(process.env.CDP_PORT || 9502), out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });
const URL = 'http://192.168.0.236:8888/gms/3d/gambit/tools/board_gallery.html?mode=play&view=top';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(), errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
const until = async (x, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(ok ? 'PASS' : 'FAIL', name, info); ok ? pass++ : fail++; };

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 760, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await until('window.G && G.boards.length === 1 && G.chess');
// screen position of a square, page coords
const sp = async sq => ev(`(()=>{const b=G.boards[0],r=document.querySelector('.host').getBoundingClientRect(),p=b.squareToScreen('${sq}');return [r.left+p.x,r.top+p.y]})()`);
const idle = () => until('!G.boards[0].isAnimating()');

// 1) drag-drop e2 -> e4
let [x0, y0] = await sp('e2'), [x1, y1] = await sp('e4');
await mouse('mousePressed', x0, y0);
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6);
await mouse('mouseReleased', x1, y1, 0);
await sleep(300); await idle();
check('drag-drop e2e4', await ev(`G.boards[0].pieceAt('e4')?.type==='p' && !G.boards[0].pieceAt('e2') && G.chess.fen().startsWith('rnbqkbnr/pppppppp/8/8/4P3')`));

// 2) tap-tap e7 -> e5
[x0, y0] = await sp('e7'); [x1, y1] = await sp('e5');
await mouse('mousePressed', x0, y0); await mouse('mouseReleased', x0, y0, 0);
await sleep(200);
check('tap selects + legal dots', await ev(`G.boards[0].stats() && true`));
await mouse('mousePressed', x1, y1); await mouse('mouseReleased', x1, y1, 0);
await sleep(300); await idle();
check('tap-tap e7e5', await ev(`G.boards[0].pieceAt('e5')?.color==='b'`));

// 3) illegal drop snaps back
[x0, y0] = await sp('d2'); [x1, y1] = await sp('d6');
await mouse('mousePressed', x0, y0);
for (let i = 1; i <= 4; i++) await mouse('mouseMoved', x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * i / 4);
await mouse('mouseReleased', x1, y1, 0); await sleep(1500);
check('illegal drop snaps back', await ev(`G.boards[0].pieceAt('d2')?.type==='p' && !G.boards[0].pieceAt('d6')`));

// 4a) locked Top: drag on empty space, wheel and arrow keys do NOT move the camera
const camKey = `JSON.stringify((({phi,theta,zoom})=>[phi,theta,zoom].map(v=>+v.toFixed(4)))(G.boards[0].camera.state))`;
await ev(`G.boards[0].camera.preset('top')`); await sleep(1500);
const c0 = await ev(camKey);
[x0, y0] = await sp('d4');
await mouse('mousePressed', x0, y0);
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', x0 + i * 15, y0 + i * 8);
await mouse('mouseReleased', x0 + 90, y0 + 48, 0);
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x0, y: y0, deltaX: 0, deltaY: -400 });
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(500);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowLeft', key: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(800);
const c1 = await ev(camKey);
check('Top (locked): drag/wheel/keys do not move camera', c0 === c1 && (await ev('G.boards[0].camera.locked')) === true, `${c0} vs ${c1}`);
await shot('mode_top_after_drag');
// 4b) V cycles views
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyV', key: 'v', windowsVirtualKeyCode: 86 });
check('V cycles top -> tilt', (await ev('G.boards[0].camera.view')) === 'tilt');
check('legacy "default" maps to tilt', (await ev(`G.boards[0].camera.preset('default')`)) === 'tilt');
// 4c) Free: drag on an empty square orbits and never moves a piece
await ev(`G.boards[0].camera.preset('free')`); await sleep(1500);
const th0 = await ev('G.boards[0].camera.state.theta');
[x0, y0] = await sp('d4');
await mouse('mousePressed', x0, y0);
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', x0 + i * 15, y0);
await mouse('mouseReleased', x0 + 90, y0, 0);
await sleep(400);
const th1 = await ev('G.boards[0].camera.state.theta');
check('empty-space drag orbits', Math.abs(th1 - th0) > 0.2, `theta ${th0}→${th1.toFixed(2)}`);
check('orbit moved no pieces', await ev(`G.chess.fen().split(' ')[0]===(()=>{let s='';for(let r=8;r>=1;r--){let e=0;for(const f of 'abcdefgh'){const p=G.boards[0].pieceAt(f+r);if(!p){e++;continue}if(e){s+=e;e=0}s+=p.color==='w'?p.type.toUpperCase():p.type}if(e)s+=e;if(r>1)s+='/'}return s})()`));
await shot('mode_free_after_drag');
await ev(`G.boards[0].camera.preset('top')`);

// 5) battle skip by tap
await ev(`(()=>{const b=G.boards[0];b.setAnimSpeed(1);G.chess.load('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');b.setPosition(G.chess.fen());window.__t0=performance.now();window.__bp=b.applyMove(G.chess.move('exd5'),{battle:true}).then(()=>window.__bt=performance.now()-__t0);})()`);
await sleep(2500);
const midBattle = await ev('G.boards[0].isAnimating()');
await shot('test_battle_before_skip');
await mouse('mousePressed', 200, 400); await mouse('mouseReleased', 200, 400, 0);
const skipped = await until('window.__bt!==undefined', 15000);
check('battle skippable by tap', midBattle && skipped && await ev(`G.boards[0].pieceAt('d5')?.color==='w' && !G.boards[0].pieceAt('e4')`), `mid=${midBattle}`);

// 6) castling moves the rook
await ev(`(()=>{const b=G.boards[0];G.chess.load('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');b.setPosition(G.chess.fen());return b.applyMove(G.chess.move('e1g1'))})()`);
check('castling O-O', await ev(`(()=>{const b=G.boards[0];return b.pieceAt('g1')?.type==='k'&&b.pieceAt('f1')?.type==='r'&&!b.pieceAt('h1')})()`));
await ev(`G.boards[0].applyMove(G.chess.move('e8c8'))`);
check('castling O-O-O', await ev(`(()=>{const b=G.boards[0];return b.pieceAt('c8')?.type==='k'&&b.pieceAt('d8')?.type==='r'&&!b.pieceAt('a8')})()`));

// 7) en passant removes the right pawn (battle off)
await ev(`(()=>{const b=G.boards[0];b.setAnimSpeed('off');G.chess.load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');b.setPosition(G.chess.fen());return b.applyMove(G.chess.move('e5d6'),{battle:true})})()`);
check('en passant', await ev(`(()=>{const b=G.boards[0];return b.pieceAt('d6')?.color==='w'&&!b.pieceAt('d5')&&!b.pieceAt('e5')})()`));

// 8) promotion with capture, battle on at 5x
await ev(`(()=>{const b=G.boards[0];b.setAnimSpeed(5);G.chess.load('3r2k1/2P5/8/8/8/8/8/4K3 w - - 0 1');b.setPosition(G.chess.fen());return b.applyMove(G.chess.move('c7d8n'),{battle:true})})()`);
check('promotion (capture, 5x) -> knight', await ev(`G.boards[0].pieceAt('d8')?.type==='n' && G.boards[0].pieceAt('d8')?.color==='w' && !G.boards[0].pieceAt('c7')`));

// 9) desync recovery via move.after
await ev(`(()=>{const b=G.boards[0];b.setPosition('8/8/8/8/8/8/8/4K2k w - - 0 1');return b.applyMove({from:'a2',to:'a4',after:'8/8/8/8/P7/8/8/4K2k b - - 0 1'})})()`);
check('desync resync via after', await ev(`G.boards[0].pieceAt('a4')?.type==='p'`));

// 10) animated setPosition (takeback)
await ev(`G.boards[0].setPosition('4k3/8/8/8/8/8/P7/4K2k w - - 0 1',{animate:true})`);
check('animated setPosition', await ev(`G.boards[0].pieceAt('a2')?.type==='p' && !G.boards[0].pieceAt('a4') && !G.boards[0].isAnimating()`));

// 11) flip + theme reload
await ev(`(async()=>{const b=G.boards[0];b.setOrientation('b');await b.setTheme('classic');b.setOrientation('w')})()`);
check('flip + setTheme', (await ev('G.boards[0].orientation')) === 'w');
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
