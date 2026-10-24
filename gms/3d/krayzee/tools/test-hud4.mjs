// HUD4: prompt card in the top band left of the warp chip; difficulty/aircraft chips up out of the flight view, faded by
// any chip tap (even the selected one) or any flight control. Real CDP touch at 390×844 and 844×390.
//   ~/.claude/bin/cdp start --port 9634 -- --use-angle=metal
//   node tools/test-hud4.mjs [--port=9634] [--only=portrait,landscape,story,pt3] [--falsify]
// pt3: PLAYTEST_3 #3 (stranded in a field), #6 (quit confirm), #10 (SKIP after landing, radio target colours), skip keeps a demand.
// --falsify drags the card onto the subtitles/warp, drops the chips onto the plane and pins faded chips visible; pt3 drops the
// demanded end before SKIP, disables the field start, banks before Quit and restores the dark target colour: those checks must FAIL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'review', 'hud4');
mkdirSync(SHOTS, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const PORT = +arg('port', 9634);
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const ONLY = arg('only', 'portrait,landscape,story,pt3,gamefix').split(',');
const GF_SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'shots', 'gamefix');
const FALSIFY = process.argv.includes('--falsify');
const BREAK = `#krz-hud .krz-ap, #krz-hud .krz-axes { visibility: visible !important; }
  html[data-krz-act] .krz-r-panel { bottom: 8px !important; } html[data-krz-act] .krz-reel { bottom: 0 !important; }
  .krz-prompt { top: 170px !important; right: 30px !important; }
  .krz-chips { top: 62% !important; } #krz-overlay #krz-ghud .krz-chips[hidden] { display: flex !important; } #krz-ghud .krz-chips.gone { opacity: 1 !important; transform: none !important; }`;

let ws, seq = 0;
const pending = new Map();
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page') || await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); } };
}
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); const p = join(SHOTS, name + '.png'); writeFileSync(p, Buffer.from(r.data, 'base64')); console.log('  shot', p); }
async function until(expr, secs, step = 200) { const t0 = Date.now(); let v; while ((Date.now() - t0) / 1000 < secs) { v = await ev(expr); if (v) return v; await sleep(step); } return v; }
async function viewport(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
async function tapAt(x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(70);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const R = `(s) => { const e = document.querySelector(s); if (!e || e.hidden || e.closest('[hidden]')) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; }`;
const rectOf = (s) => ev(`(${R})(${JSON.stringify(s)})`);
async function tap(sel) { const r = await rectOf(sel); if (!r) return false; await tapAt(r.x + r.w / 2, r.y + r.h / 2); return true; }
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const results = [], errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

// Everything the top-band pieces must stay off. Subtitles count as their slot (one 3-line pill tall) even when empty.
async function layoutRects() {
  return ev(`(() => { const R = ${R}; const c = __game.controlsRects();
    const subs = document.querySelector('.krz-r-subs'), sb = subs.getBoundingClientRect();
    return { strip: R('.krz-hud-strip'), score: R('.krz-score'), pause: c.topL, topR: c.topR, tower: R('.krz-r-tower'), warp: R('.krz-warp'),
      subs: { x: sb.x, y: sb.y, w: sb.width, h: Math.max(sb.height, 64) }, land: R('.krz-land'), radio: R('.krz-r-btn'), stick: R('.krz-stick-base'), thr: c.thr, pad: c.pad,
      ground: R('.krz-ground'), finish: R('.krz-finish'), stcoach: R('.krz-st-coach'), sttitle: R('.krz-st-title'), ap: R('.krz-ap'), axes: R('.krz-axes') }; })()`);
}
const clashes = (me, r, skip = []) => Object.entries(r).filter(([k, v]) => !skip.includes(k) && hit(me, v)).map(([k]) => k);

const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-DIRK' };
async function fresh(query, extra = {}) {
  await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(300);
  await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify({ 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1, ...extra })};
    for (const k in x) localStorage.setItem(k, JSON.stringify(x[k])); return 1; })()`);
  await send('Page.navigate', { url: BASE + query });
  const ok = await until('!!window.__krayzeeReady', 30, 300);
  if (FALSIFY) await ev(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(BREAK)}; document.head.append(s); return 1; })()`);
  return ok;
}
// what the player sees, not the hidden flag
const chipsGone = `(() => { const c = document.querySelector('.krz-chips'); if (!c) return true; const cs = getComputedStyle(c); return cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || !c.getBoundingClientRect().width; })()`;

