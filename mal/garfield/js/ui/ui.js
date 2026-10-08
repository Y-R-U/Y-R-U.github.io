import { h, emitter } from './util.js';
import * as I from './icons.js';
import { createTitle, createChapter } from './menu.js';
import { createHud } from './hud.js';
import { createTalk } from './talk.js';
import { createFx } from './fx.js';
import { showGate } from './gate.js';
import { createModals, createPause, createSettings, popup, showComplete, showChapterComplete } from './panels.js';

export const DEFAULT_SETTINGS = Object.freeze({
  musicOn: true, music: 0.35, sfx: 0.8, voice: 0.9, subtitles: true,
  quality: 'auto', camSens: 1, invertY: false,
  names: Object.freeze({ garfield: 'Garfield', jon: 'Jon' }),
});

const ev = emitter();
const params = new URLSearchParams(location.search);
const forceTouch = params.get('touch') === '1';
const coarse = () => forceTouch || matchMedia('(pointer: coarse)').matches;

let settings = structuredClone(DEFAULT_SETTINGS);
let root = null, current = 'none', mounted = false;
const screens = {};

export const ui = {
  on: ev.on, off: ev.off, emit: ev.emit,
  controls: {
    move: { x: 0, y: 0 },
    jumpHeld: false,
    _look: { dx: 0, dy: 0 },
    consumeLook() { const l = this._look, o = { dx: l.dx, dy: l.dy }; l.dx = 0; l.dy = 0; return o; },
  },
  get isTouch() { return document.documentElement.classList.contains('ui-touch'); },
  get current() { return current; },
  // True while a menu, panel or popup covers the game (core should ignore gameplay input).
  isBlocking() { return !!(this.modals?.count) || (current !== 'hud' && current !== 'none'); },
  isTyping() { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); },

  names: {
    get: (who) => settings.names[who] || ({ garfield: 'Garfield', jon: 'Jon', lyman: 'Lyman', odie: 'Odie', delivery: 'Delivery man' }[who]) || who,
    fill: (text) => String(text ?? '')
      .replace(/\{garfield\}/gi, settings.names.garfield)
      .replace(/\{jon\}/gi, settings.names.jon),
  },

  settings: {
    get: () => structuredClone(settings),
    // set(patch) merges silently (e.g. core loading the save); set(patch, true) also emits 'settings'.
    set(patch = {}, emit = false) {
      const names = patch.names ? { ...settings.names, ...patch.names } : settings.names;
      settings = { ...settings, ...patch, names };
      if (emit) ev.emit('settings', structuredClone(settings));
      document.documentElement.classList.toggle('ui-no-subs', !settings.subtitles);
    },
    reset(emit = true) { this.set(structuredClone(DEFAULT_SETTINGS), emit); },
    defaults: DEFAULT_SETTINGS,
    open: () => ui._settings.open(),
    close: () => ui._settings.close(),
    get isOpen() { return ui._settings?.isOpen; },
  },

  gate: { el: null, show: (opts) => showGate(ui, root, opts) },

  fullscreen: {
    get isOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    get supported() { const d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); },
    async toggle() {
      const d = document.documentElement;
      try {
        if (this.isOn) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else if (this.supported) {
          await (d.requestFullscreen || d.webkitRequestFullscreen).call(d, { navigationUI: 'hide' });
          screen.orientation?.lock?.('landscape').catch(() => {});
        } else return iosHelp();
      } catch { if (!this.isOn) iosHelp(); }
    },
  },

  mount(rootEl = document.body) {
    if (mounted) return ui;
    mounted = true;
    ensureFonts();
    ensureCss();
    root = h('div.gui');
    rootEl.append(root);
    const html = document.documentElement;
    html.classList.add('ui-root');
    const setTouch = () => html.classList.toggle('ui-touch', coarse());
    setTouch();
    matchMedia('(pointer: coarse)').addEventListener?.('change', setTouch);
    window.addEventListener('touchstart', () => { if (!html.classList.contains('ui-touch')) { html.classList.add('ui-touch'); } }, { once: true, passive: true });

    const fit = () => {
      const s = Math.max(0.55, Math.min(1.5, Math.min(innerWidth / 1280, innerHeight / 720)));
      html.style.setProperty('--s', s.toFixed(3));
      html.style.setProperty('--vh', innerHeight + 'px');
    };
    fit();
    addEventListener('resize', fit);

    ui.modals = createModals(ui);
    ui.talk = createTalk(ui);
    const fx = createFx(ui);
    ui._fx = fx;
    screens.title = createTitle(ui);
    screens.chapter = createChapter(ui);
    screens.hud = createHud(ui);
    ui.pause = createPause(ui);
    ui._settings = createSettings(ui);

    const rotate = h('div.rotate-card', {}, h('div.rotate-inner', {},
      h('div.rotate-ico', { html: I.rotate() }), h('p', {}, 'Turn your device sideways to play!')));

    root.append(screens.title.el, screens.chapter.el, screens.hud.el, ui.talk.layer, ui.talk.subs,
      fx.letterboxEl, fx.toasts, ui.modals.layer, fx.fadeEl, rotate);

    for (const t of ['fullscreenchange', 'webkitfullscreenchange'])
      document.addEventListener(t, () => { html.classList.toggle('ui-fs', ui.fullscreen.isOn); ev.emit('fullscreenchange', ui.fullscreen.isOn); });

    // Esc closes the top popup/panel first; captured so core's Esc→pause doesn't double-fire.
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const top = ui.modals.top();
      if (top?.onEsc) { e.stopImmediatePropagation(); e.preventDefault(); top.onEsc(); }
      else if (top) { e.stopImmediatePropagation(); }
    }, true);

    root.addEventListener('contextmenu', (e) => { if (ui.isTouch) e.preventDefault(); });
    ui.screen('none');
    return ui;
  },

  screen(name) {
    if (name === 'menu') name = 'title';
    if (name === 'level') name = 'hud';
    current = name;
    for (const [k, s] of Object.entries(screens)) s.el.classList.toggle('on', k === name);
    if (name !== 'hud') { ui.controlsReset(); screens.hud.tutorial.hide(); }
    root.dataset.screen = name;
    return ui;
  },

  menu: { show: (o) => { ui.screen('title'); return screens.title.show(o); } },
  chapter: { show: (o) => { ui.screen('chapter'); return screens.chapter.show(o); } },
  hud: {
    set: (p) => screens.hud.set(p),
    get state() { return screens.hud.state; },
    show: () => ui.screen('hud'),
  },
  get tutorial() { return screens.hud.tutorial; },

  say: (o) => ui.talk.say(o),
  toast: (text, o) => ui._fx.toast(text, o),
  letterbox: (on, o) => ui._fx.letterbox(on, o),
  skip: { show: (on) => ui._fx.skip.show(on) },
  fade: (toBlack, dur) => ui._fx.fade(toBlack, dur),
  popup: (o) => popup(ui, o),
  confirm: (text, { title = 'Are you sure?', yes = 'Yes', no = 'No' } = {}) =>
    popup(ui, { title, text, buttons: [{ label: no, value: false, style: 'cream' }, { label: yes, value: true, style: 'primary' }], cancelValue: false }),
  complete: { show: (o) => showComplete(ui, o) },
  chapterComplete: { show: (o) => showChapterComplete(ui, o) },

  controlsReset() {
    ui.controls.move.x = 0; ui.controls.move.y = 0; ui.controls.jumpHeld = false;
    ui.controls._look.dx = 0; ui.controls._look.dy = 0;
    screens.hud?.touch.reset();
  },
  icons: I,
};

function iosHelp() {
  const iphone = /iPhone|iPod/.test(navigator.userAgent);
  return popup(ui, {
    title: 'Fullscreen tip', icon: I.fullscreen(),
    text: iphone
      ? 'iPhone browsers can\'t go fullscreen from a button. Tap the Share button, then "Add to Home Screen" — the game will open fullscreen from your home screen!'
      : 'This browser won\'t let the game go fullscreen. Try your browser\'s menu, or "Add to Home Screen".',
    buttons: [{ label: 'Got it!', value: true, style: 'primary' }],
  });
}

function ensureCss() {
  if ([...document.styleSheets].some((s) => s.href && /\/css\/ui\.css/.test(s.href)) || document.querySelector('link[href*="css/ui.css"]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('../../css/ui.css', import.meta.url).href }));
}
function ensureFonts() {
  if (document.querySelector('link[data-ui-font]')) return;
  document.head.append(
    h('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }),
    h('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }),
    h('link', { rel: 'stylesheet', 'data-ui-font': '1', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap' }),
  );
}

if (typeof window !== 'undefined') window.__ui = ui;
export default ui;
