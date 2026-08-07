// The cold open, which plays itself. Owns #verdict and nothing else.
//
// Tapping is an accelerator, never a requirement: the whole thing runs to the end on its own, a
// tap jumps to the next beat, and Skip cuts to the last framing. There is no Next button.

import content from '../sim/content.js';
import { esc } from './format.js';

let root = null;
let timer = 0;
let step = null;
let playing = false;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const verdict = {
  get playing() { return playing; },

  play({ camera = null, onBeat = null } = {}) {
    if (playing) return Promise.resolve({ skipped: false });
    playing = true;
    ensureRoot();
    const beats = content.verdict.beats;
    const total = beats.reduce((n, b) => n + b.ms, 0);

    return new Promise(resolve => {
      let i = -1;
      let elapsed = 0;

      const finish = skipped => {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        step = null;
        const last = beats[beats.length - 1].shot;
        if (skipped && camera) camera.moveTo({ ...last, ms: 900, ease: 'inout' });
        root.classList.remove('in');
        setTimeout(() => { root.innerHTML = ''; root.classList.remove('live'); }, 420);
        resolve({ skipped });
      };

      const advance = () => {
        clearTimeout(timer);
        if (i >= 0) elapsed += beats[i].ms;
        i++;
        if (i >= beats.length) return finish(false);
        const b = beats[i];
        paint(b, elapsed / total, i === beats.length - 1);
        if (camera && b.shot) {
          const ms = reduced() ? 0 : b.shot.ms;
          camera.moveTo({ pos: b.shot.pos, look: b.shot.look, fov: b.shot.fov, ms, ease: 'inout' });
        }
        onBeat?.(b, i);
        timer = setTimeout(advance, reduced() ? Math.min(b.ms, 1400) : b.ms);
      };

      step = advance;
      root.classList.add('live');
      requestAnimationFrame(() => root.classList.add('in'));
      root.onclick = e => {
        if (e.target.closest('[data-v="skip"]')) return finish(true);
        advance();
      };
      advance();
    });
  },

  stop() { if (playing) { playing = false; clearTimeout(timer); root && (root.innerHTML = ''); } },
};

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('verdict');
  if (!root) {
    root = document.createElement('div');
    root.id = 'verdict';
    document.body.appendChild(root);
  }
  root.addEventListener('pointerdown', e => e.stopPropagation());
  return root;
}

function paint(b, progress, last) {
  const body = {
    seal: () => `
      <div class="v-seal">
        <div class="v-mark" aria-hidden="true"><i></i><i></i><i></i></div>
        <i class="v-over">${esc(b.over)}</i>
        <h1>${esc(b.text)}</h1>
      </div>`,
    record: () => `
      <div class="v-record${b.weight ? ' weight' : ''}">
        <i class="v-over">${esc(b.over)}</i>
        <p>${esc(b.text)}</p>
      </div>`,
    stamp: () => `
      <div class="v-stamp">
        <b>${esc(b.text)}</b>
        <s>${esc(b.sub || '')}</s>
      </div>`,
    sentence: () => `
      <div class="v-sentence">
        <i class="v-over">${esc(b.over)}</i>
        <p>${esc(b.text)}</p>
      </div>`,
    land: () => `<div class="v-land"><p>${esc(b.text)}</p></div>`,
  }[b.kind];

  root.innerHTML = `
    <div class="v-bar"><span style="width:${(progress * 100).toFixed(1)}%"></span></div>
    <div class="v-stage" key="${esc(b.id)}">${body()}</div>
    ${last ? '' : '<button class="v-skip" data-v="skip">Skip</button>'}`;
  const stage = root.querySelector('.v-stage');
  requestAnimationFrame(() => stage.classList.add('in'));
}

export default verdict;
