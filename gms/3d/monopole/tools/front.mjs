#!/usr/bin/env node
// Plays the real front of the game with real taps and screenshots it as it goes. Same raw-CDP
// recipe as uishot.mjs, but this one drives a sequence rather than loading a single state — which
// is the only way to see whether the cold open actually moves, whether the handover lands in the
// room, and whether the terminal transition reads.
//
//   node tools/front.mjs --flow=coldopen                    # every ruling beat, phone
//   node tools/front.mjs --flow=coldopen --w=1280 --h=720   # the same on a desktop frame
//   node tools/front.mjs --flow=coldopen --sound            # the recorded ruling, caption slip checked
//   node tools/front.mjs --flow=room                        # handover → room → terminal → back
//   node tools/front.mjs --flow=look                        # the room's look-around limits
//   node tools/front.mjs --flow=terminal                    # every application, the yard, a panel
//   node tools/front.mjs --flow=yard                        # turn the hull vs swipe the rail
//   node tools/front.mjs --flow=sale                        # a haggled price expiring under you
//   node tools/front.mjs --flow=clock                       # what does and does not spend a week
//   node tools/front.mjs --flow=back                        # the back chain, five deep to the gate

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, createReadStream, statSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const PORT = 8831 + (process.pid % 200);
const CDP_PORT = 9531 + (process.pid % 200);
const W = +(args.w || 390), H = +(args.h || 844);
const DPR = +(args.dpr || 2);
const FLOW = args.flow || 'coldopen';
const SOUND = !!args.sound;
const OUTDIR = resolve(ROOT, args.outdir || `shots/front/${FLOW}`);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

async function chrome() {
  const flags = [
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/mono-front-${process.pid}`,
    `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--headless=new', '--use-angle=metal', '--use-gl=angle', '--ignore-gpu-blocklist',
  ];
  // Headless has no speakers but it does decode, and `currentTime` runs in real time — which is
  // all the cold open needs, because with sound the recording is the clock and the captions only
  // ever read it. Lifting the gesture requirement is what lets a script check the beat map.
  if (SOUND) flags.push('--autoplay-policy=no-user-gesture-required');
  const proc = spawn(CHROME, flags, { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return { proc, ws: (await r.json()).webSocketDebuggerUrl };
    } catch { await sleep(150); }
  }
  throw new Error('chrome did not come up');
}

class CDP {
  constructor(url) { this.id = 0; this.pending = new Map(); this.url = url; }
  connect() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = rej;
      this.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && this.pending.has(m.id)) {
          const { res: r, rej: j } = this.pending.get(m.id);
          this.pending.delete(m.id);
          m.error ? j(new Error(m.error.message)) : r(m.result);
        }
      };
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); });
  }
}

