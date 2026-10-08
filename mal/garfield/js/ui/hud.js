import { h, pressable } from './util.js';
import * as I from './icons.js';
import { createTouch } from './touch.js';

const KEYS_HINT = [
  [['W', 'A', 'S', 'D'], 'Move'], [['Space'], 'Jump'], [['J'], 'Scratch'], [['E'], 'Interact'], [['Esc'], 'Pause'],
];
export const keycaps = (keys) => keys.map((k) => h('kbd.key' + (k.length > 2 ? '.wide' : ''), {}, k));

export function createHud(ui) {
  const objList = h('ul.obj-list');
  const objBox = h('div.obj-box', {}, objList);
  const bellyIco = h('div.belly-ico', { html: I.belly() });
  const bellyBox = h('div.belly-box', { title: 'Belly' }, bellyIco, h('span.belly-label', {}, 'Belly'));
  const chaseNum = h('span.chase-num', {}, '10');
  const chaseBox = h('div.chase-box', {}, h('span.chase-ico', { html: I.clock() }), h('span.chase-txt', {}, 'Run!'), chaseNum);
  const pauseBtn = pressable(h('button.round-btn.btn-pause', { 'aria-label': 'Pause', html: I.pause() }), () => { ui.emit('sfx', 'click'); ui.pause.open(); });

  const promptLbl = h('span.prompt-label', {}, 'Eat!');
  const prompt = h('div.key-prompt', {}, h('kbd.key', {}, 'E'), h('span.prompt-or', {}, '/'), h('kbd.key.wide', {}, 'Space'), promptLbl);
  prompt.addEventListener('click', () => ui.emit('interact'));
  const hintBar = h('div.key-hints', {}, KEYS_HINT.map(([k, t]) => h('span.hint', {}, keycaps(k), h('span', {}, t))));

  const tutText = h('div.tut-text');
  const tutKeys = h('div.tut-keys');
  const tutIco = h('div.tut-ico');
  const tut = h('div.tut-card', {}, tutIco, h('div.tut-body', {}, tutText, tutKeys));

  const fpTag = h('div.fp-tag.obj-box', {}, 'Free Play');
  const scoreG = h('b.gar', {}, '0'), scoreO = h('b.odie', {}, '0'), scoreTo = h('span.to', {}, 'first to 20');
  const nameG = h('span'), nameO = h('span', {}, 'Odie');
  const scoreBox = h('div.arena-score', {}, nameG, scoreG, h('span', {}, '–'), scoreO, nameO, scoreTo);
  const holdRing = h('div.hold-ring');
  const touch = createTouch(ui);
  const el = h('section.ui-screen.scr-hud', {},
    touch.el,
    h('div.hud-tl', {}, bellyBox, objBox, fpTag),
    chaseBox, pauseBtn, prompt, hintBar, tut, scoreBox, holdRing,
  );

  const state = { objectives: [], belly: 0.25, interactLabel: null, interactHint: false, chaseTimer: null, hints: true };
  let objKey = '';

  function set(p = {}) {
    Object.assign(state, p);
    if ('objectives' in p) {
      const key = JSON.stringify(state.objectives || []);
      if (key !== objKey) {
        const prev = objKey ? JSON.parse(objKey) : [];
        objKey = key;
        objList.innerHTML = '';
        (state.objectives || []).forEach((o, i) => {
          const li = h('li.obj' + (o.done ? '.done' : ''), {}, h('span.obj-box-tick', { html: o.done ? I.check() : '' }), h('span.obj-text', {}, ui.names.fill(o.text)));
          if (o.done && prev[i] && !prev[i].done) { li.classList.add('just-done'); ui.emit('sfx', 'pop'); }
          objList.append(li);
        });
        objBox.classList.toggle('empty', !(state.objectives || []).length);
      }
    }
    if ('belly' in p) {
      const t = Math.max(0, Math.min(1, +state.belly || 0));
      bellyIco.style.setProperty('--belly', t);
      const lvl = bellyIco.querySelector('.belly-lvl');
      if (lvl) lvl.style.transform = `translateY(${(59 - t * 50).toFixed(1)}px)`;
      if (p.belly > (state._lastBelly ?? 1)) { bellyBox.classList.remove('gulp'); void bellyBox.offsetWidth; bellyBox.classList.add('gulp'); }
      state._lastBelly = p.belly;
    }
    if ('interactLabel' in p || 'interactHint' in p) {
      // interactHint: a "not yet" message (e.g. "Scratch his face first!"), shown as a muted pill, never as a button
      const L = state.interactLabel, hint = !!(L && state.interactHint);
      touch.setInteract(hint ? null : L);
      if (L) promptLbl.textContent = L;
      prompt.classList.toggle('hint', hint);
      prompt.classList.toggle('show', !!L);
    }
    if ('chaseTimer' in p) {
      const c = state.chaseTimer;
      chaseBox.classList.toggle('show', c != null && c > 0);
      if (c != null) {
        const s = Math.ceil(c);
        if (chaseNum.textContent !== String(s)) { chaseNum.textContent = String(s); chaseBox.classList.remove('tick'); void chaseBox.offsetWidth; chaseBox.classList.add('tick'); }
      }
    }
    if ('hints' in p) hintBar.classList.toggle('show', !!state.hints);
    if ('freePlay' in p) { fpTag.style.display = state.freePlay ? '' : 'none'; if (state.freePlay) fpTag.textContent = state.freePlay; }
    // arenaScore: {g, o, to} | null
    if ('arenaScore' in p) {
      const a = state.arenaScore;
      scoreBox.style.display = a ? '' : 'none';
      el.classList.toggle('arena-on', !!a);
      if (a) {
        nameG.textContent = ui.names.get('garfield');
        for (const [el, v] of [[scoreG, a.g], [scoreO, a.o]]) {
          if (el.textContent !== String(v)) { el.textContent = String(v); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        }
        scoreTo.textContent = 'first to ' + (a.to || 20);
      }
    }
    // hold: {p: 0..1, label} | null — the "hold to glare" ring
    if ('hold' in p) {
      const hd = state.hold;
      holdRing.style.display = hd ? '' : 'none';
      if (hd) { holdRing.style.setProperty('--p', Math.max(0, Math.min(1, hd.p || 0)).toFixed(3)); holdRing.dataset.label = hd.label || 'Hold!'; }
    }
  }

  let tutId = null, tutTimer = 0;
  const tutorial = {
    show({ id = 'tut', text = '', icon = '', keys = null, touch: touchTarget = null, dur = 0 } = {}) {
      tutId = id;
      clearTimeout(tutTimer);
      tutText.textContent = ui.names.fill(text);
      tutIco.innerHTML = icon && icon.startsWith('<') ? icon : (I[icon] ? I[icon]() : icon || '');
      tutIco.classList.toggle('none', !icon);
      tutKeys.innerHTML = '';
      if (keys?.length) tutKeys.append(...keycaps(keys));
      tut.classList.remove('show'); void tut.offsetWidth; tut.classList.add('show');
      for (const b of Object.values(touch.buttons)) b.classList.remove('tut-glow');
      const targets = touchTarget ? [].concat(touchTarget) : [];
      for (const t of targets) touch.buttons[t]?.classList.add('tut-glow');
      if (dur > 0) tutTimer = setTimeout(() => tutorial.hide(id), dur * 1000);
    },
    hide(id) {
      if (id && id !== tutId) return;
      tutId = null;
      tut.classList.remove('show');
      for (const b of Object.values(touch.buttons)) b.classList.remove('tut-glow');
    },
    get current() { return tutId; },
  };

  set({ objectives: [], belly: 0.25, interactLabel: null, chaseTimer: null, hints: true, freePlay: null, arenaScore: null, hold: null });
  return { el, set, state, tutorial, touch };
}
