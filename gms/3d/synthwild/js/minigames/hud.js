// Mini-game HUD: top bar (score · objective · timer), big countdown text, toasts, a hint line, results card.
// Same calls as lane 4's stand-in minihud: objective score timer big toast results update dispose (+ hint, add).
import { h, setText, setHtml, setCls, setStyle, toast as domToast } from '../ui/dom.js';
import { g } from '../ui/glyphs.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
export const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export function createMgHud(ctx, root) {
  const score = h('span.sc'), obj = h('span.ob'), time = h('span.tm');
  const top = h('div.mg-top.glass', {}, score, obj, time);
  const hint = h('div.mg-hint');
  const big = h('div.mg-big');
  const wrap = h('div.mg-hud', {}, top, hint, big);
  root.append(wrap);
  let bigT = 0, card = null;
  const paint = () => { setStyle(score, 'display', score._html ? '' : 'none'); setStyle(time, 'display', time._txt ? '' : 'none'); };

  return {
    el: wrap,
    objective(t) { setText(obj, t || ''); },
    score(t) { setHtml(score, t || ''); paint(); },
    timer(s, up = false) {
      setText(time, s == null ? '' : up ? fmtTime(s) : fmt(Math.ceil(s)));
      setCls(time, 'low', !up && s != null && s < 15);
      paint();
    },
    hint(t) { setText(hint, t || ''); setCls(hint, 'on', !!t); },
    big(t, sec = 1.5) { big.innerHTML = t; big.classList.remove('pop'); void big.offsetWidth; big.classList.add('on', 'pop'); bigT = sec; },
    toast(t, sec = 2.2) { domToast(t, { kind: 'info', ms: sec * 1000 }); },
    add(node) { wrap.append(node); return node; },
    update(dt) {
      if (bigT > 0 && (bigT -= dt) <= 0) setCls(big, 'on', false);
    },
    // r: { won, stars, title, text }, info: { best, newBest }, actions: { replay, menu, quit }
    results(r, actions = {}, info = {}) {
      card?.remove();
      ctx.input?.releasePointer?.();
      const n = Math.max(0, Math.min(3, r.stars | 0));
      const stars = h('div.mg-stars', {}, [0, 1, 2].map((i) => h('span', { class: i < n ? 'on' : '', style: { animationDelay: 0.25 + i * 0.22 + 's' } }, '★')));
      const b = info.best;
      card = h('div.mg-results.glass', {},
        h('h2', { class: r.won ? 'won' : '' }, r.title || (r.won ? 'You win!' : 'Nice try!')),
        stars,
        r.text && h('p', {}, r.text),
        info.newBest ? h('div.mg-newbest', {}, 'New personal best!') : b?.label ? h('div.mg-bestline', {}, 'Best: ' + b.label) : null,
        h('div.mg-btns', {},
          h('button.sw-btn.primary', { onclick: () => actions.replay?.() }, g('play', 16), 'Play again'),
          h('button.sw-btn', { onclick: () => actions.menu?.() }, 'Mini-games'),
          h('button.sw-btn.ghost', { onclick: () => actions.quit?.() }, 'Title')));
      wrap.append(card);
      top.style.opacity = '0.4';
    },
    dispose() { wrap.remove(); },
  };
}
