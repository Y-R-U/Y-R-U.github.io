// VECTOR PROTOCOL audio: WebAudio buses, decoded looping music with crossfades, file stings with ducking,
// synthesised SFX (sfx.js), route-driven music, delegated UI tap sounds and a battle adapter.
// Adapted from HEIRFRAME js/audio/audio.js. Every call no-ops until the first gesture unlocks the context,
// and missing files only log once, so the game boots and plays silently without audio/.
import { TRACKS, STINGS, STATES, ROUTES, UNSHIPPED, filePath } from './tracks.js';
import { playSfx, SFX_NAMES, forestAmbience } from './sfx.js';

const BASE = new URL('../../audio/', import.meta.url).href;
const STORE = 'vectorprotocol.audio.v1';
const DEFAULTS = { master: 0.9, music: 0.6, sfx: 0.8 };
const MAX_LIVE = 28;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();

// Battle hook names (js/battle/battle.js) -> sfx, with per-name throttle {gap ms, voices, vol} and a voice group
// ({g}: GROUPS caps how many of that kind sound at once, so x4 speed stays readable).
const BATTLE = {
  wave_start: { s: 'wave_start', vol: 0.9 },
  wave_clear: { s: 'wave_clear', vol: 0.8 },
  overtime: { s: 'overtime' },
  hit: { s: 'impact', gap: 45, voices: 5, vol: 0.55, g: 'hit' },
  hit_crit: { s: 'impact_crit', gap: 70, voices: 3, vol: 0.8, g: 'hit' },
  heal: { s: 'heal', gap: 120, voices: 2, vol: 0.6, g: 'support' },
  death: { s: 'death', gap: 80, voices: 3, g: 'big' },
  deploy: { s: 'deploy', gap: 70, voices: 3, vol: 0.7, g: 'big' },
  overdrive: { s: 'overdrive_charge', gap: 150, voices: 2 },
  overdrive_fire: { s: 'overdrive_release', gap: 150, voices: 2 },
  shield_hit: { s: 'shield_hit', gap: 60, voices: 3, vol: 0.6, g: 'hit' },
  shield_break: { s: 'shield_break', gap: 80, voices: 2, g: 'support' },
  cloak: { s: 'cloak', gap: 120, voices: 2, vol: 0.8, g: 'support' },
  decloak: { s: 'decloak', gap: 120, voices: 2, vol: 0.8, g: 'support' },
  fire_melee: { s: 'swing', gap: 50, voices: 3, vol: 0.6, g: 'fire' },
  fire_projectile: { s: 'shot_kinetic', gap: 40, voices: 5, vol: 0.55, g: 'fire' },
  fire_instant: { s: 'shot_kinetic', gap: 40, voices: 5, vol: 0.55, g: 'fire' },
  fire_beam: { s: 'beam', gap: 90, voices: 2, vol: 0.5, g: 'fire' },
  fire_area: { s: 'emp', gap: 120, voices: 2, vol: 0.7, g: 'fire' },
};
// Concurrent voices per group, and per weapon sound (long or node-heavy sounds get fewer).
const GROUPS = { fire: 7, hit: 6, support: 4, big: 4 };
const SOUND_VOICES = { minigun: 2, shotgun: 3, shot_rail: 3, shot_heavy: 3, emp: 2, explosion_small: 2, beam: 2, melee_impact: 3, impact_crit: 3, swing_heavy: 3 };
// Ability id -> weapon sound [regex, sound, rate?], used when the battle passes {ability}; first match wins.
// Melee is checked against its own list so a shield bash is a hit, not a shield-up chime.
const WEAPON_MELEE = [
  [/slug|flak|scatter|buck/, 'shotgun'],
  [/blade|sword|scythe|chain|saw|cut|judgement|lash/, 'blade_swing'],
  [/punch|haymaker|maul|slam|ram|bash|charge|gore|grip|baton|pounce|lunge|breach|lockdown/, 'swing_heavy'],
  [/self_destruct/, 'explosion_small'],
];
const WEAPON = [
  [/heal|mend|triage|sanctuary|grove/, 'beam', 1.6],
  [/shield|aegis|wall|fortress|barrier|dome/, 'shield_up'],
  [/longbow|arrow|thorn/, 'shot_arrow'],
  [/rail|lance|snipe|needle|designator/, 'shot_rail'],
  [/slug|flak|scatter|buck/, 'shotgun'],
  [/rotary|smg|spray|suppress|swarm|gatling|minigun/, 'minigun'],
  [/blackout|null|stasis|static|emp|jam|override|directive/, 'emp'],
  [/bombard|inferno|cataclysm|collapse|ember|event_horizon|self_destruct/, 'explosion_small'],
  [/cannon|rifle|long_shot|ghost_round/, 'shot_heavy'],
  [/prism|refraction|spectrum|last_light/, 'beam', 1.3],
  [/blade|sword|scythe|chain|saw|cut|arc_blade|judgement/, 'blade_swing'],
  [/bolt|zap|dart|spark|pulse|orb|wisp|sting|ping|surge|volley/, 'shot_bolt'],
];
function weaponFor(name, ability) {
  const list = name === 'fire_melee' ? WEAPON_MELEE : WEAPON;
  return list.find(([re]) => re.test(ability)) || null;
}

