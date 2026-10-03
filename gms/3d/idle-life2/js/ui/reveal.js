import { el } from './dom.js?v=20261004c';

export function createReveal({ game, onReveal }) {
  const seen = new Set();
  for (const k of Object.keys(game.state.hints)) if (game.state.hints[k]) seen.add(k);

  const api = {
    is: (id) => seen.has(id),
    mark(id) {
      if (seen.has(id)) return false;
      seen.add(id);
      game.act('hint', { id });
      return true;
    },
    // cond may be a function so settled reveals cost nothing.
    check(id, cond) {
      if (seen.has('r:' + id)) return true;
      if (!(typeof cond === 'function' ? cond() : cond)) return false;
      api.mark('r:' + id);
      onReveal?.(id);
      return true;
    },
  };
  return api;
}

// One coach hint at a time: a pulse on the target plus at most two words, parented to the target so it
// scrolls with it and never needs measuring per frame.
export function createCoach({ reveal }) {
  const queue = [];
  let cur = null;
  const tag = el('div', 'coach');

  function next() {
    cur?.target.classList.remove('coach-pulse');
    tag.remove();
    cur = null;
    while (queue.length) {
      const h = queue.shift();
      if (reveal.is('h:' + h.id) || !h.target.isConnected) continue;
      cur = h;
      cur.t0 = performance.now();
      h.target.classList.add('coach-pulse');
      if (h.text) {
        tag.textContent = h.text;
        tag.className = 'coach ' + h.at;
        h.target.appendChild(tag);
      }
      return;
    }
  }

  return {
    show(id, target, text = '', { ms = 9000, at = 'above' } = {}) {
      if (!target || reveal.is('h:' + id) || queue.some((q) => q.id === id) || cur?.id === id) return;
      queue.push({ id, target, text, ms, at });
      if (!cur) next();
    },
    done(id) {
      if (!reveal.is('h:' + id)) reveal.mark('h:' + id);
      if (cur?.id === id) next();
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
    tick() {
      if (!cur) return;
      if (!cur.target.isConnected || cur.target.closest('[hidden]')) { next(); return; }
      if (performance.now() - cur.t0 > cur.ms) { reveal.mark('h:' + cur.id); next(); }
    },
    get current() { return cur?.id || null; },
  };
}
