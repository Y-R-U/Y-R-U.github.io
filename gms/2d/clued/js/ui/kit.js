// DOM helpers and the standard question widgets every format can reuse.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(tag, attrs = {}, ...kids) {
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function imgEl(m, { alt = '', cls = '' } = {}) {
  const img = h('img', { src: m.src, alt, class: cls, referrerpolicy: 'no-referrer', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => img.classList.add('broken'), { once: true });
  return img;
}

// A framed picture with a blurred fill behind it, or a play button for audio.
export function mediaBox(media, { alt = '' } = {}) {
  if (!media) return null;
  const img = media.img?.[0];
  const audio = media.audio?.[0];
  if (!img && !audio) return null;
  const fig = h('figure.q-media');
  if (img) {
    fig.style.setProperty('--fill', `url("${img.src.replace(/"/g, '%22')}")`);
    fig.append(imgEl(img, { alt }));
  }
  if (audio) fig.append(audioButton(audio));
  return fig;
}

export function audioButton(a) {
  const el = new Audio();
  el.dataset.clued = '1';
  el.preload = 'auto';
  el.src = a.src;
  const btn = h('button.audio-btn', { type: 'button', 'aria-label': 'Play sound' }, h('span', { html: '▶' }));
  const set = on => { btn.classList.toggle('playing', on); btn.firstChild.innerHTML = on ? '❚❚' : '▶'; };
  btn.addEventListener('click', () => {
    if (el.paused) { try { el.currentTime = a.start || 0; } catch (e) {} el.play().then(() => set(true), () => set(false)); } else { el.pause(); set(false); }
  });
  el.addEventListener('ended', () => set(false));
  btn._audio = el;
  return btn;
}

// Standard question layout: media (left in landscape) + prompt + answers. Returns the slots.
export function layout(el, { prompt, media, compact = false, big = false } = {}) {
  el.innerHTML = '';
  const m = mediaBox(media, { alt: '' });
  const wrap = h('div.q', { class: m ? 'has-media' : 'no-media' });
  const body = h('div.q-body');
  const promptEl = h('h2.q-prompt', { class: big && !m ? 'big' : '' }, prompt || '');
  const answersEl = h('div.q-answers', { class: compact ? 'compact' : '' });
  if (m) wrap.append(m);
  body.append(promptEl, answersEl);
  wrap.append(body);
  el.append(wrap);
  return { wrap, mediaEl: m, promptEl, answersEl, bodyEl: body };
}

const keyHandlers = new Set();
let keyBound = false;
function bindKeys() {
  if (keyBound) return;
  keyBound = true;
  document.addEventListener('keydown', e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    for (const fn of [...keyHandlers].reverse()) if (fn(e) === true) { e.preventDefault(); return; }
  });
}
export function onKey(fn) { bindKeys(); keyHandlers.add(fn); return () => keyHandlers.delete(fn); }

// options: [{ text, img?, cls?, icon? }]. onPick(index). Keys 1–6 pick.
export function choiceGrid(el, options, { images = false, tf = false, onPick, keys = true } = {}) {
  const grid = h('div.choices', { class: [images ? 'images' : '', tf ? 'tf' : '', `n${options.length}`].join(' ') });
  let locked = false;
  const buttons = options.map((o, i) => {
    const b = h('button.choice', { type: 'button', class: o.cls || '', dataset: { i: String(i) }, style: { '--i': i } },
      h('span.badge', {}, String(i + 1)),
      o.img ? imgEl(o.img, { alt: images ? `Option ${i + 1}` : o.text }) : null,
      o.icon ? h('span.icon', {}, o.icon) : null,
      h('span.label', {}, o.text));
    b.addEventListener('click', () => pick(i));
    grid.append(b);
    return b;
  });
  el.append(grid);
  function pick(i) {
    if (locked || i < 0 || i >= buttons.length || buttons[i].disabled) return;
    buttons[i].classList.add('picked');
    onPick && onPick(i);
  }
  const off = !keys ? () => {} : onKey(e => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= buttons.length && !locked) { pick(n - 1); return true; }
    if (tf && !locked && (e.key === 't' || e.key === 'f')) { pick(e.key === 't' ? 0 : 1); return true; }
  });
  return {
    el: grid, buttons, pick,
    lock() { locked = true; grid.classList.add('locked'); },
    mark(right, picked) {
      grid.classList.add('revealed');
      buttons.forEach((b, i) => {
        b.classList.toggle('right', i === right);
        b.classList.toggle('wrong', i === picked && i !== right);
        b.classList.toggle('dim', i !== right && i !== picked);
      });
    },
    eliminate(right, k, rng = Math.random) {
      const wrong = buttons.map((b, i) => i).filter(i => i !== right && !buttons[i].disabled);
      for (let n = 0; n < k && wrong.length > 1 - (options.length <= 2 ? 1 : 0); n++) {
        const j = wrong.splice(Math.floor(rng() * wrong.length), 1)[0];
        buttons[j].disabled = true;
        buttons[j].classList.add('gone');
      }
    },
    destroy() { off(); },
  };
}

// Typed answer box. onSubmit(text) -> return false to keep the box open (e.g. a wrong guess in a multi-guess format).
export function typeBox(el, { placeholder = 'Type your answer', button = 'Go', onSubmit } = {}) {
  const input = h('input.type-input', { type: 'text', placeholder, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' });
  const go = h('button.btn.primary', { type: 'submit' }, button);
  const form = h('form.type-box', {}, input, go);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    if (onSubmit && onSubmit(v) === false) { input.select(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
  });
  el.append(form);
  setTimeout(() => input.focus({ preventScroll: true }), 60);
  return { el: form, input, lock() { input.disabled = true; go.disabled = true; } };
}

export function fmtNum(n) { return Math.round(n).toLocaleString('en-GB'); }

export function countUp(el, to, ms = 700, reduced = false) {
  if (reduced) { el.textContent = fmtNum(to); return; }
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = fmtNum(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
