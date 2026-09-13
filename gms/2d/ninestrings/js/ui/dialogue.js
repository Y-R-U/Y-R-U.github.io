// js/ui/dialogue.js — the two-portrait VN strip that sits either side of a
// stage (DESIGN §7). ~6 lines, tap to advance, and ALWAYS skippable with a
// visible control: a story beat a player cannot get out of is the fastest way
// to make them close the tab.

import { DATA, el, add, clear, btn, tap, screenEl, art, portraitFile, ensureStyles } from './components.js';

// FIXTURE — delete once js/data/story.js is written. Without it this screen
// cannot be looked at at all, which is how VN layout bugs survive to ship.
const FIXTURE_LINES = [
  { who: 'Wick', portrait: 'char_wick', text: 'The bell went at four. Nobody rang it.' },
  { who: 'The Woman at the Gate', portrait: 'char_vane', text: 'They came up the lane in step. The dead do not walk in step.' },
  { who: 'Wick', portrait: 'char_wick', text: 'I saw the threads before I saw the bodies. Thin, and going up.' },
  { who: 'The Woman at the Gate', portrait: 'char_vane', text: 'Then you are the only one who can end it. Nobody else can see what to cut.' },
  { who: 'Wick', portrait: 'char_wick', text: 'And what is holding the other end?' },
  { who: 'The Woman at the Gate', portrait: 'char_vane', text: 'Something that has been listening a very long time. Go.' },
];

/** props: { key, lines, title, onDone() } */
export function dialogue(root, ctx, props = {}) {
  ensureStyles();
  const beat = (props.key && DATA.STORY && DATA.STORY[props.key]) || null;
  const lines = normalise(props.lines || (beat && beat.lines) || FIXTURE_LINES);
  const title = props.title || (beat && beat.title) || '';

  // Two portrait slots, assigned in order of appearance, so a three-speaker
  // beat still reads: the third speaker takes the side they last spoke from.
  const slots = [];
  for (const l of lines) {
    const p = l.portrait || l.who || '';
    if (p && slots.indexOf(p) < 0 && slots.length < 2) slots.push(p);
  }

  const scr = screenEl('ui-vn');
  const vn = el('div', 'vn');
  const artBox = el('div', 'vn__art ui-vn__art');
  // The act plate behind the figures. A strip of pure narration has no
  // portraits at all, so without this the whole screen was two empty
  // silhouettes on black while a perfectly good backdrop sat unused in art/.
  const bg = el('div', 'ui-vn__bg');
  if (beat && beat.art) art(bg, portraitFile(beat.art), 'var(--choir)');
  const figL = el('div', 'ui-vn__fig ui-vn__fig--l');
  const figR = el('div', 'ui-vn__fig ui-vn__fig--r');
  art(figL, portraitFile(slots[0]), 'var(--choir)');
  art(figR, portraitFile(slots[1]), 'var(--thread)');
  add(artBox, bg, figL, figR, el('div', 'ui-vn__floor'));

  const bar = el('div', 'ui-vn__bar');
  const dots = el('div', 'ui-vn__dots');
  add(bar, dots);
  if (title) add(bar, el('span', 'tiny', title));

  const pad = el('div', 'ui-vn__pad');
  const box = el('div', 'vn__box ui-vn__box');
  const who = el('div', 'vn__who');
  const text = el('p', 'vn__text');
  const more = el('span', 'ui-vn__more', '▾');
  add(box, who, text, more);
  add(pad, box);

  const foot = el('div', 'ui-vn__foot');
  const skipBtn = btn('Skip', ctx, () => finish(), { cls: 'btn--ghost btn--small', sound: 'uiBack' });
  const nextBtn = btn('Next', ctx, () => advance(), { cls: 'btn--primary' });
  add(foot, skipBtn, nextBtn);

  add(vn, artBox, bar, pad, foot);
  add(scr, vn);
  root.appendChild(scr);

  for (let i = 0; i < lines.length; i++) add(dots, el('i', 'ui-vn__dot'));

  // Tapping the strip itself advances, which is what a VN reader expects.
  // The buttons stop propagation, so this never double-fires.
  tap(artBox, ctx, () => advance(), null);
  tap(pad, ctx, () => advance(), null);

  const reduced = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = -1, done = false, raf = 0, full = '';

  function paint() {
    const l = lines[i];
    who.textContent = l.who || '';
    full = l.text || '';
    const side = slots.indexOf(l.portrait || l.who || '');
    figL.classList.toggle('is-off', side === 1);
    figR.classList.toggle('is-off', side !== 1);
    for (let k = 0; k < dots.children.length; k++) dots.children[k].classList.toggle('is-on', k <= i);
    nextBtn.lastChild.textContent = i >= lines.length - 1 ? (props.endLabel || 'Begin') : 'Next';
    reveal();
  }

  function reveal() {
    cancelAnimationFrame(raf);
    if (reduced) { text.textContent = full; more.hidden = false; return; }
    const ms = Math.min(700, Math.max(160, full.length * 13));
    const t0 = performance.now();
    more.hidden = true;
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      text.textContent = full.slice(0, Math.ceil(full.length * k));
      if (k < 1) raf = requestAnimationFrame(frame);
      else more.hidden = false;
    };
    raf = requestAnimationFrame(frame);
  }

  function advance() {
    if (done) return;
    if (i >= 0 && text.textContent.length < full.length) { cancelAnimationFrame(raf); text.textContent = full; more.hidden = false; return; }
    if (i >= lines.length - 1) return finish();
    i++;
    paint();
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (props.onDone) props.onDone();
  }

  advance();
  return { destroy() { done = true; cancelAnimationFrame(raf); scr.remove(); } };
}

function normalise(lines) {
  const out = [];
  for (const l of lines || []) {
    if (!l) continue;
    if (typeof l === 'string') out.push({ who: '', portrait: '', text: l });
    else out.push({ who: l.who || '', portrait: l.portrait || '', text: l.text || '' });
  }
  return out.length ? out : FIXTURE_LINES;
}
