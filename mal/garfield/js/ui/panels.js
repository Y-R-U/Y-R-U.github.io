import { h, sleep, pressable } from './util.js';
import * as I from './icons.js';
import { confetti } from './fx.js';
import { sparkleBurst, lockBadge } from './menu.js';

export const btn = (label, cls, onPress, icon) =>
  pressable(h('button.big-btn' + (cls ? '.' + cls : ''), {}, icon ? h('span.btn-ico', { html: icon }) : null, h('span', {}, label)), onPress);

// A modal stack. Each modal is {el, onEsc}; the top one gets Esc.
export function createModals(ui) {
  const layer = h('div.modal-layer');
  const stack = [];
  function open(el, onEsc) {
    const wrap = h('div.modal', {}, h('div.modal-dim'), el);
    layer.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const m = { wrap, el, onEsc };
    stack.push(m);
    layer.classList.add('active');
    return m;
  }
  function close(m) {
    const i = stack.indexOf(m);
    if (i < 0) return;
    stack.splice(i, 1);
    m.wrap.classList.remove('in');
    m.wrap.classList.add('out');
    setTimeout(() => m.wrap.remove(), 220);
    if (!stack.length) layer.classList.remove('active');
  }
  const top = () => stack[stack.length - 1];
  return { layer, open, close, top, get count() { return stack.length; } };
}

export function popup(ui, { title = '', text = '', icon = '', buttons = [{ label: 'OK', value: true, style: 'primary' }], cancelValue = null } = {}) {
  return new Promise((res) => {
    let m;
    const done = (v) => { ui.modals.close(m); res(v); };
    const card = h('div.panel.popup', {},
      icon ? h('div.popup-ico', { html: icon }) : null,
      title ? h('h3.panel-title', {}, title) : null,
      text ? h('p.popup-text', {}, text) : null,
      h('div.popup-btns', {}, buttons.map((b) => btn(b.label, b.style || '', () => { ui.emit('sfx', 'click'); done(b.value); }))),
    );
    m = ui.modals.open(card, () => done(cancelValue));
  });
}

// D25 Arena opponent select: [{id, label, icon, locked, lockedText}] → Promise<id|null>. Locked cards just wobble.
export function opponentSelect(ui, { opponents = [], title = 'Arena', text = 'Pick your opponent. First to 20 wins!' } = {}) {
  return new Promise((res) => {
    let m;
    const done = (v) => { ui.modals.close(m); res(v); };
    const cards = opponents.map((o) => {
      const b = h('button.big-btn.opp-btn' + (o.locked ? '.is-locked' : '.primary'), { 'data-opp': o.id },
        h('span.opp-ico', { html: (o.locked ? I.mystery : I[o.icon] || I.dog)() }),
        h('span.opp-name', {}, o.locked ? (o.lockedText || 'Locked') : o.label));
      if (o.locked) b.append(lockBadge());
      return pressable(b, () => {
        if (o.locked) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); ui.emit('sfx', 'boing'); return; }
        ui.emit('sfx', 'click'); done(o.id);
      });
    });
    const card = h('div.panel.popup.opp-panel', {},
      h('h3.panel-title', {}, title),
      text ? h('p.popup-text', {}, text) : null,
      h('div.opp-row', {}, cards),
      h('div.popup-btns', {}, btn('Back', 'cream', () => { ui.emit('sfx', 'click'); done(null); })),
    );
    m = ui.modals.open(card, () => done(null));
  });
}

export function createPause(ui) {
  let m = null;
  function open() {
    if (m) return;
    ui.controlsReset();
    const card = h('div.panel.pause-panel', {},
      h('h2.panel-title', {}, 'Paused'),
      h('div.pause-btns', {},
        btn('Start Over', 'orange', () => { ui.emit('sfx', 'click'); close(false); ui.emit('restart'); }, I.replay()),
        btn('Exit', 'cream', () => { ui.emit('sfx', 'click'); close(false); ui.emit('exit'); }, I.home()),
        btn('Resume', 'primary', () => { ui.emit('sfx', 'click'); close(); }, I.play()),
      ),
      h('div.pause-small', {},
        pressable(h('button.round-btn', { 'aria-label': 'Settings', html: I.gear() }), () => { ui.emit('sfx', 'click'); ui.settings.open(); }),
        pressable(h('button.round-btn', { 'aria-label': 'Fullscreen', html: I.fullscreen() }), () => { ui.emit('sfx', 'click'); ui.fullscreen.toggle(); }),
      ),
    );
    m = ui.modals.open(card, () => close());
    ui.emit('pause');
  }
  function close(emitResume = true) {
    if (!m) return;
    ui.modals.close(m); m = null;
    if (emitResume) ui.emit('resume');
  }
  return { open, close, toggle: () => (m ? close() : open()), get isOpen() { return !!m; } };
}

