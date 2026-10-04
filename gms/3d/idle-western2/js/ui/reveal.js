import { el } from './dom.js?v=20261004h';

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
// scrolls with it and never needs measuring per frame. A hint lives only while its `when` holds (dropped unmarked
// when it stops, so it can come back) and for at most `ms` (then marked seen). Nothing can wait forever: without
// `when` the cap is 20 s. A higher `prio` hint pre-empts the current one, which goes back to the queue.
const CAP_MS = 20000;
export function createCoach({ reveal }) {
  let queue = [];
  let cur = null;
  const tag = el('div', 'coach');
  const live = (h) => !reveal.is('h:' + h.id) && h.target.isConnected && !h.target.closest('[hidden]') && (!h.when || safe(h.when));

  function safe(fn) { try { return !!fn(); } catch { return false; } }
  function detach() {
    cur?.target.classList.remove('coach-pulse');
    tag.remove();
    cur = null;
  }
  function next() {
    detach();
    queue = queue.filter(live);
    if (!queue.length) return;
    let k = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].prio > queue[k].prio) k = i;
    const h = queue.splice(k, 1)[0];
    cur = h;
    cur.t0 = performance.now();
    h.target.classList.add('coach-pulse');
    if (h.text) {
      tag.textContent = h.text;
      tag.className = 'coach ' + h.at;
      h.target.appendChild(tag);
    }
  }

  return {
    show(id, target, text = '', { ms = 9000, at = 'above', when = null, prio = 0 } = {}) {
      if (!target || reveal.is('h:' + id) || queue.some((q) => q.id === id) || cur?.id === id) return;
      const h = { id, target, text, ms: when ? ms : Math.min(ms, CAP_MS), at, when, prio };
      if (!live(h)) return;
      queue.push(h);
      if (!cur) next();
      else if (prio > cur.prio) { const c = cur; detach(); if (live(c)) queue.unshift(c); next(); }
    },
    done(id) {
      if (!reveal.is('h:' + id)) reveal.mark('h:' + id);
      queue = queue.filter((q) => q.id !== id);
      if (cur?.id === id) next();
    },
    drop(id) {
      queue = queue.filter((q) => q.id !== id);
      if (cur?.id === id) next();
    },
    tick() {
      if (!cur) { if (queue.length) next(); return; }
      if (performance.now() - cur.t0 > cur.ms) { reveal.mark('h:' + cur.id); next(); return; }
      if (!live(cur)) next();
    },
    get current() { return cur?.id || null; },
    get queued() { return queue.map((q) => q.id); },
  };
}
