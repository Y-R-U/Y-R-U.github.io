// Screen flow: title → (first-run intro) → loading → playing ⇄ paused. Autosave every 60 s and on pause/hide.
import { h, click, toast, confirmPop, popup } from './dom.js';
import { g } from './glyphs.js';
import { settings } from './settings.js';
import { createTitle } from './title.js';
import { createAccount } from './account.js';
import { createStore } from './store.js';
import { openSettings, settingsOpen, closeSettings } from './settings_panel.js';
import { playIntro, preloadIntro } from './intro.js';
import { fullscreen } from './fullscreen.js';
import { minigames } from '../minigames/index.js';
import { loadGame } from '../minigames/registry.js';

const AUTOSAVE = 60;
const TIPS = [
  'Tip: the tool wheel (Q, or the scale button) changes how big your blocks are.',
  'Tip: at night your suit stops charging. Stand near a Glowbulb to recharge.',
  'Tip: a glitchfuse hisses and flashes before it bursts. Back away!',
  'Tip: in Build mode, double-tap jump to fly.',
  'Tip: tiny ¼ blocks make great details. Big 8× blocks make mountains.',
  'Tip: reboots burn out in sunlight. They only come out in the dark.',
];

export function createShell(ctx, root, ui) {
  let _state = 'boot';
  const st = { get state() { return _state; }, set state(v) { _state = v; document.body.dataset.swState = v; } };
  let meta = null, saving = null, autoT = 0, saveCount = 0, gameMod = null;
  let api = null;
  const apiReady = import('../net/api.js').then((m) => { api = m.api || m.default; }).catch(() => { api = null; });

  const account = createAccount(() => api, () => title.reload());
  const store = createStore(() => api, account);
  const title = createTitle({
    store, account,
    onPlay: (m, o) => play(m, o),
    onSettings: () => openSettings(root, {}),
    onIntro: () => runIntro(true),
    onMinigame: (id, o) => playMinigame(id, o),
  });

  async function game() {
    if (ui.game) return ui.game;
    if (!gameMod) gameMod = await import('../main.js');
    return gameMod.game || gameMod.default?.game || gameMod.default;
  }
  const setPaused = (p) => {
    if (ui.game?.pause) ui.game.pause(p);
    else if (ctx.session) ctx.session.paused = p;
  };
  const inputOn = (on) => {
    const inp = ctx.input;
    if (!inp) return;
    inp.enabled = on;
    if (!on) { inp.releasePointer?.(); inp.releaseAll?.(); }
  };

  async function showTitle() {
    st.state = 'title';
    setPaused(true); inputOn(false);
    ui.hud?.show(false);
    ctx.audio?.music('title');
    title.setHint(ctx.audio?.ctx?.state === 'running' ? '' : 'Tap anywhere for sound');
    addEventListener('pointerdown', () => title.setHint(''), { once: true });
    await apiReady;
    title.show(root);
    await account.refresh();
  }
  async function runIntro(replay = false) {
    const prev = st.state;
    st.state = 'intro';
    await playIntro(root, ctx.audio);
    settings.set('introSeen', true);
    if (replay) { st.state = prev; ctx.audio?.music('title'); }
  }

  function loadingScreen(name) {
    const bar = h('i'), text = h('p', {}, 'Planting the seed…');
    const el = h('div.sw-screen.sw-loading', {},
      h('div.sw-backdrop', {}, h('img', { src: new URL('../../assets/intro/seed.webp', import.meta.url).href, alt: '', style: { opacity: 0.35 }, onerror: (e) => e.target.remove() })),
      h('div.box', {}, h('div.sw-seedgrow', {}, Array.from({ length: 9 }, (_, i) => h('i', { style: { animationDelay: (i * 0.12) + 's' } }))),
        h('h2', {}, name), text, h('div.sw-bar', {}, bar),
        h('p', { style: { marginTop: '14px', fontSize: '13px', color: 'var(--ink-3)' } }, TIPS[Math.floor(Math.random() * TIPS.length)])));
    root.append(el);
    let p = 0.05;
    const set = (v, t) => { p = Math.max(p, v); bar.style.width = Math.round(p * 100) + '%'; if (t) text.textContent = t; };
    const off = ctx.bus?.on('load:progress', (d) => set(d?.p ?? p, d?.text || (d?.label ? d.label + '…' : null)));
    const fake = setInterval(() => set(p + (0.9 - p) * 0.06), 200);
    set(0.05);
    return { set, done() { clearInterval(fake); off?.(); set(1); el.classList.add('fade-out'); setTimeout(() => el.remove(), 450); } };
  }

  async function play(m, { fresh = false } = {}) {
    if (st.state === 'loading' || st.state === 'playing') return;
    title.hide();
    if (!settings.get('introSeen') && !/[?&](auto|shot|nointro|play)/.test(location.search)) await runIntro();
    st.state = 'loading';
    ctx.audio?.music(null);
    const ld = loadingScreen(m.name);
    try {
      let data = null;
      if (!fresh && m.id && !m.temp) { ld.set(0.1, 'Fetching your world…'); ({ meta: m, data } = await store.load(m)); }
      meta = m;
      if (ctx.session) { ctx.session.meta = meta; ctx.session.mode = meta.mode; }
      ld.set(0.2, 'Growing the land…');
      const G = await game();
      await G.start(meta, data);
      ld.done();
      enterPlaying(true);
      autoT = 0; saveCount = 0;
      if (fresh) toast(meta.mode === 'build' ? 'Build mode: every block is yours' : 'Survive the night. Keep your Charge up!', { ms: 3200 });
    } catch (e) {
      console.error('[shell] start failed', e);
      ld.done();
      toast('That world would not start: ' + (e?.message || e), { kind: 'bad', ms: 5000 });
      showTitle();
    }
  }

  function enterPlaying(first = false) {
    st.state = 'playing';
    pauseEl?.remove(); pauseEl = null;
    setPaused(false); inputOn(true);
    ui.hud?.show(true);
    ctx.audio?.music(ctx.sky?.isNight && !settings.get('alwaysDay') ? 'night' : 'day');
    if (first && ctx.input?.device === 'mouse') toast('Click to look around. Esc for the menu.', { ms: 3000 });
    else ctx.input?.requestPointer?.();
  }

  async function playMinigame(id, opts = {}) {
    if (st.state === 'loading' || st.state === 'intro') return;
    const from = st.state;
    if (meta && !meta.temp && (from === 'playing' || from === 'paused')) await save('quit', true);
    minigames.stop();
    pauseEl?.remove(); pauseEl = null;
    ui.closePanels?.(); ui.cmd?.close();
    if (from === 'title' || from === 'boot') title.hide();
    st.state = 'loading';
    ctx.audio?.music(null);
    const def = await loadGame(id);
    const ld = loadingScreen(def?.name || 'Mini-game');
    try {
      if (!def) throw new Error('missing game ' + id);
      meta = { id: null, temp: true, minigame: id, name: def.name, seed: 'mg-' + id, mode: 'minigame', difficulty: 'normal', source: 'local', mine: true };
      if (ctx.session) { ctx.session.meta = meta; ctx.session.mode = 'minigame'; }
      ld.set(0.2, 'Building the arena…');
      await (await game()).start(meta, null);
      enterPlaying();
      const r = await minigames.begin(ctx, root, id, { variant: opts.variant, actions: {
        replay: () => playMinigame(id, { variant: r.mg.variant }),
        menu: () => quit({ toMenu: true }),
        quit: () => quit(),
      } });
      ld.done();
      ctx.input?.requestPointer?.();
    } catch (e) {
      console.error('[shell] mini-game failed', e);
      ld.done();
      minigames.stop();
      toast('That mini-game would not start: ' + (e?.message || e), { kind: 'bad', ms: 5000 });
      try { (await game()).stop?.(); } catch {}
      meta = null;
      showTitle();
    }
  }

  let pauseEl = null;
  function pause() {
    if (st.state !== 'playing') return;
    st.state = 'paused';
    setPaused(true); inputOn(false);
    ui.closePanels?.();
    save('pause');
    const mode = meta?.mode === 'build' ? 'Build' : meta?.mode === 'minigame' ? 'Mini-game' : 'Survival';
    const mg = meta?.mode === 'minigame' ? minigames.running : null;
    pauseEl = mg ? h('div.sw-pause', {}, h('div.card.glass', {},
      h('h2', {}, 'PAUSED'), h('div.sub', {}, `${meta?.name || ''} · ${mode}`),
      h('button.sw-btn.primary', { onclick: () => { click(); resume(); } }, g('play', 16), 'Resume'),
      h('button.sw-btn', { onclick: () => { click(); playMinigame(mg.id, { variant: mg.mg.variant }); } }, g('rotate', 16), 'Restart'),
      h('button.sw-btn', { onclick: () => { click(); openSettings(root, {}); } }, g('gear', 16), 'Settings'),
      h('button.sw-btn', { onclick: () => { click(); quit({ toMenu: true }); } }, g('exit', 16), 'Leave'))) : h('div.sw-pause', {}, h('div.card.glass', {},
      h('h2', {}, 'PAUSED'), h('div.sub', {}, `${meta?.name || ''} · ${mode}`),
      h('button.sw-btn.primary', { onclick: () => { click(); resume(); } }, g('play', 16), 'Resume'),
      h('button.sw-btn', { onclick: () => { click(); openSettings(root, {}); } }, g('gear', 16), 'Settings'),
      h('div.sw-pause-row', {},
        fullscreen.supported() && h('button.sw-btn', { onclick: () => { click(); fullscreen.toggle(); } }, g('expand', 16), 'Full screen'),
        h('button.sw-btn', { onclick: () => { click(); resume(); setTimeout(() => ui.cmd?.open(), 60); } }, h('b', { style: { fontFamily: 'var(--display)' } }, '/'), 'Commands')),
      visiting() && h('button.sw-btn', { onclick: async (e) => { click(); e.currentTarget.disabled = true; if (await save('copy', true)) { toast('Saved to My Worlds', { kind: 'good' }); } } }, g('copy', 16), 'Save a copy'),
      h('button.sw-btn', { onclick: () => { click(); quit(); } }, g(visiting() ? 'exit' : 'save', 16), visiting() ? 'Leave' : 'Save & quit')));
    root.append(pauseEl);
  }
  function resume() {
    if (st.state !== 'paused') return;
    if (settingsOpen()) closeSettings();
    enterPlaying();
  }
  async function quit({ toMenu = false } = {}) {
    if (meta?.mode === 'minigame') {
      minigames.stop();
      try { (await game()).stop?.(); } catch (e) { console.warn(e); }
      pauseEl?.remove(); pauseEl = null;
      meta = null;
      await showTitle();
      if (toMenu) title.openTab('mg');
      return;
    }
    if (pauseEl) pauseEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (visiting() && !(await confirmPop('Leave this world?', 'This is someone else’s world. Use “Save a copy” first if you want to keep what you built.', 'Leave'))) {
      pauseEl?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      return;
    }
    const ok = await save('quit', true);
    if (!ok && !(await confirmPop('Saving failed', 'Your latest changes could not be saved. Quit anyway?', 'Quit anyway', true))) {
      pauseEl?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      return;
    }
    try { (await game()).stop?.(); } catch (e) { console.warn(e); }
    pauseEl?.remove(); pauseEl = null;
    meta = null;
    showTitle();
  }

  function thumb() {
    const r = ctx.renderer, src = r?.domElement;
    if (!src || !ctx.scene || !ctx.camera) return null;
    try {
      r.render(ctx.scene, ctx.camera);
      const c = document.createElement('canvas');
      c.width = 256; c.height = 144;
      const sw = src.width, sh = src.height, a = 16 / 9;
      const w = Math.min(sw, sh * a), hh = w / a;
      c.getContext('2d').drawImage(src, (sw - w) / 2, (sh - hh) / 2, w, hh, 0, 0, 256, 144);
      return c.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
  }

  const visiting = () => meta && meta.source === 'cloud' && !meta.mine;
  async function save(why = 'auto', withThumb = false) {
    if (!meta || meta.temp) return true;
    if (visiting() && why !== 'copy') return true;
    if (saving) { try { await saving; } catch {} }
    saving = (async () => {
      const G = await game();
      const data = await G.save();
      if (!data) return true;
      const th = withThumb || why === 'pause' || saveCount++ % 5 === 0 ? thumb() : null;
      const r = await store.save(meta, data, th, async () => {
        const v = await popup({
          title: 'This world changed somewhere else',
          text: 'Someone saved this world from another device since you opened it. Keep your version, or save yours as a separate copy?',
          buttons: [{ label: 'Save as copy', value: 'copy' }, { label: 'Overwrite', value: 'overwrite', primary: true }],
        });
        return v || 'copy';
      });
      meta = r.meta;
      if (ctx.session) ctx.session.meta = meta;
      if (r.copied) toast(r.conflict ? 'Saved yours as a copy' : 'Saved your own copy of this world', { kind: 'good', ms: 3600 });
      return true;
    })();
    try { return await saving; } catch (e) {
      console.warn('[shell] save failed', e);
      if (why !== 'auto' || e?.code !== 'offline') toast('Could not save: ' + (e?.message || e), { kind: 'warn', ms: 3600 });
      return false;
    } finally { saving = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (st.state === 'playing' || st.state === 'paused')) { save('hide'); if (st.state === 'playing' && !shellApi.noAutoPause) pause(); }
  });
  addEventListener('pagehide', () => { if (st.state === 'playing' || st.state === 'paused') save('hide'); });

  const shellApi = {
    noAutoPause: false,
    get state() { return st.state; },
    get meta() { return meta; },
    start: showTitle,
    playMinigame,
    adopt() {
      meta = { id: null, temp: true, name: 'Dev World', mode: ctx.session?.mode || 'survival', source: 'local', mine: true };
      const go = () => { if (st.state !== 'playing') enterPlaying(); };
      if (ctx.session?.playing) go(); else ctx.bus?.once('game:start', go);
    },
    play, pause, resume, save, quit, runIntro,
    update(dt) {
      minigames.update(dt);
      if (st.state !== 'playing') return;
      autoT += dt;
      if (autoT >= AUTOSAVE) { autoT = 0; save('auto'); }
    },
    preload: preloadIntro,
  };
  return shellApi;
}
