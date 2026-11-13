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
import { item, crowdCosmetics } from './meta/shop.js';
import { createOnline, serverUrl, onlineVisible, httpBase, newDeviceId, newCid, quickMode } from './net/online.js';
import { modeOf } from './sim/sim.js';
import { matchEvents, liveEvents, eventLook, eventSim } from './meta/events.js';
import { rollSeason } from './meta/season.js';
import { EMOTES, emoteId } from './net/proto.js';
import { zonesOf } from './ui/hud.js';

const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k) && Q.get(k) !== '0' && Q.get(k) !== 'false';
const opts = {
  auto: flag('auto'), lite: flag('lite'), shot: flag('shot'), debug2d: flag('debug2d'), nocloud: flag('nocloud'), fps: flag('fps'),
  mode: Q.get('mode') || '', event: Q.get('event') || '',
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
const seasonReport = rollSeason(save);
if (seasonReport) write(storage, save);

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
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// setCrowds entries: name + colour + the renderer cosmetics (CONTRACT.md "Crowd cosmetics").
const crowdsMeta = (players) => players.map((p, i) => ({ ...(p.cos || {}), index: i, name: p.name, color: p.color }));

async function boot() {
  const { gen, stub } = await loadMapGen();
  const mapSeed = opts.seed ?? 1;
  const map = gen(mapSeed);
  let renderer = await loadRenderer(map);
  G.mapStub = stub;

  const audio = createAudio(save.settings);
  const hudRoot = document.getElementById('hud');
  const hud = createHud({ root: hudRoot, audio, getRenderer: () => renderer, onPause: () => pauseMatch() });
  const input = createInput({
    el: stage, getYaw: () => { try { return renderer.cameraYaw() || 0; } catch { return 0; } },
    getLeader: () => { const st = curState(); return st && match ? st.crowds[match.me || 0] : null; },
    groundPoint: (x, y, o) => { try { return renderer.groundPoint ? renderer.groundPoint(x, y, o) : null; } catch { return null; } },
  });
  const hints = createHints(hudRoot, () => input.mouseMode);

  const app = {
    net: null,
    get save() { return save; },
    audio,
    persist() { write(storage, save); },
    playerName: () => save.name || app.accountName || 'You',
    accountName: '',
    seasonReport,
    get mode() { return modeOf(save.mode); },
    setMode(m) { save.mode = modeOf(m); app.persist(); screens.refresh(); },
    haptic(ms) { if (save.settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } },
    colorHex: () => item('color', save.equip.color).color,
    emoteGlyph: () => item('emote', save.equip.emote).glyph,
    changed() { screens.refresh(); },
    applySettings() {
      const s = save.settings;
      audio.setMusic(s.music); audio.setSfx(s.sfx);
      try {
        // R3: "Auto" lets the renderer step quality down on a slow device; a manual pick pins it.
        if (renderer.setAdaptive) renderer.setAdaptive(false);
        if (renderer.setQuality && G.ready) renderer.setQuality(pickQuality());
        if (renderer.setAdaptive) renderer.setAdaptive(s.quality === 'auto' && !opts.lite);
      } catch (e) { logErr('setQuality', e); }
      hudRoot.classList.toggle('lefty', !!s.lefty);
      input.setKeepMoving(s.keepMoving);
      input.setMouseMode(s.mouse);
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

  // ---------------------------------------------------------------- online (M3, docs/NET.md)
  const session = (() => { try { const k = '__throng_probe'; sessionStorage.setItem(k, '1'); sessionStorage.removeItem(k); return sessionStorage; } catch { return null; } })();
  const devId = (() => { let d = storage.getItem('throng.dev'); if (!/^[0-9a-f]{32}$/.test(d || '')) { d = newDeviceId(); storage.setItem('throng.dev', d); } return d; })();
  const cid = (() => { let c = session && session.getItem('throng.cid'); if (!c) { c = newCid(); if (session) session.setItem('throng.cid', c); } return c; })();
  let online = null, lastRecorded = null, netNotice = '', netNoticeUntil = 0, netPillAt = 0;
  const notice = (t, ms = 3500) => { netNotice = t; netNoticeUntil = performance.now() + ms; };
  const net = {
    visible: onlineVisible(),
    pendingCode: (Q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    roomMode: 'classic',
    sheetUpdate: null,
    get status() { return online ? online.status : 'idle'; },
    get you() { return online && online.you; },
    connect(force) {
      if (!online) online = createOnline({ url: serverUrl(), map, name: app.playerName(), dev: devId, cid, cos: crowdCosmetics(save.equip), emit: onNet,
        pickMode: (quick) => (quick ? quickMode() : modeOf(net.roomMode || 'classic')) });
      if (force && online.status === 'unavailable') { online.close(); }
      online.connect();
    },
    async ensure() {
      net.connect();
      const t0 = performance.now();
      while (online.status !== 'online') {
        if (online.status === 'unavailable' || online.status === 'old' || performance.now() - t0 > 7000) throw new Error(online.status === 'old' ? 'THRONG was updated. Reload the page to play online.' : 'Online play is not available right now. Try again in a minute, or press Play.');
        await new Promise((r) => setTimeout(r, 100));
      }
      const n = app.playerName();
      online.setName(n);
      online.setCos(crowdCosmetics(save.equip));
      if (online.you && online.you.name !== n && n !== 'You') { try { const r = await online.rename(n); online.you.name = r.name; } catch {} }
      return online;
    },
    quick: async () => enterRoom((await (await net.ensure()).quick()).room),
    create: async () => enterRoom((await (await net.ensure()).create()).room),
    join: async (code) => {
      const o = await net.ensure();
      try { enterRoom((await o.join(code)).room); } catch (e) { throw new Error(e.code === 'no_room' ? `No room called ${code}. Check the code.` : e.message); }
      net.pendingCode = '';
    },
    leaveRoom() { markLive(false); if (online) online.leave(); showMenu(); },
    ready: (on) => online && online.ready(on),
    start: () => online.start(),
    shareLink(code) {
      const extra = Q.get('net') ? '&net=' + encodeURIComponent(Q.get('net')) : '';
      return location.origin + location.pathname + '?room=' + code + extra;
    },
    get client() { return online; },
    async boards(period, kind, bmode = 'all') {
      const base = httpBase(online ? online.url : serverUrl());
      const me = online && online.you ? '&me=' + online.you.pid : '';
      const r = await fetch(`${base}/boards?period=${period}&kind=${kind}&mode=${encodeURIComponent(bmode)}${me}`);
      if (!r.ok) throw new Error('boards ' + r.status);
      return r.json();
    },
  };

  function onNet(type, d) {
    try {
      if (net.sheetUpdate && (type === 'status' || type === 'room')) net.sheetUpdate();
      switch (type) {
        case 'room': if (mode === 'olobby') screens.room.update(d); break;
        case 'begin': startOnlineMatch(d.match, d.late); break;
        case 'role':
          if (mode === 'match') { hud.toast(d.role === 'host' ? 'YOU ARE THE HOST' : 'HOST CHANGED', { sub: d.role === 'host' ? 'the last host left' : '', cls: 'warn' }); notice('Host changed'); }
          break;
        case 'meta':
          if (match && match.net) {
            d.players.forEach((p, i) => {
              hud.setName(i, p.name);
              // Late joiner's look: only if the renderer can swap one crowd's look without a camera snap.
              const key = JSON.stringify(p.cos || {});
              if (renderer.updateCrowdMeta && match.cosKeys && match.cosKeys[i] !== key) {
                match.cosKeys[i] = key;
                try { renderer.updateCrowdMeta(i, { ...(p.cos || {}), index: i, name: p.name, color: p.color }); } catch (e) { logErr('updateCrowdMeta', e); }
              }
            });
          }
          break;
        case 'ended':
          lastRecorded = d.recorded;
          if (mode === 'results' && lastKind === 'online') screens.results.setOnlineNote(recordedText());
          break;
        case 'closed': if (mode === 'olobby') showMenu(); break;
        case 'error': if (mode === 'olobby' && d.error) screens.room.error(d.error); break;
        case 'offline': notice('Offline · the match finishes on this device', 6000); break;
        case 'status':
          if (d.status === 'unavailable' && mode === 'olobby') screens.room.error('Lost the connection to the online server.');
          break;
      }
    } catch (e) { logErr('net ' + type, e); }
  }

  function recordedText() {
    const nm = lastNet;
    if (nm && nm.offline) return 'Finished offline: not on the leaderboard';
    if (nm && nm.late) return 'You joined late: this match is not on the leaderboard';
    if (lastRecorded === true) return 'Saved to the Online leaderboard';
    if (lastRecorded === false) return 'Not saved to the leaderboard this time';
    return 'Saving to the Online leaderboard…';
  }
  let lastNet = null;

  function enterRoom(room) {
    if (!room) return;
    if (mode === 'match' && match && match.net) return;
    mode = 'olobby';
    screens.hideAll();
    if (!match || !match.attract) { cam('showcase'); attractMatch(); }
    hud.show(false);
    input.setEnabled(false);
    screens.room.show(room);
  }

  // A reload mid-match lands on the menu: this marker (per tab, like the cid) reconnects at boot and the
  // server hands the crowd back (begin + keyframe + tail).
  const LIVE = 'throng.live';
  const markLive = (on) => { try { if (!session) return; if (on) session.setItem(LIVE, String(Date.now() + 200000)); else session.removeItem(LIVE); } catch {} };
  const wasLive = () => { try { return session && +session.getItem(LIVE) > Date.now(); } catch { return false; } };

  function startOnlineMatch(nm, late) {
    markLive(true);
    mode = 'match';
    lastKind = 'online';
    lastRecorded = null;
    lastNet = nm;
    nm.late = !!late;
    screens.hideAll();
    cam('follow');
    const me = nm.me, players = nm.players;
    match = { kind: 'online', net: nm, seed: nm.meta.seed, players, me, attract: false, crownSecs: 0, left: false, mode: nm.mode,
      cosKeys: players.map((p) => JSON.stringify(p.cos || {})) };
    renderer.setCrowds(crowdsMeta(players));
    renderer.setFocus(me);
    setLook(eventLook(nm.meta.events || []));
    resetZones();
    hud.setMatch({ players, playerIndex: me, map, league: null, plate: save.equip.plate, badge: save.equip.badge, toast: save.equip.toast, mode: nm.mode });
    acc = 0; frameEvents = []; resultsAt = 0; lastBeep = -1; lastTick = -1; wasLeader = false;
    paused = false; autopilot = false; hiddenAt = 0;
    input.reset();
    hud.show(true);
    hud.setHudVisible(true);
    input.setEnabled(true);
    audio.ensure();
    hints.stop();
    if (late) notice('You took over a crowd mid-match', 4000);
    if (document.hidden) onHidden();
  }

  function finishOnline(left) {
    markLive(false);
    const nm = match.net;
    mode = 'results';
    hud.show(false);
    hints.stop();
    screens.pause.hide();
    paused = false; autopilot = false;
    input.setEnabled(false);
    save.tutorialDone = true;
    app.persist();
    const state = nm.state;
    screens.showResults({ state, players: nm.players, me: nm.me, left, mode: nm.mode, online: { note: left ? 'Your crowd was handed to a bot' : recordedText() } });
    G.resultsShown = (G.resultsShown || 0) + 1;
    G.matchCompleted();
    if (online) online.endMatch();
  }

  function onlineFrame(now, dt) {
    const nm = match.net;
    let ax = 0, az = 0;
    if (mode === 'match' && !autopilot) { input.vector(v); ax = v.x; az = v.z; }
    nm.setAutopilot(autopilot);
    let r = null;
    try { r = nm.frame(now, dt, ax, az); } catch (e) { logErr('net frame', e); }
    if (r && r.state) {
      const state = r.state;
      if (!match.spectating && match.mode === 'lcs' && state.crowds[match.me].out) match.spectating = true;
      if (match.spectating && state.phase === 'play') { try { renderer.setFocus(state.leader); } catch {} }
      try { direct(state, r.events); } catch (e) { logErr('director', e); }
      pushZones(state);
      try { renderer.frame(state, r.events, dt, r.alpha); } catch (e) { logErr('renderer.frame', e); }
      if (mode === 'match') {
        try { hud.update(state, r.events, dt, r.alpha); } catch (e) { logErr('hud', e); }
        if (state.phase === 'over' && !nm.over) {
          nm.over = true;
          if (online) online.report();
          input.setEnabled(false); audio.stopMusic();
          if (!resultsAt) { resultsAt = now + overHold(); watchWinner(state); }
        }
      }
    }
    if (now - netPillAt > 250) {
      netPillAt = now;
      let t = '', tone = '';
      const st = online ? online.status : 'idle';
      if (nm.offline) { t = 'Offline'; tone = 'bad'; }
      else if (st === 'reconnecting' || st === 'connecting') { t = 'Reconnecting…'; tone = 'bad'; }
      else if (nm.role === 'guest' && nm.ready && performance.now() - nm.lastPeer > 1200) { t = 'Waiting for the host…'; tone = 'bad'; }
      if (now < netNoticeUntil) { t = netNotice + (t ? ' · ' + t : ''); tone = tone || 'warn'; }
      if (!t && online) t = `${Math.round(online.rtt)} ms${nm.role === 'host' ? ' · host' : ''}`;
      hud.setNet(mode === 'match' ? t : '', tone);
    }
    if (mode === 'match' && resultsAt && now >= resultsAt) { resultsAt = 0; finishOnline(false); }
  }

  // A hidden host tab gets no animation frames: a slow timer keeps the match running for everyone.
  setInterval(() => {
    if (!document.hidden || !match || !match.net || match.net.role !== 'host' || mode !== 'match') return;
    const now = performance.now(), dt = Math.min(2, (now - last) / 1000);
    last = now;
    try { match.net.frame(now, dt, 0, 0, 60); } catch (e) { logErr('net pump', e); }
  }, 200);

  const screens = createScreens({
    root: document.getElementById('screens'), app,
    onPlay: () => playOnline(),
    onPractice: () => startMatch(prepare('practice')),
    onAgain: () => {
      if (lastKind === 'online') {
        if (online && online.room && !online.room.quick) return enterRoom(online.room);
        return net.quick().catch(() => { showMenu(); screens.open('online'); });
      }
      return lastKind === 'practice' ? startMatch(prepare('practice')) : playOnline();
    },
    onMenu: () => { if (lastKind === 'online' && online && online.room) online.leave(); showMenu(); },
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
    const mode = modeOf(opts.mode || save.mode);
    if (kind === 'sim-online') { const rep = rollSeason(save); if (rep) { app.seasonReport = rep; app.persist(); } }
    const roster = kind === 'sim-online' ? buildRoster({ seed, rating: save.rating, count: CONFIG.MATCH.crowds - 1 }) : null;
    const p = makePlayers({ seed, mode, playerName: app.playerName(), playerColor: app.colorHex(), playerCos: crowdCosmetics(save.equip), roster });
    const ev = matchEvents(Date.now(), mode);
    if (opts.event) { ev.ids = opts.event.split(','); ev.sim = eventSim(ev.ids); ev.look = eventLook(ev.ids); ev.slayer = ev.ids.includes('slayer') ? 30 : ev.slayer; }
    return { kind, seed, mode, ev, ...p };
  }

  function newMatch(pre) {
    const attract = pre.kind === 'attract';
    const { seed, players, botIndices, botSpecs } = pre;
    const idx = botIndices.slice(), specs = botSpecs.slice();
    if (!idx.includes(0)) { idx.unshift(0); specs.unshift({ ...CONFIG.AUTO_PLAYER }); }
    const countdown = attract || opts.shot ? 0 : CONFIG.MATCH.countdown;
    const mode = attract ? 'classic' : modeOf(pre.mode);
    const ev = pre.ev || null;
    const sim = createSim({ seed, map, players, countdown, mode, config: attract ? ATTRACT.sim : ev ? ev.sim : null });
    const bots = createBots({ sim, indices: idx, specs, seed, focus: attract ? attractFocus : null });
    match = { kind: pre.kind, seed, players, sim, bots, attract, crownSecs: 0, left: false, mode, ev, slayer: 0 };
    renderer.setCrowds(crowdsMeta(players));
    renderer.setFocus(0);
    setLook(attract ? eventLook(liveEvents().map((w) => w.id)) : ev && ev.look);
    resetZones();
    hud.setMatch({
      players, playerIndex: 0, map, league: pre.kind === 'sim-online' ? save.league : null,
      plate: save.equip.plate, badge: save.equip.badge, toast: save.equip.toast, mode,
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
    const mi = match.me || 0;
    const me = state.crowds[mi];
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
        case 'emote': if (e.crowd !== mi && EMOTES[e.id]) hud.emote(e.crowd, EMOTES[e.id]); break;
        case 'infect':
          if (e.crowd === mi) { audio.absorbed(); app.haptic([40, 60, 120]); }
          else if (e.by === mi) audio.absorb();
          crowdLook(e.crowd, e.by);
          break;
        case 'recruit': if (e.crowd === mi) audio.recruit(e.n); break;
        case 'steal':
          if (e.to === mi) audio.steal(e.n, true);
          else if (e.from === mi) audio.steal(e.n, false);
          break;
        case 'elim':
          if (e.by === mi) {
            audio.absorb(); app.haptic(60); myEmote(app.emoteGlyph());
            const v = state.crowds[e.victim];
            if (match.ev && match.ev.slayer && v && v.rank < state.crowds[mi].rank) match.slayer++;
          } else if (e.victim === mi) { audio.absorbed(); app.haptic([90, 50, 90]); if (match.mode === 'lcs') spectate(state); }
          humanEmote(e.by, BRAG, 0.55);
          humanEmote(e.victim, OUCH, 0.5, 3300);
          break;
        case 'pickup': if (e.crowd === mi) { audio.pickup(e.kind); app.haptic(25); } break;
        case 'lead':
          if (e.crowd === mi) { audio.lead(true); wasLeader = true; }
          else if (wasLeader) { audio.lead(false); wasLeader = false; }
          humanEmote(e.crowd, CROWN, 0.3);
          break;
        case 'phase':
          if (e.phase === 'play') {
            audio.beep(true); audio.startMusic();
            match.players.forEach((p, i) => humanEmote(i, HELLO, 0.5, 600 + Math.random() * 2600));
          }
          if (e.phase === 'over') {
            audio.stopMusic(); audio.end(state.crowds[mi].rank === 1); input.setEnabled(false); resultsAt = performance.now() + overHold();
            watchWinner(state);
            if (state.crowds[mi].rank === 1) myEmote(app.emoteGlyph());
            match.players.forEach((p, i) => humanEmote(i, ['gg', 'gg', 'gg wp', 'close one'], state.crowds[i].rank === 1 ? 0.9 : 0.3));
          }
          break;
      }
    }
  }

  // Your own emote: shown at once, and sent to the room in online play.
  function myEmote(glyph) {
    const mi = match.me || 0;
    hud.emote(mi, glyph);
    if (match.net) { try { match.net.emote(emoteId(glyph)); } catch (e) { logErr('emote', e); } }
  }

  // A few seconds on the winner before the results (when it isn't you).
  function watchWinner(state) {
    const mi = match.me || 0, w = state.leader;
    if (w === mi || !state.crowds[w] || !state.crowds[w].alive) return;
    try { renderer.setFocus(w); } catch {}
    resultsAt += 1300;
    hud.toast(esc(match.players[w].name), { sub: 'takes it', cls: 'gold small' });
  }

  // LCS: once you are out, the camera follows whoever leads.
  function spectate(state) {
    match.spectating = true;
    try { renderer.setFocus(state.leader); } catch {}
  }

  // Infection: a crowd that turned. The 3D crowd only changes colour if the renderer has updateCrowdMeta.
  function crowdLook(i, by) {
    if (!renderer.updateCrowdMeta) return;
    const p = match.players[i], st = curState(), src = st && st.crowds[by];
    try { renderer.updateCrowdMeta(i, { ...(p.cos || {}), index: i, name: p.name, color: CONFIG.MODES.infection.hordeColor, palette: undefined }, src ? { from: { x: src.x, z: src.z } } : {}); } catch (e) { logErr('updateCrowdMeta', e); }
  }

  // weather null = the theme's own (snow falls on the snow theme); never force 'clear' over it.
  let lookTheme = 'evening';
  function setLook(look) {
    try {
      const theme = look && look.theme || 'evening', weather = look && look.weather || null;
      if (renderer.setTheme) lookTheme = renderer.setTheme(theme) || theme;
      if (renderer.setWeather) renderer.setWeather(weather === 'clear' && lookTheme === 'snow' ? null : weather);
    } catch (e) { logErr('setTheme', e); }
  }
  // Festival fireworks start at the whistle: hold the results long enough to see them.
  const overHold = () => (lookTheme === 'festival' ? 3200 : 1700);

  let zonesKey = '';
  function resetZones() { zonesKey = ''; try { renderer.setZones && renderer.setZones([]); } catch {} }
  function pushZones(state) {
    if (!renderer.setZones) return;
    const z = zonesOf(state, match.players.map((p) => p.color));
    const key = z.map((q) => `${q.id},${q.x.toFixed(1)},${q.z.toFixed(1)},${q.r.toFixed(1)},${q.style},${q.color},${q.progress ?? ''}`).join('|');
    if (key === zonesKey) return;
    zonesKey = key;
    try { renderer.setZones(z); } catch (e) { logErr('setZones', e); }
  }

  // ?fps=1: frame rate as measured here (mean and the slowest 5 % of frames), quality tier and draw calls.
  const fpsBox = opts.fps ? Object.assign(document.createElement('div'), { className: 'fps-box' }) : null;
  const ft = [];
  let fpsAt = 0;
  if (fpsBox) document.body.appendChild(fpsBox);
  function fpsMeter(now, dtMs) {
    ft.push(dtMs); if (ft.length > 120) ft.shift();
    if (now - fpsAt < 500) return;
    fpsAt = now;
    const sorted = ft.slice().sort((a, b) => a - b), mean = ft.reduce((a, b) => a + b, 0) / ft.length, p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    let st = {};
    try { st = renderer.stats() || {}; } catch {}
    fpsBox.textContent = `${(1000 / mean).toFixed(0)} fps · 5% low ${(1000 / p95).toFixed(0)} · ${st.quality || '2d'}${st.dpr ? ' @' + st.dpr.toFixed(1) + 'x' : ''} · ${st.drawCalls ?? '–'} draws · ${st.triangles ? (st.triangles / 1e6).toFixed(2) + 'M tris' : ''}`;
    fpsBox.dataset.tone = 1000 / mean >= 50 ? 'ok' : 1000 / mean >= 30 ? 'warn' : 'bad';
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (fpsBox) fpsMeter(now, now - last);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    if (!match) return;
    if (match.net) return onlineFrame(now, dt);
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
    if (!match.spectating && match.mode === 'lcs' && state.crowds[0].out) match.spectating = true;
    if (match.spectating && state.phase === 'play') { try { renderer.setFocus(state.leader); } catch {} }
    pushZones(state);
    try {
      renderer.frame(state, frameEvents, dt, alpha);
      renderFails = 0;
    } catch (e) {
      logErr('renderer.frame', e);
      if (++renderFails >= 3 && !renderer.debug2d) {
        try { renderer.dispose(); } catch {}
        renderer = createDebug2D({ canvas: freshCanvas(), map });
        renderer.setCrowds(crowdsMeta(match.players));
        renderer.setFocus(0);
      }
    }
    if (mode === 'match' || mode === 'menu') {
      try { hud.update(state, frameEvents, dt, alpha); } catch (e) { logErr('hud', e); }
    }
    if (mode === 'match') { try { hints.update(state, match.me || 0, input.dragging); } catch (e) { logErr('hints', e); } }
    frameEvents.length = 0;
    if (match.attract && state.phase === 'over') attractMatch();
    if (mode === 'match' && state.phase === 'over' && !resultsAt) { input.setEnabled(false); audio.stopMusic(); resultsAt = now + overHold(); }
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
        crownSecs: match.crownSecs, left, mode: match.mode, coinMul: match.ev ? match.ev.coinMul : 1,
        slayer: match.ev && match.ev.slayer ? { n: match.slayer, bonus: match.ev.slayer } : null,
      });
    }
    if (!opts.auto) save.tutorialDone = true;
    app.persist();
    if (left) input.setEnabled(false);
    screens.showResults({ state, players: match.players, me: 0, report, practice, left, mode: match.mode, ev: match.ev });
    G.matchCompleted();
    G.resultsShown = (G.resultsShown || 0) + 1;
    G.lastReport = report;
  }

  // The menu's attract match: bigger, faster-growing crowds that drift to the central plaza (behind the title).
  const ATTRACT = { sim: { startCount: 40, recruitValue: 2 }, ff: 20 };
  const centre = map.plazas && map.plazas.length ? map.plazas.reduce((a, p) => (Math.hypot(p.x, p.z) < Math.hypot(a.x, a.z) ? p : a)) : { x: 0, z: 0 };
  const attractFocus = { x: centre.x, z: centre.z, r: 80, w: 3 };
  function attractMatch() { newMatch(attractPre()); fastForward(ATTRACT.ff); }
  function attractPre() {
    const seed = newSeed(':attract');
    return { kind: 'attract', seed, ...makePlayers({ seed, allBots: true }) };
  }

  function showMenu() {
    mode = 'menu';
    audio.stopMusic();
    hints.stop();
    cam('showcase');
    attractMatch();
    hud.show(false);
    screens.showMenu();
    input.setEnabled(false);
  }

  function playOnline() {
    const pre = prepare('sim-online');
    screens.hideAll();
    mode = 'lobby';
    if (!match || !match.attract) { cam('showcase'); attractMatch(); }
    // The very first match should start quickly: the fake "finding players" wait is short then.
    screens.lobby.show({ players: pre.players, league: save.league, onDone: () => startMatch(pre), onCancel: () => showMenu(), ...(save.tutorialDone ? {} : { total: 1300 }) });
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

  const curState = () => match && (match.net ? match.net.state : match.sim.state);
  const live = () => mode === 'match' && match && !match.attract && curState() && curState().phase !== 'over';

  function pauseMatch(away = 0) {
    if (!live()) return;
    if (match.kind !== 'practice') autopilot = true; else paused = true;
    input.setEnabled(false);
    screens.pause.show({ online: match.kind !== 'practice', away, rated: match.kind === 'sim-online' && match.mode === 'classic' });
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
    if (match.net) { audio.stopMusic(); if (online) online.leave(); return finishOnline(true); }
    if (match.kind === 'sim-online') { audio.stopMusic(); finishMatch(true); } else showMenu();
  }

  function onHidden() {
    if (!live()) return;
    hiddenAt = Date.now();
    pauseMatch();
    if (match.net && match.net.role === 'host' && online) online.handoff();
  }
  function onVisible() {
    if (!hiddenAt) return;
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    if (match && match.net && mode === 'match') { last = performance.now(); if (live()) screens.pause.show({ online: true, away, rated: false }); return; }
    if (!match || match.kind !== 'sim-online' || mode !== 'match') return;
    const st = match.sim.state;
    const left = (st.phase === 'countdown' ? st.countdownLeft : 0) + st.timeLeft + 0.2;
    // The match never stopped: catch the sim up with autopilot steering.
    try { fastForward(Math.min(away, left)); } catch (e) { logErr('catch-up', e); }
    last = performance.now();
    if (match.sim.state.phase === 'over') { screens.pause.hide(); return; }
    screens.pause.show({ online: true, away, rated: match.mode === 'classic' });
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
    state: { get: () => curState() },
    online: { get: () => online },
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

  app.net = net;
  Object.assign(G, { net });

  // br8t account + cloud save: optional, never blocks; the nudge only shows on the menu or results.
  let cloudSync = null;
  if (!opts.auto && !opts.shot && !opts.nocloud) {
    import('./cloud.js').then((m) => {
      cloudSync = m.initCloud({
        canPester: () => (mode === 'menu' && !screens.sheets.current) || mode === 'results',
        onName: (n) => { if (n !== app.accountName) { app.accountName = n; screens.refresh(); } },
      });
      G.cloud = cloudSync;
    }).catch((e) => { G.cloudError = String(e && e.message || e); console.warn('[throng] account layer unavailable', e); });
  }
  G.matchCompleted = () => { try { cloudSync && cloudSync.matchCompleted(); } catch {} };
  app.applySettings();
  if (opts.shot) startMatch(prepare('practice'));
  else if (opts.auto) startMatch(prepare('sim-online'));
  else showMenu();
  if (wasLive() && !opts.shot && !opts.auto) { notice('Rejoining your match…', 6000); G.rejoining = true; net.connect(); setTimeout(() => { if (mode !== 'match') markLive(false); }, 15000); }
  if (net.pendingCode && !opts.shot && !opts.auto) {
    try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])room=[^&]*&?/, '$1').replace(/[?&]$/, '')); } catch {}
    screens.open('online');
  }
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
