import { h, click } from './dom.js';
import { g } from './glyphs.js';
import { settings as S } from './settings.js';
import { fullscreen } from './fullscreen.js';
import { audio } from '../audio/audio.js';

const pct = (v) => Math.round(v * 100) + '%';
const T = (key, label, desc, extra = {}) => ({ type: 'toggle', key, label, desc, ...extra });
const R = (key, label, desc, min, max, step, fmt = pct, extra = {}) => ({ type: 'range', key, label, desc, min, max, step, fmt, ...extra });
const C = (key, label, desc, opts, extra = {}) => ({ type: 'choice', key, label, desc, opts, ...extra });

const TABS = [
  { id: 'audio', icon: 'sound', label: 'Sound', rows: [
    T('muteAll', 'Mute everything', 'Turns all sound off at once.'),
    T('musicOn', 'Music', 'The background songs.'),
    R('music', 'Music volume', null, 0, 1, 0.05, pct, { sub: true, dep: 'musicOn' }),
    T('sfxOn', 'Sound effects', 'Breaking, placing, footsteps, creatures.'),
    R('sfx', 'Effects volume', null, 0, 1, 0.05, pct, { sub: true, dep: 'sfxOn' }),
    T('voiceOn', 'Voice', 'The storyteller in the intro.'),
    R('voice', 'Voice volume', null, 0, 1, 0.05, pct, { sub: true, dep: 'voiceOn' }),
    C('narrator', 'Narrator voice', 'Who tells the story. Tap ▶ to hear them.', [['male', 'Male'], ['female', 'Female']], { preview: true }),
  ] },
  { id: 'video', icon: 'screen', label: 'Video', rows: [
    C('quality', 'Graphics quality', 'Lower it if the game feels slow.', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']]),
    R('renderDistance', 'View distance', 'How far you can see, in chunks. Shorter is faster.', 2, 10, 1, (v) => v + ''),
    R('fov', 'Field of view', 'How wide your view is.', 55, 100, 1, (v) => v + '°'),
    T('fullscreen', 'Full screen', 'Hide the browser bars and fill the screen.', { fs: true }),
    T('showFps', 'Show FPS', 'A small speed counter in the corner.'),
  ] },
  { id: 'controls', icon: 'pad', label: 'Controls', rows: [
    R('sensitivity', 'Look speed', 'How fast the camera turns.', 0.2, 3, 0.05, (v) => v.toFixed(2) + '×'),
    T('invertY', 'Invert look up/down', 'Push up to look down, like a plane.'),
    T('leftHanded', 'Left-handed', 'Swap the move stick and the buttons.'),
    R('uiScale', 'Button and text size', 'Make the buttons and words bigger or smaller.', 0.8, 1.4, 0.05, pct),
    C('view', 'Camera', 'See through your eyes, or from behind you.', [['first', 'First person'], ['third', 'Third person']]),
  ] },
  { id: 'ease', icon: 'sprout', label: 'Easier play', rows: [
    T('guide', 'Growth Journal hints', 'A little goal in the corner that shows what to try next.'),
    T('autoJump', 'Auto-jump', 'Hop up one block by just walking into it.'),
    T('aimAssist', 'Aim help', 'Touch aiming snaps gently onto creatures and blocks.'),
    T('treeFelling', 'Chop a whole tree at once', 'Cut the bottom log and the whole tree comes down.'),
    T('noFallDamage', 'No fall damage', 'Falling from high up never hurts.'),
    T('keepInventory', 'Keep everything', 'Keep your whole backpack when you get knocked out.'),
    T('toolsNeverBreak', 'Tools never break', 'Tools last forever.'),
    T('peaceful', 'Peaceful', 'No creatures will attack you.'),
    T('buildMobs', 'Creatures in Build mode', 'Let creatures roam while you build. Off means a quiet world.'),
    T('alwaysDay', 'Always day', 'The sun never sets.'),
    T('mobGrief', 'Glitchfuse breaks blocks', 'When a glitchfuse bursts, it can knock blocks out. Off is safer for your builds.'),
    T('highContrast', 'High contrast', 'Stronger outlines and darker panels, easier to read.'),
    T('subtitles', 'Subtitles', 'Show the words when someone is speaking.'),
  ] },
];

let open = null;

export function openSettings(root, { tab = 'audio', onClose } = {}) {
  if (open) return open;
  let cur = tab;
  const list = h('div.list');
  const nav = h('nav', {}, TABS.map((t) => h('button', { 'data-t': t.id, onclick: () => { click(); show(t.id); } },
    g(t.icon, 18), t.label)));
  const close = () => {
    click('back');
    el.remove(); open = null; document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  const card = h('div.card.glass', {},
    h('header', {}, h('h2', {}, 'SETTINGS'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('button.sw-btn.small.ghost', { onclick: () => { S.reset(); show(cur); } }, 'Reset'),
        h('button.sw-btn.small.primary', { onclick: close }, 'Done'))),
    nav, list);
  const el = h('div.sw-settings', { onpointerdown: (e) => { if (e.target === el) close(); } }, card);

  function show(id) {
    cur = id;
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
    list.replaceChildren(...TABS.find((t) => t.id === id).rows.map(row));
    list.scrollTop = 0;
    refreshDeps();
  }
  function refreshDeps() {
    list.querySelectorAll('[data-dep]').forEach((r) => r.classList.toggle('dim', !S.get(r.dataset.dep) || S.get('muteAll')));
  }
  function row(d) {
    let ctl;
    if (d.type === 'toggle') {
      const inp = h('input', { type: 'checkbox', checked: !!S.get(d.key) });
      inp.addEventListener('change', () => {
        click();
        if (d.fs) { fullscreen.toggle(inp.checked).then((on) => { inp.checked = on; }); return; }
        S.set(d.key, inp.checked); refreshDeps();
      });
      ctl = h('label.sw-tog', {}, inp, h('i'));
    } else if (d.type === 'range') {
      const val = h('span.val', {}, d.fmt(S.get(d.key)));
      const inp = h('input.sw-range', { type: 'range', min: d.min, max: d.max, step: d.step, value: S.get(d.key) });
      const paint = () => inp.style.setProperty('--p', ((inp.value - d.min) / (d.max - d.min)) * 100 + '%');
      paint();
      inp.addEventListener('input', () => { const v = +inp.value; S.set(d.key, v); val.textContent = d.fmt(v); paint(); });
      inp.addEventListener('change', () => click('tick'));
      ctl = [inp, val];
    } else {
      const seg = h('div.sw-seg', {}, d.opts.map(([v, lb]) => h('button', { class: S.get(d.key) === v ? 'on' : '',
        onclick: (e) => { click(); S.set(d.key, v); seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, lb)));
      ctl = d.preview ? [seg, h('button.sw-icon-btn', { title: 'Play a line', onclick: () => {
        audio.unlock(); audio.vo('i10');
      } }, g('play', 16))] : seg;
    }
    return h('div.sw-set' + (d.sub ? '.sub' : ''), d.dep ? { 'data-dep': d.dep } : {},
      h('div.lb', {}, h('b', {}, d.label), d.desc && h('span', {}, d.desc)), h('div.ctl', {}, ctl));
  }

  document.addEventListener('keydown', onKey, true);
  root.append(el);
  show(cur);
  open = { el, close };
  return open;
}

export const settingsOpen = () => !!open;
export const closeSettings = () => open?.close();
