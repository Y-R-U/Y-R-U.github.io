import { el, btn } from './dom.js?v=20261004a';
import { fmtCash } from '../state/format.js?v=20261004a';

// W6 swipe-to-fling. Mabel holds a drunk at the Gizzard's doors for holdSec; a swipe anywhere on the hero throws
// him (direction picks the target), or tap one of the four target chips. Unflung, Mabel throws him herself.
const SWIPE_MIN = 34, SWIPE_MS = 900;
const DIRS = { left: '⬅', right: '➡', up: '⬆', down: '⬇' };
const JOKE = {
  trough: { t: '💦 SPLOOSH! Into the trough', s: 'splash' },
  dentist: { t: '🦷 A walk-in for Pliers Pete', s: 'thud' },
  jail: { t: '🚓 Wendell caught him… with his face', s: 'thud' },
  pomfrey: { t: '🪟 CRASH! Imported glass, too', s: 'glass' },
  haycart: { t: '🌾 Hay cart. Soft landing', s: 'thud' },
};

export function createFling(hero, heroView, ctx, { canShow, spectacle }) {
  const { game, audio } = ctx;
  const T = game.data.eject?.targets || {};
  const layer = el('div', 'fling');
  layer.hidden = true;
  const grab = el('div', 'fling-grab');
  const ring = el('i', 'fling-ring');
  const who = el('span', 'fling-who', '💪🥴');
  grab.append(ring, who);
  const hint = el('div', 'fling-hint', 'Swipe to fling!');
  layer.append(grab, hint);
  const chips = {};
  for (const [id, t] of Object.entries(T)) {
    const b = btn('fling-t ' + t.dir, '', (e) => { e.stopPropagation(); throwAt(id); }, t.text);
    b.append(el('i', 'ft-a', DIRS[t.dir] || ''), el('span', 'ft-e', t.emoji));
    chips[id] = b;
    layer.appendChild(b);
  }
  hero.appendChild(layer);

  let held = null, start = null, swallow = 0;

  // Spectacle knows where the drunk and the four targets are on screen; otherwise a fixed cross around Mabel.
  let placedAt = 0;
  function place() {
    placedAt = performance.now();
    const W = ctx.geo.viewW, H = ctx.geo.heroH;
    const info = spectacle.fling();
    const a = info || spectacle.anchor('mabel', 'saloon');
    const vis = info ? info.x > 0 && info.x < W && info.y > 0 && info.y < H : a?.visible;
    const x = vis ? Math.max(70, Math.min(W - 70, a.x)) : W / 2;
    const y = vis ? Math.max(100, Math.min(H - 70, a.y)) : H * 0.56;
    layer.style.setProperty('--gx', (x | 0) + 'px');
    layer.style.setProperty('--gy', (y | 0) + 'px');
    layer.classList.toggle('real', !!info && vis);
    for (const [id, b] of Object.entries(chips)) {
      const t = info?.targets?.find((q) => q.id === id);
      if (t && t.visible && vis) {
        let dx = t.x - x, dy = t.y - y;
        const d = Math.hypot(dx, dy) || 1, k = Math.max(1, 80 / d);
        dx = Math.max(26 - x, Math.min(W - 26 - x, dx * k));
        dy = Math.max(70 - y, Math.min(H - 26 - y, dy * k));
        b.style.translate = `${dx | 0}px ${dy | 0}px`;
      } else b.style.translate = '';
    }
  }

  function dirFor(dx, dy) {
    const info = spectacle.fling();
    const W = ctx.geo.viewW, H = ctx.geo.heroH;
    const onScreen = info && info.x > 0 && info.x < W && info.y > 0 && info.y < H;
    const seen = onScreen ? info.targets.filter((t) => t.visible) : [];
    if (seen.length < 2) return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    let best = 'trough', bc = -2;
    const m = Math.hypot(dx, dy) || 1;
    for (const t of seen) {
      const vx = t.x - info.x, vy = t.y - info.y, n = Math.hypot(vx, vy) || 1;
      const c = (vx * dx + vy * dy) / (n * m);
      if (c > bc) { bc = c; best = t.id; }
    }
    return best;
  }

  function open(ev) {
    held = { id: ev.id, kind: ev.kind, until: performance.now() + (ev.holdSec || 2.2) * 1000 };
    place();
    layer.hidden = false;
    layer.style.setProperty('--hold', (ev.holdSec || 2.2) + 's');
    layer.classList.remove('go'); void layer.offsetWidth; layer.classList.add('go');
    hero.classList.add('fling-on');
    ctx.barks.wordless('mabel');
    ctx.coach.show('fling', grab, '👆 Swipe!', { ms: 4000, at: 'below' });
  }

  function close() {
    held = null;
    start = null;
    layer.hidden = true;
    hero.classList.remove('fling-on');
  }

  function throwAt(dir) {
    if (!held) return false;
    const r = game.act('fling', { dir });
    close();
    if (!r.ok) return false;
    swallow = performance.now() + 450;
    ctx.coach.done('fling');
    return true;
  }

  // Listen on the whole hero (capture) so a swipe that starts on a target chip or overlay still counts.
  hero.addEventListener('pointerdown', (e) => {
    if (!held || !e.isPrimary) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  }, true);
  const up = (e) => {
    if (!held || !start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = performance.now() - start.t;
    start = null;
    if (Math.hypot(dx, dy) < SWIPE_MIN || dt > SWIPE_MS) return;
    throwAt(dirFor(dx, dy));
  };
  hero.addEventListener('pointerup', up, true);
  hero.addEventListener('pointercancel', () => { start = null; }, true);
  hero.addEventListener('click', (e) => { if (performance.now() < swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

  game.on('eject', (ev) => { if (canShow()) open(ev); });
  game.on('fling', (out) => {
    if (held && held.id === out.id) close();
    const j = JOKE[out.target] || JOKE.trough;
    if (!canShow()) return;
    audio.sfx.whoosh();
    setTimeout(() => audio.sfx[j.s]?.(), 380);
    if (out.auto) { ctx.barks.wordless('mabel'); return; }
    const W = ctx.geo.viewW, H = ctx.geo.heroH;
    const parts = [j.t];
    if (out.cash > 0) parts.push('+' + fmtCash(out.cash));
    if (out.teeth) parts.push('+🦷' + out.teeth);
    ctx.juice.float(hero, W / 2, H * 0.42, 0, { label: parts.join(' · '), cls: 'gold joke' });
    ctx.buzz(18);
  });

  return {
    get held() { return held; },
    frame(now) {
      if (!held) return;
      if (now > held.until + 400) { close(); return; }
      if (now - placedAt > 33) place();
    },
    close,
    throwAt,
  };
}
