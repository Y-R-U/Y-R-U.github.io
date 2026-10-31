// ACCESS gate (D36, docs/ACCESS.md): br8t Pass mission limits, the online allowance, sign-in to fly online, cloud saves.
// Real game pages in two headless Chromes (two browser profiles), real taps, a local krayzeenet and a mock payments
// service (tools/access/mockpay.mjs). The cloud section signs in to the REAL br8t-games Firebase project with a
// throwaway email/password account it creates and deletes again (games/CLAUDE.md: the stand-in for a Google popup).
//
//   node tools/test-access.mjs                 all sections (missions, online, cloud)
//   node tools/test-access.mjs --only=missions,online
//   node tools/test-access.mjs --falsify=<gate|pass|failopen|signin|allowance|cloud>
//        breaks that one mechanism; at least one check guarding it must then FAIL (exit 0 = caught)
//   ports: CDP 9711 (profile A) + 9712 (profile B), static 8743, mock payments 8744, krayzeenet 8745
// Screenshots: docs/shots/access/.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './story/cdp.mjs';
import { startMockPay } from './access/mockpay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(HERE, '..'), SITE = join(GAME_DIR, '..', '..', '..');
const SHOTS = join(GAME_DIR, 'docs', 'shots', 'access');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const ONLY = arg('only', 'missions,online,cloud').split(',');
const FALSIFY = arg('falsify', '');
const GUARDS = ['gate', 'pass', 'failopen', 'signin', 'allowance', 'cloud'];
if (FALSIFY && !GUARDS.includes(FALSIFY)) { console.error(`--falsify= one of ${GUARDS.join(', ')}`); process.exit(2); }
const PA = +arg('pa', 9711), PB = +arg('pb', 9712), WEBP = 8743, PAYP = 8744, NETP = 8745;
const WEB = `http://127.0.0.1:${WEBP}`, GAME = `${WEB}/gms/3d/krayzee/`;
const NET = `ws://127.0.0.1:${NETP}/gms/3d/krayzee/net`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// any modal dialog actually on screen (the settings/profile popups sit hidden in the DOM with aria-modal)
const MODAL = `[...document.querySelectorAll('[aria-modal=true]')].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'))`;

// Each guarded check names the mechanism that --falsify breaks; under --falsify exactly those must fail.
const results = [];
const ok = (cond, msg, guard = null) => { results.push({ ok: !!cond, msg, guard }); console.log(`${cond ? 'ok  ' : 'FAIL'} ${guard ? `[${guard}] ` : ''}${msg}`); return !!cond; };

