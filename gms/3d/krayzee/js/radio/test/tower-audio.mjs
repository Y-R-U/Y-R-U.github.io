// Headless check that a map tower talks with real clips, not subtitles only: boots the game at the airport, listens to the
// radio's 'line' events and the network, lets the live ATC talk, then prods a few tower events. GREEN needs >= 3 tower
// lines in the airport's voice, every one with a clip in the bank whose mp3 the game itself fetched (HTTP 200) and
// decodes. --falsify blocks that voice's mp3s at the network layer and must come out RED.
//   ~/.claude/bin/cdp start --port 9709 -- --use-angle=metal --autoplay-policy=no-user-gesture-required
//   node js/radio/test/tower-audio.mjs [--airport=farm|palace|airbase] [--plane=cub] [--port=9709] [--falsify]
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const PORT = +arg('port', 9709);
const AIRPORT = arg('airport', 'farm');
const VOICE = { farm: 'tower_farm', airbase: 'tower_raf', palace: 'tower_butler' }[AIRPORT];
const FALSIFY = process.argv.includes('--falsify');
// the Palace Lawn is 240 m: the C172 is refused there and the game boots at C-Tower 1 instead
const PLANE = arg('plane', AIRPORT === 'palace' ? 'cub' : '');
const URL = `http://127.0.0.1:8888/gms/3d/krayzee/?airport=${AIRPORT}&start=free&noaccount=1&intro=0${PLANE ? '&plane=' + PLANE : ''}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errors = []; const net = new Map(); const reqs = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Network.requestWillBeSent' && d.params.request.url.includes('/audio/')) reqs.set(d.params.requestId, d.params.request.url);
  if (d.method === 'Network.responseReceived' && d.params.response.url.includes('/audio/')) net.set(d.params.response.url, d.params.response.status);
  if (d.method === 'Network.loadingFailed' && reqs.has(d.params.requestId)) net.set(reqs.get(d.params.requestId), 'failed:' + d.params.errorText);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result ?? d)); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
async function waitFor(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(250); } return false; }

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
if (FALSIFY) await send('Network.setBlockedURLs', { urls: [`*/audio/voices/${VOICE}/*`] });
await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: URL });

const out = { airport: AIRPORT, voice: VOICE, falsify: FALSIFY };
if (!(await waitFor('!!(window.__krayzeeReady && window.__game?.wiring?.radio)', 60000))) { console.log('FAIL: game never ready', errors); process.exit(1); }
// a real tap, as a player's first touch: a line said before any user activation can go out as subtitles only
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 422, y: 120, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 422, y: 120, button: 'left', clickCount: 1 });
// and a settle: a line said in the first seconds of boot, before AUDIO is up, goes out as subtitles only (reported
// to the AUDIO/RADIO owners; it is not a missing clip), so the count starts once the game is running
await sleep(6000);
await ev(`(async () => {
  const R = __game.wiring.radio; window.__lines = [];
  await R.load();
  R.on('line', (l) => { const c = R.bank.clip(l.voice, l.id); __lines.push({ t: +performance.now().toFixed(0), speaker: l.speaker, voice: l.voice, intent: l.intent, id: l.id, text: l.text, missing: !!l.missing, url: c?.url || null }); });
  return true;
})()`);
await waitFor('__game.state().mode === "play" || !!__game.S.player', 30000);
out.mode = await ev('__game.state().mode');

// Live ATC first, then a welcome, a clearance and a scold so every run hears the tower.
await sleep(25000);
for (const e of [{ type: 'tower', intent: 'welcome', actor: 'player' }, { type: 'tower', intent: 'clear_land', actor: 'player', runway: AIRPORT === 'farm' ? '25' : '27' },
  { type: 'infraction', id: 'queue_jump', actor: 'player' }]) {
  await ev(`__game.wiring.radio.handleEvent(${JSON.stringify(e)}), true`);
  await sleep(7000);
}
// A story line in another tower voice (Toby's t_jumbo while this airport's controller holds the tower, as in M8):
// it must play in Toby's own clip, not vanish (js/radio pickAny + the line's own voice for clips).
await ev(`(() => { const R = __game.wiring.radio;
  R.bank.load([{ id: 't_jumbo', voice: 'tower_trainee', intent: 't_jumbo', text: 'that is a very big aeroplane.', callsign: 'pre', maxSeconds: 12 }]);
  R.bank.loadManifest({ tower_trainee: { t_jumbo: { file: 'audio/story/t_jumbo.mp3', duration: 0 } } }, '');
  R.say('tower', 't_jumbo', { about: 'player', target: 'player' }); return true; })()`);
await sleep(9000);
const lines = await ev('__lines');
const borrowed = lines.find((l) => l.id === 't_jumbo');
const borrowNet = net.get(new globalThis.URL('audio/story/t_jumbo.mp3', URL).href);
const tower = lines.filter((l) => l.speaker === 'tower' && l.id !== 't_jumbo');
const mine = tower.filter((l) => l.voice === VOICE);
// the game's own fetch of each clip (network) and a fresh decode of it in the page
for (const l of mine) {
  l.net = l.url ? net.get(new globalThis.URL(l.url, URL).href) ?? 'not fetched' : 'no clip';
  l.decoded = l.url && !FALSIFY ? await ev(`fetch(${JSON.stringify(l.url)}).then((r) => r.arrayBuffer()).then((b) => new OfflineAudioContext(1, 1, 24000).decodeAudioData(b)).then((a) => +a.duration.toFixed(2)).catch((e) => 'ERR ' + e.message)`) : null;
}
const splices = [...net].filter(([u]) => new RegExp(`${VOICE}/${VOICE}\\.(cs_|rwy_)`).test(u));
const ok = mine.filter((l) => l.url && !l.missing && l.net === 200 && (FALSIFY || typeof l.decoded === 'number'));
out.towerLines = tower.length; out.voiceLines = mine.length; out.withClip = ok.length;
out.otherVoices = [...new Set(tower.filter((l) => l.voice !== VOICE).map((l) => l.voice))];
out.spliceFetches = splices.map(([u, s]) => `${u.split('/').pop()} ${s}`);
out.borrowed = borrowed ? `t_jumbo said, clip ${borrowNet ?? 'not fetched'}` : 't_jumbo DROPPED';
out.errors = errors.slice(0, 5);
if (process.argv.includes("--debug")) out.net = [...net].filter(([u]) => u.includes("lineup")).map(([u, st]) => `${u} ${st}`), out.lineUrls = mine.map((l) => `${l.t} ${l.url}`), out.reqs = [...reqs.values()].map((u) => u.split('/').pop());
for (const l of mine) console.log(`${l.net === 200 ? 'CLIP' : 'SUBS'} ${l.id} net=${l.net} dur=${l.decoded} | ${l.text}`);
const green = mine.length >= 3 && ok.length === mine.length && !out.otherVoices.length && !!borrowed && (FALSIFY || borrowNet === 200);
console.log(JSON.stringify(out, null, 1));
console.log(green ? 'GREEN' : 'RED', `${ok.length}/${mine.length} ${VOICE} lines played from clips`);
ws.close();
process.exit(green ? 0 : 1);