async function chipsFlow(W, H, tag) {
  console.log(`\n== chips ${tag} ${W}×${H} touch`);
  await viewport(W, H);
  check(`${tag}: boot Free Flight`, await fresh('?start=free&noaccount=1', { 'krayzee.career': { lifetimePP: 6000 } }));
  check(`${tag}: chips parked at the start`, await until('__game.ghud.ground.state.difficulty === "easy" && __game.ghud.ground.state.aircraft === "c172"', 8));
  await sleep(1200);
  const ch = await rectOf('.krz-chips'), r = await layoutRects();
  const bad = clashes(ch, r);
  check(`${tag}: chips clear of HUD, tower, warp, subtitles, radio, LAND and thumbs`, ch && !bad.length, bad.join(', ') + ' ' + JSON.stringify(ch));
  // up out of the flight view: above the chase-framed plane (portrait plane band starts ~42 %, landscape ~40 %)
  check(`${tag}: chips sit in the top band, above the plane`, ch && ch.y + ch.h <= H * (W < H ? 0.4 : 0.48), JSON.stringify(ch));
  check(`${tag}: prompts held while the chips show`, !(await ev('__game.hud.prompts.current')));
  await shot(`after-chips-${tag}`);

  // the selected chip confirms and fades the set, without rebuilding the game
  const g0 = await ev('(window.__g0 = __game.wiring.game, 1)');
  await tap('.krz-diff [data-d="easy"]');
  await sleep(600);
  check(`${tag}: tapping the selected Easy fades the whole set`, await ev(chipsGone) && (await ev('__game.ghud.ground.state.dismissed')) === 'pick', JSON.stringify(await ev('__game.ghud.ground.state')));
  check(`${tag}: selected chip tap keeps the game (no rebuild)`, g0 && await ev('__game.wiring.game === window.__g0 && __game.wiring.difficulty === "easy"'));
  await sleep(1500);
  check(`${tag}: chips stay away for this flight`, await ev(chipsGone));

  // a stick touch fades them
  check(`${tag}: reload → chips back`, await fresh('?start=free&noaccount=1') && await until('__game.ghud.ground.chipsOn', 8));
  await sleep(800);
  const z = await rectOf('.krz-stick-base');
  const x = z.x + z.w / 2, y = z.y + z.h / 2;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
  for (let i = 1; i <= 4; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 3, y, id: 3 }] }); await sleep(40); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  check(`${tag}: a joystick touch fades the chips`, await ev(chipsGone) && (await ev('__game.ghud.ground.state.dismissed')) === 'control');

  // a throttle touch fades them too
  await fresh('?start=free&noaccount=1'); await until('__game.ghud.ground.chipsOn', 8); await sleep(800);
  await tap('.krz-thr');
  await sleep(600);
  check(`${tag}: a throttle touch fades the chips`, await ev(chipsGone));

  // another choice applies and fades
  await fresh('?start=free&noaccount=1'); await until('__game.ghud.ground.chipsOn', 8); await sleep(800);
  await tap('.krz-diff [data-d="medium"]');
  await sleep(600);
  check(`${tag}: Medium applies and fades the set`, await ev(chipsGone) && await until('__game.wiring.difficulty === "medium" && JSON.parse(localStorage.getItem("krayzee.settings")).difficulty === "medium"', 2));

  // an aircraft pick rebuilds the plane and the set stays faded through the rebuild
  await fresh('?start=free&noaccount=1', { 'krayzee.career': { lifetimePP: 6000 } }); await until('__game.ghud.ground.chipsOn', 8); await sleep(800);
  await tap('.krz-plane [data-a="tiger"]');
  check(`${tag}: Moth pick rebuilds the plane`, await until('__game.S.type === "tiger" && !!__game.S.player', 8));
  await sleep(1500);
  check(`${tag}: chips stay faded after the aircraft rebuild`, await ev(chipsGone), JSON.stringify(await ev('__game.ghud.ground.state')));
  // a locked chip only explains (no fade)
  await fresh('?start=free&noaccount=1'); await until('__game.ghud.ground.chipsOn', 8); await sleep(800);
  await tap('.krz-plane [data-a="bathtub"]');
  await sleep(500);
  check(`${tag}: locked Bathtub explains and keeps the chips`, !(await ev(chipsGone)) && /Bathtub/.test(await ev('__game.ghud.ground.state.why')));
}

