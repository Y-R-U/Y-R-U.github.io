import { h, createBus, cssUrl, store, RARITY, STAT_LABELS, SLOTS, volumesOf } from './core.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { createFeedback } from './feedback.js';
import { createDialogue } from './dialogue.js';
import { createPanels } from './panels.js';
import { createScreens } from './screens.js';
import { createCombat } from './combat.js';

const CSS = ['ui', 'hud', 'controls', 'combat', 'feedback', 'dialogue', 'panels', 'screens'];
const FONTS = 'https://fonts.googleapis.com/css2?family=Michroma&family=Rajdhani:wght@500;600;700&display=swap';

const bus = createBus();
let root = null, hud, controls, fx, dlg, panels, screens, combat;
let slots = SLOTS;
const pending = { hud: {}, skills: null, voice: null };
// attack glyph per frame kind until the engine calls ui.controls.setAttack itself
const DEFAULT_ATTACK = { rental: 'baton', brawler: 'fist', gunner: 'carbine', ghost: 'blade' };
let attackSet = false;

function addLink(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

function fitScale() {
  if (!root) return;
  const r = Math.min(innerWidth / 915, innerHeight / 412);
  const s = Math.max(.82, Math.min(1.7, r >= 1 ? 1 + (r - 1) * .55 : r));
  root.style.setProperty('--hs', s.toFixed(3));
  // panels / results / death render on a virtual ~960x460 page scaled up on big screens (never down)
  const ps = Math.max(1, Math.min(1.6, innerWidth / 960, innerHeight / 460));
  root.style.setProperty('--ps', ps.toFixed(3));
  restack();
}

function restack() {
  if (!root) return;
  const hs = parseFloat(root.style.getPropertyValue('--hs')) || 1;
  const on = sel => !!root.querySelector(`${sel}.on`);
  let y = on('.hf-boss') ? 62 : 0;
  root.style.setProperty('--y-heat', `${y}px`);
  if (on('.hf-heat')) y += 36 * hs;
  root.style.setProperty('--y-det', `${y}px`);
  if (on('.hf-detstat')) y += 32;
  root.style.setProperty('--y-band', `${y}px`);
  if (on('.hf-band')) y += 56;
  root.style.setProperty('--y-meter', `${y}px`);
  if (on('.hf-meter')) y += 50;
  root.style.setProperty('--y-toast', `${y + 6}px`);
}

let lastVol = '';
function applySettings(s) {
  Object.assign(store.settings, s);
  const vol = volumesOf(store.settings), vk = JSON.stringify(vol);
  if (vk !== lastVol) { lastVol = vk; bus.emit('volumes', vol); }
  store.saveSettings();
  ui.quality(store.settings.quality);
  controls?.setSide(store.settings.joystick);
  bus.emit('settings', { ...store.settings });
}

function onKey(e, down) {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (down && dlg.open && dlg.onKey(e)) return e.preventDefault();
  if (down && e.code === 'Escape') {
    if (fx.closeCard()) return;
    if (panels.current) return panels.close();
    if (!screens.current) { bus.emit('pause'); return; }
  }
  if (panels.current || screens.current || dlg.open) return;
  if (controls.onKey(e, down)) return e.preventDefault();
  if (!down || e.repeat) return;
  const map = { KeyE: 'interact', KeyC: 'contracts', KeyI: 'warehouse', Tab: 'warehouse', KeyO: 'codex', KeyP: 'pause' };
  if (map[e.code]) { e.preventDefault(); bus.emit(map[e.code]); }
}

export const ui = {
  on: bus.on, off: bus.off, emit: bus.emit,

  mount(el = document.body, o = {}) {
    if (root) return ui;
    const { css = true, fonts = true, keys = true, controls: mode = 'auto' } = o;
    if (css) CSS.forEach(n => addLink(cssUrl(n)));
    if (fonts) addLink(FONTS);
    root = h('div.hf-root');
    const desktop = mode === 'desktop' || (mode === 'auto' && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches);
    root.classList.toggle('hf-desktop', desktop);
    hud = createHud(bus);
    controls = createControls(bus);
    dlg = createDialogue(bus, root);
    if (pending.voice) dlg.setVoice(pending.voice);
    fx = createFeedback(bus);
    panels = createPanels(bus, { root, itemCard: (...a) => fx.itemCard(...a), toast: (...a) => fx.toast(...a), applySettings, get slots() { return slots; } });
    screens = createScreens(bus, root);
    combat = createCombat(bus, root);
    screens.openSettings = () => panels.open('settings');
    root.append(hud.el, combat.el, controls.el, dlg.el, panels.el, fx.el, screens.el);
    bus.on('_restack', () => requestAnimationFrame(restack));
    el.append(root);
    ui.hud.minimap = hud.minimap;
    ui.controls.move = controls.move;
    ui.quality(store.settings.quality);
    fitScale();
    addEventListener('resize', fitScale);
    if (keys) {
      addEventListener('keydown', e => onKey(e, true));
      addEventListener('keyup', e => onKey(e, false));
      addEventListener('blur', () => controls.releaseAll());
    }
    if (pending.hud.frame?.kind) controls.setAttack({ icon: DEFAULT_ATTACK[pending.hud.frame.kind] || 'fist' });
    hud.set(pending.hud);
    if (pending.skills) controls.setSkills(pending.skills);
    return ui;
  },

  get root() { return root; },

  theme(name) { root?.classList.toggle('undercity', name === 'undercity'); },
  quality(q) {
    if (!root) return;
    root.classList.remove('hf-q-low', 'hf-q-med', 'hf-q-high');
    root.classList.add(`hf-q-${q || 'high'}`);
  },
  config({ rarities, statLabels, slots: sl } = {}) {
    if (rarities) RARITY.list = rarities.map((r, i) => ({ ...RARITY.list[i], ...(typeof r === 'string' ? { name: r } : r) }));
    if (statLabels) Object.assign(STAT_LABELS, statLabels);
    if (sl) slots = sl;
  },
  hideHud(on) { root?.classList.toggle('hf-hidden-hud', !!on); },

  hud: {
    minimap: null,
    set(p) {
      if (p?.frame?.kind && !attackSet && controls) controls.setAttack({ icon: DEFAULT_ATTACK[p.frame.kind] || 'fist' });
      hud ? hud.set(p) : Object.assign(pending.hud, p);
    },
    heading(rad) { hud?.heading(rad); },
    recenter(on) { hud?.recenter(on); },
    flash(kind) { hud?.flash(kind); },
    badge(evt, n) { hud?.badge(evt, n); },
  },

  controls: {
    move: { x: 0, y: 0 },
    get attackHeld() { return !!controls?.attackHeld; },
    get sneak() { return !!controls?.sneak; },
    setAttack(o) { attackSet = true; controls?.setAttack(o); },
  },

  skills: {
    set(list) { controls ? controls.setSkills(list) : (pending.skills = list); },
    dodge(cd, cdMax) { controls?.setDodge(cd, cdMax); },
    kit(n, o) { controls?.setKit(n, o); },
  },

  toast: (...a) => fx?.toast(...a),
  loot: items => fx?.loot(items),
  damage: (x, y, n, kind) => fx?.damage(x, y, n, kind),
  itemCard: (it, cmp, o) => fx?.itemCard(it, cmp, o),
  marker: {
    set: (...a) => fx?.marker.set(...a),
    hide: () => fx?.marker.hide(),
  },
  interact: {
    show: (label, o) => fx?.interact.show(label, o),
    hide: () => fx?.interact.hide(),
  },

  dialogue: {
    show: o => dlg.show(o),
    setVoice: fn => { pending.voice = fn; dlg?.setVoice(fn); },
    play: lines => dlg.play(lines),
    close: () => dlg.close(),
    get open() { return !!dlg?.open; },
  },

  boss: {
    set: o => combat?.boss.set(o),
    show: o => combat?.boss.set(o),
    hide: () => combat?.boss.hide(),
  },
  detect: {
    set: (id, x, y, amount, o) => combat?.detect.set(id, x, y, amount, o),
    clear: id => combat?.detect.clear(id),
    status: s => combat?.detect.status(s),
  },
  lens: {
    show: o => combat?.lens.show(o),
    hide: () => combat?.lens.hide(),
    target: (sx, sy, size, o) => combat?.lens.target(sx, sy, size, o),
    progress: p => combat?.lens.progress(p),
    count: t => combat?.lens.count(t),
    flash: label => combat?.lens.flash(label),
    get open() { return !!combat?.lens.open; },
  },
  meter: {
    set: o => combat?.meter.set(o),
    hide: () => combat?.meter.hide(),
  },
  band: {
    set: o => combat?.band.set(o),
    hide: () => combat?.band.hide(),
  },
  sting: (title, sub, kind, ms) => combat?.sting(title, sub, kind, ms),

  panel: {
    open: (name, data) => (name === 'results' ? screens.show('complete', data) : panels.open(name, data)),
    update: data => panels.update(data),
    close: () => panels.close(),
    get current() { return panels?.current || null; },
  },

  screen: (name, data) => screens.show(name, data),
  loading: (p, label) => screens.loading(p, label),

  settings: {
    get: () => ({ ...store.settings }),
    volumes: () => volumesOf(store.settings),
    set: s => applySettings(s),
  },

  debug() {
    return {
      screen: screens?.current || null,
      panel: panels?.current || null,
      dialogue: !!dlg?.open,
      move: { ...controls?.move },
      hud: hud?.state,
      settings: { ...store.settings },
      scale: root ? getComputedStyle(root).getPropertyValue('--hs') : null,
    };
  },
};

if (typeof window !== 'undefined') window.__ui = ui;
