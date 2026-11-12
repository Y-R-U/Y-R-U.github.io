import { CONFIG } from './config.js';
import { createSim, SIM_DT } from './sim/sim.js';
import { createBots } from './sim/bots.js';
import { makePlayers } from './sim/match.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './ui/hud.js';
import { createHints } from './ui/hints.js';
import { createScreens } from './ui/screens.js';
import { createDebug2D } from './ui/debug2d.js';
import { load, write, defaults } from './meta/save.js';
import { buildRoster } from './meta/roster.js';
import { applyMatch } from './meta/progress.js';
import { item } from './meta/shop.js';

const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k) && Q.get(k) !== '0' && Q.get(k) !== 'false';
const opts = {
  auto: flag('auto'), lite: flag('lite'), shot: flag('shot'), debug2d: flag('debug2d'),
  seed: Q.has('seed') && Q.get('seed') !== '' ? Q.get('seed') : null,
  t: Math.max(0, +Q.get('t') || 0),
};
const errors = [];
const logErr = (where, e) => { const m = `${where}: ${e && e.stack || e}`; errors.push(m); console.error(m); };
window.addEventListener('error', (e) => errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message || e.reason)));

const G = window.__game = { ready: false, errors, params: opts };

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);

const storage = (() => {
  try { const k = '__throng_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch {}
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
let save = load(storage);

async function loadMapGen() {
  try {
    const m = await import('./world/map.js');
    const probe = m.generateMap(1);
    if (!probe || !Array.isArray(probe.obstacles) || !probe.size) throw new Error('map.js returned an unexpected shape');
    return { gen: m.generateMap, stub: false };
  } catch (e) {
    logErr('map.js unavailable, using stub map', e);
    const m = await import('../tools/stub_map.js');
    return { gen: m.generateMap, stub: true };
  }
}

const stage = document.getElementById('stage');
let canvas = document.getElementById('view');

function freshCanvas() {
  const c = document.createElement('canvas');
  c.id = 'view';
  canvas.replaceWith(c);
  canvas = c;
  return c;
}

function autoQuality() {
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
}
function pickQuality() {
  if (opts.lite) return 'lite';
  const q = save.settings.quality;
  return q === 'auto' ? autoQuality() : q;
}

async function loadRenderer(map) {
  if (opts.debug2d) return createDebug2D({ canvas, map });
  try {
    const m = await withTimeout(import('./render/renderer.js'), 15000, 'renderer import');
    const r = await withTimeout(Promise.resolve(m.createRenderer({ canvas, map, quality: pickQuality() })), 20000, 'createRenderer');
    if (!r || typeof r.frame !== 'function' || typeof r.project !== 'function') throw new Error('renderer missing frame/project');
    return r;
  } catch (e) {
    logErr('3D renderer unavailable, using 2D debug view', e);
    return createDebug2D({ canvas: freshCanvas(), map });
  }
}

const HELLO = ['hi', '👋', 'glhf', 'gl', 'yo'], BRAG = ['gg', '😎', 'ez', '💪', '😂', 'yum'], OUCH = ['noo', '😭', '💀', 'rip', 'wow', 'bruh'], CROWN = ['👑', 'mine', '😤'];
const any = (a) => a[Math.floor(Math.random() * a.length)];

async function boot() {
  const { gen, stub } = await loadMapGen();
  const mapSeed = opts.seed ?? 1;
  const map = gen(mapSeed);
  let renderer = await loadRenderer(map);
  G.mapStub = stub;

  const audio = createAudio(save.settings);
  const hudRoot = document.getElementById('hud');
  const hud = createHud({ root: hudRoot, audio, getRenderer: () => renderer, onPause: () => pauseMatch() });
  const hints = createHints(hudRoot);
  const input = createInput({ el: stage, getYaw: () => { try { return renderer.cameraYaw() || 0; } catch { return 0; } } });

  const app = {
    get save() { return save; },
    audio,
    persist() { write(storage, save); },
    playerName: () => save.name || 'You',
    colorHex: () => item('color', save.equip.color).color,
    emoteGlyph: () => item('emote', save.equip.emote).glyph,
    changed() { screens.refresh(); },
    applySettings() {
      const s = save.settings;
      audio.setMusic(s.music); audio.setSfx(s.sfx);
      try { renderer.setQuality && renderer.setQuality(pickQuality()); } catch (e) { logErr('setQuality', e); }
      hudRoot.classList.toggle('lefty', !!s.lefty);
      input.setKeepMoving(s.keepMoving);
    },
    resetProgress() {
      const keep = save.settings;
      save = defaults();
      save.settings = keep;
      save.createdAt = Date.now();
      app.persist();
      screens.refresh();
    },
  };

  const screens = createScreens({
    root: document.getElementById('screens'), app,
    onPlay: () => playOnline(),
    onPractice: () => startMatch(prepare('practice')),
    onAgain: () => (lastKind === 'practice' ? startMatch(prepare('practice')) : playOnline()),
    onMenu: () => showMenu(),
    onResume: () => resumeMatch(),
    onLeave: () => leaveMatch(),
  });

  let match = null;
  let mode = 'boot';
  let lastKind = 'sim-online';
  let acc = 0, last = performance.now();
  let frameEvents = [];
  let renderFails = 0;
  let resultsAt = 0;
  let lastBeep = -1, lastTick = -1, wasLeader = false;
  let paused = false, autopilot = false, hiddenAt = 0;
  const v = { x: 0, z: 0 };
  let auto = opts.auto || opts.shot;

  const cam = (m) => { try { renderer.setCameraMode && renderer.setCameraMode(m); } catch (e) { logErr('setCameraMode', e); } };
  const newSeed = (tag = '') => (opts.seed != null ? opts.seed + tag : String((Math.random() * 1e9) | 0));

  // kind: 'sim-online' (rated, ladder opponents, never really stops) | 'practice' (offline, real pause).
  function prepare(kind) {
    const seed = newSeed(kind === 'practice' ? ':practice' : '');
    const roster = kind === 'sim-online' ? buildRoster({ seed, rating: save.rating, count: CONFIG.MATCH.crowds - 1 }) : null;
    const p = makePlayers({ seed, playerName: app.playerName(), playerColor: app.colorHex(), roster });
    return { kind, seed, ...p };
  }

  function newMatch(pre) {
    const attract = pre.kind === 'attract';
    const { seed, players, botIndices, botSpecs } = pre;
    const idx = botIndices.slice(), specs = botSpecs.slice();
    if (!idx.includes(0)) { idx.unshift(0); specs.unshift({ ...CONFIG.AUTO_PLAYER }); }
    const countdown = attract || opts.shot ? 0 : CONFIG.MATCH.countdown;
    const sim = createSim({ seed, map, players, countdown });
    const bots = createBots({ sim, indices: idx, specs, seed });
    match = { kind: pre.kind, seed, players, sim, bots, attract, crownSecs: 0, left: false };
    renderer.setCrowds(players.map((p, i) => ({ index: i, name: p.name, color: p.color })));
    renderer.setFocus(0);
    hud.setMatch({
      players, playerIndex: 0, map, league: pre.kind === 'sim-online' ? save.league : null,
      plate: save.equip.plate, badge: save.equip.badge, toast: save.equip.toast,
    });
    acc = 0; frameEvents = []; resultsAt = 0; lastBeep = -1; lastTick = -1; wasLeader = false;
    paused = false; autopilot = false; hiddenAt = 0;
    input.reset();
    return match;
  }

  function simStep() {
    const { sim, bots } = match;
    bots.update();
    if (!auto && !autopilot && !match.attract) {
      if (sim.state.phase === 'play') { input.vector(v); sim.setInput(0, v.x, v.z); } else sim.setInput(0, 0, 0);
    }
    sim.step();
    if (sim.state.phase === 'play' && sim.state.leader === 0) match.crownSecs += SIM_DT;
  }

  function fastForward(seconds) {
    const n = Math.round(seconds / SIM_DT);
    for (let i = 0; i < n; i++) { simStep(); match.sim.drainEvents(); }
  }

  function tick() {
    simStep();
    const ev = match.sim.drainEvents();
    for (let i = 0; i < ev.length; i++) frameEvents.push(ev[i]);
  }

  function humanEmote(i, list, p, delay = 400 + Math.random() * 700) {
    const m = match;
    if (!m.players[i] || !m.players[i].humanish || Math.random() > p) return;
    const now = performance.now();
    m.emoteAt = m.emoteAt || {};
    if (now - (m.emoteAt[i] || -1e9) < 9000) return;
    m.emoteAt[i] = now + delay;
    setTimeout(() => { if (match === m && mode === 'match') hud.emote(i, any(list)); }, delay);
  }

  function direct(state, events) {
    const me = state.crowds[0];
    audio.setCrowd(match.attract || !me.alive ? 0 : me.count);
    if (match.attract) return;
    if (state.phase === 'countdown') {
      const n = Math.ceil(state.countdownLeft);
      if (n !== lastBeep) { lastBeep = n; audio.beep(false); }
    }
    if (state.phase === 'play' && state.timeLeft <= 10) {
      const n = Math.ceil(state.timeLeft);
      if (n !== lastTick && n > 0) { lastTick = n; audio.tick(n <= 3); }
    }
    audio.setIntense(state.phase === 'play' && state.timeLeft <= 30);
    for (const e of events) {
      switch (e.type) {
        case 'recruit': if (e.crowd === 0) audio.recruit(e.n); break;
        case 'steal':
          if (e.to === 0) audio.steal(e.n, true);
          else if (e.from === 0) audio.steal(e.n, false);
          break;
        case 'elim':
          if (e.by === 0) { audio.absorb(); hud.emote(0, app.emoteGlyph()); }
          else if (e.victim === 0) audio.absorbed();
          humanEmote(e.by, BRAG, 0.55);
          humanEmote(e.victim, OUCH, 0.5, 3300);
          break;
        case 'pickup': if (e.crowd === 0) audio.pickup(e.kind); break;
        case 'lead':
          if (e.crowd === 0) { audio.lead(true); wasLeader = true; }
          else if (wasLeader) { audio.lead(false); wasLeader = false; }
          humanEmote(e.crowd, CROWN, 0.3);
          break;
        case 'phase':
          if (e.phase === 'play') {
            audio.beep(true); audio.startMusic();
            match.players.forEach((p, i) => humanEmote(i, HELLO, 0.5, 600 + Math.random() * 2600));
          }
          if (e.phase === 'over') {
            audio.stopMusic(); audio.end(state.crowds[0].rank === 1); input.setEnabled(false); resultsAt = performance.now() + 1700;
            if (state.crowds[0].rank === 1) hud.emote(0, app.emoteGlyph());
            match.players.forEach((p, i) => humanEmote(i, ['gg', 'gg', 'gg wp', 'close one'], state.crowds[i].rank === 1 ? 0.9 : 0.3));
          }
          break;
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    if (!match) return;
    if (paused) { acc = 0; dt = 0; }
    acc += dt;
    let steps = 0;
    try {
      while (acc >= SIM_DT && steps < 8) { tick(); acc -= SIM_DT; steps++; }
    } catch (e) { logErr('sim', e); acc = 0; }
    if (steps === 8) acc = Math.min(acc, SIM_DT);
    const alpha = paused ? 1 : Math.min(1, acc / SIM_DT);
    const state = match.sim.state;
    try { direct(state, frameEvents); } catch (e) { logErr('director', e); }
    try {
      renderer.frame(state, frameEvents, dt, alpha);
      renderFails = 0;
    } catch (e) {
      logErr('renderer.frame', e);
      if (++renderFails >= 3 && !renderer.debug2d) {
        try { renderer.dispose(); } catch {}
        renderer = createDebug2D({ canvas: freshCanvas(), map });
        renderer.setCrowds(match.players.map((p, i) => ({ index: i, name: p.name, color: p.color })));
        renderer.setFocus(0);
      }
    }
    if (mode === 'match' || mode === 'menu') {
      try { hud.update(state, frameEvents, dt, alpha); } catch (e) { logErr('hud', e); }
    }
    if (mode === 'match') { try { hints.update(state, 0, input.dragging); } catch (e) { logErr('hints', e); } }
    frameEvents.length = 0;
    if (match.attract && state.phase === 'over') newMatch(attractPre());
    if (mode === 'match' && state.phase === 'over' && !resultsAt) { input.setEnabled(false); audio.stopMusic(); resultsAt = now + 1700; }
    if (mode === 'match' && resultsAt && now >= resultsAt && !opts.shot) {
      resultsAt = 0;
      finishMatch(false);
    }
  }

  function finishMatch(left) {
    const state = match.sim.state, me = state.crowds[0];
    mode = 'results';
    hud.show(false);
    hints.stop();
    screens.pause.hide();
    paused = false; autopilot = false;
    let report = null;
    const practice = match.kind !== 'sim-online';
    if (!practice) {
      report = applyMatch(save, {
        place: me.rank, count: me.count, best: me.best, kills: me.kills, recruited: me.recruited,
        crownSecs: match.crownSecs, left,
      });
    }
    if (!opts.auto) save.tutorialDone = true;
    app.persist();
    if (left) input.setEnabled(false);
    screens.showResults({ state, players: match.players, me: 0, report, practice, left });
    G.resultsShown = (G.resultsShown || 0) + 1;
    G.lastReport = report;
  }

  function attractPre() {
    const seed = newSeed(':attract');
    return { kind: 'attract', seed, ...makePlayers({ seed, allBots: true }) };
  }

  function showMenu() {
    mode = 'menu';
    audio.stopMusic();
    hints.stop();
    cam('showcase');
    newMatch(attractPre());
    fastForward(18);
    hud.show(false);
    screens.showMenu();
    input.setEnabled(false);
  }

  function playOnline() {
    const pre = prepare('sim-online');
    screens.hideAll();
    mode = 'lobby';
    if (!match || !match.attract) { cam('showcase'); newMatch(attractPre()); fastForward(18); }
    screens.lobby.show({ players: pre.players, league: save.league, onDone: () => startMatch(pre), onCancel: () => showMenu() });
  }

  function startMatch(pre) {
    mode = 'match';
    lastKind = pre.kind;
    screens.hideAll();
    cam('follow');
    newMatch(pre);
    if (opts.t > 0 && !G.ffUsed) { G.ffUsed = true; fastForward(opts.t); }
    hud.show(true);
    hud.setHudVisible(!opts.shot);
    if (opts.shot) hud.show(false);
    input.setEnabled(true);
    audio.ensure();
    if (!save.tutorialDone && !auto) hints.start(); else hints.stop();
    if (document.hidden) onHidden();
  }

  const live = () => mode === 'match' && match && !match.attract && match.sim.state.phase !== 'over';

  function pauseMatch(away = 0) {
    if (!live()) return;
    if (match.kind === 'sim-online') autopilot = true; else paused = true;
    input.setEnabled(false);
    screens.pause.show({ online: match.kind === 'sim-online', away });
  }

  function resumeMatch() {
    screens.pause.hide();
    paused = false; autopilot = false;
    if (live()) input.setEnabled(true);
    last = performance.now();
  }

  function leaveMatch() {
    screens.pause.hide();
    if (!match || match.attract) return showMenu();
    if (match.kind === 'sim-online') { audio.stopMusic(); finishMatch(true); } else showMenu();
  }

  function onHidden() {
    if (!live()) return;
    hiddenAt = Date.now();
    pauseMatch();
  }
  function onVisible() {
    if (!hiddenAt) return;
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    if (!match || match.kind !== 'sim-online' || mode !== 'match') return;
    const st = match.sim.state;
    const left = (st.phase === 'countdown' ? st.countdownLeft : 0) + st.timeLeft + 0.2;
    // The match never stopped: catch the sim up with autopilot steering.
    try { fastForward(Math.min(away, left)); } catch (e) { logErr('catch-up', e); }
    last = performance.now();
    if (match.sim.state.phase === 'over') { screens.pause.hide(); return; }
    screens.pause.show({ online: true, away });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? onHidden() : onVisible()));

  function onResize() {
    try { renderer.resize(); } catch (e) { logErr('resize', e); }
    hud.resize();
  }
  let rz = 0;
  const queueResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(onResize); };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  Object.defineProperties(G, {
    state: { get: () => match && match.sim.state },
    sim: { get: () => match && match.sim },
    match: { get: () => match },
    mode: { get: () => mode },
    save: { get: () => save },
    paused: { get: () => paused },
    autopilot: { get: () => autopilot },
    renderer: { get: () => renderer, set: () => {} },
  });
  Object.assign(G, {
    map, audio, input, hud, app, screens,
    start: (o = {}) => startMatch(prepare(o.kind || 'sim-online')),
    play: playOnline,
    menu: showMenu,
    pause: pauseMatch, resume: resumeMatch,
    openSheet: (id) => screens.open(id),
    setAuto(vv) { auto = !!vv; },
    stepSeconds: (s) => fastForward(s),
  });

  app.applySettings();
  if (opts.shot) startMatch(prepare('practice'));
  else if (opts.auto) startMatch(prepare('sim-online'));
  else showMenu();
  onResize();
  requestAnimationFrame((t) => { last = t; frame(t); });

  G.ready = true;
  window.__bootReady = true;
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 600);
}

boot().catch((e) => {
  logErr('boot', e);
  const m = document.getElementById('boot-msg');
  if (m) m.textContent = 'Failed to start: ' + (e && e.message || e);
  document.getElementById('boot')?.classList.add('failed');
});
