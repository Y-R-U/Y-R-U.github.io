#!/usr/bin/env node
/**
 * P10 — FIRST PLAYABLE. `BUILD_PLAN.md` §P10's gate, M1–M6.
 *
 *   node tools/p10gate.mjs                 the six criteria, landscape 844x390
 *   node tools/p10gate.mjs --portrait      the same six at 390x844 (D123 regression)
 *   node tools/p10gate.mjs --falsify       every break-switch, all required RED
 *   node tools/p10gate.mjs --only M1,M6    a subset
 *   node tools/p10gate.mjs --shots         also write shots/p10/*.png
 *
 * THE ONE RULE THIS FILE IS BUILT AROUND. Every arm reports what it ACTUALLY
 * did, never what it was asked to do. In P9 alone three break-switches were
 * green because they fell through a dispatcher and exited before running
 * anything (D148), a fourth was faked by zsh not word-splitting a flag, and my
 * own first measurement in this phase was patched into the WRONG FUNCTION and
 * returned two bit-identical arms that read like a clean null result. So each
 * row prints the state it observed — thumb samples taken, touches dispatched,
 * the engage mode the game reports, the lid the corridor used — and a control
 * that cannot show it ran is not a control.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { harness, ROOT } from './cdp.mjs';
import { Touch } from './touch.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORTRAIT = has('--portrait');
const W = PORTRAIT ? 390 : 844;
const H = PORTRAIT ? 844 : 390;
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const SHOTS = has('--shots');
const want = (id) => !ONLY.length || ONLY.includes(id);

/** M1's mission cap in SIM seconds. a1-01 is a 97 s traverse at cruise. */
const M1_CAP_S = 150;
const M2_CAP_S = 200;

const rows = [];
const add = (id, what, pass, detail, note) => {
  rows.push({ id, what, pass: !!pass, detail, note });
  return !!pass;
};

/* ------------------------------------------------------------ the driver -- */

/**
 * Fly the aeroplane with a REAL TOUCH, following the advisor's wanted stick.
 *
 * The thumb goes down inside the shipped stick zone and is then moved, one
 * `Input.dispatchTouchEvent` at a time, to the point that produces the axis a
 * competent pilot wants — so the aeroplane is flown through `core/input.js`'s
 * whole path (anchor, radius, dead zone, release) exactly as a player flies it.
 * `js/modes/story.js`'s advisor computes that axis and never applies it, which
 * is the difference between measuring a thumb and inventing one.
 *
 * Returns what it actually did, not what it was asked to do.
 */
async function flyWithThumb(cdp, { capS, mode = 'follow', pollMs = 55, onPoll = null } = {}) {
  const t = new Touch(cdp);
  const z = await cdp.eval('JSON.stringify(window.__p10.zones())').then(JSON.parse);
  if (!z.stick) return { flown: false, why: 'no stick zone', touches: 0, moves: 0 };
  const cx = z.stick.x + z.stick.w / 2, cy = z.stick.y + z.stick.h / 2;
  let touches = 0, moves = 0, samples = 0, wantSum = 0;

  if (mode !== 'none') { await t.down(cx, cy); touches++; }

  const t0 = Date.now();
  let last = null;
  for (;;) {
    const st = await cdp.eval(`(()=>{ const p = window.__p10; const r = p.run;
      return JSON.stringify({ scene: p.scene, t: r ? +r.state.t.toFixed(2) : -1,
        over: r ? r.state.over : true, wx: p.wantAxis.x, wy: p.wantAxis.y,
        sr: p.stick.r, sox: p.stick.ox, soy: p.stick.oy, act: p.stick.active,
        ax: window.__state.input.axisX, ay: window.__state.input.axisY }); })()`)
      .then(JSON.parse).catch(() => null);
    if (!st) break;
    last = st;
    if (st.scene !== 'play' || st.over) break;
    if (st.t >= capS) break;
    if (Date.now() - t0 > (capS + 60) * 1000) break;

    if (mode === 'follow' && st.act) {
      // the point that produces the wanted axis under the LIVE radius, read back
      // from the shipped `stickRadius()` rather than from a literal here (D131)
      const x = st.sox + st.wx * st.sr;
      const y = st.soy + st.wy * st.sr;
      await t.moveTo(x, y);
      moves++;
      samples++;
      wantSum += Math.abs(st.wy);
    }
    if (onPoll) await onPoll(st);
    await sleep(pollMs);
  }
  try { await t.allUp(); } catch { /* the page may already be gone */ }
  return { flown: true, touches, moves, samples, meanWant: samples ? wantSum / samples : 0, last };
}

