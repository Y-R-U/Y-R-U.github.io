// Lane 7: every mini-game, played to its results screen in the real game, plus the command bar.
//   node tools/qa_minigames.mjs [--url U] [--only mobile|desktop] [--games parkour,ctf] [--no-cmd] [--falsify ends,stuck] [--port 9319]
// Launch: title → Games tab → card's Play (real taps). Play: real stick/WASD input to prove movement, then
// __game hooks steer (teleport onto platforms/caches/flags/hiders, zap siege monsters). Floor Fall and Hide (hider)
// are played out naturally. Then Play again → restart, pause → Leave → Games tab (Parkour: results → Mini-games).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';
import { VIEWPORTS, DEFAULT_URL, printTable } from './qa_smoke.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PASS = 'PASS', FAIL = 'FAIL', SKIP = 'SKIP', WARN = 'WARN';
const MARGIN = 30;            // seconds allowed past a game's own limit (plus the 3.5 s countdown)
const STUCK_S = 10;

// limit = the game's own clock (s). steer = how the harness drives it to an end.
const SPEC = {
  parkour: { limit: 120, steer: 'parkour' },
  floorfall: { limit: 180, steer: null },
  treasure: { limit: 240, steer: 'treasure' },
  ctf: { limit: 360, steer: 'ctf', fps: true },
  hideseek: { limit: 150, steer: null },
  'hideseek-seek': { limit: 195, steer: 'seek' },
  siege: { limit: 360, steer: 'siege' },
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const url = opt('--url', DEFAULT_URL);
const port = +opt('--port', 9319);
const only = opt('--only') ? [opt('--only')] : ['mobile', 'desktop'];
const gamesWanted = opt('--games') ? opt('--games').split(',') : Object.keys(SPEC);
const F = new Set((opt('--falsify') || '').split(',').filter(Boolean));
const noCmd = args.includes('--no-cmd');
const OUT = path.join(HERE, 'qa_out', 'minigames');
fs.mkdirSync(OUT, { recursive: true });
const local = /^http:\/\/(localhost|127\.)/.test(url);

const results = [];
let VPN = '';
const add = (game, name, status, detail = '') => {
  results.push({ vp: VPN, name: `${game.padEnd(13)} ${name}`, status, detail: String(detail) });
  console.log(`  [${VPN}] ${status.padEnd(4)} ${game} · ${name}${detail ? ' — ' + detail : ''}`);
};

const MOD = `(await import(new URL('js/minigames/index.js', document.baseURI).href)).minigames`;
const REG = `(await import(new URL('js/minigames/registry.js', document.baseURI).href))`;

console.log(`SYNTHWILD mini-games → ${url}${F.size ? '  [FALSIFY ' + [...F] + ']' : ''}`);
await launch(port);
try {
  for (const vpName of only) {
    VPN = vpName;
    try { await runViewport(vpName); } catch (e) { console.log(e.stack); add('harness', 'crash', FAIL, e.message); }
  }
} finally { stopBrowser(port); }
const fails = printTable(results, 'SYNTHWILD mini-games');
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ url, at: new Date().toISOString(), falsify: [...F], results }, null, 1));
process.exit(fails ? 1 : 0);