function silentWav() {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const s = (o, str) => [...str].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = ''; b.forEach((x) => (bin += String.fromCharCode(x)));
  return 'data:audio/wav;base64,' + btoa(bin);
}

export function createAudio() {
  const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
  let ctx = null, B = null, analyser = null, levelBuf = null, primed = false, vis = true, muted = false;
  let vols = { ...DEFAULTS }, curState = null, curTrack = null, deck = null, pendingTimer = 0, battleTimer = 0;
  let live = 0, autoRoute = true, autoUi = true, odSplit = false, readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  const rotation = {}, bufCache = new Map(), inflight = new Map(), missing = new Set();
  const ducks = new Map(), sfxLast = {}, sfxLive = {}, groupLive = {}, odCharges = new Map();
  const errors = [], played = [];

  try { Object.assign(vols, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* storage blocked */ }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = hasDOM && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    B = { master: G(), music: G(), musicDuck: G(), sting: G(), sfx: G() };
    B.master.connect(comp).connect(ctx.destination);
    B.music.connect(B.musicDuck).connect(B.master);
    B.sting.connect(B.master);
    B.sfx.connect(B.master);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; levelBuf = new Float32Array(2048);
    B.master.connect(analyser);
    applyVolumes(0);
    ctx.onstatechange = () => { if (ctx.state === 'running') onRunning(); };
    return ctx;
  }

  function applyVolumes(t = 0.05) {
    if (!B) return;
    const set = (g, v) => g.gain.setTargetAtTime(v, ctx.currentTime, t || 0.001);
    set(B.master, muted ? 0 : vols.master);
    set(B.music, vols.music);
    set(B.sting, vols.music);
    set(B.sfx, vols.sfx);
  }

  const running = () => !!ctx && ctx.state === 'running' && vis;

  function onRunning() {
    readyResolve(true);
    if (!curState) return;
    if (!deck) startState(curState, 1.5);
    else if (curTrack && deck.id !== curTrack) playTrack(curTrack, 1.5);
  }

  function unlock() {
    if (!ensureCtx()) return Promise.resolve(false);
    if (!primed) {
      primed = true;
      try { // iOS: a played media element moves the page to the playback audio session (ignores the mute switch)
        const el = new Audio(silentWav()); el.playsInline = true;
        const p = el.play(); if (p) p.catch(() => {});
      } catch (e) { /* no media element */ }
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    }
    const p = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    return p.then(() => { if (ctx.state === 'running') onRunning(); return ctx.state === 'running'; }).catch(() => false);
  }

  function duck(id, level) {
    if (level == null) ducks.delete(id); else ducks.set(id, level);
    if (!B) return;
    let m = 1;
    ducks.forEach((v) => (m = Math.min(m, v)));
    B.musicDuck.gain.setTargetAtTime(m, ctx.currentTime, m >= 1 ? 0.5 : 0.08);
  }

  // ---- buffers -------------------------------------------------------------------------------
  function loadBuffer(url) {
    if (missing.has(url)) return Promise.resolve(null);
    if (bufCache.has(url)) { const b = bufCache.get(url); bufCache.delete(url); bufCache.set(url, b); return Promise.resolve(b); }
    if (inflight.has(url)) return inflight.get(url);
    if (!ensureCtx()) return Promise.resolve(null);
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej); }))
      .then((b) => {
        bufCache.set(url, b);
        // decoded music is ~35 MB per 100 s: keep at most 3 tracks + the small stings
        let big = [...bufCache].filter(([, x]) => x.duration > 30);
        while (big.length > 3) { bufCache.delete(big[0][0]); big = big.slice(1); }
        return b;
      })
      .catch((e) => { missing.add(url); errors.push('load: ' + (e && e.message)); console.warn('[audio] missing', url); return null; })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  // Leading digital silence = decoder padding the browser kept; skip it so the loop seam stays on the bar.
  function leadPad(buf) {
    const d = buf.getChannelData(0), n = Math.min(d.length, 4096);
    let i = 0; while (i < n && Math.abs(d[i]) < 3e-4) i++;
    return i < 64 || i >= n ? 0 : i / buf.sampleRate;
  }

  // ---- music ---------------------------------------------------------------------------------
  function stopDeck(d, fade) {
    if (!d) return;
    const g = d.g.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + Math.max(0.05, fade));
    try { d.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ }
    setTimeout(() => { try { d.g.disconnect(); } catch (e) { /* gone */ } }, fade * 1000 + 300);
  }

  function playTrack(id, fade) {
    const tr = TRACKS[id];
    if (!tr || !ctx) return;
    curTrack = id;
    const token = id + ':' + now();
    playTrack.token = token;
    loadBuffer(BASE + 'music/' + tr.file).then((buf) => {
      if (playTrack.token !== token || !buf || !running()) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      const pad = leadPad(buf);
      src.buffer = buf; src.loop = true;
      src.loopStart = pad;
      src.loopEnd = Math.min(buf.duration, pad + (tr.loop || buf.duration - pad));
      src.connect(g).connect(B.music);
      const t = ctx.currentTime, v = tr.gain ?? 1;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + Math.max(0.05, fade));
      src.start(t, pad);
      const old = deck;
      deck = { src, g, id, t0: t, pad, loopLen: src.loopEnd - pad };
      if (old) stopDeck(old, fade);
    });
  }

  function startState(state, fade) {
    const list = STATES[state] || (TRACKS[state] ? [state] : null);
    if (!list) return;
    const i = rotation[state] ?? Math.floor(Math.random() * list.length);
    rotation[state] = (i + 1) % list.length;
    const id = list[i % list.length];
    if (id === curTrack && deck) return;
    playTrack(id, fade);
  }

  // music(name|null, {fade, delay, restart}) — name is a track id or a STATES key; null/'none' fades out.
  function music(name, opts = {}) {
    clearTimeout(pendingTimer);
    const fade = opts.fade ?? 2;
    if (!name || name === 'none' || name === 'off') {
      curState = null; curTrack = null; playTrack.token = null;
      if (ctx && deck) { stopDeck(deck, fade); deck = null; }
      return;
    }
    if (!STATES[name] && !TRACKS[name]) { console.warn('[audio] unknown music', name); return; }
    if (name === curState && !opts.restart) return;
    const go = () => {
      curState = name;
      if (opts.restart) curTrack = null;
      if (running()) startState(name, fade);
    };
    if (opts.delay) { curState = name; pendingTimer = setTimeout(() => { curState = null; go(); }, opts.delay * 1000); } else go();
  }

  function sting(name, opts = {}) {
    const st = STINGS[name];
    if (!st || !running()) return Promise.resolve(false);
    return loadBuffer(BASE + filePath(st)).then((buf) => {
      if (!buf || !running()) return false;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      g.gain.value = (opts.vol ?? 1) * (st.gain ?? 1);
      s.buffer = buf; s.connect(g).connect(st.bus === 'sfx' ? B.sfx : B.sting);
      const id = 'sting' + now();
      if (st.bus !== 'sfx') { duck(id, opts.duck ?? 0.2); s.onended = () => duck(id, null); }
      s.start(ctx.currentTime + (opts.delay || 0), leadPad(buf));
      return true;
    });
  }

  // ---- SFX -----------------------------------------------------------------------------------
  // sfx(name, {vol, pan (-1..1), rate, minGap ms, maxVoices, group, groupVoices, ...sound opts}) -> seconds scheduled (0 = skipped)
  function sfx(name, opts = {}) {
    return voice(name, opts) ? lastLen : 0;
  }
  let lastLen = 0;
  // voice() is sfx() that returns the output gain node (or null) so a caller can fade it early.
  function voice(name, opts = {}) {
    lastLen = 0;
    if (!running() || live >= MAX_LIVE) return null;
    const t = now(), grp = opts.group;
    if (t - (sfxLast[name] || 0) < (opts.minGap ?? 25) || (sfxLive[name] || 0) >= (opts.maxVoices ?? 8)) return null;
    if (grp && (groupLive[grp] || 0) >= (opts.groupVoices ?? GROUPS[grp] ?? 8)) return null;
    const g = ctx.createGain();
    // dense moments: each extra voice in the group pulls the new one down a little, so a x4 barrage doesn't pile up
    g.gain.value = (opts.vol ?? 1) / (grp ? Math.sqrt(1 + 0.3 * (groupLive[grp] || 0)) : 1);
    let node = g;
    if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(opts.pan, -1, 1); g.connect(p); node = p; }
    node.connect(B.sfx);
    let len = 0;
    try { len = playSfx(ctx, g, name, ctx.currentTime + 0.005, opts); } catch (e) { errors.push('sfx ' + name + ': ' + e.message); }
    if (!len) { node.disconnect(); if (!SFX_NAMES.includes(name)) console.warn('[audio] unknown sfx', name); return null; }
    sfxLast[name] = t;
    sfxLive[name] = (sfxLive[name] || 0) + 1; live++;
    if (grp) groupLive[grp] = (groupLive[grp] || 0) + 1;
    // the group slot frees once the sound has mostly decayed; the nodes are dropped a little later
    setTimeout(() => { if (grp) groupLive[grp]--; }, Math.min(len, 0.6) * 1000);
    setTimeout(() => { sfxLive[name]--; live--; try { node.disconnect(); g.disconnect(); } catch (e) { /* gone */ } }, len * 1000 + 400);
    lastLen = len;
    played.push({ s: name, pan: +(opts.pan || 0).toFixed(2), vol: +g.gain.value.toFixed(2), grp, t: Math.round(t) });
    if (played.length > 300) played.splice(0, 100);
    return g;
  }

  // ---- battle adapter ------------------------------------------------------------------------
  // forBattle(info) picks + starts the battle track and returns the object createBattleScene takes as `opts.audio`.
  // info: the ui's session.battle ({kind, levelId, mapIndex, theme, enemyWaves, ...}) or {music:'boss'}.
  function battleTrackFor(info = {}) {
    if (info.music) return info.music;
    const waves = JSON.stringify(info.enemyWaves || info.waves || '');
    const boss = info.boss || /"boss_|"isBoss":true|"boss":true/.test(waves);
    const rift = info.theme === 'fantasy' || info.realm === 'fantasy' || info.mapIndex === 6 || /^m6_/.test(info.levelId || '');
    const st = rift && !boss ? 'rift' : boss ? 'boss' : 'battle';
    return STATES[st] ? st : 'battle';
  }

  // battle-7: arena ambience bed under the battle music (theme 'fantasy' = wind, leaves, birds); anything else stops it
  let amb = null;
  function ambience(theme, fade = 1.5) {
    if (theme === 'fantasy') { if (!amb && running()) amb = forestAmbience(ctx, B.sfx, { level: 1 }); return; }
    if (amb) { amb.stop(fade); amb = null; }
  }

  function battleSfx(name, c = {}) {
    if (name === 'ambience') return ambience(c.theme);
    if (name === 'victory' || name === 'defeat') {
      ambience(null, 2.5);
      music(null, { fade: 0.8 });
      sting(name).then((ok) => { if (!ok) sfx(name); });
      if (name === 'victory') { sting('crowd', { vol: 0.5 }).then((ok) => { if (!ok) sfx('crowd_cheer', { vol: 0.8 }); }); }
      return;
    }
    const m = BATTLE[name];
    let s = m ? m.s : name, rate = c.rate, vol = (m?.vol ?? 1) * (c.vol ?? 1);
    const pan = c.pan ?? (c.x != null ? clamp(c.x / 6.5, -0.75, 0.75) : 0);
    const base = { minGap: m?.gap, maxVoices: m?.voices, group: m?.g, ...c, pan };
    const key = c.x != null ? String(Math.round(c.x * 10)) : 'od';
    if (/^fire_/.test(name) && c.ability) {
      const w = weaponFor(name, c.ability);
      if (w) { s = w[1]; rate = w[2] ?? rate; }
    }
    if (name === 'hit' || name === 'hit_crit') {
      const absorbedOnly = c.absorbed > 0 && !(c.amount > 0);
      if (absorbedOnly) { s = 'shield_hit'; vol *= 1.1; } else if (name === 'hit' && c.melee) s = 'melee_impact';
      if (c.absorbed > 0 && !absorbedOnly) sfx('shield_hit', { ...base, vol: vol * 0.5, minGap: 60, maxVoices: 3 });
      // big numbers hit a little harder (amount is relative to nothing, so only a gentle curve)
      if (c.amount > 0) vol *= clamp(0.85 + Math.log10(1 + c.amount) * 0.08, 0.85, 1.15);
    }
    if (name === 'overdrive') { // charge only; the release comes from overdrive_fire (fallback below if it never does)
      const g = voice(s, { ...base, vol, rate, dur: c.charge ?? 1.5 });
      const rec = { g, timer: setTimeout(() => { odCharges.delete(key); if (!odSplit) voice('overdrive_release', { ...base, vol }); }, 1600) };
      odCharges.set(key, rec);
      return;
    }
    if (name === 'overdrive_fire') {
      odSplit = true;
      const rec = odCharges.get(key) || [...odCharges.values()].pop();
      if (rec) { // choke the charge riser so the release lands clean
        clearTimeout(rec.timer); odCharges.forEach((v, k) => v === rec && odCharges.delete(k));
        if (rec.g && ctx) { const t = ctx.currentTime; rec.g.gain.cancelScheduledValues(t); rec.g.gain.setTargetAtTime(0, t, 0.03); }
      }
      voice(s, { ...base, vol, rate });
      const w = c.ability && weaponFor('fire_area', c.ability);
      if (w && w[1] !== 'beam') sfx(w[1], { ...base, minGap: 0, maxVoices: 2, group: null, vol: 0.7, rate: w[2] });
      return;
    }
    voice(s, { ...base, vol, rate });
    if (name === 'wave_start') sting('crowd', { vol: 0.25 });
  }

  function forBattle(info = {}) {
    clearTimeout(battleTimer);
    music(battleTrackFor(info), { fade: info.fade ?? 1.2, restart: true });
    return { sfx: battleSfx, music, sting };
  }

  // ---- auto hooks: route music + UI taps --------------------------------------------------------
  function onRoute() {
    if (!autoRoute) return;
    const seg = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'hub';
    clearTimeout(battleTimer);
    if (seg !== 'battle') ambience(null);
    if (seg === 'battle') { // the battle screen should call forBattle(); if it doesn't, fall back to the rotation
      battleTimer = setTimeout(() => { if (!/^(battle|boss|rift)/.test(curState || '')) music('battle'); }, 900);
      return;
    }
    const st = ROUTES[seg];
    if (st === undefined || st === null) return;
    const fromFight = /^(battle|boss|rift)/.test(curState || '') || curState === null;
    music(st, { fade: fromFight ? 3 : 2, delay: seg === 'results' ? 2.2 : 0 });
  }

  const BACK = '.vpm-back, [aria-label="back"], [aria-label="Back"], [aria-label*="close" i], .back, .close, [data-back]';
  const CONFIRM = '.primary, .go, .cta, .deploy, [type="submit"]';
  function onClick(e) {
    if (!autoUi || !running()) return;
    const el = e.target && e.target.closest && e.target.closest('[data-sfx], button, a[href], [role="button"], .vp-card, .pc');
    if (!el) return;
    const tag = el.getAttribute('data-sfx');
    if (tag === 'none') return;
    let s = tag || (el.disabled || el.getAttribute('aria-disabled') === 'true' ? 'ui_deny' : el.matches(BACK) ? 'ui_back' : el.matches(CONFIRM) ? 'ui_confirm' : 'ui_tap');
    if (!SFX_NAMES.includes(s) && SFX_NAMES.includes('ui_' + s)) s = 'ui_' + s;
    sfx(s, { vol: 0.8, minGap: 40 });
  }

  if (hasDOM) {
    const gesture = () => { if (!ctx || ctx.state !== 'running' || !primed) unlock(); };
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, gesture, { capture: true, passive: true }));
    window.addEventListener('click', onClick, { capture: true, passive: true });
    // the app router navigates with history.pushState (no hashchange), so also watch the hash itself
    let lastHash = location.hash;
    const routeCheck = () => { if (location.hash !== lastHash) { lastHash = location.hash; onRoute(); } };
    window.addEventListener('hashchange', routeCheck);
    window.addEventListener('popstate', routeCheck);
    setInterval(routeCheck, 250);
    document.addEventListener('visibilitychange', () => {
      vis = document.visibilityState !== 'hidden';
      if (!ctx) return;
      if (!vis) ctx.suspend().catch(() => {});
      else ctx.resume().then(onRunning).catch(() => {});
    });
    queueMicrotask(onRoute);
  }

  return {
    unlock, ready, music, sting, sfx, forBattle, battleSfx,
    setVolumes(v) {
      for (const k of Object.keys(DEFAULTS)) if (v && typeof v[k] === 'number') vols[k] = clamp(v[k], 0, 1);
      try { localStorage.setItem(STORE, JSON.stringify(vols)); } catch (e) { /* storage blocked */ }
      applyVolumes();
    },
    getVolumes: () => ({ ...vols }),
    mute(on = true) { muted = !!on; applyVolumes(); },
    get muted() { return muted; },
    set autoRoute(v) { autoRoute = !!v; }, get autoRoute() { return autoRoute; },
    set autoUi(v) { autoUi = !!v; }, get autoUi() { return autoUi; },
    get state() { return curState; },
    get track() { return curTrack; },
    get context() { return ctx; },
    debug: {
      errors, played,
      level() {
        if (!analyser) return -Infinity;
        analyser.getFloatTimeDomainData(levelBuf);
        let s = 0; for (const v of levelBuf) s += v * v;
        return 10 * Math.log10(s / levelBuf.length + 1e-12);
      },
      // seconds into the current loop (wraps at the loop point)
      position() { if (!deck) return null; const e = ctx.currentTime - deck.t0; return { track: deck.id, t: e, inLoop: e % deck.loopLen, loopLen: deck.loopLen }; },
      // restart the current track so its loop seam arrives in `sec` seconds (for listening tests)
      seam(sec = 4) {
        if (!deck) return;
        const d = deck, src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = d.src.buffer; src.loop = true; src.loopStart = d.src.loopStart; src.loopEnd = d.src.loopEnd;
        src.connect(g).connect(B.music); g.gain.value = TRACKS[d.id]?.gain ?? 1;
        const off = Math.max(d.pad, d.src.loopEnd - sec);
        try { d.src.stop(); d.g.disconnect(); } catch (e) { /* gone */ }
        src.start(ctx.currentTime, off);
        deck = { ...d, src, g, t0: ctx.currentTime - (off - d.pad) };
      },
      info: () => ({ ctx: ctx && ctx.state, state: curState, track: curTrack, live, cache: bufCache.size, missing: [...missing], unshipped: UNSHIPPED, groups: { ...groupLive }, vols: { ...vols }, errors: errors.slice(-5) }),
      tracks: TRACKS, stings: STINGS, states: STATES, routes: ROUTES, sfxNames: SFX_NAMES, battleHooks: Object.keys(BATTLE).concat(['victory', 'defeat']),
    },
  };
}

export const audio = createAudio();
if (typeof window !== 'undefined') window.__audio = audio;
export default audio;