function toggle(val, onChange) {
  const el = h('button.toggle', { role: 'switch' }, h('span.toggle-knob'), h('span.toggle-on', {}, 'ON'), h('span.toggle-off', {}, 'OFF'));
  const set = (v) => { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', String(!!v)); };
  set(val);
  pressable(el, () => { const v = !el.classList.contains('on'); set(v); onChange(v); });
  el.set = set;
  return el;
}
function slider(val, min, max, step, onChange) {
  const inp = h('input.slider', { type: 'range', min, max, step, value: val });
  const paint = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%');
  paint();
  inp.addEventListener('input', () => { paint(); onChange(+inp.value); });
  inp.set = (v) => { inp.value = v; paint(); };
  return inp;
}
function segmented(opts, val, onChange) {
  const el = h('div.seg');
  const btns = opts.map(([v, label]) => pressable(h('button.seg-btn', { 'data-v': v }, label), () => { set(v); onChange(v); }));
  const set = (v) => btns.forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  el.append(...btns); set(val); el.set = set;
  return el;
}
const row = (label, ...ctrl) => h('div.set-row', {}, h('label.set-label', {}, label), h('div.set-ctrl', {}, ...ctrl));

export function createSettings(ui) {
  let m = null;
  function open() {
    if (m) return;
    const s = ui.settings.get();
    const change = (patch) => ui.settings.set(patch, true);

    const fsBtn = pressable(h('button.big-btn.fs-big.orange', {}, h('span.btn-ico', { html: I.fullscreen() }), h('span.fs-label', {}, ui.fullscreen.isOn ? 'Exit Fullscreen' : 'Go Fullscreen!')), () => ui.fullscreen.toggle());
    const offFs = ui.on('fullscreenchange', (on) => { fsBtn.querySelector('.fs-label').textContent = on ? 'Exit Fullscreen' : 'Go Fullscreen!'; });

    const nameG = h('input.name-input', { type: 'text', maxlength: 14, value: s.names.garfield, spellcheck: 'false', autocomplete: 'off' });
    const nameJ = h('input.name-input', { type: 'text', maxlength: 14, value: s.names.jon, spellcheck: 'false', autocomplete: 'off' });
    const onName = () => change({ names: { garfield: nameG.value.trim() || 'Garfield', jon: nameJ.value.trim() || 'Jon' } });
    for (const n of [nameG, nameJ]) {
      n.addEventListener('change', onName);
      n.addEventListener('blur', onName);
      n.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') n.blur(); });
      n.addEventListener('keyup', (e) => e.stopPropagation());
    }

    const card = h('div.panel.settings-panel', {},
      h('div.settings-head', {},
        h('h2.panel-title', {}, 'Settings'),
        pressable(h('button.round-btn.btn-close', { 'aria-label': 'Close' }, '✕'), () => { ui.emit('sfx', 'click'); close(); }),
      ),
      h('div.settings-scroll', {},
        h('div.set-col', {},
          h('div.set-card', {}, h('h4', {}, 'Sound'),
            row('Music', toggle(s.musicOn, (v) => change({ musicOn: v })), slider(s.music, 0, 1, 0.05, (v) => change({ music: v }))),
            row('Sound effects', slider(s.sfx, 0, 1, 0.05, (v) => change({ sfx: v }))),
            row('Voices', slider(s.voice, 0, 1, 0.05, (v) => change({ voice: v }))),
            row('Subtitles', toggle(s.subtitles, (v) => change({ subtitles: v }))),
          ),
          h('div.set-card', {}, h('h4', {}, 'Character names'),
            row('Cat', nameG), row('Human', nameJ),
            h('div.set-row.right', {}, pressable(h('button.small-btn', {}, 'Reset names'), () => {
              nameG.value = 'Garfield'; nameJ.value = 'Jon'; onName(); ui.emit('sfx', 'click');
            })),
          ),
        ),
        h('div.set-col', {},
          h('div.set-card.fs-card', {}, fsBtn),
          h('div.set-card', {}, h('h4', {}, 'Game'),
            row('Graphics', segmented([['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], s.quality, (v) => change({ quality: v }))),
            row('Camera speed', slider(s.camSens, 0.3, 2, 0.05, (v) => change({ camSens: v }))),
            row('Invert up/down', toggle(s.invertY, (v) => change({ invertY: v }))),
          ),
          h('div.set-card.set-actions', {},
            btn('Replay intro', 'cream', () => { ui.emit('sfx', 'click'); close(); ui.emit('replayIntro'); }, I.play()),
            btn('Reset progress', 'danger', async () => {
              ui.emit('sfx', 'click');
              const ok = await popup(ui, {
                title: 'Start all over?', icon: I.lock(),
                text: 'This locks every level again and empties the belly. Are you sure?',
                buttons: [{ label: 'Keep my progress', value: false, style: 'primary' }, { label: 'Yes, reset', value: true, style: 'danger' }],
                cancelValue: false,
              });
              if (ok) { ui.emit('resetProgress'); ui.toast('Progress reset'); }
            }, I.replay()),
          ),
        ),
      ),
    );
    m = ui.modals.open(card, () => close());
    m.cleanup = offFs;
    ui.emit('settingsOpen');
  }
  function close() {
    if (!m) return;
    m.cleanup?.();
    ui.modals.close(m); m = null;
    ui.emit('settingsClose');
  }
  return { open, close, get isOpen() { return !!m; } };
}

const LEVEL_CHEERS = ['Yum!', 'Delicious!', 'Burp!', 'Scrumptious!', 'Nom nom nom!', 'Belly full!'];
const MISCHIEF_CHEERS = ['Mischief managed!', 'Sneaky!', 'Too easy!', 'Purrfect!', 'Nailed it!', 'Genius!', 'Ha!', 'Smooth!', 'Cat 1, Dog 0!', 'Legendary!'];
export function showComplete(ui, { level = 1, food = 'steak', nextUnlocked = true, title } = {}) {
  return new Promise((res) => {
    let m, stopConf;
    const done = (v) => { stopConf?.(); ui.modals.close(m); res(v); };
    // Ch2 mischief levels have no food: a smug cat instead of a plate
    const mischief = food === 'none';
    const cheer = (mischief ? MISCHIEF_CHEERS : LEVEL_CHEERS)[(level - 1) % (mischief ? MISCHIEF_CHEERS : LEVEL_CHEERS).length];
    const foodEl = h('div.win-food' + (mischief ? '.win-cat' : ''), { html: mischief ? I.peekCat() : I.food(food) });
    const card = h('div.panel.win-panel', {},
      h('div.win-ribbon', {}, h('span', {}, title || `Level ${level}`)),
      h('h2.win-title', {}, ...'Level Complete!'.split('').map((c, i) => h('span', { style: { animationDelay: (300 + i * 45) + 'ms' } }, c === ' ' ? ' ' : c))),
      foodEl,
      h('div.win-cheer', {}, cheer),
      h('div.win-btns', {},
        nextUnlocked ? btn('Next Level', 'primary.next', () => { ui.emit('sfx', 'click'); done('next'); }, I.play()) : null,
        btn('Replay', 'orange', () => { ui.emit('sfx', 'click'); done('replay'); }, I.replay()),
        btn('Menu', 'cream', () => { ui.emit('sfx', 'click'); done('menu'); }, I.home()),
      ),
    );
    m = ui.modals.open(card, null);
    m.wrap.classList.add('celebrate');
    stopConf = confetti(m.wrap);
    ui.emit('sfx', 'ding');
    setTimeout(() => sparkleBurst(foodEl, 12), 700);
  });
}

export function showChapterComplete(ui, { chapter = 'Chapter One', subtitle = 'Food', cheer, foods = true } = {}) {
  return new Promise((res) => {
    let m, stopConf;
    const done = (v) => { stopConf?.(); ui.modals.close(m); res(v); };
    const card = h('div.panel.win-panel.chapter-win', {},
      h('div.win-ribbon.gold', {}, h('span', {}, 'Chapter Complete!')),
      h('h2.win-title.small', {}, `${chapter}: ${subtitle}`),
      foods ? h('div.win-foods', {}, h('div', { html: I.steak() }), h('div.mid', { html: I.lasagna() }), h('div', { html: I.meatloaf() }))
        : h('div.win-food.win-cat', { html: I.peekCat() }),
      h('p.win-cheer', {}, cheer || `${ui.names.get('garfield')} ate ALL the food. Every last bite.`),
      h('p.win-sub', {}, 'More chapters coming soon!'),
      h('div.win-btns', {},
        btn('Menu', 'primary', () => { ui.emit('sfx', 'click'); done('menu'); }, I.home()),
        btn('Replay', 'orange', () => { ui.emit('sfx', 'click'); done('replay'); }, I.replay()),
      ),
    );
    m = ui.modals.open(card, null);
    m.wrap.classList.add('celebrate');
    stopConf = confetti(m.wrap, { count: 220, dur: 4.5 });
    ui.emit('sfx', 'ding');
  });
}

export { sleep };