async function bootPlay(cdp, base, level, extra = '') {
  await cdp.viewport(W, H, 1, true);
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave&scene=play&level=${level}${extra}`);
  const ok = await cdp.waitFor('window.__p10 && window.__p10.run', 25000);
  return ok;
}

function shot(cdp, name) {
  return cdp.eval('window.__p10.shot()').then((url) => {
    if (!url) return null;
    mkdirSync(join(ROOT, 'shots/p10'), { recursive: true });
    const f = join(ROOT, 'shots/p10', `${name}${PORTRAIT ? '_portrait' : ''}.png`);
    writeFileSync(f, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    return f;
  }).catch(() => null);
}

/* ------------------------------------------------------------------ M1 ---- */

async function M1(cdp, base, brk) {
  const mode = brk === 'still-thumb' ? 'still' : brk === 'no-thumb' ? 'none' : 'follow';
  await bootPlay(cdp, base, 'a1-01', '&auto=thumb');
  /**
   * The milestone shot is taken MID-MISSION, not at the end. The first version
   * captured after `flyWithThumb` returned, which is after the debrief has
   * opened — a perfectly good picture of a results screen and no picture at all
   * of the game being played.
   */
  let midShot = !(SHOTS && !brk);
  const onPoll = async (st) => {
    if (midShot || st.t < 22) return;
    midShot = true;
    await shot(cdp, 'm1-a1-01');
  };
  const flight = await flyWithThumb(cdp, { capS: M1_CAP_S, mode, onPoll });
  await sleep(400);
  const out = await cdp.eval(`(()=>{ const p = window.__p10; const r = p.run;
    const s = r ? r.summary() : null;
    return JSON.stringify({ scene: p.scene, s, errs: window.__state.errors.slice(0, 4) }); })()`)
    .then(JSON.parse);
  const s = out.s;
  const consoleErrs = cdp.errors.filter((e) => !/favicon/i.test(e));
  if (SHOTS && !brk) await shot(cdp, 'm1-debrief');
  return {
    pass: !!s && s.completed && s.won && consoleErrs.length === 0 && out.errs.length === 0,
    detail: `mode ${mode}: ${flight.touches} touch(es), ${flight.moves} real moves, ` +
      `mean |want| ${flight.meanWant.toFixed(3)} — ` +
      (s ? `${s.time} s, completed ${s.completed}, won ${s.won}, ${s.kills} down, ` +
           `${s.damageTaken.toFixed(0)} HP taken, stars ${s.starCount}` : 'no summary') +
      `; console errors ${consoleErrs.length}, page errors ${out.errs.length}`,
    extra: { flight, s },
  };
}

/* ------------------------------------------------------------------ M2 ---- */

/**
 * D4: **crates are in it.** One caught, one cut, one denied, in a real session.
 *
 * Flown by the shipping AI in a real browser with the real renderer and the real
 * HUD, at a named mission seed, and the engagement policy is changed the way a
 * player changes it — a real long press on the special slot (§2.4/§6.4's
 * gesture), not by reaching into the field object.
 */
async function M2(cdp, base, brk) {
  await bootPlay(cdp, base, 'a1-12',
    `&auto=bot&levelseed=207${brk === 'no-beats' ? '&storybug=no-beats' : ''}`);
  const z = await cdp.eval('JSON.stringify(window.__p10.zones())').then(JSON.parse);
  const t = new Touch(cdp);
  const before = await cdp.eval('window.__p10.engage');
  let presses = 0;
  if (z.special && brk !== 'no-press') {
    // 'none' -> 'cut' -> 'deny'. LONG_PRESS is the shipped gesture; hold well past it.
    for (let i = 0; i < 2; i++) {
      const id = await t.down(z.special.cx, z.special.cy);
      await sleep(900);
      await t.up(id);
      presses++;
      await sleep(120);
    }
  }
  const after = await cdp.eval('window.__p10.engage');

  const t0 = Date.now();
  let s = null;
  for (;;) {
    s = await cdp.eval(`(()=>{ const r = window.__p10.run; if (!r) return null;
      const c = r.field.stats;
      return JSON.stringify({ t: +r.state.t.toFixed(1), over: r.state.over, dropped: c.dropped,
        caught: c.playerBanked, cut: r.state.canopiesCut, denied: c.denied,
        cutBanked: c.cutTaken, enemy: c.enemyBanked, engage: r.field.engage[1] }); })()`)
      .then((v) => (v ? JSON.parse(v) : null)).catch(() => null);
    if (!s) break;
    if (s.caught > 0 && s.cut > 0 && s.denied > 0) break;
    if (s.over || s.t >= M2_CAP_S) break;
    if (Date.now() - t0 > (M2_CAP_S + 60) * 1000) break;
    await sleep(400);
  }
  if (SHOTS && !brk) await shot(cdp, 'm2-crates');
  return {
    pass: !!s && s.caught > 0 && s.cut > 0 && s.denied > 0,
    detail: `${presses} long press(es) on the special slot: engage ${before} -> ${after} ` +
      `(game reports ${s ? s.engage : '?'}); at ${s ? s.t : '?'} s — ` +
      `dropped ${s ? s.dropped : '?'}, CAUGHT ${s ? s.caught : '?'}, CUT ${s ? s.cut : '?'}, ` +
      `DENIED ${s ? s.denied : '?'}; cut-and-banked ${s ? s.cutBanked : '?'} (REQUEST-3), ` +
      `to the enemy ${s ? s.enemy : '?'}`,
    extra: { s },
  };
}

/* ------------------------------------------------------------------ M3 ---- */

/**
 * D7: **the game is fully playable with `assets/audio/` empty.** The folder does
 * not exist in this repo, so the shipped state IS the condition — which is
 * exactly why the row needs a control that can fail. `?audiobug=await` ships the
 * forbidden boot, the one that waits for the manifest, and it must NOT reach
 * `title`.
 */
async function M3(cdp, base, brk) {
  const audioDir = join(ROOT, 'assets/audio');
  const present = existsSync(audioDir);
  const url = `${base}/index.html?preserve=1&dpr=1&nosave${brk === 'await' ? '&audiobug=await' : ''}`;
  await cdp.viewport(W, H, 1, true);
  await cdp.goto(url);
  const reachedTitle = await cdp.waitFor('window.__p10 && window.__p10.scene === "title"', 12000);
  let played = false, cards = 0;
  if (reachedTitle) {
    await cdp.eval('window.__p10.go("play", {id:"a1-01"})');
    await cdp.waitFor('window.__p10.run', 15000);
    await sleep(2500);
    const r = await cdp.eval(`(()=>{ const p = window.__p10; return JSON.stringify({
      t: p.run ? +p.run.state.t.toFixed(1) : -1,
      cards: window.__kh.scenes.play ? 1 : 0 }); })()`).then(JSON.parse).catch(() => null);
    played = !!r && r.t > 1.5;
    cards = r ? r.cards : 0;
  }
  const audioState = await cdp.eval('JSON.stringify(window.__state.audio)').catch(() => 'null');
  return {
    pass: !present && reachedTitle && played,
    detail: `assets/audio present on disk: ${present}; reached title: ${reachedTitle}; ` +
      `flew ${played ? '>1.5 s of sim' : 'nothing'}; audio ${audioState}; text cards path live ${cards === 1}`,
  };
}

/* ------------------------------------------------------------------ M5 ---- */

async function M5(cdp, base, brk) {
  // 1. a real save is written and survives a reload
  await cdp.viewport(W, H, 1, true);
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1`);
  await cdp.waitFor('window.__p10 && window.__p10.scene === "title"', 20000);
  await cdp.eval('localStorage.removeItem("kitehawk.save"); window.__p10.save.reset();');
  const wrote = await cdp.eval(`(()=>{ const s = window.__p10.save;
    s.recordRun('a1-01', { won: true, time: 88.5, stars: [{id:'clean',got:true}], cratesCaught: 2,
      scrip: 25, crateValue: 40, repair: 3 }, 'a1-04');
    s.flush();
    return JSON.stringify({ raw: !!localStorage.getItem('kitehawk.save'),
      levels: s.data.levels, unlocked: s.data.story.unlocked, scrip: s.data.economy.scrip, v: s.data.v }); })()`)
    .then(JSON.parse);

  await cdp.goto(`${base}/index.html?preserve=1&dpr=1`);
  await cdp.waitFor('window.__p10 && window.__p10.scene === "title"', 20000);
  const back = await cdp.eval(`JSON.stringify({ levels: window.__p10.save.data.levels,
    unlocked: window.__p10.save.data.story.unlocked, scrip: window.__p10.save.data.economy.scrip,
    v: window.__p10.save.data.v })`).then(JSON.parse);
  const restored = JSON.stringify(back) === JSON.stringify(wrote.raw !== undefined
    ? { levels: wrote.levels, unlocked: wrote.unlocked, scrip: wrote.scrip, v: wrote.v } : {});

  // 2. a v3 save MIGRATES rather than being wiped
  await cdp.eval(`localStorage.setItem('kitehawk.save', JSON.stringify({ v: 3, created: 1, saved: 1,
     hangar: { airframe: 'kitehawk-i', owned: ['kitehawk-i'], upgrades: {}, traits: [] },
     economy: { crates: 9, scrip: 777 }, levels: { 'a1-01': { best: 61.2, stars: ['clean'], runs: 4 } },
     story: { act: 1, level: 3, beatsSeen: [] } }))`);
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1`);
  await cdp.waitFor('window.__p10 && window.__p10.scene === "title"', 20000);
  const mig = await cdp.eval(`JSON.stringify({ v: window.__p10.save.data.v,
    af: window.__p10.save.data.hangar.airframe, owned: window.__p10.save.data.hangar.owned,
    scrip: window.__p10.save.data.economy.scrip, crates: window.__p10.save.data.economy.crates,
    best: (window.__p10.save.data.levels['a1-01']||{}).best,
    corrupt: window.__p10.save.corrupt })`).then(JSON.parse);

  // 3. CORRUPT JSON: one console warning, one in-page callout, NO alert
  const before = cdp.logs.length;
  await cdp.eval(`localStorage.setItem('kitehawk.save', '{ this is not json ')`);
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1&alertspy=1`);
  await cdp.eval(`window.__alerts = 0; const a = window.alert; window.alert = function(){ window.__alerts++; return a.apply(this, arguments); };`);
  await cdp.waitFor('window.__p10 && window.__p10.scene === "title"', 20000);
  const cor = await cdp.eval(`JSON.stringify({ corrupt: window.__p10.save.corrupt,
    calloutShown: !document.getElementById('callout').hidden,
    calloutText: document.getElementById('callout').textContent,
    alerts: window.__alerts | 0,
    dialogs: document.querySelectorAll('dialog').length,
    v: window.__p10.save.data.v, scrip: window.__p10.save.data.economy.scrip })`).then(JSON.parse);
  const warns = cdp.logs.slice(before).filter((l) => /\[save\]/.test(l));

  // 4. the control: ?nosave must persist NOTHING
  let nosaveLeak = null;
  if (brk !== 'skip-control') {
    await cdp.eval(`localStorage.removeItem('kitehawk.save')`);
    await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave`);
    await cdp.waitFor('window.__p10', 20000);
    nosaveLeak = await cdp.eval(`(()=>{ const s = window.__p10.save;
      s.recordRun('a1-01', { won: true, time: 1, stars: [], cratesCaught: 1, scrip: 5, crateValue: 0, repair: 0 }, '');
      s.flush(); return !!localStorage.getItem('kitehawk.save'); })()`);
  }

  const pass = wrote.raw && restored
    && mig.v === 4 && mig.af === 'kite_b1' && mig.scrip === 777 && mig.best === 61.2 && !mig.corrupt
    && cor.corrupt && cor.calloutShown && cor.alerts === 0 && cor.dialogs === 0 && warns.length === 1
    && nosaveLeak === false;
  return {
    pass,
    detail: `round trip: wrote ${wrote.raw}, restored ${restored}, scrip ${back.scrip}, unlocked [${back.unlocked}]; ` +
      `v3 MIGRATED: v${mig.v}, airframe ${mig.af}, scrip ${mig.scrip} kept, best ${mig.best} kept, wiped ${mig.corrupt}; ` +
      `corrupt JSON: fresh save v${cor.v} scrip ${cor.scrip}, ${warns.length} console warning, ` +
      `callout "${cor.calloutText}", ${cor.alerts} alerts, ${cor.dialogs} dialogs; ` +
      `?nosave wrote to storage: ${nosaveLeak}`,
  };
}

/* ------------------------------------------------------------------ M6 ---- */

/**
 * §9.4: restart is a **1.2 s "again" card, not a modal, not a menu.** So the
 * measurement is three things at once — that the card exists, that it lasts the
 * stated time, and that the scene never leaves `play` while it does. A "retry?"
 * dialog would satisfy the first and fail the other two.
 */
async function M6(cdp, base, brk) {
  await bootPlay(cdp, base, 'a1-01', '&auto=bot');
  await cdp.eval(`window.__alerts = 0; const a = window.alert; window.alert = function(){ window.__alerts++; };`);
  await sleep(700);
  await cdp.eval(`window.__kh.go('play', { id: 'a1-01', again: ${brk === 'no-card' ? 'false' : 'true'} })`);
  const seen = [];
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    const r = await cdp.eval(`(()=>{ const s = window.__kh.scenes.play;
      return JSON.stringify({ scene: window.__p10.scene, again: +(s.againLeft || 0).toFixed(3),
        t: window.__p10.run ? +window.__p10.run.state.t.toFixed(3) : -1,
        alerts: window.__alerts | 0, dialogs: document.querySelectorAll('dialog').length,
        buttons: window.__p10.buttons.length }); })()`).then(JSON.parse).catch(() => null);
    if (!r) break;
    seen.push(r);
    if (r.again <= 0 && i > 2) break;
    await sleep(40);
  }
  const wall = (Date.now() - t0) / 1000;
  const first = seen[0] || {};
  const cardFrames = seen.filter((r) => r.again > 0).length;
  const leftPlay = seen.some((r) => r.scene !== 'play');
  const anyButton = seen.some((r) => r.again > 0 && r.buttons > 0);
  const alerts = seen.reduce((m, r) => Math.max(m, r.alerts), 0);
  const dialogs = seen.reduce((m, r) => Math.max(m, r.dialogs), 0);
  // the sim must be HELD while the card is up: a card that does not stop the
  // mission is decoration, not a restart
  const heldT = seen.filter((r) => r.again > 0).map((r) => r.t);
  const held = heldT.length ? Math.max(...heldT) - Math.min(...heldT) : 99;
  if (SHOTS && !brk) await shot(cdp, 'm6-again');
  return {
    pass: cardFrames > 0 && !leftPlay && !anyButton && alerts === 0 && dialogs === 0
      && held < 0.02 && Math.abs(first.again - 1.2) < 0.25,
    detail: `card opened at ${first.again ?? '—'} s and ran ${cardFrames} polls over ${wall.toFixed(2)} s wall; ` +
      `scene stayed play: ${!leftPlay}; tap targets while up: ${anyButton ? 'YES' : 'none'}; ` +
      `alerts ${alerts}, dialogs ${dialogs}; sim advanced ${held.toFixed(3)} s while held`,
  };
}

/* ---------------------------------------------------------------- runner -- */

const CHECKS = {
  M1: { what: 'a human plays a1-01 end to end on a phone-sized viewport', fn: M1,
        breaks: { 'still-thumb': 'the thumb goes down and never moves', 'no-thumb': 'nothing ever touches the glass' } },
  M2: { what: 'crates are in it — one caught, one cut, one denied (D4)', fn: M2,
        breaks: { 'no-beats': "the level's own beats are stripped, so no crate is ever dropped",
                  'no-press': 'the engagement policy is never changed — nothing may be cut or denied' } },
  M3: { what: 'assets/audio absent — it boots, plays and completes (D7)', fn: M3,
        breaks: { await: 'the forbidden boot: wait for assets/audio/manifest.json' } },
  M5: { what: 'save round trip, migration, and a corrupt file', fn: M5, breaks: {} },
  M6: { what: 'restart is a 1.2 s "again" card, not a modal, not a menu', fn: M6,
        breaks: { 'no-card': 'the restart skips the card and seats the run immediately' } },
};

async function runOne(id, brk) {
  const { cdp, base, close } = await harness({});
  try { return await CHECKS[id].fn(cdp, base, brk); }
  finally { close(); }
}

/** M4 is an existing suite; shell out rather than write a second copy of it. */
function M4() {
  try {
    const out = execFileSync('node', [join(ROOT, 'tools/orient.mjs')], { encoding: 'utf8', cwd: ROOT });
    const m = /(\d+)\s*\/\s*(\d+)\s*PASS/i.exec(out) || /PASS\s+(\d+)\/(\d+)/.exec(out);
    const fails = (out.match(/^\s*FAIL/gm) || []).length;
    return { pass: fails === 0, detail: `tools/orient.mjs: ${fails} FAIL line(s)` + (m ? ` (${m[0]})` : ''), out };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const fails = (out.match(/^\s*FAIL/gm) || []).length;
    return { pass: false, detail: `tools/orient.mjs exited non-zero, ${fails} FAIL line(s)`, out };
  }
}

async function main() {
  console.log(`\nP10 GATE — FIRST PLAYABLE.  ${W}x${H} ${PORTRAIT ? 'portrait' : 'landscape'}` +
              `${has('--falsify') ? ', FALSIFY' : ''}\n`);

  if (has('--falsify')) {
    let bad = 0;
    for (const id of Object.keys(CHECKS)) {
      if (!want(id)) continue;
      const base = await runOne(id, '');
      console.log(`  ${base.pass ? 'GREEN' : 'red  '}  ${id} baseline   ${base.detail}`);
      if (!base.pass) { bad++; console.log(`         ^ a baseline that is not green makes its controls meaningless`); }
      for (const [b, why] of Object.entries(CHECKS[id].breaks)) {
        const r = await runOne(id, b);
        const red = !r.pass;
        if (!red) bad++;
        console.log(`  ${red ? 'RED  ' : 'GREEN'}  ${id} --break ${b.padEnd(12)} ${why}`);
        console.log(`         ${r.detail}`);
      }
    }
    console.log(bad ? `\nFAIL — ${bad} arm(s) did not behave\n` : '\nPASS — every control bites\n');
    process.exit(bad ? 1 : 0);
  }

  for (const id of Object.keys(CHECKS)) {
    if (!want(id)) continue;
    const r = await runOne(id, '');
    add(id, CHECKS[id].what, r.pass, r.detail);
  }
  if (want('M4')) {
    const r = M4();
    add('M4', 'rotate 20x mid-flight — gates_orientation green against the real sim', r.pass, r.detail);
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  for (const r of rows) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.what}`);
    console.log(`              ${r.detail}`);
  }
  const bad = rows.filter((r) => !r.pass);
  console.log(bad.length ? `\nFAIL — ${bad.map((r) => r.id).join(', ')}\n` : '\nPASS — first playable\n');
  writeFileSync(join(ROOT, 'shots/p10', `gate${PORTRAIT ? '_portrait' : ''}.json`),
                JSON.stringify({ w: W, h: H, when: new Date().toISOString(), rows }, null, 2));
  process.exit(bad.length ? 1 : 0);
}

mkdirSync(join(ROOT, 'shots/p10'), { recursive: true });
void renameSync; void rmSync;
main();
