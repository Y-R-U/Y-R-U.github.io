// Lane 7: headless smoke test through the real UI. Exit code 1 on any FAIL.
//   node tools/qa_smoke.mjs [--url URL] [--only mobile|desktop] [--quick] [--strict] [--keep] [--falsify a,b] [--port 9317]
// --quick skips the 10 s fps sample, --strict turns SKIP into FAIL, --keep leaves Chrome running,
// --falsify sabotages named checks to prove they can fail (see docs/notes/qa.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, open, stopBrowser, decodePNG, imageStats, sleep } from './qa_cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..');
export const DEFAULT_URL = 'http://localhost:8861/gms/3d/synthwild/';
export const FALSIFIERS = ['title', 'error', 'console', '404', 'foreign', 'render', 'fps', 'break', 'place', 'intro', 'settings', 'persist'];

export const VIEWPORTS = {
  mobile: { width: 915, height: 412, mobile: true },
  desktop: { width: 1280, height: 720, mobile: false },
};

const PASS = 'PASS', FAIL = 'FAIL', SKIP = 'SKIP', WARN = 'WARN';

export async function runSmoke(o = {}) {
  const url = o.url || DEFAULT_URL;
  const port = o.port || 9317;
  const out = o.outDir || path.join(HERE, 'qa_out', o.label || 'smoke');
  const F = new Set(o.falsify || []);
  const only = o.only ? [o.only] : ['mobile', 'desktop'];
  const results = [];
  fs.mkdirSync(out, { recursive: true });

  // Before the first index.html exists locally, the browser suite is a SKIP rather than a crash.
  const localIndex = path.join(GAME_DIR, 'index.html');
  const isDefaultLocal = url.replace(/\/?$/, '/') === DEFAULT_URL;
  const missingOk = (isDefaultLocal || o.missingOk) && !fs.existsSync(localIndex) && !o.strict;

  await launch(port, o.chromeFlags);
  try {
    for (const vpName of only) {
      try {
        results.push(...await runViewport({ ...o, url, port, out, F, vpName, missingOk }));
      } catch (e) {
        console.log(`  [${vpName}] harness error: ${e.stack}`);
        results.push({ vp: vpName, name: 'harness', status: FAIL, detail: 'harness crashed: ' + e.message });
      }
    }
  } finally {
    if (!o.keep) stopBrowser(port);
  }
  if (o.strict) for (const r of results) if (r.status === SKIP) { r.status = FAIL; r.detail = '[strict] ' + r.detail; }
  return results;
}