async function promptFlow(W, H, tag) {
  console.log(`\n== prompt ${tag} ${W}×${H} touch`);
  await viewport(W, H);
  await fresh('?start=free&noaccount=1');
  await until('!!__game.S.player', 8);
  await ev('(__game.ghud.prompts.reset(), 1)');
  await ev('__game.teleport({ x: 900, z: -300, alt: 140, heading: 270, speedKt: 95, throttle: 0.75 })');
  const pr = await until('__game.hud.prompts.current', 14);
  check(`${tag}: a prompt shows in flight`, !!pr, JSON.stringify(pr));
  await sleep(900);
  const p = await rectOf('.krz-prompt'), r = await layoutRects();
  const right = Math.min(...[r.warp, r.tower].filter(Boolean).map((b) => b.x));
  check(`${tag}: card sits left of the warp chip / tower badge`, p && p.x + p.w <= right && p.y < (r.warp || r.tower).y + (r.warp || r.tower).h, JSON.stringify({ p, warp: r.warp, tower: r.tower }));
  const apRow = await ev(`(() => { const a = document.querySelector('.krz-ap'), x = document.querySelector('.krz-axes'), b = a.getBoundingClientRect();
    return { r: { x: b.x, y: b.y, w: b.width, h: b.height }, ap: getComputedStyle(a).visibility, axes: getComputedStyle(x).visibility }; })()`);
  check(`${tag}: card in the top band (below the HUD strip, over the AP row)`, p && p.y >= r.strip.y + r.strip.h && p.y < H * 0.3 && hit(p, apRow.r), JSON.stringify(p));
  // GAMEFIX #4: one of them wins: while the card shows, the AP pill and the axes row under it are hidden
  check(`${tag}: AP pill + axes row hidden under the card`, apRow.ap === 'hidden' && apRow.axes === 'hidden', JSON.stringify(apRow));
  const bad = clashes(p, r, ['ap', 'axes']);
  check(`${tag}: card clear of strip, score, tower, warp, subtitles, LAND, radio, thumbs`, p && !bad.length, bad.join(', '));
  const look = await ev(`(() => { const e = document.querySelector('.krz-prompt'), cs = getComputedStyle(e), t = getComputedStyle(e.querySelector('.krz-pr-t'));
    const a = +(cs.backgroundColor.match(/[\\d.]+(?=\\))/) || [1])[0]; return { a, title: parseFloat(t.fontSize), op: +cs.opacity, cramped: e.classList.contains('cramped'), clipped: e.scrollHeight > e.clientHeight + 1 }; })()`);
  check(`${tag}: card see-through but legible`, look.a <= 0.5 && look.title >= 12 && look.op > 0.9 && !look.cramped && !look.clipped, JSON.stringify(look));
  const x = await rectOf('.krz-pr-x');
  const top = x && await ev(`(() => { const e = document.elementFromPoint(${x.x + x.w / 2}, ${x.y + x.h / 2}); return !!e && !!e.closest('.krz-pr-x'); })()`);
  check(`${tag}: ✕ is on top and at least 30 px`, top && x.w >= 30 && x.h >= 30, JSON.stringify(x));
  await shot(`after-prompt-${tag}`);
  await tap('.krz-pr-x');
  check(`${tag}: ✕ dismisses by real tap`, await until('__game.hud.prompts.history.some((h) => h.why === "dismissed") && !__game.hud.prompts.current', 2));
}

