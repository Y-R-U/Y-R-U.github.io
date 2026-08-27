import { h, tap, icon } from './dom.js';
import { createSheet } from './sheet.js';
import { GLYPH } from './icons.js';

/**
 * ALCHEMY's campaign.
 *
 * Ninety-six levels is a list, and a list of ninety-six identical buttons is
 * the thing this file exists not to be. What makes it a campaign rather than a
 * directory is that every screenful answers three questions at once — where am
 * I, what did I earn, and what is still shut — so the five acts are sections
 * with their own progress, not a filter you have to operate.
 *
 * One-handed on a 390x844 phone is the constraint that decides the layout: the
 * grid scrolls, and everything you actually PRESS — the act jumps and Continue
 * — is pinned to the bottom of the sheet where a thumb already rests. Reaching
 * the top of a 96-tile scroller to change act would make the picker a two-hand
 * control in a game that is otherwise played with one.
 *
 * The level table belongs to lane C. Nothing here hardcodes a level, a count or
 * a threshold; the act names are the only copy this lane owns.
 */

const ACT_NAMES = ['First Heat', 'The Slag', 'Deep Kiln', 'Black Glass', 'Cold Fire'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** The five archetypes, coloured so a run of levels reads as a run of one KIND. */
export const ARCH = {
  span:     { name: 'span',     c: '#f2b33d' },
  excavate: { name: 'excavate', c: '#d9603b' },
  crucible: { name: 'crucible', c: '#b189d6' },
  slag:     { name: 'slag',     c: '#8fd07a' },
  quench:   { name: 'quench',   c: '#41e8c4' },
};

let LEVELS = [];
let onLoad = null;

// Lane C ships the level table; the shell must survive it being absent, the way
// the mode sheet survives a mode that has not landed.
import('../modes/alchemy.js')
  .then((m) => {
    const list = (m && m.default && m.default.levels) || (m && m.LEVELS) || [];
    LEVELS = Array.isArray(list) ? list : [];
    if (onLoad) onLoad();
  })
  .catch(() => { LEVELS = []; });


export function levelById(id) { return LEVELS.find((l) => l.id === id) || null; }
export function levelCount() { return LEVELS.length; }

/** m:ss for anything past a minute, one decimal below ten — the same clock the HUD uses. */
export function secs(s) {
  s = Math.max(0, s || 0);
  if (s < 10) return s.toFixed(1) + 's';
  if (s < 60) return s.toFixed(0) + 's';
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
}

/** Three pips. `lit` of them filled — the same object on a tile, a card and a stat. */
export function stars(lit, cls) {
  const els = [];
  for (let i = 0; i < 3; i++) {
    const s = icon(GLYPH.star);
    if (i < lit) s.classList.add('on');
    els.push(s);
  }
  return h('span', { class: cls || 'stars' }, ...els);
}

function starsFor(save, id) {
  return (save && save.starsFor) ? save.starsFor(id) : 0;
}

export function createLevelPicker(playLevel) {
  const sheet = createSheet('ALCHEMY', 'the campaign');
  sheet.panel.classList.add('sheet--lv');

  // What the corner dot on a tile means. Five kinds of problem is worth knowing
  // before you press one, and an unexplained colour is decoration.
  sheet.panel.insertBefore(
    h('div', { class: 'lv-legend' }, ...Object.keys(ARCH).map((k) => {
      const key = h('span', { class: 'lv-key', style: { '--ac': ARCH[k].c } }, h('i'), ARCH[k].name);
      key.style.setProperty('--ac', ARCH[k].c);
      return key;
    })),
    sheet.body);

  const chips = h('div', { class: 'lv-acts' });
  const contLab = h('b', { text: 'lv 1' });
  const cont = tap(
    h('button', { class: 'gb gb--pill gb--primary lv-cont' }, icon(GLYPH.play), 'Continue', contLab),
    () => { const n = nextUp(); if (n) playLevel(n); });
  const note = h('div', { class: 'lv-note', text: '' });
  sheet.panel.append(h('div', { class: 'lv-foot' }, note, chips, cont));

  const sections = [];
  let unlocked = 1, noteT = 0;

  function nextUp() {
    const total = LEVELS.length;
    if (!total) return 0;
    return Math.min(Math.max(1, unlocked), total);
  }

  function say(text) {
    note.textContent = text;
    note.classList.add('is-on');
    clearTimeout(noteT);
    noteT = setTimeout(() => note.classList.remove('is-on'), 2600);
  }

  function tile(lv, save) {
    const st = starsFor(save, lv.id);
    const locked = lv.id > unlocked;
    const a = ARCH[lv.arch] || ARCH.span;
    const el = h('button', {
      class: 'lvt' + (locked ? ' is-locked' : '') + (st > 0 ? ' is-done' : '') +
             (!locked && lv.id === unlocked ? ' is-next' : ''),
      'aria-label': `Level ${lv.id}, ${lv.name}${locked ? ', locked' : ''}`,
      style: { '--ac': a.c },
    },
      h('span', { class: 'lvt-n t-num', text: String(lv.id) }),
      locked ? h('span', { class: 'lvt-lock' }, icon(GLYPH.lock)) : stars(st, 'lvt-stars'));
    el.style.setProperty('--ac', a.c);
    tap(el, () => {
      if (locked) {
        el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
        say(`Clear level ${unlocked} to open this one`);
        return;
      }
      playLevel(lv.id);
    });
    return el;
  }

  function build() {
    const save = window.__game && window.__game.save;
    const total = LEVELS.length;
    unlocked = (save && save.unlockedUpTo) ? save.unlockedUpTo(total) : 1;

    if (!total) {
      sheet.setTitle('ALCHEMY', 'not shipped yet');
      sheet.body.replaceChildren(h('div', { class: 'lv-empty', text: 'The level table has not landed yet.' }));
      chips.replaceChildren();
      cont.disabled = true;
      return;
    }
    cont.disabled = false;

    const byAct = new Map();
    for (const lv of LEVELS) {
      if (!byAct.has(lv.act)) byAct.set(lv.act, []);
      byAct.get(lv.act).push(lv);
    }

    let earned = 0;
    for (const lv of LEVELS) earned += starsFor(save, lv.id);
    sheet.setTitle('ALCHEMY', `${earned} of ${total * 3} stars`);

    sections.length = 0;
    chips.replaceChildren();
    const out = [];

    for (const [act, group] of [...byAct.entries()].sort((a, b) => a[0] - b[0])) {
      const k = act - 1;
      const done = group.filter((l) => starsFor(save, l.id) > 0).length;
      const got = group.reduce((n, l) => n + starsFor(save, l.id), 0);
      const open = group[0].id <= unlocked;
      const here = open && group[group.length - 1].id >= unlocked;

      const bar = h('i');
      const sec = h('section', { class: 'lv-act' + (here ? ' is-here' : '') + (open ? '' : ' is-shut') },
        h('div', { class: 'lv-act-head' },
          h('span', { class: 'lv-act-n', text: 'Act ' + (ROMAN[k] || act) }),
          h('span', { class: 'lv-act-name', text: ACT_NAMES[k] || '' }),
          h('span', { class: 'lv-act-meta' },
            h('b', { class: 't-num', text: String(got) }), icon(GLYPH.star),
            h('span', { class: 't-num', text: '/' + group.length * 3 }))),
        h('div', { class: 'lv-act-bar' }, bar),
        h('div', { class: 'lv-grid' }, ...group.map((lv) => tile(lv, save))));
      bar.style.width = (100 * done / group.length).toFixed(1) + '%';
      sections.push(sec);
      out.push(sec);

      const chip = tap(h('button', {
        class: 'lv-chip' + (here ? ' on' : '') + (open ? '' : ' is-shut'),
        text: ROMAN[k] || String(act),
      }), () => { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      chips.append(chip);
    }

    sheet.body.replaceChildren(...out);
    contLab.textContent = 'lv ' + nextUp();
  }

  onLoad = () => { if (wrap.open) build(); };

  const wrap = {
    el: sheet.el,
    show() {
      build();
      sheet.show();
      // Land on the act you are actually playing, not on act I. Two frames,
      // because the sheet is still sliding up on the first and scrollIntoView
      // inside a transforming element lands short.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const here = sections.find((s) => s.classList.contains('is-here'));
        if (here) here.scrollIntoView({ block: 'start' });
      }));
    },
    hide() { sheet.hide(); },
    get open() { return sheet.open; },
  };
  return wrap;
}