async function runViewport({ url, port, out, F, vpName, missingOk, quick, expectBad, apiExpected }) {
  const vp = VIEWPORTS[vpName];
  const res = [];
  const add = (name, status, detail = '') => { res.push({ vp: vpName, name, status, detail: String(detail) }); console.log(`  [${vpName}] ${status.padEnd(4)} ${name}${detail ? ' — ' + detail : ''}`); return status === PASS; };
  const skipRest = (names, why) => names.forEach((n) => add(n, SKIP, why));
  const shot = (n) => pg.shot(path.join(out, `${vpName}_${n}.png`));
  const ALL = ['page loads', 'title screen', 'settings toggles', 'new survival world', 'intro skippable', 'world plays',
    'chunks render', 'HUD controls reachable', 'fps (10 s)', 'break (real input)', 'place (real input)', 'place into water', 'new build world', 'build place+break',
    'save & quit', 'reload: settings persisted', 'reload: world persisted', 'no uncaught errors', 'no console errors',
    'no 4xx/5xx', 'no foreign origins'];
  const done = new Set();
  const mark = (n) => done.add(n);

  const pg = await open(port);
  try {
    await pg.viewport(vp);
    await pg.clearOrigin(url);
    const nav = await pg.goto(url);
    mark('page loads');
    if (nav.status !== 200) {
      if (missingOk && (nav.status === 404 || nav.status === null)) {
        add('page loads', SKIP, `HTTP ${nav.status}: no index.html yet (lane 2)`);
        skipRest(ALL.slice(1), 'client not booting yet');
        return res;
      }
      add('page loads', FAIL, `HTTP ${nav.status ?? nav.error}`);
      skipRest(ALL.slice(1, -4), 'page did not load');
      return finishErrors();
    }
    add('page loads', PASS, `HTTP 200, load event ${nav.loaded ? 'fired' : 'TIMED OUT'}`);

    if (F.has('error')) await pg.eval(`setTimeout(()=>{throw new Error('qa-falsify uncaught')},0)`);
    if (F.has('console')) await pg.eval(`console.error('qa-falsify console.error')`);
    if (F.has('404')) await pg.evalSafe(`fetch('qa_falsify_missing.js').catch(()=>{})`);
    if (F.has('foreign')) await pg.evalSafe(`fetch('https://example.com/qa-falsify',{mode:'no-cors'}).catch(()=>{})`);

    // ---- title
    const titleSel = F.has('title') ? '.qa-no-such-title' : '.sw-title';
    const hasTitle = await pg.waitFor(`!!document.querySelector('${titleSel}')`, { timeout: 20000 });
    const hasGame = await pg.waitFor('!!window.__game', { timeout: hasTitle ? 3000 : 1000 });
    await sleep(800);
    await shot('01_title');
    mark('title screen');
    if (!hasTitle) {
      add('title screen', FAIL, `.sw-title never appeared in 20 s (window.__game ${hasGame ? 'present' : 'absent'})`);
      if (!hasGame) { skipRest(ALL.filter((n) => !done.has(n)).slice(0, -4), 'no title and no __game'); return finishErrors(); }
    } else add('title screen', PASS, `title visible${hasGame ? ', __game present' : ', __game ABSENT'}`);

    // ---- settings: toggle Show FPS through the panel (checked again after reload)
    mark('settings toggles');
    let settingsOk = false;
    if (hasTitle) {
      const opened = await pg.tapSel('.sw-title-actions button', 'Settings');
      const panel = opened && await pg.waitFor(`!!document.querySelector('.sw-settings')`, { timeout: 4000 });
      if (!panel) add('settings toggles', FAIL, 'Settings button did not open .sw-settings');
      else {
        await pg.tapSel('.sw-settings nav button[data-t=video]');
        await sleep(250);
        const before = await pg.evalSafe(`JSON.parse(localStorage.getItem('synthwild.settings')||'{}').showFps`);
        const tog = await pg.evalSafe(`(()=>{const row=[...document.querySelectorAll('.sw-set')].find(r=>r.querySelector('b')?.textContent==='Show FPS');
          const t=row?.querySelector('.sw-tog');if(!t)return null;const r=t.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        if (!tog) add('settings toggles', FAIL, 'no "Show FPS" toggle in the Video tab');
        else {
          await pg.tap(tog.x, tog.y);
          await sleep(500);
          await shot('02_settings');
          const after = await pg.evalSafe(`JSON.parse(localStorage.getItem('synthwild.settings')||'{}').showFps`);
          settingsOk = after === true;
          add('settings toggles', settingsOk ? PASS : FAIL, `showFps in localStorage: ${before} → ${after}`);
        }
        await pg.tapSel('.sw-settings button', 'Done');
        await sleep(300);
      }
    } else add('settings toggles', SKIP, 'no title shell (lane 5)');

    // ---- new survival world through the real UI
    const surv = await newWorld('survival', 'QA Survival ' + vpName);
    if (!surv) return finishErrors();

    // ---- in-world checks
    const playOk = await waitPlaying('world plays', 'survival');
    if (!playOk) { skipRest(ALL.filter((n) => !done.has(n)).slice(0, -4), 'world never reached playing'); return finishErrors(); }
    await renderCheck();
    await reachCheck();
    await fpsCheck();
    const sv = await breakPlace('survival');
    await waterPlace();
    await saveQuit();

    // ---- build world
    const bw = await newWorld('build', 'QA Build ' + vpName, true);
    let placed = null;
    if (bw && await waitPlaying(null, 'build')) {
      placed = await breakPlace('build');
      await saveQuit();
    } else if (!done.has('build place+break')) { mark('build place+break'); add('build place+break', SKIP, 'build world did not start'); }

    // ---- reload → settings + world persisted
    mark('reload: settings persisted'); mark('reload: world persisted');
    if (F.has('settings')) await pg.eval(`localStorage.removeItem('synthwild.settings')`);
    if (F.has('persist')) await pg.evalSafe(`new Promise(r=>{const q=indexedDB.deleteDatabase('synthwild');q.onsuccess=q.onerror=q.onblocked=()=>r(1)})`);
    await pg.reload();
    const t2 = await pg.waitFor(`!!document.querySelector('.sw-title')`, { timeout: 20000 });
    await sleep(1200);
    await shot('20_reload_title');
    if (!t2) { add('reload: settings persisted', FAIL, 'no title after reload'); add('reload: world persisted', FAIL, 'no title after reload'); return finishErrors(); }
    const sAfter = await pg.evalSafe(`(()=>{const s=JSON.parse(localStorage.getItem('synthwild.settings')||'{}');return {showFps:s.showFps,introSeen:s.introSeen}})()`);
    if (!settingsOk) add('reload: settings persisted', SKIP, 'the toggle itself failed earlier');
    else add('reload: settings persisted', sAfter?.showFps === true ? PASS : FAIL, `after reload ${JSON.stringify(sAfter)}`);

    if (!placed) add('reload: world persisted', SKIP, 'no confirmed placed block to look for');
    else {
      const row = await pg.waitFor(`(()=>{const e=[...document.querySelectorAll('.sw-world')].find(e=>e.textContent.includes(${JSON.stringify(placed.world)}));if(!e)return null;
        const b=e.querySelector('.acts .primary')||e;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,n:document.querySelectorAll('.sw-world').length}})()`, { timeout: 8000 });
      if (!row) add('reload: world persisted', FAIL, `"${placed.world}" not in the worlds list after reload`);
      else {
        await pg.tap(row.x, row.y);
        const ok = await waitPlaying(null, 'build', 60000);
        if (!ok) add('reload: world persisted', FAIL, 'saved world did not start again');
        else {
          const got = await pg.game(`return C.world.getSub(${placed.sub.join(',')})`).catch((e) => 'err ' + e.message);
          const brk = placed.brokeSub ? await pg.game(`return C.world.getSub(${placed.brokeSub.join(',')})`).catch(() => null) : null;
          await shot('21_reloaded_world');
          const okPlace = got === placed.mat, okBreak = !placed.brokeSub || brk === 0;
          add('reload: world persisted', okPlace && okBreak ? PASS : FAIL,
            `${row.n} world(s) listed; placed sub ${placed.sub} mat ${placed.mat} → now ${got}` + (placed.brokeSub ? `; broken sub ${placed.brokeSub} → now ${brk}` : ''));
        }
      }
    }
    return finishErrors();

    // ================= helpers (closures over pg/add) =================
    async function newWorld(mode, name, second = false) {
      const step = mode === 'survival' ? 'new survival world' : 'new build world';
      mark(step);
      if (!hasTitle) {
        // Fallback to the test hook route once main.js exists: ?play=1&mode=
        const u = new URL(url); u.searchParams.set('play', '1'); u.searchParams.set('nointro', '1'); u.searchParams.set('mode', mode); u.searchParams.set('seed', 'qa-' + mode);
        await pg.goto(u.href);
        add(step, WARN, 'no title shell: started via ?play=1 hook instead of the UI');
        if (mode === 'survival') { mark('intro skippable'); add('intro skippable', SKIP, 'no shell, ?play bypasses the intro'); }
        return true;
      }
      const tabNew = await pg.rect('.sw-tabs button', 'New World');
      if (tabNew) { await pg.tap(tabNew.x, tabNew.y); await sleep(300); }
      const nameIn = await pg.rect('.sw-form input.sw-input');
      if (!nameIn) { add(step, FAIL, 'New World form (.sw-form) not found'); return false; }
      await pg.tap(nameIn.x, nameIn.y);
      await pg.eval(`(()=>{const i=document.querySelector('.sw-form input.sw-input');i.focus();i.select();})()`);
      await pg.send('Input.insertText', { text: name });
      const card = await pg.tapSel('.sw-mode-card', mode === 'build' ? 'Build' : 'Survival');
      await sleep(250);
      const plant = await pg.tapSel('.sw-form button.primary', 'Plant the seed');
      if (!card || !plant) { add(step, FAIL, `mode card ${!!card}, plant button ${!!plant}`); return false; }
      add(step, PASS, `"${name}" via New World form`);

      if (mode === 'survival' && !second) {
        mark('intro skippable');
        const intro = await pg.waitFor(`!!document.querySelector('.sw-intro')`, { timeout: 5000 });
        if (!intro) add('intro skippable', FAIL, 'first play of a fresh profile did not show .sw-intro');
        else {
          await sleep(1500);
          await shot('03_intro');
          if (!F.has('intro')) await pg.tapSel('.sw-intro .skip');
          const t0 = Date.now();
          const gone = await pg.waitFor(`!document.querySelector('.sw-intro')`, { timeout: 3000, every: 100 });
          add('intro skippable', gone ? PASS : FAIL, gone ? `Skip closed it in ${Date.now() - t0} ms` : 'still on screen 3 s after Skip');
          if (!gone) { await pg.tapSel('.sw-intro .skip'); await pg.waitFor(`!document.querySelector('.sw-intro')`, { timeout: 3000 }); }
        }
      } else if (second) {
        const intro = await pg.waitFor(`!!document.querySelector('.sw-intro')`, { timeout: 1500 });
        if (intro) { console.log('  note: intro replayed on the second world'); await pg.tapSel('.sw-intro .skip'); }
      }
      return true;
    }

    async function waitPlaying(step, mode, timeout = 60000) {
      const t0 = Date.now();
      const ok = await pg.waitFor(`(()=>{const G=window.__game,C=G&&G.ctx;const st=(window.__game?.shell||C?.ui?.shell)?.state;
        if(st&&st!=='playing')return false;if(!C||!C.world||!C.player)return false;
        const p=C.player.pos;return !!(p&&C.world.isReady?.(p.x,p.z)&&C.player.ready!==false)})()`, { timeout, every: 300 });
      if (step) mark(step);
      if (!ok) {
        const st = await pg.evalSafe(`(()=>{const C=window.__game?.ctx;return {shell:(window.__game?.shell||C?.ui?.shell)?.state,world:!!C?.world,player:!!C?.player,loading:!!document.querySelector('.sw-loading')}})()`);
        await shot(`04_${mode}_stuck`);
        if (step) add(step, FAIL, `not playing+ready after ${timeout / 1000} s: ${JSON.stringify(st)}`);
        return false;
      }
      await sleep(2500);
      const info = await pg.game(`const p=C.player.pos;return {mode:C.session?.mode,pos:[p.x,p.y,p.z].map(v=>+v.toFixed(1)),biome:C.world.biomeAt?.(p.x,p.z)}`).catch(() => ({}));
      if (step) add(step, info.mode === mode ? PASS : FAIL, `ready in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${JSON.stringify(info)}`);
      return true;
    }

    async function renderCheck() {
      mark('chunks render');
      await pg.evalSafe(`document.getElementById('ui-root')&&(document.getElementById('ui-root').style.visibility='hidden')`);
      if (F.has('render')) await pg.evalSafe(`document.querySelector('canvas').style.visibility='hidden'`);
      await sleep(300);
      const buf = await shot('05_world_noui');
      await pg.evalSafe(`document.getElementById('ui-root')&&(document.getElementById('ui-root').style.visibility='')`);
      if (F.has('render')) await pg.evalSafe(`document.querySelector('canvas').style.visibility=''`);
      await sleep(200);
      await shot('06_world_hud');
      const st = imageStats(decodePNG(buf));
      const lower = imageStats(decodePNG(buf), { region: [0, 0.45, 1, 1] });
      const scene = await pg.game(`let m=0,t=0;C.scene.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry){m++;const g=o.geometry;t+=(g.index?g.index.count:(g.attributes.position?.count||0))/3}});
        return {meshes:m,tris:Math.round(t),calls:C.renderer?.info?.render?.calls}`).catch((e) => ({ err: e.message }));
      // Design: night is deep blue, never black, so a mostly-black frame is a failure at any time of day.
      const ok = st.std > 12 && st.colours > 40 && lower.edgeFrac > 0.02 && st.blackFrac < 0.2;
      add('chunks render', ok ? PASS : FAIL, `luma std ${st.std}, colours ${st.colours}, lower-half edges ${lower.edgeFrac}, black ${(st.blackFrac * 100).toFixed(0)}%; scene ${JSON.stringify(scene)}`);
    }

    // Every visible HUD/touch control must be the top element at its own centre (else taps/clicks miss it).
    async function reachCheck() {
      mark('HUD controls reachable');
      const r = await pg.evalSafe(`(()=>{const out={ok:0,bad:[]};const sels='.sw-hud .tap,.sw-hud .sw-slot,.sw-pausebtn,.swp-btn';
        for(const e of document.querySelectorAll(sels)){const b=e.getBoundingClientRect();const cs=getComputedStyle(e);
          if(b.width<4||b.height<4||cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0)continue;
          const t=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          if(t&&(e.contains(t)||t.contains(e)))out.ok++;else{const n=x=>x?x.tagName.toLowerCase()+(x.className&&typeof x.className==='string'?'.'+x.className.trim().split(' ').join('.'):''):'null';out.bad.push(n(e)+(e.dataset.btn?'['+e.dataset.btn+']':'')+' under '+n(t))}}
        const c=document.querySelector('canvas');const cb=c.getBoundingClientRect();const ct=document.elementFromPoint(cb.x+cb.width/2,cb.y+cb.height/2);
        out.centre=ct===c?'canvas':(ct?ct.tagName.toLowerCase()+'.'+String(ct.className).trim().split(' ').join('.'):'null');return out})()`);
      if (!r) { add('HUD controls reachable', SKIP, 'could not evaluate'); return; }
      const bad = [...new Set(r.bad)];
      const centreOk = vp.mobile ? true : r.centre === 'canvas';
      add('HUD controls reachable', !bad.length && centreOk ? PASS : FAIL,
        `${r.ok} reachable${bad.length ? `, ${bad.length} COVERED: ${bad.slice(0, 6).join(', ')}` : ''}; screen centre → ${r.centre}`);
    }

    async function fpsCheck() {
      mark('fps (10 s)');
      if (quick) { add('fps (10 s)', SKIP, '--quick'); return; }
      if (F.has('fps')) await pg.eval(`(()=>{const f=()=>{const t=performance.now();while(performance.now()-t<60);requestAnimationFrame(f)};requestAnimationFrame(f)})()`);
      const r = await pg.eval(`new Promise(res=>{const ts=[];const t0=performance.now();const f=t=>{ts.push(t);if(t-t0<10000)requestAnimationFrame(f);else{
        const d=ts.slice(1).map((v,i)=>v-ts[i]).sort((a,b)=>a-b);res({fps:+(ts.length/((t-t0)/1000)).toFixed(1),p50:+d[d.length>>1].toFixed(1),p95:+d[Math.floor(d.length*.95)].toFixed(1),max:+d[d.length-1].toFixed(1)})}};requestAnimationFrame(f)})`, { timeout: 20000 });
      const gl = await pg.evalSafe(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
      const floor = vp.mobile ? 30 : 50;
      const load = os.loadavg()[0], busy = !F.has('fps') && load > os.cpus().length * 0.6;
      add('fps (10 s)', r.fps >= floor ? PASS : busy ? WARN : FAIL, `load ${load.toFixed(1)}${busy ? ' (CONTENDED: other browsers/agents busy, re-run quiet)' : ''}; ` + `${r.fps} fps (p50 ${r.p50} ms, p95 ${r.p95} ms, max ${r.max} ms), floor ${floor}; GPU ${gl}`);
    }

    // Aim with the hook (yaw/pitch), act with real input. Returns { world, sub, mat, brokeSub } of a confirmed place.
    async function breakPlace(mode) {
      const label = mode === 'build' ? 'build place+break' : null;
      const bName = label || 'break (real input)', pName = label || 'place (real input)';
      mark(bName); mark(pName);
      const hooks = await pg.game(`return !!(C.player&&C.brush&&C.bus&&C.world)`).catch(() => false);
      if (!hooks) { add(bName, SKIP, '__game.ctx.player/brush/bus missing'); if (!label) add(pName, SKIP, 'hooks missing'); return null; }
      await pg.game(`window.__qa={place:[],brk:[]};C.bus.on('block:place',d=>__qa.place.push(d));C.bus.on('block:break',d=>__qa.brk.push(d));C.settings?.set?.('alwaysDay',true);C.settings?.set?.('peaceful',true);return 1`);
      // find a yaw whose break target is solid ground 1.2–3.5 m away
      let aim = null;
      for (let k = 0; k < 16 && !aim; k++) {
        await pg.game(`C.player.yaw=${k}*Math.PI/8;C.player.pitch=-0.75;return 1`).catch(() => {});
        await sleep(150);
        aim = await pg.game(`const t=C.brush.target;const p=C.brush.placeTarget;if(!t||!p||t.dist<1.3||t.dist>4)return null;
          const pmin=p.min;if(C.world.getSub(pmin[0],pmin[1],pmin[2])!==0)return null;
          const {WET}=await import('./js/data/blocks.js'),c=C.brush.breakTarget.min.map(v=>v>>2);
          for(const [dx,dy,dz] of [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])if(WET[C.world.getCell(c[0]+dx,c[1]+dy,c[2]+dz)])return null;
          return {yaw:+C.player.yaw.toFixed(2),dist:+t.dist.toFixed(2),mat:t.mat}`).catch(() => null);
      }
      await sleep(200);
      let tgt = await pg.game(`const b=C.brush;return {bt:b.breakTarget&&{min:b.breakTarget.min,max:b.breakTarget.max},pt:b.placeTarget&&{min:b.placeTarget.min,max:b.placeTarget.max},mat:b.target?.mat,held:C.game?.inv?.held?.()}`).catch(() => null);
      if (!tgt?.bt) { add(bName, FAIL, `no break target after aiming (${JSON.stringify(aim)})`); if (!label) add(pName, SKIP, 'no target'); return null; }
      if (!aim) console.log('  note: no ideal aim found, using the current target');

      let locked = true, lockNote = '';
      if (!vp.mobile) {
        const c = await pg.rect('canvas');
        if (c?.covered) {
          const why = `canvas centre is covered by ${c.covered}: mouse clicks never reach the game`;
          add(bName, FAIL, why); if (!label) add(pName, FAIL, why);
          return null;
        }
        await pg.click(c.x, c.y);
        locked = !!(await pg.waitFor('!!document.pointerLockElement', { timeout: 2000 }));
        if (!locked) {
          // Headless Chrome never grants pointer lock: shim the lock state, keep the mouse events real.
          await pg.eval(`(()=>{if(window.__qaLockShim)return;window.__qaLockShim=1;let L=null;const fire=()=>document.dispatchEvent(new Event('pointerlockchange'));
            Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get(){return L}});
            Element.prototype.requestPointerLock=function(){L=this;setTimeout(fire);return Promise.resolve()};
            Document.prototype.exitPointerLock=function(){L=null;setTimeout(fire)}})()`);
          await pg.click(c.x, c.y);
          locked = !!(await pg.waitFor('!!document.pointerLockElement', { timeout: 2000 }));
          lockNote = ' (pointer-lock shim)';
        }
      }
      const btn = async (which, holdMs, until) => {
        if (vp.mobile) {
          const r = await pg.rect(`[data-btn=${which}]`);
          if (!r) return `no [data-btn=${which}]`;
          await pg.touch('touchStart', [[r.x, r.y, 21]]);
          const t0 = Date.now();
          while (Date.now() - t0 < holdMs) { if (until && await pg.evalSafe(until)) break; await sleep(100); }
          await pg.touch('touchEnd', []);
        } else {
          if (!locked) return 'pointer lock not granted (headless)';
          const c = await pg.rect('canvas');
          const button = which === 'break' ? 'left' : 'right';
          await pg.mouse('mousePressed', c.x, c.y, { button });
          const t0 = Date.now();
          while (Date.now() - t0 < holdMs) { if (until && await pg.evalSafe(until)) break; await sleep(100); }
          await pg.mouse('mouseReleased', c.x, c.y, { button });
        }
        return null;
      };
      // break
      const breakTarget = tgt.bt;
      const e1 = F.has('break') ? null : await btn('break', mode === 'build' ? 600 : 10000, 'window.__qa.brk.length>0');
      await sleep(400);
      const brk = await pg.evalSafe('window.__qa.brk.slice()');
      const brokeAir = brk?.length ? await pg.game(`return C.world.getSub(${breakTarget.min.join(',')})`).catch(() => null) : null;
      const bOk = brk?.length > 0 && brokeAir === 0;
      if (e1 && /pointer lock/.test(e1)) add(bName, SKIP, e1);
      else if (!label) add(bName, bOk ? PASS : FAIL, e1 || `${brk?.length || 0} block:break event(s); target ${breakTarget.min} mat ${tgt.mat} → ${brokeAir}${lockNote}`);
      await shot(`07_${mode}_broken`);

      // place (survival: needs the drop picked up first)
      await sleep(mode === 'build' ? 300 : 1800);
      tgt = await pg.game(`const b=C.brush;C.brush.update?.(0);return {pt:b.placeTarget&&{min:b.placeTarget.min,max:b.placeTarget.max},held:C.game?.inv?.held?.(),hotbar:C.game?.inv?.slots?.slice(0,9).map(s=>s&&s.id)}`).catch(() => null);
      const nPlace = (await pg.evalSafe('window.__qa.place.length')) || 0;
      const e2 = F.has('place') ? null : await btn('place', 250, `window.__qa.place.length>${nPlace}`);
      await sleep(500);
      const pl = await pg.evalSafe('window.__qa.place.slice()');
      const last = pl?.[pl.length - 1];
      let mat = null;
      if (last) mat = await pg.game(`return C.world.getSub(${last.minSub.join(',')})`).catch(() => null);
      const pOk = pl?.length > nPlace && mat > 0 && mat === last.mat;
      await shot(`08_${mode}_placed`);
      const pDetail = e2 || `${(pl?.length || 0) - nPlace} block:place event(s)${lockNote}; ` + (last ? `sub ${last.minSub} mat ${last.mat} → world ${mat}` : `held ${JSON.stringify(tgt?.held)} hotbar ${JSON.stringify(tgt?.hotbar)}`);
      if (e2 && /pointer lock/.test(e2)) { if (!label || !(e1 && /pointer lock/.test(e1))) add(pName, SKIP, e2); }
      else if (label) add(label, bOk && pOk ? PASS : FAIL, `break: ${brk?.length || 0} ev, target → ${brokeAir}; place: ${pDetail}`);
      else add(pName, pOk ? PASS : FAIL, pDetail);
      if (!vp.mobile) await pg.evalSafe('document.exitPointerLock()');
      return pOk ? { world: 'QA ' + (mode === 'build' ? 'Build' : 'Survival') + ' ' + vpName, sub: last.minSub, mat: last.mat, brokeSub: bOk && !samebox(breakTarget.min, last.minSub) ? breakTarget.min : null } : null;
    }

    // Placing a block into a water cell must work (the hook builds a small pool; the place goes through the brush).
    async function waterPlace() {
      mark('place into water');
      const r = await pg.game(`
        const W=C.world,P=C.player,B=C.brush,inv=C.game.inv,items=C.game.items;
        const {BLOCK}=await import('./js/data/blocks.js');const {placeBox}=await import('./js/player/brushmath.js');
        const x=Math.floor(P.pos.x)+5,z=Math.floor(P.pos.z),s=Math.floor(W.surfaceY(x+0.5,z+0.5));
        W.setBox([(x-2)*4,(s-2)*4,(z-2)*4],[(x+3)*4,(s+1)*4,(z+3)*4],BLOCK.BASALT_MATRIX,'fill',{flow:false});
        W.setBox([(x-1)*4,(s-1)*4,(z-1)*4],[(x+2)*4,(s+1)*4,(z+2)*4],BLOCK.WATER,'fill',{flow:false});
        W.setBox([(x-2)*4,(s+1)*4,(z-2)*4],[(x+3)*4,(s+5)*4,(z+3)*4],0,'fill',{flow:false});
        const ray=W.raycast([x+0.5,s+3.5,z+0.5],[0,-1,0],8);
        if(!ray)return {err:'no ray hit'};
        inv.setSlot(inv.sel,items.id('polymer_brick'),5);B.setScale(1);
        const box=placeBox(ray.sub,ray.normal,1,[1,1,1]);
        const water=W.getCell(box.min[0]>>2,box.min[1]>>2,box.min[2]>>2)===BLOCK.WATER;
        const placed=B._doPlace(box,'fill');
        return {water,placed,cell:W.getCell(box.min[0]>>2,box.min[1]>>2,box.min[2]>>2),brick:BLOCK.POLYMER_BRICK,bricks:inv.count(items.id('polymer_brick'))}`).catch((e) => ({ err: e.message }));
      add('place into water', r && r.water && r.placed && r.cell === r.brick && r.bricks === 4 ? PASS : FAIL, JSON.stringify(r));
    }

    async function saveQuit() {
      mark('save & quit');
      await sleep(300);
      let paused = await pg.evalSafe(`!!document.querySelector('.sw-pause')`);
      let how = 'already paused', note = '';
      if (!paused) {
        for (const sel of ['.sw-pausebtn', '[data-btn=pause]', '.sw-topright .sw-hud-btn', '[title^="Menu"]']) {
          const r = await pg.rect(sel);
          if (!r) continue;
          if (r.covered) note += `${sel} covered by ${r.covered}; `;
          await pg.tap(r.x, r.y);
          paused = await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 2500 });
          if (paused) { how = `tapped ${sel}`; break; }
          note += `${sel} tap did not pause; `;
        }
      }
      if (!paused && !vp.mobile) {
        await pg.key('Escape');
        paused = await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 2000 });
        if (paused) how = 'Escape key';
      }
      if (!paused) {
        await pg.game('(window.__game.shell||C.ui.shell).pause();return 1').catch(() => {});
        paused = await pg.waitFor(`!!document.querySelector('.sw-pause')`, { timeout: 2000 });
        if (paused) { how = 'HOOK ui.shell.pause() (no working pause button)'; }
      }
      if (!paused) { if (!res.some((x) => x.name === 'save & quit')) add('save & quit', FAIL, 'pause menu never opened: ' + note); return false; }
      const viaHook = /HOOK/.test(how);
      await shot('09_pause');
      await pg.tapSel('.sw-pause button', 'Save & quit');
      const back = await pg.waitFor(`!!document.querySelector('.sw-title')&&!document.querySelector('.sw-pause')`, { timeout: 15000 });
      const n = await pg.evalSafe(`new Promise(r=>{const q=indexedDB.open('synthwild');q.onsuccess=()=>{try{const t=q.result.transaction('worlds').objectStore('worlds').getAll();t.onsuccess=()=>r(t.result.map(w=>({n:w.name??w.meta?.name,v:w.version??w.meta?.version})))}catch(e){r('err '+e.message)}};q.onerror=()=>r('no db')})`);
      const status = back ? (viaHook ? FAIL : PASS) : FAIL;
      const why = `${how}${note ? ' [' + note.trim() + ']' : ''}`;
      const prev = res.find((x) => x.name === 'save & quit');
      if (prev) { prev.detail += `; again ${status}: ${why}`; if (status === FAIL) prev.status = FAIL; }
      else add('save & quit', status, (back ? `pause (${why}) → Save & quit → title; IDB ${JSON.stringify(n)}` : 'did not return to the title in 15 s; ' + why));
      return back;
    }

    function finishErrors() {
      const L = pg.log;
      const isExpected = (u) => (expectBad || []).some((re) => re.test(u));
      const ex = L.exceptions;
      add('no uncaught errors', ex.length ? FAIL : PASS, ex.length ? ex.slice(0, 5).map((e) => `[${e.where}] ${e.text}`).join(' || ') : `${L.requests} requests watched`);
      const ce = L.console.filter((c) => (c.type === 'error' || c.type === 'assert' || c.type === 'log-error') && !/^Failed to load resource/.test(c.text));
      add('no console errors', ce.length ? FAIL : PASS, ce.slice(0, 5).map((c) => `[${c.where}] ${c.text.slice(0, 200)}`).join(' || '));
      const bad = [...L.bad.map((b) => ({ ...b, what: b.status })), ...L.failed.map((f) => ({ ...f, what: f.error }))];
      const realBad = bad.filter((b) => !isExpected(b.url));
      const expd = bad.length - realBad.length;
      const uniq = [...new Set(realBad.map((b) => `${b.what} ${b.url.replace(url, '')}`))];
      add('no 4xx/5xx', realBad.length ? FAIL : PASS, (uniq.length ? `${uniq.length} url(s): ` + uniq.slice(0, 12).join(' || ') : 'none') + (expd ? ` (${expd} expected: ${[...new Set(bad.filter((b) => isExpected(b.url)).map((b) => b.what + ' ' + b.url.replace(url, '')))].join(', ')})` : ''));
      add('no foreign origins', L.foreign.length ? FAIL : PASS, [...new Set(L.foreign.map((f) => f.url))].slice(0, 5).join(' || '));
      for (const n of ALL) if (!res.some((r) => r.name === n || (n === 'build place+break' && r.name === n))) if (!done.has(n)) add(n, SKIP, 'not reached');
      return res;
    }
  } finally {
    fs.writeFileSync(path.join(out, `${vpName}_log.json`), JSON.stringify(pg.log, null, 1));
    await pg.close();
  }
}

const samebox = (a, b) => a && b && a.join() === b.join();

export function printTable(results, title = 'SYNTHWILD smoke') {
  const w = Math.max(...results.map((r) => r.name.length), 10);
  console.log(`\n${title}\n${'-'.repeat(w + 30)}`);
  for (const r of results) console.log(`${r.vp.padEnd(8)} ${r.name.padEnd(w)}  ${r.status.padEnd(4)}  ${r.detail.slice(0, 160)}`);
  const c = (s) => results.filter((r) => r.status === s).length;
  console.log(`${'-'.repeat(w + 30)}\nPASS ${c(PASS)}  FAIL ${c(FAIL)}  SKIP ${c(SKIP)}  WARN ${c(WARN)}`);
  return c(FAIL);
}

export function parseArgs(argv) {
  const a = { falsify: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--url') a.url = argv[++i];
    else if (k === '--only') a.only = argv[++i];
    else if (k === '--port') a.port = +argv[++i];
    else if (k === '--quick') a.quick = true;
    else if (k === '--strict') a.strict = true;
    else if (k === '--keep') a.keep = true;
    else if (k === '--falsify') a.falsify = argv[++i].split(',');
    else if (k === '--out') a.outDir = argv[++i];
  }
  return a;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = parseArgs(process.argv.slice(2));
  const url = a.url || DEFAULT_URL;
  // python http.server has no API: api/* 404s are expected locally (api.js falls back to offline)
  const local = /^http:\/\/(localhost|127\.0\.0\.1)/.test(url);
  console.log(`SYNTHWILD smoke → ${url}${a.falsify.length ? '  [FALSIFY ' + a.falsify + ']' : ''}`);
  const results = await runSmoke({ ...a, url, expectBad: local ? [/\/api\//] : [] });
  const fails = printTable(results);
  fs.writeFileSync(path.join(a.outDir || path.join(HERE, 'qa_out', 'smoke'), 'results.json'), JSON.stringify({ url, at: new Date().toISOString(), falsify: a.falsify, results }, null, 1));
  process.exit(fails ? 1 : 0);
}