async function storyFlow() {
  console.log('\n== story mission 1 390×844 touch');
  await viewport(390, 844);
  check('story: Mission 1 boots', await fresh('?mission=1&noaccount=1') && await until('!!__game.S.player && __game.S.playMode === "story"', 20));
  const coach = await until(`!!(${R})('.krz-st-coach')`, 25);
  await ev('(__game.ghud.prompts.reset(), 1)');
  await ev('__game.teleport({ x: 900, z: -300, alt: 140, heading: 270, speedKt: 95, throttle: 0.75 })');
  const pr = await until('__game.hud.prompts.current', 14);
  await sleep(900);
  const p = await rectOf('.krz-prompt'), r = await layoutRects();
  console.log('  DIAG', JSON.stringify({ coach: !!coach, pr: !!pr, p, stcoach: r.stcoach }));
  const bad = p ? clashes(p, r, ['ap', 'axes']) : [];
  check('story: card clear of the mission coach card, title card and subtitles', !!pr && (!p || !bad.length), bad.join(', ') + ' ' + JSON.stringify({ p, stcoach: r.stcoach }));
  await shot('after-prompt-story-portrait');
}

async function pt3Flow() {
  console.log('\n== PLAYTEST_3 items 390×844 touch');
  await viewport(390, 844);
  // skip keeps a live DEMAND TAKEOFF: same end, rolling at once
  await fresh('?start=free&noaccount=1');
  await until('!!__game.S.player', 10);
  // parked on a stand so DEMAND TAKEOFF has to taxi (and SKIP TO RUNWAY is offered)
  await ev(`import('./js/world/layout.js').then((L) => { const s = L.STANDS[0]; __game.teleport({ x: s.position[0], z: s.position[2], alt: 0, heading: s.heading ?? 180, speedKt: 0 }); return 1; })`);
  await until('__game.ghud.ground.state.takeoff', 10);
  await ev('(__game.ghud.ground.chipsOn && __game.ghud.ground.chips.querySelector("[aria-pressed=true]").click(), 1)');
  await tap('.krz-gbtn-to');
  await sleep(1000);
  const end = await ev('__game.S.demandEnd');
  const skipOn = await until('__game.ghud.ground.state.skip', 4);
  if (FALSIFY) await ev('(__game.S.demandEnd = null, 1)');
  if (skipOn) await tap('.krz-gbtn-skip');
  else await ev('(__game.ghud.ground.el.querySelector(".krz-gbtn-skip").click(), 1)');
  const roll = await until(`(() => { const p = __game.state().player; return (p.speedKt > 25 || !p.onGround) && p; })()`, 25);
  const rwHdg = await ev(`import('./js/world/layout.js').then((L) => { const rw = L.RUNWAYS.find((r) => r.ends.includes(${JSON.stringify(end)})); return L.runwayHeadingFor(rw, ${JSON.stringify(end)}); })`);
  const dh = roll ? Math.abs(((roll.heading - rwHdg) % 360 + 540) % 360 - 180) : 999;
  check('skip after DEMAND TAKEOFF keeps the demand (demanded end, rolling within 25 s, no clearance wait)', skipOn && !!roll && dh < 20, JSON.stringify({ end, skipOn, rwHdg, roll: roll && [roll.speedKt, roll.phase, roll.onGround, roll.heading] }));
  // stranded in a field: DEMAND IT greyed → DEMAND TAKEOFF offered, and it gets you airborne
  await fresh('?start=free&noaccount=1');
  await until('!!__game.S.player', 10);
  await ev('__game.teleport({ x: -1500, z: 1500, alt: 150, heading: 180, speedKt: 80, throttle: 0.6 })');
  await sleep(1500);
  await ev('__game.teleport({ x: -1500, z: 1500, alt: 0.3, heading: 180, speedKt: 0, throttle: 0 })');
  await ev('(__game.wiring.game.handleEvent({ type: "tower_buzz", id: 9101, actor: "player", data: { dist: 20, close: true } }), 1)');
  const strand = await until(`(() => { const g = __game.state().game.game; const f = document.querySelector('.krz-finish'); return g?.finishReady && f && !f.hidden && f.dataset.state === 'greyed' && { pending: g.pending }; })()`, 12);
  check('field stop: DEMAND IT greyed (not a finish zone)', !!strand, JSON.stringify(strand));
  check('field stop: DEMAND TAKEOFF offered', await until('__game.ghud.ground.state.takeoff', 4));
  check('field stop: SKIP TO RUNWAY not offered after a flight', !(await ev('__game.ghud.ground.state.skip')));
  await shot('pt3-field-stranded');
  if (FALSIFY) await ev('(__game.S.everAir = false, 1)');
  await tap('.krz-gbtn-to');
  const up = await until('!__game.state().player.onGround && __game.state().player.alt > 20', 150, 500);
  check('field stop: DEMAND TAKEOFF gets you airborne again', !!up, JSON.stringify(await ev('(() => { const p = __game.state().player; return [p.x, p.z, p.speedKt, p.phase, p.onGround]; })()')));
  // quit with pending PP asks first (popup, no alert)
  await ev('(window.alert = () => { window.__alerted = 1; }, 1)');
  if (FALSIFY) await ev('(__game.wiring.game.bank(), 1)');
  const pend = await ev('__game.state().game.game.pending');
  await tap('[data-act="pause"]');
  await until('__game.state().paused', 3);
  await sleep(500);
  await tap('.kz-btn.danger');
  const q = await until(`!document.querySelector('.krz-quitc').hidden && document.querySelector('.krz-quitc-pp').textContent`, 2);
  check('quit with pending PP shows the confirm with the amount', !!q && q.replace(/,/g, '') === String(Math.round(pend)) && !(await ev('window.__alerted')), `${q} vs ${pend}`);
  await shot('pt3-quit-confirm');
  await tap('.krz-quitc-stay');
  await sleep(400);
  check('"Keep flying" keeps the flight', await ev('__game.state().mode === "play"') && await ev('document.querySelector(".krz-quitc").hidden'));
  await tap('.kz-btn.danger');
  await until(`!document.querySelector('.krz-quitc').hidden`, 2); await sleep(300);
  await tap('.krz-quitc-go');
  check('"Quit and lose them" quits to the menu', await until('__game.state().mode === "attract"', 4));
  // radio target names readable on the dark sheet
  await fresh('?start=free&noaccount=1');
  await until('!!__game.S.player', 10);
  await ev('__game.teleport({ x: 900, z: -300, alt: 300, heading: 270, speedKt: 95, throttle: 0.75 })');
  await sleep(2500);
  if (FALSIFY) await ev(`(() => { const s = document.createElement('style'); s.textContent = '.krz-r-tgt { color: var(--c) !important; }'; document.head.append(s); return 1; })()`);
  await tap('.krz-r-btn');
  const lum = await until(`(() => { const t = [...document.querySelectorAll('.krz-r-tgt')]; if (!t.length) return null;
    return t.map((e) => { const c = getComputedStyle(e).color, m = c.match(/[\\d.]+/g).map(Number); const [r, g, b] = c.startsWith('color(') ? m.slice(0, 3).map((v) => v * 255) : m;
      const L = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return +(0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b)).toFixed(3); }); })()`, 6);
  check('radio target names light enough on the dark sheet (luminance ≥ 0.35)', lum && lum.every((v) => v >= 0.35), JSON.stringify(lum));
  await shot('pt3-radio-targets');
}

