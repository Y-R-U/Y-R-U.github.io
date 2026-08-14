// DOM host for the game UI. The host and its stylesheet are created on demand, so nothing exists
// in the document under ?shot= or in the editor.

let host = null;

export function gameHost() {
  if (host) return host;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./game.css', import.meta.url).href;
  document.head.append(link);
  host = document.createElement('div');
  host.id = 'game';
  document.body.append(host);
  document.body.classList.add('playing');
  return host;
}

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const clear = n => { while (n.firstChild) n.firstChild.remove(); return n; };

// A running status line. Non-modal by construction: no dim, no button, no pointer-events, so it
// can never be the thing standing between the player and the game. Returns its own dismiss.
export function toast(host, text, { level = '', ms = 4200 } = {}) {
  const n = el('div', `g-toast${level ? ` ${level}` : ''}`);
  n.append(el('span', null, text));
  host.append(n);
  requestAnimationFrame(() => n.classList.add('in'));
  let timer = ms ? setTimeout(() => dismiss(), ms) : 0;
  function dismiss() {
    clearTimeout(timer);
    timer = 0;
    n.classList.remove('in');
    setTimeout(() => n.remove(), 400);
  }
  return { el: n, dismiss };
}

// The opening beat: `beats` is a list of { who, text } shown one at a time in the same bottom
// band as the dialogue bubble, over a world that keeps running. Tap advances, waiting advances,
// and `onDone` fires once at the end however it got there.
export function openingBeat(host, beats = [], { hold = 6500, onDone = () => {} } = {}) {
  if (!beats.length) { onDone(); return { skip: () => {} }; }
  const n = el('div', 'g-open');
  let i = 0, timer = 0, live = true;

  const draw = () => {
    clear(n);
    const b = beats[i];
    if (b.who) n.append(el('b', null, b.who));
    const p = el('p', null, b.text);
    p.append(el('i', null, i === beats.length - 1 ? ' ✕' : ' ▸'));
    n.append(p);
  };

  const step = () => {
    clearTimeout(timer);
    if (++i >= beats.length) return skip();
    draw();
    timer = setTimeout(step, hold);
  };

  function skip() {
    if (!live) return;
    live = false;
    clearTimeout(timer);
    n.classList.remove('in');
    setTimeout(() => n.remove(), 500);
    onDone();
  }

  n.onclick = step;
  draw();
  host.append(n);
  requestAnimationFrame(() => n.classList.add('in'));
  timer = setTimeout(step, hold);
  return { el: n, skip };
}