let PROC = null;
function cleanup(proc) {
  const dir = `/tmp/mono-front-${process.pid}`;
  try { (proc || PROC)?.kill(); } catch {}
  try { execSync(`pkill -f ${dir} 2>/dev/null; sleep 0.3`, { stdio: 'ignore', shell: '/bin/sh' }); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

let n = 0;
async function shot(S, name, note = '') {
  const { data } = await S('Page.captureScreenshot', { format: 'png' });
  const file = resolve(OUTDIR, `${String(++n).padStart(2, '0')}_${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`  ${file.replace(ROOT + '/', '')}${note ? '  ' + note : ''}`);
  for (const l of logs.splice(0)) console.log('    ' + l);
}

// A real tap in the middle of the frame, which is what a player does to page a beat on.
async function tap(S, x = W / 2, y = H / 2) {
  for (const type of ['touchStart', 'touchEnd']) {
    await S('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  }
  await sleep(60);
}

// Scrolls the target into view first. A synthetic touch is delivered at a viewport coordinate, so
// tapping something below the fold silently lands on whatever happens to be there instead — which
// on a 390 px-tall landscape frame is most of the yard's board.
async function tapSel(S, sel) {
  const q = JSON.stringify(sel);
  const found = await evalJSON(S, `(()=>{const e=document.querySelector(${q});if(!e)return 0;e.scrollIntoView({block:'center'});return 1;})()`);
  if (!found) { console.log(`  ⚠ no element for ${sel}`); return false; }
  await sleep(120);
  const box = await evalJSON(S, `(()=>{const e=document.querySelector(${q});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if (!box || box.y < 0 || box.y > H) { console.log(`  ⚠ ${sel} is off screen`); return false; }
  await tap(S, box.x, box.y);
  return true;
}

// where the camera is, and how far it is from whatever it is pointing at — the number that says
// whether the cold open is actually approaching anything
const CAM = `(()=>{const r=window.__mono.camera.rig;return {dist:Math.round(r.dist),fov:Math.round(r.fov),pos:r.cam.position.toArray().map(v=>Math.round(v)),look:r.target.toArray().map(v=>Math.round(v))};})()`;

async function main() {
  const server = await serve();
  const { proc, ws } = await chrome();
  PROC = proc;
  const cdp = new CDP(ws);
  await cdp.connect();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable');

  cdp.ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && /error|warn/.test(m.params.type)) {
      logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('[throw] ' + (d.exception?.description || d.text));
    }
  });

  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: W < H });
  await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  mkdirSync(OUTDIR, { recursive: true });

  await ({ coldopen, room, look, terminal, clock, back, yard, sale }[FLOW] || coldopen)(S);

  await S('Browser.close').catch(() => {});
  cleanup(proc); server.close();
}

// Every ruling beat, left to play itself, with the camera distance printed beside each frame.
//
// `mute=1`, so this is the 66-second silent cut and not the 137-second recording. It is the same
// twenty-two beats and the same eight framings either way — only the holds differ — and headless
// Chrome refuses to make a sound anyway, which would have put every one of these shots on the
// silent clock while the script waited on the audio one.
async function coldopen(S) {
  await load(S, SOUND ? '?front=1' : '?front=1&mute=1');
  if (SOUND) {
    await sleep(900);
    await shot(S, 'gate');
    await tapSel(S, '#gate [data-g="sound"]');
  }
  // Watch the stage for a new beat rather than sleeping each beat's own length. Sleeping drifts —
  // four CDP round-trips and a PNG cost more than the 1.4-second cards do, so the sampler used to
  // slide a beat behind and miss one every time the captions got shorter.
  const seen = new Set();
  const until = Date.now() + 200000;
  let last = null;
  let slip = 0;
  while (Date.now() < until) {
    const id = await evalJSON(S, `document.querySelector('#verdict .v-stage')?.getAttribute('key') || null`);
    if (!id) { if (seen.size) break; await sleep(60); continue; }
    if (id !== last) {
      last = id;
      if (seen.has(id)) { await sleep(60); continue; }
      seen.add(id);
      // With sound on, how late the caption was against the second it is authored for. Anything
      // over a tenth of a second means the beat map and the file have come apart.
      let late = '';
      if (SOUND) {
        const t = await evalJSON(S, `window.__mono.verdict?.now ?? null`);
        const at = await evalJSON(S, `(window.__mono.verdictBeats||[]).find(b=>b.id===${JSON.stringify(id)})?.at ?? null`);
        if (t != null && at != null) { slip = Math.max(slip, Math.abs(t - at)); late = ` · at ${at}s heard ${t.toFixed(2)}s`; }
      }
      await sleep(340);
      const cam = await evalJSON(S, CAM);
      const st = await evalJSON(S, `window.__mono.stats()`);
      await shot(S, `beat${String(seen.size - 1).padStart(2, '0')}_${id}`,
        `dist ${cam.dist} fov ${cam.fov} · ${st.calls} calls ${(st.tris / 1000).toFixed(0)}k tris ${st.texMB.toFixed(1)}MB${late}`);
      continue;
    }
    await sleep(60);
  }
  const total = await evalJSON(S, `(window.__mono.verdictBeats||[]).length`);
  if (seen.size !== total) console.log(`  !! ${seen.size} of ${total} beats reached the stage`);
  if (SOUND) console.log(`  worst caption slip ${slip.toFixed(2)}s`);
  await sleep(1200);
  await shot(S, 'after_ruling');
}