// GAMEFIX #2/#3: stranded with two action rows (DEMAND IT greyed + DEMAND TAKEOFF): a radio sheet and the Herald reel
// must never sit on an action button, in either orientation.
async function gfShot(name) { mkdirSync(GF_SHOTS, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); const p = join(GF_SHOTS, name + '.png'); writeFileSync(p, Buffer.from(r.data, 'base64')); console.log('  shot', p); }
const COVER = `((sel) => { const e = document.querySelector(sel); if (!e || e.hidden || e.closest('[hidden]')) return 'missing'; const b = e.getBoundingClientRect();
  const pts = [[.5, .5], [.15, .5], [.85, .5]].map(([fx, fy]) => document.elementFromPoint(b.x + b.width * fx, b.y + b.height * fy));
  const bad = pts.find((t) => !t || !e.contains(t)); return bad ? (bad.className?.baseVal ?? bad.className ?? bad.tagName) + '' : ''; })`;
async function gamefixFlow(W, H, tag) {
  console.log(`\n== GAMEFIX radio sheet + reel vs the action slot ${W}×${H}`);
  await viewport(W, H);
  await fresh('?start=free&noaccount=1');
  await until('!!__game.S.player', 10);
  await ev('__game.teleport({ x: -1500, z: 1500, alt: 150, heading: 180, speedKt: 80, throttle: 0.6 })');
  await sleep(1500);
  await ev('__game.teleport({ x: -1500, z: 1500, alt: 0.3, heading: 180, speedKt: 0, throttle: 0 })');
  await ev('(__game.wiring.game.handleEvent({ type: "tower_buzz", id: 9201, actor: "player", data: { dist: 20, close: true } }), 1)');
  const two = await until(`document.documentElement.dataset.krzAct === '2' && __game.ghud.ground.state.takeoff`, 12);
  check(`${tag}: stranded: two action rows (DEMAND IT greyed + DEMAND TAKEOFF)`, !!two, await ev('document.documentElement.dataset.krzAct'));
  await tap('.krz-r-btn');
  const open = await until(`!document.querySelector('.krz-r-panel').hidden`, 4);
  await sleep(400);
  const cov = await ev(`[${COVER}('.krz-finish'), ${COVER}('.krz-gbtn-to')]`);
  const pr = await rectOf('.krz-r-panel'), fr = await rectOf('.krz-finish'), tr = await rectOf('.krz-gbtn-to');
  check(`${tag}: radio sheet open, clear of DEMAND IT and DEMAND TAKEOFF`, open && !cov[0] && !cov[1] && !hit(pr, fr) && !hit(pr, tr), JSON.stringify({ cov, pr, fr, tr }));
  const chipsIn = await ev(`(() => { const p = document.querySelector('.krz-r-panel').getBoundingClientRect(); return [...document.querySelectorAll('.krz-r-chip')].every((c) => { const b = c.getBoundingClientRect(); return b.top >= p.top - 1 && b.bottom <= p.bottom + 1 && b.top >= 0; }); })()`);
  check(`${tag}: radio chips all visible inside the sheet (on screen)`, chipsIn);
  await gfShot(`radio-sheet-${tag}`);
  await tap('.krz-r-x');
  await until(`document.querySelector('.krz-r-panel').hidden`, 3);
  // a Herald reel on the ground: DEMAND TAKEOFF stays tappable without dismissing it
  await ev(`(__game.ghud.headlines.onPP({ id: 'tower_buzz', amount: 300 }), __game.ghud.headlines.onPP({ id: 'low_pass', amount: 200 }), __game.ghud.headlines.reel(), 1)`);
  const reel = await until(`!!document.querySelector('.krz-reel:not(.out)')`, 3);
  await sleep(700);
  const rc = await ev(`${COVER}('.krz-gbtn-to')`);
  const rr = await rectOf('.krz-reel-btns'), tr2 = await rectOf('.krz-gbtn-to');
  check(`${tag}: Herald reel open, DEMAND TAKEOFF not under it`, reel && !rc && !hit(rr, tr2), JSON.stringify({ rc, rr, tr2 }));
  await gfShot(`reel-${tag}`);
  await tap('.krz-gbtn-to');
  const went = await until(`!document.querySelector('.krz-reel:not(.out)') && (__game.S.demandedT || !__game.state().player.onGround)`, 4);
  check(`${tag}: DEMAND TAKEOFF under the reel works and closes the reel`, !!went);
  // GAMEFIX #4 visual: the prompt card wins over the AP pill
  await ev('__game.teleport({ x: 900, z: -300, alt: 140, heading: 270, speedKt: 95, throttle: 0.75 })');
  await ev('(__game.ghud.prompts.reset(), 1)');
  if (await until('__game.hud.prompts.current', 14)) { await sleep(900); await gfShot(`prompt-card-${tag}`); }
}
// GAMEFIX #1 / #5: Hard, stopped on the runway with the AP done: it taxis in by itself, the HUD says so, no SKIP, then DEMAND IT
async function hardTaxiIn() {
  console.log('\n== GAMEFIX Hard taxi-in 390×844 (timescale 4)');
  await viewport(390, 844);
  await fresh('?start=free&noaccount=1&timescale=4', { 'krayzee.settings': { difficulty: 'hard' } });
  await until('!!__game.S.player', 10);
  check('hard: difficulty is hard', (await ev('__game.wiring.difficulty')) === 'hard');
  await ev('__game.teleport({ x: 300, z: 0, alt: 40, heading: 270, speedKt: 70, throttle: 0.3 })');
  await sleep(600);
  await ev('__game.teleport({ x: 300, z: 0, alt: 0.3, heading: 270, speedKt: 0, throttle: 0 })');
  await ev('(__game.wiring.game.handleEvent({ type: "tower_buzz", id: 9301, actor: "player", data: { dist: 20, close: true } }), 1)');
  await ev(`(__game.S.player.ap.setRoute({ name: 'stop', legs: [{ kind: 'park', seconds: 0.2, label: 'STOP' }], loop: null }), 1)`);
  if (FALSIFY) await ev('(__game.S.taxiIn = 1, 1)');
  const inb = await until(`(() => { const f = document.querySelector('.krz-finish'); return f && !f.hidden && f.dataset.state === 'greyed' && /Taxiing to the terminal/.test(f.textContent) && f.textContent; })()`, 12);
  check('hard: the AP taxis in by itself and DEMAND IT says "Taxiing to the terminal…"', !!inb, String(inb));
  await sleep(1500);
  check('hard: no SKIP TO RUNWAY during the taxi-in', !(await ev('__game.ghud.ground.state.skip')));
  check('hard: DEMAND TAKEOFF still offered during the taxi-in', await ev('__game.ghud.ground.state.takeoff'));
  await gfShot('hard-taxi-in-portrait');
  const pend0 = await ev('__game.state().game.game.pending');
  const ready = await until(`document.querySelector('.krz-finish')?.dataset.state === 'ready'`, 120, 500);
  check('hard: DEMAND IT lights at the terminal', !!ready, JSON.stringify(await ev('(() => { const p = __game.state().player; return [p.x, p.z, p.phase, p.speedKt]; })()')));
  await gfShot('hard-at-terminal-portrait');
  await ev('(__game.S.player.ac.fuel.L *= 0.5, 1)');
  await tap('.krz-finish');
  const g = await until(`(() => { const g = __game.state().game.game; return g.pending === 0 && g.banked > 0 && { banked: g.banked, fuel: +__game.S.player.ac.fuelFraction.toFixed(3) }; })()`, 6);
  check('hard: DEMAND IT banks the pending PP and refuels', g && g.banked === pend0 && g.fuel >= 0.999, JSON.stringify({ g, pend0 }));
}

