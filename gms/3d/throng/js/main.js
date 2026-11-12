import { CONFIG } from './config.js';
import { createSim, SIM_DT } from './sim/sim.js';
import { createBots } from './sim/bots.js';
import { makePlayers } from './sim/match.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createDebug2D } from './ui/debug2d.js';

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

function pickQuality() {
  if (opts.lite) return 'lite';
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  return coarse ? 'medium' : 'high';
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

async function boot() {
  const { gen, stub } = await loadMapGen();
  const mapSeed = opts.seed ?? 1;
  const map = gen(mapSeed);
  let renderer = await loadRenderer(map);
  G.mapStub = stub;

  const audio = createAudio();
  const hud = createHud({ root: document.getElementById('hud'), audio, getRenderer: () => renderer });
  const input = createInput({ el: stage, getYaw: () => { try { return renderer.cameraYaw() || 0; } catch { return 0; } } });
  const screens = createScreens({
    root: document.getElementById('screens'), audio,
    onPlay: (name) => startMatch({ name }),
    onMenu: () => showMenu(),
  });

  let match = null;
  let mode = 'boot';
  let acc = 0, last = performance.now();
  let frameEvents = [];
  let renderFails = 0;
  let resultsAt = 0;
  let lastBeep = -1, lastTick = -1, wasLeader = false;
  const v = { x: 0, z: 0 };
  let auto = opts.auto || opts.shot;

  function newMatch({ attract = false, name = '' } = {}) {
    const seed = opts.seed != null ? opts.seed + (attract ? ':attract' : '') : String((Math.random() * 1e9) | 0);
    const { players, botIndices, botSpecs } = makePlayers({ seed, playerName: name, allBots: attract });
    const idx = botIndices.slice(), specs = botSpecs.slice();
    if (!idx.includes(0)) { idx.unshift(0); specs.unshift({ ...CONFIG.AUTO_PLAYER }); }
    const countdown = attract || opts.shot ? 0 : CONFIG.MATCH.countdown;
    const sim = createSim({ seed, map, players, countdown });
    const bots = createBots({ sim, indices: idx, specs, seed });
    match = { seed, players, sim, bots, attract, ffDone: true };
    renderer.setCrowds(players.map((p, i) => ({ index: i, name: p.name, color: p.color })));
    renderer.setFocus(0);
    hud.setMatch({ players, playerIndex: 0, map });
    acc = 0; frameEvents = []; resultsAt = 0; lastBeep = -1; lastTick = -1; wasLeader = false;
    input.reset();
    return match;
  }

  function fastForward(seconds) {
    const n = Math.round(seconds / SIM_DT);
    for (let i = 0; i < n; i++) { match.bots.update(); match.sim.step(); match.sim.drainEvents(); }
  }

  function tick() {
    const { sim, bots } = match;
    bots.update();
    if (!auto && !match.attract) {
      if (sim.state.phase === 'play') { input.vector(v); sim.setInput(0, v.x, v.z); } else sim.setInput(0, 0, 0);
    }
    sim.step();
    const ev = sim.drainEvents();
    for (let i = 0; i < ev.length; i++) frameEvents.push(ev[i]);
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
          if (e.by === 0) audio.absorb();
          else if (e.victim === 0) audio.absorbed();
          break;
        case 'pickup': if (e.crowd === 0) audio.pickup(e.kind); break;
        case 'lead':
          if (e.crowd === 0) { audio.lead(true); wasLeader = true; }
          else if (wasLeader) { audio.lead(false); wasLeader = false; }
          break;
        case 'phase':
          if (e.phase === 'play') { audio.beep(true); audio.startMusic(); }
          if (e.phase === 'over') { audio.stopMusic(); audio.end(state.crowds[0].rank === 1); input.setEnabled(false); resultsAt = performance.now() + 1700; }
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
    acc += dt;
    let steps = 0;
    try {
      while (acc >= SIM_DT && steps < 8) { tick(); acc -= SIM_DT; steps++; }
    } catch (e) { logErr('sim', e); acc = 0; }
    if (steps === 8) acc = Math.min(acc, SIM_DT);
    const alpha = Math.min(1, acc / SIM_DT);
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
    frameEvents.length = 0;
    if (match.attract && state.phase === 'over') newMatch({ attract: true });
    if (mode === 'match' && state.phase === 'over' && !resultsAt) { input.setEnabled(false); audio.stopMusic(); resultsAt = now + 1700; }
    if (mode === 'match' && resultsAt && now >= resultsAt && !opts.shot) {
      resultsAt = 0;
      mode = 'results';
      hud.show(false);
      screens.showResults(state, match.players, 0);
      G.resultsShown = (G.resultsShown || 0) + 1;
    }
  }

  function showMenu() {
    mode = 'menu';
    audio.stopMusic();
    newMatch({ attract: true });
    fastForward(18);
    hud.show(false);
    screens.showMenu();
    input.setEnabled(false);
  }

  function startMatch({ name = screens.name } = {}) {
    mode = 'match';
    screens.hideAll();
    newMatch({ name });
    if (opts.t > 0 && !G.ffUsed) { G.ffUsed = true; fastForward(opts.t); }
    hud.show(true);
    hud.setHudVisible(!opts.shot);
    if (opts.shot) hud.show(false);
    input.setEnabled(true);
    audio.ensure();
  }

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
    renderer: { get: () => renderer, set: () => {} },
  });
  Object.assign(G, {
    map, audio, input, hud,
    start: (o) => startMatch(o || {}),
    menu: showMenu,
    setAuto(vv) { auto = !!vv; },
    stepSeconds: (s) => fastForward(s),
  });

  if (opts.shot || opts.auto) startMatch({ name: opts.auto ? 'Auto' : '' });
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