// The handover: skip the ruling, build a character, and see where the game actually puts you.
async function room(S) {
  await load(S, '?front=1&mute=1');
  await sleep(700);
  await tapSel(S, '#verdict [data-v="skip"]');
  await sleep(1600);
  await shot(S, 'origin_pick');
  await tapSel(S, '#origin [data-o="pick"]');
  await sleep(800);
  await shot(S, 'character');
  await tapSel(S, '#origin [data-o="start"]');
  await sleep(900);
  await sleep(3200);
  await shot(S, 'handover', JSON.stringify(await evalJSON(S, `({quarters:document.body.classList.contains('in-quarters'),terminal:document.body.classList.contains('in-terminal')})`)));
  await sleep(2500);
  await shot(S, 'settled', JSON.stringify(await evalJSON(S, CAM)));
  // and straight on into the terminal, which is where the first objective sends you
  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(1800);
  await shot(S, 'terminal');
  await tapSel(S, '#terminal [data-t="room"]');
  await sleep(1600);
  await shot(S, 'back_in_room');
  // out to the system and back in off the HUD, which is the other way round the loop
  await tapSel(S, '#roomnav [data-r="system"]');
  await sleep(1800);
  await shot(S, 'system', JSON.stringify(await evalJSON(S, `(()=>{const r=document.querySelector('#speed').getBoundingClientRect();return {speedRight:Math.round(r.right),vw:innerWidth,fits:r.right<=innerWidth};})()`)));
  await tapSel(S, '[data-hud-quarters]');
  await sleep(1800);
  await shot(S, 'room_again', JSON.stringify(await evalJSON(S, `({quarters:document.body.classList.contains('in-quarters'),nav:!!document.querySelector('#roomnav.in')})`)));
}

// Into the room, into the terminal, through its screens, and back out again.
async function terminal(S) {
  await load(S, '?front=0&intro=0');
  await sleep(2600);
  await evalJSON(S, `window.__mono.quarters.enter().then(()=>1)`);
  await sleep(1500);
  await shot(S, 'room');
  // the glass itself, not a button: this is the tap Aaron asked for
  await tap(S, W * 0.62, H * 0.47);
  await sleep(1400);
  await shot(S, 'window_tapped');
  await tapSel(S, '#roomnav [data-r="back"]');
  await sleep(1200);
  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(1700);
  await shot(S, 'terminal_home');
  for (const id of ['identity', 'banking', 'quarters', 'contracts']) {
    await tapSel(S, `#terminal [data-t="app"][data-id="${id}"]`);
    await sleep(600);
    await shot(S, 'terminal_' + id);
    await tapSel(S, '#terminal [data-t="home"]');
    await sleep(400);
  }
  await tapSel(S, '#terminal [data-t="app"][data-id="yard"]');
  await sleep(2200);
  await shot(S, 'yard_first_hull');
  await tapSel(S, '#yard [data-y="next"]');
  await sleep(1500);
  await shot(S, 'yard_second_hull');
  await tapSel(S, '#yard [data-y="ask"]');
  await sleep(1600);
  await shot(S, 'yard_haggled');
  await tapSel(S, '#yard [data-y="detail"]');
  await sleep(700);
  await shot(S, 'yard_sheet');
  await tapSel(S, '#yard [data-y="out"]');
  await sleep(2000);
  await tapSel(S, '#terminal [data-t="panel"][data-id="market"]');
  await sleep(900);
  await shot(S, 'terminal_market_panel');
  await tapSel(S, '#sheet [data-sheet-close]');
  await sleep(600);
  await tapSel(S, '#terminal [data-t="room"]');
  await sleep(1800);
  await shot(S, 'back_in_room', JSON.stringify(await evalJSON(S, `({quarters:document.body.classList.contains('in-quarters'),terminal:document.body.classList.contains('in-terminal')})`)));
  await tapSel(S, '#roomnav [data-r="system"]');
  await sleep(1800);
  await shot(S, 'system_view');
}