// ------------------------------------------------------------------ infrastructure
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
function startWeb() {
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, WEB);
    if (u.pathname === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>blank</title>'); return; }
    let p = normalize(join(SITE, decodeURIComponent(u.pathname)));
    if (!p.startsWith(SITE)) { res.writeHead(403); res.end(); return; }
    try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
    catch (e) { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => srv.listen(WEBP, '127.0.0.1', () => r(srv)));
}
function startNet(env) {
  const bin = join(tmpdir(), 'krayzeenet-access');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(GAME_DIR, 'server'), stdio: 'inherit' });
  const p = spawn(bin, [], { env: { ...process.env, KRAYZEE_ADDR: `127.0.0.1:${NETP}`, KRAYZEE_DEV_AUTH: '1', KRAYZEE_ICE_URL: 'off', KRAYZEE_ALLOWANCE_URL: `http://127.0.0.1:${PAYP}/api/br8t/`, ...env }, stdio: 'ignore' });
  return p;
}
function chrome(port) {
  execFileSync(join(homedir(), '.claude/bin/cdp'), ['start', '--port', String(port), '--idle', '120', '--', '--use-angle=metal', '--disable-features=WebRtcHideLocalIpsWithMdns'], { stdio: 'ignore' });
}
async function page(port) {
  const C = await connect(port);
  C.navs = 0;
  C.listeners.push((d) => { if (d.method === 'Page.frameNavigated' && !d.params.frame.parentId) C.navs++; });
  C.until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await C.ev(expr)) return true; } catch (e) { /* navigating */ } await sleep(150); } return false; };
  // Fresh storage for this origin: localStorage, sessionStorage, IndexedDB (the Firebase session lives there).
  C.wipe = async () => {
    await C.send('Page.navigate', { url: `${WEB}/__blank` });
    await sleep(400);
    await C.send('Storage.clearDataForOrigin', { origin: WEB, storageTypes: 'all' });
  };
  // Tap an element inside a scroller: bring it into view first (a thumb scrolls before it taps).
  C.tapIn = async (sel) => { await C.ev(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`); await sleep(250); return C.tapSel(sel); };
  C.seed = async (kv) => { await C.ev(`(() => { const kv = ${JSON.stringify(kv)}; for (const k in kv) localStorage.setItem(k, typeof kv[k] === 'string' ? kv[k] : JSON.stringify(kv[k])); })()`); };
  return C;
}
const PROFILE = (name) => ({ name, gender: 'f', company: `${name} Air`, primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-TEST', favourites: [] });
const STORY4 = { introSeen: true, missions: { 1: { done: true, best: 900 }, 2: { done: true, best: 800 }, 3: { done: true, best: 700 }, 4: { done: true, best: 600 } } };
const SEEN = { 'krayzee.coach': { done: true }, 'krayzee.coachTakeoff': '1', 'krayzee.hints': { all: 1 } };

// ------------------------------------------------------------------ 1. missions
async function missions(A, pay) {
  console.log('\n— missions (story picker)');
  await A.viewport(390, 844, true);
  const url = (q) => `${GAME}?intro=0&noaccount=1&payapi=${encodeURIComponent(pay.url)}&${q}`;
  async function openPicker(q) {
    await A.wipe();
    await A.seed({ 'krayzee.profile': PROFILE('Dirk'), 'krayzee.story': STORY4, ...SEEN });
    if (!await A.load(url(q))) return false;
    if (FALSIFY === 'gate') await A.ev(`window.__access && (window.__access.missionOpen = () => true, window.__access.blocks = () => false)`);
    await A.until('window.__access?.probed', 8000);
    await A.tapSel('#kz-ui [data-a="story"]');
    return A.until('document.querySelectorAll(".krz-st-picklist button[data-id]").length >= 5', 15000);
  }
  const rows = () => A.ev(`JSON.stringify([...document.querySelectorAll('.krz-st-picklist button[data-id]')].map((b) => ({ id: +b.dataset.id, locked: b.hasAttribute('data-pass-locked'), dis: b.disabled, tag: b.querySelector('.kzp-tag')?.textContent || '' })))`).then(JSON.parse);

  // free player, limits enforced
  pay.state.live = true; pay.state.pass.clear();
  ok(await openPicker('uid=free1&access=on'), 'free player: the picker opens from the menu Story button');
  await sleep(600);
  let r = await rows();
  ok(r.filter((x) => x.id <= 4).every((x) => !x.locked), `free player: missions 1–4 open (${r.filter((x) => x.id <= 4).map((x) => x.id + (x.locked ? 'L' : 'o')).join(' ')})`);
  ok(r.find((x) => x.id === 5)?.locked && /Pass/.test(r.find((x) => x.id === 5)?.tag), 'free player, enforce on: mission 5 is locked with a br8t Pass tag', 'gate');
  await A.shot(SHOTS, 'picker-locked-portrait');
  await A.tapIn('.krz-st-picklist button[data-id="5"]');
  await sleep(500);
  const card = await A.ev(`(() => { const c = document.querySelector('.krz-st-picklist .kzp'); if (!c) return null; const b = c.getBoundingClientRect(); return { text: c.textContent, h: b.height, inView: b.top >= 0 && b.bottom <= innerHeight + 2, btns: [...c.querySelectorAll('button')].map((x) => x.textContent.trim()) }; })()`);
  ok(card && /Crown requires a br8t Pass/.test(card.text) && card.btns.some((t) => /Get the Pass/.test(t)) && card.btns.includes('Restore'), `tapping mission 5 shows the royal card inline (${card?.btns?.join(' | ')})`, 'gate');
  ok(await A.ev(`!window.__krzStory.mission && !${MODAL}`), 'mission 5 did not start, and no modal');
  await A.shot(SHOTS, 'picker-card-portrait');
  // the gate in runMission (Next mission after 4, ?mission=5): straight back to the picker with the card open
  await A.tapIn('.krz-st-picklist .kzp [data-p="back"]');
  await A.ev('window.__krzStory.runMission(5, {})');
  await sleep(700);
  ok(await A.ev('!window.__krzStory.mission && !!document.querySelector(".krz-st-picklist button[data-id=\\"5\\"] + .kzp")'), 'runMission(5) is refused and reopens the picker on the Pass card', 'gate');
  // Get the Pass → checkout (the mock's fake checkout page), then Restore once the Pass exists → mission 5 opens
  await A.tapIn('.krz-st-picklist .kzp [data-p="buy"]');
  ok(await A.until(`location.pathname === '/fake-checkout'`, 6000).catch(() => false) || await A.ev('location.href').then((h) => /fake-checkout/.test(h)).catch(() => false), 'Get the Pass goes to checkout (mock)');
  ok(pay.state.calls.some((c) => c.path === 'checkout' && c.uid === 'free1'), 'checkout was asked for the signed-in account');
  pay.state.pass.add('free1');
  ok(await openPicker('uid=free1&access=on'), 'back in the game after buying');
  await A.until('window.__access?.passKnown', 6000);
  await sleep(400);
  r = await rows();
  ok(r.every((x) => !x.locked) && /br8t Pass/.test(r.find((x) => x.id === 5)?.tag || ''), 'with the Pass every mission is open (the Pass unlocks)', 'pass');
  // Restore path: the Pass appears while the card is open
  pay.state.pass.delete('free1');
  ok(await openPicker('uid=free1&access=on'), 'picker again without the Pass');
  await A.tapIn('.krz-st-picklist button[data-id="5"]');
  await sleep(300);
  pay.state.pass.add('free1');
  await A.tapIn('.krz-st-picklist .kzp [data-p="restore"]');
  ok(await A.until(`!document.querySelector('.krz-st-picklist button[data-id="5"]').hasAttribute('data-pass-locked') && !document.querySelector('.krz-st-picklist .kzp')`, 5000), 'Restore finds the Pass: the card closes and mission 5 unlocks', 'pass');
  await A.tapIn('.krz-st-picklist button[data-id="5"]');
  ok(await A.until('!!window.__krzStory.mission || !!window.__game.S.player || window.__game.S.starting', 15000), 'a Pass holder can start mission 5');
  await A.ev('window.__krzStory.endMission(); window.__game.quit()').catch(() => {});

  // payments NOT live (test mode, like games.br8t.com today): auto keeps everything open and says "coming soon"
  pay.state.live = false; pay.state.pass.clear();
  ok(await openPicker(`uid=free1${FALSIFY === 'failopen' ? '&access=on' : '&access=auto'}`), 'picker with payments in test mode');
  await sleep(500);
  r = await rows();
  ok(r.every((x) => !x.locked) && !r.some((x) => x.tag), 'payments not live: mission 5 is open, no Pass tags (fail-open)', 'failopen');
  ok(await A.ev('window.__access.tier') === 'open', `access tier is "open" (${await A.ev('window.__access.tier')})`, 'failopen');
  await A.shot(SHOTS, 'picker-open-testmode');
  // landscape card shot
  pay.state.live = true;
  await A.viewport(844, 390, true);
  ok(await openPicker('uid=free1&access=on'), 'landscape picker');
  await A.tapIn('.krz-st-picklist button[data-id="5"]');
  await sleep(500);
  await A.shot(SHOTS, 'picker-card-landscape');
  const visible = await A.ev(`(() => { const c = document.querySelector('.krz-st-picklist .kzp'); if (!c) return false; c.scrollIntoView({ block: 'nearest' }); const b = c.querySelector('[data-p="buy"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && !!e.closest('[data-p="buy"]'); })()`);
  ok(visible, 'landscape: the Get the Pass button can be hit (not covered)');
  await A.ev('window.__krzStory.endMission()').catch(() => {});
}

// ------------------------------------------------------------------ 2. online
async function online(A, B, pay) {
  console.log('\n— online (sign-in, allowance, two-browser room)');
  pay.state.live = true; pay.state.pass.clear(); pay.state.used.clear(); pay.state.pass.add('hostP');
  const url = (uid, extra = '') => `${GAME}?intro=0&noaccount=1&net=${encodeURIComponent(NET)}&payapi=${encodeURIComponent(pay.url)}&access=on${uid ? `&uid=${uid}` : ''}${extra}`;
  async function lobby(C, uid, name, extra) {
    await C.wipe();
    await C.seed({ 'krayzee.profile': PROFILE(name), ...SEEN });
    if (!await C.load(url(uid, extra))) return false;
    await C.until('!document.querySelector(\'#kz-ui [data-a="online"]\')?.classList.contains("soon")', 5000);
    for (let t = 0; t < 3; t++) {
      await sleep(400);
      const r = await C.tapSel('#kz-ui [data-a="online"]');
      if (await C.until('!!document.querySelector(".kzn.on")', 4000)) break;
      console.log(`   (Online tap ${t + 1} did not open the lobby: ${JSON.stringify(r)} → ${await C.ev('(() => { const e = document.elementFromPoint(' + (r?.x | 0) + ',' + (r?.y | 0) + '); return e ? e.tagName + "." + e.className : null; })()')})`);
    }
    const up = await C.until('document.querySelector(".kzn.on") && /Connected|Alone|Direct|Relay/.test(document.querySelector("[data-s=conn]").textContent)', 15000);
    if (!up) console.log('   lobby diag', await C.ev(`JSON.stringify({ url: location.href.slice(0, 120), ready: !!window.__krayzeeReady, kzn: !!document.querySelector('.kzn'), on: !!document.querySelector('.kzn.on'), pill: document.querySelector('[data-s=conn]')?.textContent, soon: document.querySelector('#kz-ui [data-a="online"]')?.className, ui: window.__game?.S?.mode })`).catch((e) => String(e)));
    return up;
  }
  await A.viewport(390, 844, true); await B.viewport(390, 844, true);
  async function createRoom(i) {
    if (await A.ev('document.querySelector(".kzn").dataset.view === "room"')) { await A.tapSel('.kzn [data-a="leave"]'); await A.until('document.querySelector(".kzn").dataset.view === "home"', 5000); }
    await A.tapSel('.kzn [data-a="create"]');
    await A.until('document.querySelector(".kzn").dataset.view === "create"', 4000);
    await A.tapSel('.kzn [data-k="_priv"] [data-v="1"]');
    await A.tapSel('.kzn [data-a="ok"]');
    ok(await A.until('document.querySelector(".kzn").dataset.view === "room" && /^[A-Z0-9]{6}$/.test(document.querySelector("[data-s=code]")?.textContent || "")', 8000), `host creates room ${i}`);
    return A.ev('document.querySelector("[data-s=code]").textContent');
  }
  let code = null;
  if (ONLY.includes('online')) {
  // a guest (no account) sees the sign-in card, not the room buttons
  ok(await lobby(B, null, 'Guest'), 'guest opens the Online lobby');
  await B.until('!!document.querySelector(".kzn .kzp-sign")', 6000);
  const guest = await B.ev(`({ sign: !!document.querySelector('.kzn .kzp-sign [data-a="signin"]'), quick: !!document.querySelector('.kzn [data-a="quick"]'), join: !!document.querySelector('#kzn-code') })`);
  ok(guest.sign && !guest.quick && !guest.join, 'guest: "Sign in to fly with other royals" card instead of Quick join / Join', 'signin');
  await B.shot(SHOTS, 'lobby-signin-guest');

  // host (Pass) and a free player
  ok(await lobby(A, 'hostP', 'Hosty'), 'host (Pass holder) opens the lobby');
  ok(await lobby(B, 'free2', 'Frugal'), 'free player opens the lobby');
  ok(await B.until(`/3 of 3/.test(document.querySelector('[data-s="allow"]')?.textContent || '')`, 6000), `free player sees "3 of 3 free online games left today" (${await B.ev(`document.querySelector('[data-s="allow"]')?.textContent`)})`);
  ok(await A.until(`/Unlimited/.test(document.querySelector('[data-s="allow"]')?.textContent || '')`, 6000), 'Pass holder sees "Unlimited online games"');
  await B.shot(SHOTS, 'lobby-allowance-3');
  const left = [];
  for (let i = 0; i < 4; i++) {
    code = await createRoom(i + 1); // A creates a private room with real taps
    // B types the code and taps Join
    await B.ev(`(() => { const c = document.querySelector('#kzn-code'); c.value = ${JSON.stringify(code)}; c.dispatchEvent(new Event('input')); })()`);
    await B.tapSel('.kzn [data-a="join"]');
    if (i < 3) {
      const inRoom = await B.until('document.querySelector(".kzn").dataset.view === "room"', 8000);
      ok(inRoom, `free player joins room ${i + 1} by code`);
      ok(await A.until('document.querySelectorAll(".kzn-players li").length === 2', 6000), `host sees two pilots in room ${i + 1}`);
      left.push(await B.ev('window.__access?.allowanceState?.remaining'));
      if (i === 0) await B.shot(SHOTS, 'lobby-room-joined');
      await B.tapSel('.kzn [data-a="leave"]');
      await B.until('document.querySelector(".kzn").dataset.view === "home"', 5000);
    }
  }
  ok(JSON.stringify(left) === '[2,1,0]', `the allowance goes 3 → 0 (${left.join(' → ')} left after each room)`, 'allowance');
  ok(await B.until(`/0 of 3/.test(document.querySelector('[data-s="allow"]')?.textContent || '')`, 4000), 'the lobby line reads "0 of 3"', 'allowance');
  const refused = await B.until('document.querySelector(".kzn").dataset.view === "home" && !!document.querySelector(".kzn .kzp[data-reason=online]")', 8000);
  ok(refused, 'the 4th join is refused politely: an inline br8t Pass card in the lobby', 'allowance');
  ok(await B.ev(`!${MODAL} && !!document.querySelector('.kzn .kzp [data-p="buy"]')`), 'the card offers Get the Pass, no modal');
  ok(await A.ev('document.querySelectorAll(".kzn-players li").length') === 1, 'the refused player never entered the room', 'allowance');
  await B.shot(SHOTS, 'lobby-nogames');
  ok((pay.state.used.get('hostP') || 0) === 0, 'the Pass-holding host was never counted');
  } else {
    ok(await lobby(A, 'hostP', 'Hosty'), 'host (Pass holder) opens the lobby');
  }
  code = await createRoom('for the flight');

  // a signed-in host/join flow into flight, with B in the F-35 (F2: nozzle + lift fan carried in snapshots)
  ok(await lobby(B, 'flyer', 'Flyer', '&allplanes&plane=f35'), 'a fresh free player (F-35) opens the lobby');
  await B.ev(`(() => { const c = document.querySelector('#kzn-code'); c.value = ${JSON.stringify(code)}; c.dispatchEvent(new Event('input')); })()`);
  await B.tapSel('.kzn [data-a="join"]');
  ok(await B.until('document.querySelector(".kzn").dataset.view === "room"', 8000) && await A.until('document.querySelectorAll(".kzn-players li").length === 2', 6000), 'signed-in player joins the host\'s room');
  await A.tapSel('.kzn [data-a="start"]');
  const flying = await A.until('window.__game.S.playMode === "online" && !!window.__game.S.player', 30000) && await B.until('window.__game.S.playMode === "online" && !!window.__game.S.player', 30000);
  ok(flying, 'host taps Start: both royals are in flight online');
  const HUM = 'window.__game.traffic.list.some((e) => e.remote && e.netKind === "human")';
  const DIAG = 'JSON.stringify({ mode: window.__game.S.playMode, n: window.__game.traffic.list.length, remote: window.__game.traffic.list.filter((e) => e.remote).map((e) => e.netKind) })';
  const seesA = await A.until(HUM, 25000), seesB = await B.until(HUM, 25000);
  ok(seesA, `the host sees the joiner's plane ${seesA ? '' : await A.ev(DIAG)}`);
  ok(seesB, `the joiner sees the host's plane ${seesB ? '' : await B.ev(DIAG)}`);
  await B.ev(`(() => { const ac = window.__game.S.player.ac; Object.defineProperty(ac, 'nozzle', { get: () => 0.62, set() {}, configurable: true }); Object.defineProperty(ac, 'liftFan', { get: () => 0.8, set() {}, configurable: true }); })()`);
  const noz = await A.until(`window.__game.traffic.list.some((e) => e.remote && e.netKind === "human" && Math.abs(e.ac.nozzle - 0.62) < 0.01 && Math.abs(e.ac.liftFan - 0.8) < 0.01)`, 8000);
  ok(noz, 'F2: the F-35\'s nozzle + lift-fan state reach the other page');
  await A.shot(SHOTS, 'online-flight-host');
  await A.ev('window.__game.quit()').catch(() => {}); await B.ev('window.__game.quit()').catch(() => {});

  // payments not live → the server does not count, the lobby says "coming soon"
  ok(true, 'note: server-side "auto" (not live) is covered by go test TestAllowanceAutoNotLive');
}

// ------------------------------------------------------------------ 3. cloud saves
async function cloud(A, B) {
  console.log('\n— cloud save round trip (real Firebase, throwaway account)');
  const email = `krayzee-access-${Date.now().toString(36)}@br8t.com`, pw = `T${Math.random().toString(36).slice(2)}!9x`;
  const FB = `const { SDK } = await import('/lib/auth/config.js'); const a = await import(SDK + '/firebase-auth.js'); const app = await import(SDK + '/firebase-app.js'); const au = a.getAuth(app.getApp());`;
  await A.viewport(390, 844, true); await B.viewport(390, 844, true);
  // A: a guest on a fresh device, signs in (email/password linked to the anonymous uid), then plays
  await A.wipe();
  ok(await A.load(`${GAME}?intro=0`), 'device A: game boots as a guest');
  ok(await A.until(`import('/lib/auth/auth.js').then(({ auth }) => auth.ready().then(() => !!auth.user))`, 20000), 'device A: anonymous account ready');
  const linked = await A.ev(`(async () => { ${FB} await a.linkWithCredential(au.currentUser, a.EmailAuthProvider.credential(${JSON.stringify(email)}, ${JSON.stringify(pw)})); const { auth } = await import('/lib/auth/auth.js'); return auth.signedIn; })()`);
  ok(linked, 'device A: signed in (email/password linked to the guest account)');
  // progress through the game's own modules: profile + livery + voice, settings + hangar plane, career PP, story, tasks
  await A.ev(`(async () => {
    const st = await import('/gms/3d/krayzee/js/ui/store.js');
    st.saveProfile({ ...st.loadProfile(), name: 'Cloudy', company: 'Cloudy Air', primary: '#123456', voice: 'bubba', registration: 'K-CLDY', favourites: ['bubba'] });
    st.saveSettings?.({ ...st.loadSettings(), difficulty: 'hard', aircraft: 'tiger', invertPitch: true });
    const { career } = await import('/gms/3d/krayzee/js/ui/career.js'); career().addBonus(7777);
    const d = await import('/gms/3d/krayzee/js/story/dom.js'); d.saveProgress({ introSeen: true, missions: { 1: { done: true, best: 1234 }, 2: { done: true, best: 999 } } });
    localStorage.setItem('krayzee.tasks', JSON.stringify({ v: 1, done: { first_flight: 1 }, sets: {}, stats: {}, uniq: {}, best: {}, worn: null, unseen: [], savedAt: Date.now() }));
  })()`);
  ok(await A.until(`(async () => { const { cloud } = await import('/lib/auth/cloud.js'); await cloud.game('krayzee').flush(); const r = await cloud.game('krayzee').load(); return !!r?.data?.keys?.['krayzee.story'] && JSON.parse(r.data.keys['krayzee.career']).lifetimePP >= 7777; })()`, 20000), 'device A: progress reached the account (cloud doc has career + story)');
  // Reload A once: its task grid credits the story missions it now sees (+PP, the story tasks ticked), exactly as a
  // finished mission would have, so the save B receives is self-consistent (no second retro credit over there).
  await A.load(`${GAME}?intro=0`);
  const SAME = `(async () => { const { cloud } = await import('/lib/auth/cloud.js'); await cloud.game('krayzee').flush(); const r = await cloud.game('krayzee').load(); return ['krayzee.career', 'krayzee.story', 'krayzee.profile'].filter((k) => r?.data?.keys?.[k] !== localStorage.getItem(k)).map((k) => k + ' cloud=' + String(r?.data?.keys?.[k]).slice(0, 80) + ' local=' + String(localStorage.getItem(k)).slice(0, 80)).join(' | '); })()`;
  const same = await A.until(`${SAME}.then((d) => !d)`, 30000);
  ok(same, `device A: the account holds what A has after the reload ${same ? '' : await A.ev(SAME)}`);
  const snapA = await A.ev(`JSON.stringify(['krayzee.profile','krayzee.settings','krayzee.career','krayzee.story','krayzee.tasks'].map((k) => localStorage.getItem(k)))`);
  // B: a different browser profile. Signs in on the hub page first (fresh device), then opens Krayzee.
  await B.wipe();
  await B.send('Page.navigate', { url: `${WEB}/lib/auth/diag.html` });
  await sleep(1500);
  const bIn = await B.ev(`(async () => { const { auth } = await import('/lib/auth/auth.js'); await auth.ready(); ${FB} await a.signInWithEmailAndPassword(au, ${JSON.stringify(email)}, ${JSON.stringify(pw)}); await au.currentUser.getIdToken(true); return auth.signedIn; })()`);
  ok(bIn, 'device B: signed in to the same account');
  B.navs = 0;
  await B.load(FALSIFY === 'cloud' ? `${GAME}?intro=0&nocloud=1` : `${GAME}?intro=0`);
  await B.until(`localStorage.getItem('krayzee.career')`, 20000);
  await sleep(2500);
  const snapB = await B.ev(`JSON.stringify(['krayzee.profile','krayzee.settings','krayzee.career','krayzee.story','krayzee.tasks'].map((k) => localStorage.getItem(k)))`);
  const a = JSON.parse(snapA).map((s) => JSON.parse(s)), b = JSON.parse(snapB).map((s) => s && JSON.parse(s));
  ok(b[0]?.name === 'Cloudy' && b[0]?.primary === '#123456' && b[0]?.voice === 'bubba' && b[0]?.registration === 'K-CLDY', 'device B: same profile, livery and voice', 'cloud');
  ok(b[1]?.difficulty === 'hard' && b[1]?.aircraft === 'tiger', 'device B: same settings and hangar plane', 'cloud');
  ok(b[2]?.lifetimePP === a[2].lifetimePP && b[2]?.lifetimePP >= 7777, `device B: same career PP (${b[2]?.lifetimePP})`, 'cloud');
  ok(b[3]?.missions?.[2]?.done && b[3]?.missions?.[1]?.best === 1234, 'device B: same story progress', 'cloud');
  ok(b[4]?.done?.first_flight === 1, 'device B: same tasks', 'cloud');
  ok(B.navs <= 2, `device B: no reload loop (${B.navs} top-level navigations: load + one adopt)`);
  const menuPP = await B.ev(`document.querySelector('#kz-ui')?.textContent.includes('Cloudy')`);
  ok(menuPP, 'device B: the menu shows the adopted pilot');
  await B.shot(SHOTS, 'cloud-deviceB-menu');
  // B plays on (more PP); A reloads and gets it (newest wins, both played)
  await B.ev(`import('/gms/3d/krayzee/js/ui/career.js').then(({ career }) => career().addBonus(1111))`);
  await sleep(300);
  ok(await B.until(`(async () => { const { cloud } = await import('/lib/auth/cloud.js'); await cloud.game('krayzee').flush(); const r = await cloud.game('krayzee').load(); return JSON.parse(r.data.keys['krayzee.career']).lifetimePP >= 8888; })()`, 20000), 'device B: the new PP reached the account');
  A.navs = 0;
  await A.load(`${GAME}?intro=0`);
  await A.until(`JSON.parse(localStorage.getItem('krayzee.career') || '{}').lifetimePP >= 8888`, 20000);
  ok(await A.ev(`JSON.parse(localStorage.getItem('krayzee.career')).lifetimePP`) >= 8888, 'device A: picks up B\'s newer progress on its next load', 'cloud');
  ok(A.navs <= 2, `device A: no reload loop (${A.navs})`);
  // tidy: delete the account's Krayzee doc and the throwaway user
  const gone = await B.ev(`(async () => { ${FB} const fs = await import(SDK + '/firebase-firestore.js'); const db = fs.getFirestore(app.getApp()); await fs.deleteDoc(fs.doc(db, 'users', au.currentUser.uid, 'games', 'krayzee')).catch(() => {}); await fs.deleteDoc(fs.doc(db, 'users', au.currentUser.uid)).catch(() => {}); await a.reauthenticateWithCredential(au.currentUser, a.EmailAuthProvider.credential(${JSON.stringify(email)}, ${JSON.stringify(pw)})); await a.deleteUser(au.currentUser); return true; })()`).catch((e) => String(e));
  ok(gone === true, `test account deleted (${email}${gone === true ? '' : `: ${gone}`})`);
}

// ------------------------------------------------------------------ run
const web = await startWeb();
const pay = await startMockPay({ port: PAYP, live: true, perDay: 3 });
const net = startNet({ KRAYZEE_SIGNIN: FALSIFY === 'signin' ? '' : 'required', KRAYZEE_ALLOWANCE: FALSIFY === 'allowance' ? 'off' : 'on' });
let A, B;
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${NETP}/gms/3d/krayzee/net/health`); break; } catch { await sleep(100); } }
  chrome(PA); chrome(PB);
  A = await page(PA); B = await page(PB);
  // --falsify=pass: the entitlement answer loses its br8t_pass (the client must then never unlock)
  if (FALSIFY === 'pass') await A.send('Page.addScriptToEvaluateOnNewDocument', { source: `{ const f = window.fetch; window.fetch = async (u, o) => { const r = await f(u, o); if (!/entitlement|allowance/.test(String(u))) return r; const d = await r.clone().json().catch(() => null); if (d?.entitlements) d.entitlements.br8t_pass = false; if (d && 'unlimited' in d) { d.unlimited = false; d.tier = 'free'; } return new Response(JSON.stringify(d), { status: r.status, headers: { 'content-type': 'application/json' } }); }; }` });
  if (ONLY.includes('missions')) await missions(A, pay);
  if (ONLY.includes('online') || ONLY.includes('flight')) await online(A, B, pay);
  if (ONLY.includes('cloud')) await cloud(A, B);
  const errs = [...A.errors, ...B.errors].filter((e) => !/favicon|ERR_|net::|Failed to load resource|WebSocket|404/.test(e));
  ok(!errs.length, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  console.error(e); ok(false, `crashed: ${e.message}`);
} finally {
  net.kill(); web.close(); await pay.close();
  try { A?.ws.close(); B?.ws.close(); } catch (e) { /* */ }
  try { execFileSync(join(homedir(), '.claude/bin/cdp'), ['stop', String(PA)]); execFileSync(join(homedir(), '.claude/bin/cdp'), ['stop', String(PB)]); } catch (e) { /* */ }
}
const failed = results.filter((r) => !r.ok);
if (FALSIFY) {
  const red = results.filter((r) => r.guard === FALSIFY && !r.ok).length, others = results.filter((r) => r.guard && r.guard !== FALSIFY && !r.ok).length;
  console.log(`\nFALSIFY ${FALSIFY}: ${red} guarded check(s) went red${red ? ' — CAUGHT' : ' — NOT CAUGHT'} (${others} other guarded failures)`);
  process.exit(red ? 0 : 1);
}
console.log(failed.length ? `\n${failed.length} FAILED` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