// GAMEFIX #7: Easy, stopped on grass 420 m off the runway (outside the 300 m zone, inside the 500 m field-hop line): DEMAND
// TAKEOFF taxis the AP in. Crossing into the zone at walking pace must not light DEMAND IT or hide DEMAND TAKEOFF.
async function demandTaxiOut() {
  console.log('\n== GAMEFIX DEMAND TAKEOFF taxi through the Easy finish zone 390×844 (timescale 4)');
  await viewport(390, 844);
  await fresh('?start=free&noaccount=1&timescale=4');
  await until('!!__game.S.player', 10);
  await ev('__game.teleport({ x: 600, z: 420, alt: 40, heading: 0, speedKt: 70, throttle: 0.3 })');
  await sleep(600);
  await ev('__game.teleport({ x: 600, z: 420, alt: 0.3, heading: 0, speedKt: 0, throttle: 0 })');
  await ev('(__game.wiring.game.handleEvent({ type: "tower_buzz", id: 9401, actor: "player", data: { dist: 20, close: true } }), 1)');
  const offered = await until('__game.ghud.ground.state.takeoff', 8);
  // FLIGHTFIX3 takes off straight from grass; refuse that so the taxi-in fallback (no clear run) is what gets tested
  await ev('(__game.S.player.ap.fieldTakeoff = () => false, 1)');
  await tap('.krz-gbtn-to');
  if (FALSIFY) await ev('(__game.S.demandLive = false, 1)');
  await ev(`(() => { window.__gf7 = { n: 0, bad: [] }; const f = () => { const P = __game.S.player, ap = P.ap, kt = P.ac.gs / 0.5144;
    // a give-way stop inside the zone mid-taxi (a crossing, traffic): held still for ~30 frames once z < 280
    if (P.ac.onGround && Math.abs(P.ac.pos.z) < 280 && (__gf7.hold = (__gf7.hold || 0) + 1) < 30) P.ac.vel.set(0, 0, 0);
    if (P.ac.onGround && !(ap.leg?.kind === 'takeoff' && (ap.sub === 'roll' || ap.sub === 'rotate' || kt > 25))) { __gf7.n++;
      const fin = document.querySelector('.krz-finish').dataset.state, to = __game.ghud.ground.state.takeoff;
      if (fin === 'ready' || !to) __gf7.bad.push([Math.round(P.ac.pos.x), Math.round(P.ac.pos.z), +kt.toFixed(1), fin, to]); }
    if (P.ac.onGround) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
  await until('!__game.state().player.onGround', 60, 500);
  const r = await ev('__gf7');
  check('taxi-out: DEMAND TAKEOFF stays and DEMAND IT stays dark while the AP taxis through the finish zone', offered && r.n > 20 && !r.bad.length, JSON.stringify({ n: r.n, bad: r.bad.slice(0, 4) }));
}

await connect();
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); });
if (ONLY.includes('portrait')) { await chipsFlow(390, 844, 'portrait'); await promptFlow(390, 844, 'portrait'); }
if (ONLY.includes('landscape')) { await chipsFlow(844, 390, 'landscape'); await promptFlow(844, 390, 'landscape'); }
if (ONLY.includes('story')) await storyFlow();
if (ONLY.includes('pt3')) await pt3Flow();
if (ONLY.includes('gamefix')) { await gamefixFlow(390, 844, 'portrait'); await gamefixFlow(844, 390, 'landscape'); await hardTaxiIn(); await demandTaxiOut(); }
check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed${FALSIFY ? ' (FALSIFY: placement/fade checks are expected to FAIL)' : ''}`);
process.exit(FALSIFY ? 0 : fails.length ? 1 : 0);