// The two gestures the sales floor has to keep apart: a drag over the hull turns the hull, and a
// drag on the rail changes which hull it is. Both print the state they moved.
async function yard(S) {
  const WHERE = `(()=>{const y=window.__mono.yard;const r=window.__mono.camera.rig;`
    + `return {hull:document.querySelector('.y-card b')?.textContent,theta:Math.round(r.want.theta*100)/100,`
    + `spin:Math.round((window.__mono.world.subject?.rotation.y||0)*100)/100};})()`;
  await load(S, '?front=0&intro=0');
  await sleep(2400);
  await evalJSON(S, `window.__mono.quarters.enter().then(()=>1)`);
  await sleep(1500);
  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(1700);
  await tapSel(S, '#terminal [data-t="app"][data-id="yard"]');
  await sleep(2000);
  await shot(S, 'opened', JSON.stringify(await evalJSON(S, WHERE)));

  // over the hull: this must turn the camera and leave the hull the same
  await drag(S, W * 0.5, H * 0.28, W * 0.5 - 220, H * 0.28);
  await sleep(700);
  await shot(S, 'dragged_hull', JSON.stringify(await evalJSON(S, WHERE)));

  // pinch on the hull
  await pinch(S, W * 0.5, H * 0.28, 60, 200);
  await sleep(700);
  await shot(S, 'pinched', JSON.stringify(await evalJSON(S, `Math.round(window.__mono.camera.rig.want.dist)`)));

  // on the rail: this must change hull and leave the camera alone
  const rail = await evalJSON(S, `(()=>{const r=document.querySelector('.y-rail').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await drag(S, rail.x + 90, rail.y, rail.x - 90, rail.y);
  await sleep(1400);
  await shot(S, 'swiped_rail', JSON.stringify(await evalJSON(S, WHERE)));

  await tapSel(S, '#yard [data-y="chat"]');
  await sleep(500);
  await tapSel(S, '#yard [data-y="detail"]');
  await sleep(600);
  await shot(S, 'sheet_no_chat');
  await tapSel(S, '#yard [data-y="buy"]');
  await sleep(2600);
  await shot(S, 'bought', JSON.stringify(await evalJSON(S, `({week:window.__mono.sim.week,hulls:window.__mono.sim.state.ships.length,cash:window.__mono.sim.state.cash})`)));
}

// Haggle a price down, walk away for a fortnight, come back. The number on the rail has to have
// gone back up and the broker has to say so — a countdown that never actually bites is decoration.
async function sale(S) {
  const READ = `(()=>({hull:document.querySelector('.y-card b')?.textContent,`
    + `price:document.querySelector('.y-price em')?.textContent,`
    + `clock:document.querySelector('.y-clock')?.textContent.trim()||null,`
    + `hot:!!document.querySelector('.y-clock.hot'),`
    + `week:window.__mono.sim.week,`
    + `said:[...document.querySelectorAll('.y-log p')].slice(-3).map(p=>p.textContent)}))()`;
  const openYard = async () => {
    await tapSel(S, '#terminal [data-t="app"][data-id="yard"]');
    await sleep(2200);
  };

  await load(S, '?front=0&intro=0');
  await sleep(2400);
  // the odds are a real roll off who the player is, so stack them — this flow is about what
  // happens to a deal after it is struck, not about whether one gets struck
  await evalJSON(S, `(()=>{const p=window.__mono.sim.profile;p.traits=['haggler'];p.personality='sly';return 1})()`);
  await evalJSON(S, `window.__mono.quarters.enter().then(()=>1)`);
  await sleep(1500);
  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(1700);
  await openYard();
  await shot(S, 'board', JSON.stringify(await evalJSON(S, READ)));

  await tapSel(S, '#yard [data-y="ask"]');
  await sleep(1600);
  await tapSel(S, '#yard [data-y="ask"]');
  await sleep(1600);
  await shot(S, 'haggled', JSON.stringify(await evalJSON(S, READ)));

  // leave the floor and burn three weeks — enough to run out every short window, and short of the
  // quarterly, which would otherwise put its sheet over the board
  await tapSel(S, '#yard [data-y="out"]');
  await sleep(900);
  await evalJSON(S, `(()=>{for(let i=0;i<3;i++)window.__mono.sim.tick();return 1})()`);
  await sleep(600);
  await openYard();
  await shot(S, 'came_back', JSON.stringify(await evalJSON(S, READ)));

  await tapSel(S, '#yard [data-y="next"]');
  await sleep(1600);
  await shot(S, 'next_hull', JSON.stringify(await evalJSON(S, READ)));
}

async function pinch(S, x, y, from, to) {
  const pts = d => [{ x: x - d / 2, y, id: 1 }, { x: x + d / 2, y, id: 2 }];
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= 10; i++) {
    await S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * i / 10) });
    await sleep(20);
  }
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// Walk all the way in, then press back until the game offers to keep going. Every line prints the
// navigation stack, and it has to come apart in exactly the order it went together.
async function back(S) {
  const PATH = `window.__mono.nav.path`;
  const WHERE = `({path:${PATH},quarters:document.body.classList.contains('in-quarters'),terminal:document.body.classList.contains('in-terminal'),sheet:document.body.classList.contains('sheet-open'),gate:!!document.querySelector('#navgate.in')})`;
  await load(S, '?front=0&intro=0');
  await sleep(2200);
  await shot(S, 'system', JSON.stringify(await evalJSON(S, WHERE)));

  await tapSel(S, '[data-hud-quarters]');
  await sleep(2000);
  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(1800);
  await tapSel(S, '#terminal [data-t="app"][data-id="banking"]');
  await sleep(700);
  await tapSel(S, '#terminal [data-t="lender"]');
  await sleep(700);
  await shot(S, 'deep', JSON.stringify(await evalJSON(S, WHERE)));

  for (let i = 1; i <= 6; i++) {
    await S('Runtime.evaluate', { expression: 'history.back()' });
    await sleep(1900);
    await shot(S, 'back' + i, JSON.stringify(await evalJSON(S, WHERE)));
  }
  await tapSel(S, '#navgate [data-ng="stay"]');
  await sleep(700);
  await shot(S, 'carried_on', JSON.stringify(await evalJSON(S, WHERE)));
}

// The complaint this exists for: a quarter of a year went by while the player looked around. Every
// line below prints the week, and the ones taken while standing still must not move it.
async function clock(S) {
  const WEEK = `window.__mono.sim.week`;
  await load(S, '?front=0&intro=0');
  await sleep(1000);
  await shot(S, 'opened', `week ${await evalJSON(S, WEEK)}`);

  await evalJSON(S, `window.__mono.quarters.enter().then(()=>1)`);
  await sleep(12000);
  await shot(S, 'idled_in_room_12s', `week ${await evalJSON(S, WEEK)}`);

  await tapSel(S, '#roomnav [data-r="terminal"]');
  await sleep(12000);
  await shot(S, 'idled_at_terminal_12s', `week ${await evalJSON(S, WEEK)}`);

  await tapSel(S, '#terminal [data-t="app"][data-id="yard"]');
  await sleep(2200);
  await tapSel(S, '#yard [data-y="next"]');
  await sleep(1400);
  await tapSel(S, '#yard [data-y="buy"]');
  await sleep(1650);
  await shot(S, 'buying', `week ${await evalJSON(S, WEEK)} · ff ${JSON.stringify(await evalJSON(S, `window.__mono.clock.ff`))}`);
  await sleep(3000);
  await shot(S, 'bought', `week ${await evalJSON(S, WEEK)} · ${await evalJSON(S, `window.__mono.sim.state.ships.length`)} hulls`);

  await tapSel(S, '#yard [data-y="out"]');
  await sleep(2000);
  await tapSel(S, '#terminal [data-t="room"]');
  await sleep(1800);
  await tapSel(S, '#roomnav [data-r="system"]');
  await sleep(2000);
  await shot(S, 'system_idle', `week ${await evalJSON(S, WEEK)} · ${JSON.stringify(await evalJSON(S, `window.__mono.clock.busy`))}`);
  await sleep(12000);
  await shot(S, 'system_idled_12s', `week ${await evalJSON(S, WEEK)}`);

  await tapSel(S, '#clocknote');
  await sleep(2500);
  await shot(S, 'after_wait_tap', `week ${await evalJSON(S, WEEK)}`);

  // put the rig to work, then let the clock run the way it is meant to
  await evalJSON(S, `(()=>{const s=window.__mono.sim;s.act({type:'assign',ship:s.state.ships[0].id,to:'kestrel'});return 1;})()`);
  await sleep(3200);
  await shot(S, 'assigned', `week ${await evalJSON(S, WEEK)} · ${JSON.stringify(await evalJSON(S, `window.__mono.clock.busy`))}`);
  await sleep(12000);
  await shot(S, 'running_12s', `week ${await evalJSON(S, WEEK)}`);
  await tapSel(S, '#speed [data-skip]');
  await sleep(3500);
  await shot(S, 'after_skip', `week ${await evalJSON(S, WEEK)}`);
}

// Drag left, drag right, let go — the room must never show the player a wall it does not own.
async function look(S) {
  await load(S, '?front=0&intro=0');
  await sleep(2600);
  await evalJSON(S, `window.__mono.quarters ? window.__mono.quarters.enter().then(()=>1) : 0`);
  await sleep(1400);
  const THETA = `Math.round(window.__mono.camera.rig.want.theta * 1000) / 1000`;
  const home = await evalJSON(S, THETA);
  await shot(S, 'centre', 'theta ' + home);
  for (const [dx, name] of [[-320, 'drag_left'], [320, 'drag_right']]) {
    await drag(S, W / 2, H * 0.55, W / 2 + dx, H * 0.55);
    await sleep(400);
    const held = await evalJSON(S, THETA);
    await shot(S, name, `theta ${held} (${(held - home).toFixed(3)} off centre)`);
    await sleep(2600);
    const back = await evalJSON(S, THETA);
    await shot(S, name + '_released', `theta ${back} (${(back - home).toFixed(3)} off centre)`);
  }
}

async function drag(S, x0, y0, x1, y1) {
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await S('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12 }],
    });
    await sleep(16);
  }
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// A save left by an earlier run changes which front the game shows, so the first navigate exists
// only to give us an origin to clear storage on.
async function load(S, query) {
  const url = `http://127.0.0.1:${PORT}/index.html`;
  await S('Page.navigate', { url: url + '?front=0&intro=0' });
  await waitFor(S, `window.__mono && window.__mono.ready`, 20000);
  await S('Runtime.evaluate', { expression: `localStorage.clear()` });
  await S('Page.navigate', { url: url + query });
  await waitFor(S, `window.__mono && window.__mono.ready`, 20000);
}

async function waitFor(S, expr, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await S('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true });
    if (r.result.value) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${expr}`);
}

async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true, awaitPromise: true });
  return JSON.parse(r.result.value ?? 'null');
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