async function runViewport(vpName) {
  const vp = VIEWPORTS[vpName];
  const pg = await open(port);
  const shot = (n) => pg.shot(path.join(OUT, `${vpName}_${n}.png`));
  const mg = (body) => pg.eval(`(async()=>{const G=window.__game,C=G&&G.ctx;const M=${MOD};const R=M.running;const D=R&&R.def;${body}})()`);
  try {
    await pg.viewport(vp);
    await pg.clearOrigin(url);
    const nav = await pg.goto(url);
    if (nav.status !== 200) { add('boot', 'page', FAIL, 'HTTP ' + nav.status); return; }
    if (!await pg.waitFor(`!!document.querySelector('.sw-title')`, { timeout: 20000 })) { add('boot', 'title', FAIL, 'no title'); return; }
    // Skip the first-run intro for this profile, and seed one normal world to prove the games never touch it.
    await pg.eval(`(()=>{const k='synthwild.settings';const s=JSON.parse(localStorage.getItem(k)||'{}');s.introSeen=true;localStorage.setItem(k,JSON.stringify(s))})()`);
    await pg.eval(`(async()=>{const a=(await import(new URL('js/net/api.js',document.baseURI).href)).api;await a.local.put({name:'QA keep me',seed:'qa-keep',mode:'build',data:{qa:'untouched',n:42}});return 1})()`);
    await pg.reload();
    await pg.waitFor(`!!document.querySelector('.sw-title')`, { timeout: 20000 });
    await sleep(800);
    const idb0 = await idbSnap(pg);
    const names = await pg.eval(`(async()=>{const r=${REG};return (await r.listGames()).map(d=>({id:d.id,name:d.name}))})()`);
    const nameOf = Object.fromEntries(names.map((d) => [d.id, d.name]));

    for (const id of gamesWanted) {
      if (!SPEC[id]) continue;
      if (!nameOf[id]) { add(id, 'present', SKIP, 'not in listGames() (module missing or failed to load)'); continue; }
      try { await playOne(id, nameOf[id]); } catch (e) {
        console.log(e.stack);
        add(id, 'harness', FAIL, 'crashed: ' + e.message);
        await recoverToTitle();
      }
    }

    const idb1 = await idbSnap(pg);
    add('worlds', 'IDB untouched', idb0 === idb1 && /QA keep me/.test(idb1) ? PASS : FAIL,
      idb0 === idb1 ? `same snapshot (${idb1.length} chars, contains "QA keep me")` : `CHANGED:\n before ${idb0.slice(0, 300)}\n after  ${idb1.slice(0, 300)}`);

    if (!noCmd) await commandBar(vpName);
  } finally {
    fs.writeFileSync(path.join(OUT, `${vpName}_log.json`), JSON.stringify(pg.log, null, 1));
    await pg.close();
  }

  // ---------------------------------------------------------------- one game
  async function playOne(id, name) {
    const spec = SPEC[id];
    pg.resetLog();
    // launch through the Games tab
    await ensureGamesTab();
    const btn = await pg.evalSafe(`(()=>{for(const c of document.querySelectorAll('.mg-card')){const n=c.querySelector('.mg-cname');if(!n||n.childNodes[0].textContent.trim()!==${JSON.stringify(name)})continue;
      const b=c.querySelector('.mg-cplay')||c;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,hit:!!t&&b.contains(t)}}return null})()`);
    if (!btn) { add(id, 'launch', FAIL, `no card named "${name}" in the Games tab`); return; }
    if (!btn.hit) console.log('  note: Play button not top-most at its centre');
    await sleep(250);
    await pg.tap(btn.x, btn.y);
    const t0 = Date.now();
    // Desktop headless: the shell auto-pauses when pointer lock is lost/refused, so resume (and count it) while waiting.
    let launchPauses = 0;
    const started = await pg.waitFor(`(async()=>{const M=${MOD};const S=(window.__game.shell||window.__game.ctx.ui?.shell||window.__game.ctx.ui);
      if(M.running&&M.running.id===${JSON.stringify(id)}&&S.state==='paused'){window.__qaLP=(window.__qaLP||0)+1;S.resume();return false}
      return !!(M.running&&M.running.id===${JSON.stringify(id)}&&S.state==='playing'&&!document.querySelector('.sw-loading'))})()`, { timeout: 45000, every: 300 });
    launchPauses = (await pg.evalSafe('window.__qaLP||0')) || 0;
    await pg.evalSafe('window.__qaLP=0');
    if (!started) { await shot(`${id}_nolaunch`); add(id, 'launch', FAIL, 'not playing 45 s after tapping Play'); await recoverToTitle(); return; }
    add(id, 'launch', launchPauses ? WARN : PASS, `Games tab → "${name}" → playing in ${((Date.now() - t0) / 1000).toFixed(1)} s${launchPauses ? `; opened PAUSED ${launchPauses}× (pointer-lock auto-pause), resumed by hook` : ''}`);
    const tStart = Date.now();
    await sleep(4300);                      // 3-2-1-GO
    await shot(`${id}_1_start`);

    // HUD timer/score moves
    const hud = () => pg.evalSafe(`(()=>{const q=s=>document.querySelector('.mg-top '+s)?.textContent||'';return q('.tm')+' | '+q('.sc')+' | '+q('.ob')})()`);
    const h1 = await hud();

    // real input moves the player (the Seeker is pinned while counting, so skip it there)
    if (id !== 'hideseek-seek') {
      const p0 = await mg('const p=C.player.pos;return [p.x,p.y,p.z]');
      let d = 0;
      const track = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { const p = await mg('const p=C.player.pos;return [p.x,p.y,p.z]'); d = Math.max(d, Math.hypot(p[0] - p0[0], p[2] - p0[2])); await sleep(150); } };
      if (vp.mobile) {
        await pg.touch('touchStart', [[150, 300, 31]]);
        for (let i = 1; i <= 6; i++) { await pg.touch('touchMove', [[150, 300 - i * 9, 31]]); await sleep(25); }
        await track(1100);
        await pg.touch('touchEnd', []);
      } else {
        await pg.keyDown('KeyW', 'w'); await track(1200); await pg.keyUp('KeyW', 'w');
      }
      add(id, 'real input moves', d > 0.5 ? PASS : FAIL, `${vp.mobile ? 'stick' : 'W key'} ~1.2 s → max ${d.toFixed(2)} m from start`);
    }
    else await sleep(2200);
    const h2 = await hud();
    add(id, 'HUD moves', h1 !== h2 && h2 ? PASS : FAIL, `"${h1}" → "${h2}"`);

    if (spec.fps) await fpsCheck(id);

    if (F.has('stuck')) await mg(`const b=(D.squad?.list||D.bots||[])[0];if(!b)return 0;b.update=()=>{};b.goTo(Math.floor(b.x)+12,Math.floor(b.y),Math.floor(b.z));return 1`);

    // play to the end, sampling bots each second
    const limit = (F.has('ends') ? 3 : spec.limit + MARGIN) + 3.5;
    const hist = new Map();
    let steerT = 0, end = null, steerErr = null, parkourDone = false, autoPaused = 0;
    while ((Date.now() - tStart) / 1000 < limit + 15) {
      end = await pg.evalSafe(`(()=>{const c=document.querySelector('.mg-results');return c?{t:c.querySelector('h2')?.textContent,txt:c.querySelector('p')?.textContent}:null})()`);
      if (end) break;
      if (await pg.evalSafe(`!!document.querySelector('.sw-pause')`)) { autoPaused++; await pg.evalSafe(`(window.__game.shell||window.__game.ctx.ui?.shell).resume()`); }
      const bots = await mg(`return (D?.squad?.list||D?.bots||[]).filter(b=>b&&!b.out).map(b=>({k:b.name+'#'+(b.id??''),x:b.x,y:b.y,z:b.z,
        a:!!b.goal&&!(b.arrived?b.arrived(Math.max(0.6,b.goalNear||0)):true)&&!((b.frozen||0)>0)&&!b.hidden&&!b.falling&&!b.mem?.found,u:b.stuckCount||0}))`).catch(() => []);
      const now = (Date.now() - tStart) / 1000;
      for (const b of bots || []) { if (!hist.has(b.k)) hist.set(b.k, []); hist.get(b.k).push({ t: now, ...b }); }
      if (Date.now() - steerT > 700) {
        steerT = Date.now();
        try { if (spec.steer === 'parkour' && !parkourDone) { await steerParkour(); parkourDone = true; } else await steer(spec.steer); } catch (e) { steerErr = e.message; }
      }
      await sleep(1000);
    }
    const secs = (Date.now() - tStart) / 1000;
    await shot(`${id}_2_end`);
    add(id, 'game ends in time', end && secs <= limit ? PASS : FAIL,
      end ? `"${end.t}" after ${secs.toFixed(0)} s (limit ${limit.toFixed(0)} s)${autoPaused ? `; NOTE auto-paused ${autoPaused}× (resumed by hook)` : ''}` : `no results ${secs.toFixed(0)} s in (limit ${limit.toFixed(0)} s)${steerErr ? '; steer error ' + steerErr : ''}`);
    if (end) {
      await sleep(1200);
      const card = await pg.evalSafe(`(()=>{const c=document.querySelector('.mg-results');if(!c)return null;const b=[...c.querySelectorAll('button')].map(b=>b.textContent.trim());const r=c.getBoundingClientRect();
        return {buttons:b,stars:c.querySelectorAll('.mg-stars .on').length,vis:r.width>50&&r.height>50,text:c.textContent.slice(0,140)}})()`);
      add(id, 'results card', card?.vis && card.buttons.some((b) => /Play again/.test(b)) ? PASS : FAIL, JSON.stringify(card));
    } else add(id, 'results card', SKIP, 'never finished');

    // bots never stuck > 10 s
    let worst = { s: 0 }, unst = 0;
    for (const [k, h] of hist) {
      unst = Math.max(unst, h[h.length - 1]?.u || 0) + (unst && 0);
      let i0 = null;
      for (let i = 0; i < h.length; i++) {
        const s = h[i];
        if (!s.a) { i0 = null; continue; }
        if (i0 == null) i0 = i;
        while (i0 < i && Math.hypot(s.x - h[i0].x, s.y - h[i0].y, s.z - h[i0].z) > 0.5) i0++;
        const dur = s.t - h[i0].t;
        if (dur > worst.s) worst = { s: dur, k, at: [s.x, s.y, s.z].map((v) => +v.toFixed(1)) };
      }
    }
    const watchdog = [...hist.values()].reduce((a, h) => a + (h[h.length - 1]?.u || 0), 0);
    if (!hist.size) add(id, 'bots unstuck', SKIP, 'no bots in this game');
    else add(id, 'bots unstuck', worst.s <= STUCK_S ? PASS : FAIL, `${hist.size} bots sampled ~1 Hz; longest no-progress-with-a-goal ${worst.s.toFixed(1)} s${worst.k ? ` (${worst.k} at ${worst.at})` : ''}; watchdog unstick() fired ${watchdog}×`);

    // Play again → clean restart (Parkour also tests results → Mini-games)
    if (end) {
      pg.resetLog();
      await pg.tapSel('.mg-results button', 'Play again');
      const again = await pg.waitFor(`(async()=>{const M=${MOD};const S=(window.__game.shell||window.__game.ctx.ui?.shell||window.__game.ctx.ui);if(M.running&&!M.running.mg.done&&S.state==='paused'&&!document.querySelector('.mg-results')){window.__qaLP=(window.__qaLP||0)+1;S.resume();return false}return !!(M.running&&M.running.id===${JSON.stringify(id)}&&!M.running.mg.done&&!document.querySelector('.mg-results')&&document.querySelectorAll('.mg-hud').length===1&&(window.__game.shell||window.__game.ctx.ui?.shell||window.__game.ctx.ui).state==='playing')})()`, { timeout: 45000, every: 300 });
      await sleep(4500);
      const st = await pg.evalSafe(`(()=>({huds:document.querySelectorAll('.mg-hud').length,tm:document.querySelector('.mg-top .tm')?.textContent,res:!!document.querySelector('.mg-results'),pause:!!document.querySelector('.sw-pause')}))()`);
      const lp = (await pg.evalSafe('window.__qaLP||0')) || 0; await pg.evalSafe('window.__qaLP=0');
      add(id, 'play again', again && !pg.log.exceptions.length ? (lp ? WARN : PASS) : FAIL, `${again ? 'restarted' : 'did NOT restart in 45 s'}${lp ? ` (opened PAUSED ${lp}×, resumed by hook)` : ''}; ${JSON.stringify(st)}; ${pg.log.exceptions.length} exceptions`);
      if (id === 'parkour' && again) {
        await steerParkour();
        const e2 = await pg.waitFor(`!!document.querySelector('.mg-results')`, { timeout: 20000 });
        if (e2) {
          await sleep(1000);
          await pg.tapSel('.mg-results button', 'Mini-games');
          const back = await pg.waitFor(`(async()=>!!document.querySelector('.sw-title .mg-grid')&&!(${MOD}).running&&!document.querySelector('.mg-hud'))()`, { timeout: 15000 });
          add(id, 'results → Mini-games', back ? PASS : FAIL, back ? 'Games tab shown, runner stopped, mini-game HUD gone' : 'did not land on the Games tab');
        } else add(id, 'results → Mini-games', FAIL, 'second run never finished');
      }
    } else add(id, 'play again', SKIP, 'no results card');

    // pause → Leave → Games tab
    if (await pg.evalSafe(`!!(${'document.querySelector(".sw-title .mg-grid")'})`)) return errorsRow(id);
    const r = (await pg.rect('.sw-pausebtn')) || (vp.mobile && await pg.rect('[data-btn=pause]'));
    if (r) await pg.tap(r.x, r.y);
    let paused = await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 3000 });
    if (!paused && !vp.mobile) { await pg.key('Escape'); paused = await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 3000 }); }
    if (!paused) { add(id, 'leave → Games tab', FAIL, `pause menu did not open (pause button ${r ? (r.covered ? 'covered by ' + r.covered : 'tapped') : 'not found'})`); await recoverToTitle(); return errorsRow(id); }
    await pg.tapSel('.sw-pause button', 'Leave');
    const back = await pg.waitFor(`(async()=>!!document.querySelector('.sw-title .mg-grid')&&!(${MOD}).running&&!document.querySelector('.mg-hud'))()`, { timeout: 15000 });
    add(id, 'leave → Games tab', back ? PASS : FAIL, back ? 'pause → Leave → Games tab, runner stopped' : 'not on the Games tab 15 s after Leave');
    if (!back) await recoverToTitle();
    errorsRow(id);
  }

  function errorsRow(id) {
    const L = pg.log;
    const ce = L.console.filter((c) => (c.type === 'error' || c.type === 'log-error') && !/^Failed to load resource/.test(c.text));
    const bad = [...L.bad.map((b) => `${b.status} ${b.url.replace(url, '')}`), ...L.failed.map((f) => `${f.error} ${f.url.replace(url, '')}`)]
      .filter((u) => !(local && /api\//.test(u)) && !/favicon\.ico/.test(u));
    const n = L.exceptions.length + ce.length + bad.length + L.foreign.length;
    add(id, 'no errors / 4xx', n ? FAIL : PASS, n ? [...L.exceptions.map((e) => 'EXC ' + e.text), ...ce.map((c) => 'ERR ' + c.text), ...new Set(bad), ...L.foreign.map((f) => 'FOREIGN ' + f.url)].slice(0, 6).join(' || ').slice(0, 600) : 'clean (favicon ignored here)');
  }

  async function ensureGamesTab() {
    if (!await pg.evalSafe(`!!document.querySelector('.sw-title')`)) await recoverToTitle();
    if (await pg.evalSafe(`!!document.querySelector('.sw-title .mg-grid')`)) return;
    await pg.tapSel('.sw-tabs button', 'Games');
    await pg.waitFor(`!!document.querySelector('.mg-card')`, { timeout: 8000 });
    await sleep(300);
  }

  async function recoverToTitle() {
    await pg.evalSafe(`(async()=>{const S=(window.__game.shell||window.__game.ctx.ui?.shell||window.__game.ctx.ui);if(S.state!=='title'){try{${MOD}.stop()}catch{};await S.quit({toMenu:true})}})()`);
    if (!await pg.waitFor(`!!document.querySelector('.sw-title')`, { timeout: 10000 })) {
      await pg.reload();
      await pg.waitFor(`!!document.querySelector('.sw-title')`, { timeout: 20000 });
    }
  }

  async function fpsCheck(id) {
    const r = await pg.eval(`new Promise(res=>{const ts=[];const t0=performance.now();const f=t=>{ts.push(t);if(t-t0<8000)requestAnimationFrame(f);else res({fps:+(ts.length/((t-t0)/1000)).toFixed(1)})};requestAnimationFrame(f)})`, { timeout: 20000 });
    const nb = await mg('return (D.squad?.list||D.bots||[]).length');
    const load = os.loadavg()[0], busy = load > os.cpus().length * 0.6, floor = vp.mobile ? 30 : 50;
    add(id, `fps with ${nb} bots`, r.fps >= floor ? PASS : busy ? WARN : FAIL, `${r.fps} fps over 8 s, floor ${floor}, load ${load.toFixed(1)}${busy ? ' (CONTENDED)' : ''}`);
  }

  async function steerParkour() {
    const n = await mg('return D.steps.length');
    for (let i = 1; i < n; i++) {
      const r = await mg(`if(D.over)return 'over';const s=D.steps[${i}],o=D.A.origin;C.player.teleport(o.x+s.x+0.5,o.y+s.y+0.02,o.z+s.z+0.5);return 1`);
      if (r === 'over') return;
      await sleep(260);
    }
  }

  async function steer(kind) {
    if (kind === 'treasure') return mg(`if(D.over||!D.cur)return;const s=D.cur,o=D.A.origin;C.player.teleport(o.x+s.at[0]+0.5,o.y+s.at[1]-0.4,o.z+s.at[2]+0.5)`);
    if (kind === 'ctf') return mg(`if(D.over||D.count>0)return;const f=D.flags;
      if(f.red.carrier!=='player'){const p=f.red.pos;C.player.teleport(p.x,p.y+0.02,p.z);return}
      const b=f.blue,home=!b.carrier&&Math.hypot(b.pos.x-b.home.x,b.pos.z-b.home.z)<0.1;const p=home?b.home:b.pos;C.player.teleport(p.x+0.4,p.y+0.02,p.z)`);
    if (kind === 'seek') return mg(`if(D.over||D.phase!=='seek')return;const b=D.squad.list.find(b=>!b.mem.found);if(b)C.player.teleport(b.x,b.y+0.02,b.z)`);
    if (kind === 'siege') return mg(`if(D.over||D.phase!=='wave')return;for(const m of [...D.alive])if(!m.removed&&!m.dying)C.game.mobs.kill(m,'qa')`);
  }

  // ---------------------------------------------------------------- command bar
  async function commandBar(vpName) {
    const T = 'cmd';
    const toastText = () => pg.evalSafe(`[...document.querySelectorAll('.sw-toast:not(.qa-seen)')].map(e=>e.textContent).join(' | ')`);
    const markToasts = () => pg.evalSafe(`document.querySelectorAll('.sw-toast').forEach(e=>e.classList.add('qa-seen'))`);
    const u = new URL(url); u.searchParams.set('play', '1'); u.searchParams.set('nointro', '1'); u.searchParams.set('mode', 'survival'); u.searchParams.set('seed', 'qa-cmd');
    pg.resetLog();
    await pg.goto(u.href);
    const ok = await pg.waitFor(`(()=>{const C=window.__game?.ctx;return (window.__game?.shell||C?.ui?.shell)?.state==='playing'&&C.world.isReady(C.player.pos.x,C.player.pos.z)})()`, { timeout: 45000 });
    if (!ok) { add(T, 'survival world', FAIL, 'did not start'); return; }
    await sleep(2500);
    if (vp.mobile) {
      // touch: the pause menu's Commands chip opens the bar
      const r = await pg.rect('.sw-pausebtn');
      if (r) await pg.tap(r.x, r.y);
      await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 3000 });
      await pg.tapSel('.sw-pause button', 'Commands');
      const open = await pg.waitFor(`!!document.querySelector('.mg-cmd input')`, { timeout: 3000 });
      add(T, 'Commands chip (touch)', open ? PASS : FAIL, open ? 'pause → Commands opens the bar' : 'bar did not open');
      if (open) {
        await sleep(600);   // the bar slides in
        await markToasts();
        await pg.tapSel('.mg-cmd-hints button', '/help'); await sleep(250);
        const val = await pg.evalSafe(`document.querySelector('.mg-cmd input')?.value`);
        await pg.tapSel('.mg-cmd .row button', 'Go'); await sleep(700);
        const t = await toastText(); add(T, '/help (touch)', /Games:/.test(t) ? PASS : FAIL, `field "${val}" → toast "${t.slice(0, 140)}"`);
      }
      return;
    }
    const pos = () => mg('const p=C.player.pos;return [p.x,p.y,p.z]');
    const moved = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    const holdW = async () => { const a = await pos(); await pg.keyDown('KeyW', 'w'); await sleep(1000); await pg.keyUp('KeyW', 'w'); await sleep(150); return moved(a, await pos()); };
    const closedDom = await pg.evalSafe(`!document.querySelector('.mg-cmd')&&!(document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName))`);
    const d0 = await holdW();
    add(T, 'WASD free while closed', closedDom && d0 > 0.5 ? PASS : FAIL, `no bar in DOM/no focused field: ${closedDom}; W moved ${d0.toFixed(2)} m`);

    const openBar = async () => { await pg.key('Slash', '/', { text: '/' }); return pg.waitFor(`document.activeElement?.closest?.('.mg-cmd')?true:false`, { timeout: 2000 }); };
    const runCmd = async (c) => {
      await markToasts();
      if (!await openBar()) return null;
      await pg.eval(`(()=>{const i=document.querySelector('.mg-cmd input');i.value='';})()`);
      await pg.send('Input.insertText', { text: c });
      await pg.key('Enter', 'Enter', { text: '\r' });
      await sleep(700);
      return toastText();
    };
    // while open, W types into the field instead of walking
    if (await openBar()) {
      const a = await pos();
      await pg.keyDown('KeyW', 'w', { text: 'w' }); await sleep(600); await pg.keyUp('KeyW', 'w');
      const val = await pg.evalSafe(`document.querySelector('.mg-cmd input')?.value`);
      const d1 = moved(a, await pos());
      await pg.key('Escape');
      await sleep(300);
      const gone = await pg.evalSafe(`!document.querySelector('.mg-cmd')`);
      const d2 = await holdW();
      add(T, 'bar captures keys only while open', d1 < 0.2 && /w/.test(val || '') && gone && d2 > 0.5 ? PASS : FAIL, `open: W moved ${d1.toFixed(2)} m, field "${val}"; Esc closed: ${gone}; after close W moved ${d2.toFixed(2)} m`);
    } else add(T, 'bar opens on /', FAIL, '"/" did not open a focused command field');

    const th = await runCmd('/help');
    add(T, '/help', th && /Games:/.test(th) && /floorfall/.test(th) ? PASS : FAIL, (th || 'bar did not open').slice(0, 200));
    const tBefore = await mg('return C.sky?.time01');
    const tt = await runCmd('/time night');
    const tAfter = await mg('return C.sky?.time01');
    add(T, '/time refused in survival', tt && /Build mode|commands/i.test(tt) && Math.abs((tAfter ?? 0) - (tBefore ?? 0)) < 0.05 ? PASS : FAIL, `toast "${(tt || '').slice(0, 120)}"; time ${tBefore?.toFixed?.(3)} → ${tAfter?.toFixed?.(3)}`);
    await runCmd('/play floorfall');
    const ff = await pg.waitFor(`(async()=>{const M=${MOD};const S=(window.__game.shell||window.__game.ctx.ui?.shell||window.__game.ctx.ui);if(M.running?.id==='floorfall'&&S.state==='paused'){S.resume();return false}return M.running?.id==='floorfall'&&S.state==='playing'})()`, { timeout: 45000 });
    add(T, '/play floorfall', ff ? PASS : FAIL, ff ? 'Floor Fall running' : 'not running 45 s later');
    if (ff) {
      await sleep(4500);
      await runCmd('/quit');
      const q = await pg.waitFor(`(async()=>!!document.querySelector('.sw-title')&&!(${MOD}).running)()`, { timeout: 15000 });
      add(T, '/quit', q ? PASS : FAIL, q ? 'back at the title, runner stopped' : 'still in the game');
    }
    errorsRow(T);
  }
}

async function idbSnap(pg) {
  return pg.eval(`new Promise(res=>{const q=indexedDB.open('synthwild');q.onerror=()=>res('no-db');q.onsuccess=()=>{const db=q.result;const names=[...db.objectStoreNames];if(!names.length){db.close();return res('empty')}
    const t=db.transaction(names);const out={};let n=names.length;
    for(const s of names){const r=t.objectStore(s).getAll();r.onsuccess=()=>{out[s]=r.result.map(x=>JSON.stringify(x,(k,v)=>v instanceof Uint8Array||v instanceof ArrayBuffer?'bytes:'+(v.byteLength):v instanceof Blob?'blob:'+v.size:v)).sort();if(--n===0){db.close();res(JSON.stringify(out))}}}}})`);
}
