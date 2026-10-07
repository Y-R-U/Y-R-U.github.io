// Favourite picks UI: one-tap quick picks (filled slots) and the ♥ + 1–5 save control. Logic in favmodel.js.
import { h } from './kit.js?v=202610071324';
import { sfx, haptic } from './fx.js?v=202610071324';
import { toast } from './popup.js?v=202610071324';
import { getFavs, setFav, clearFav, FAV_SLOTS } from '../core/store.js?v=202610071324';
import { cleanFav, sameFav, favLabel } from './favmodel.js?v=202610071324';

const CSS = `
.fav-quick { display: flex; align-items: flex-start; gap: 10px; margin: 10px 0 14px; padding: 10px 12px; background: #ffe1e1; border: var(--line) solid var(--ink); border-radius: var(--r); box-shadow: var(--shadow-sm); }
.fav-quick .fq-head { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 4px; width: 46px; }
.fav-quick .fq-head b { font-size: 26px; line-height: 1; color: var(--coral); -webkit-text-stroke: 1.5px var(--ink); paint-order: stroke fill; }
.fav-quick .fq-head small { font-size: 10.5px; font-weight: 900; color: var(--ink-2); text-transform: uppercase; letter-spacing: .4px; }
.fq-list { flex: 1; display: flex; gap: 6px; min-width: 0; }
.fq { flex: 1 1 0; min-width: 0; max-width: 132px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: 0; padding: 2px 0; }
.fq .fq-n, .fs-slot { width: 46px; height: 46px; border-radius: 50%; border: var(--line) solid var(--ink); box-shadow: var(--shadow-sm); display: grid; place-items: center; font-family: var(--font-display); font-size: 22px; line-height: 1; transition: transform .08s, box-shadow .08s, background .12s; }
.fq .fq-n { background: var(--coral); color: #fff; -webkit-text-stroke: 1px var(--ink); paint-order: stroke fill; }
.fq:active .fq-n, .fs-slot:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ink); }
.fq .fq-t { font-size: 11.5px; font-weight: 800; line-height: 1.2; text-align: center; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.fq.match .fq-n { box-shadow: 0 0 0 4px var(--mint), var(--shadow-sm); }
.fq.flash .fq-n { animation: fav-pop .45s cubic-bezier(.2, 1.6, .4, 1); }
.fav-save { margin-top: 14px; padding: 12px 14px; display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'heart slots' 'cap cap'; align-items: center; column-gap: 10px; }
.fs-heart { grid-area: heart; } .fs-slots { grid-area: slots; } .fs-cap { grid-area: cap; }
.fs-heart { flex: none; width: 50px; height: 50px; border-radius: 16px; border: var(--line) solid var(--ink); background: #fff; box-shadow: var(--shadow-sm); font-size: 26px; line-height: 1; color: var(--coral); display: grid; place-items: center; padding: 0; transition: transform .08s, box-shadow .08s, background .12s; }
.fs-heart:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ink); }
.fs-heart.on { background: var(--coral); color: #fff; }
.fs-heart.flash { animation: fav-pop .5s cubic-bezier(.2, 1.6, .4, 1); }
.fs-slots { display: flex; justify-content: space-between; gap: 4px; min-width: 0; padding: 4px 0; }
.fs-wrap { position: relative; flex: none; }
.fs-slot { background: #fff; color: var(--ink-3); border-style: dashed; padding: 0; font-size: 20px; }
.fs-slot.filled { background: var(--coral); color: #fff; border-style: solid; -webkit-text-stroke: 1px var(--ink); paint-order: stroke fill; }
.fs-slot.match { box-shadow: 0 0 0 4px var(--mint), var(--shadow-sm); }
.fs-slot.armed { background: var(--sun); color: var(--ink); -webkit-text-stroke: 0; animation: fav-wob .5s ease-in-out infinite; }
.fs-slot.flash { animation: fav-pop .45s cubic-bezier(.2, 1.6, .4, 1); }
.fs-x { position: absolute; top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--ink); background: #fff; color: var(--ink); font-size: 13px; font-weight: 900; line-height: 1; padding: 0; display: grid; place-items: center; }
.fs-x::before { content: ''; position: absolute; inset: -8px; }
.fs-cap { margin: 10px 2px 0; font-size: 13.5px; line-height: 1.35; color: var(--ink-2); min-height: 1.35em; }
.fs-cap b { color: var(--ink); }
.fs-cap .btn { min-height: 32px; padding: 2px 12px; font-size: 14px; margin-left: 8px; vertical-align: middle; }
@keyframes fav-glow { 30% { box-shadow: 0 0 0 5px var(--mint), var(--shadow); } }
.opt-wrap.fav-applied > .panel { animation: fav-glow .7s ease-out; }
@keyframes fav-pop { 40% { transform: scale(1.22); } }
@keyframes fav-wob { 25% { transform: rotate(-8deg); } 75% { transform: rotate(8deg); } }
@media (min-width: 600px) {
  .fs-slots { justify-content: flex-start; gap: 14px; }
  .fav-quick { align-items: center; padding: 8px 12px; }
  .fav-quick .fq-head { width: auto; flex-direction: row; gap: 6px; padding: 0 4px 0 0; }
  .fq-list { flex-wrap: wrap; gap: 8px 16px; }
  .fq { flex: 0 1 auto; max-width: 230px; flex-direction: row; gap: 8px; }
  .fq .fq-n { flex: none; width: 40px; height: 40px; font-size: 19px; }
  .fq .fq-t { text-align: left; font-size: 12.5px; }
}
body.kids-on .fq .fq-n, body.kids-on .fs-slot { width: 58px; height: 58px; font-size: 27px; }
body.kids-on .fs-heart { width: 62px; height: 62px; font-size: 34px; }
body.kids-on .fav-save { grid-template-areas: 'heart cap' 'slots slots'; row-gap: 12px; }
body.kids-on .fs-cap { margin: 0; font-size: 15px; }
body.kids-on .fs-x { width: 28px; height: 28px; font-size: 16px; top: -9px; right: -9px; }
body.kids-on .fav-quick .fq-head b { font-size: 32px; }
body.kids-on .fq .fq-t { font-size: 13px; }
`;
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('fav-css')) return;
  document.head.append(h('style', { id: 'fav-css' }, CSS));
}

const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };

// ctx: { key, fmt, kids, index, snap() -> current picks (shown fields only), apply(cleanedFav) }
export function favControls(ctx) {
  ensureCss();
  const { key, fmt, kids, index } = ctx;
  const mo = { kids };
  let armed = -1, armTimer = 0, msgUntil = 0, pressTimer = 0, longPressed = false;

  const quickList = h('div.fq-list');
  const quick = h('div.fav-quick', { dataset: { fav: 'quick' }, hidden: true },
    h('div.fq-head', {}, h('b', {}, '♥'), h('small', {}, 'Faves')), quickList);
  const heart = h('button.fs-heart', { type: 'button', dataset: { fav: 'heart' }, 'aria-label': 'Save these picks to favourite 1', title: 'Save these picks to favourite 1' }, '♥');
  const slots = h('div.fs-slots');
  const cap = h('div.fs-cap', { 'aria-live': 'polite' });
  const save = h('div.panel.fav-save', { dataset: { fav: 'save' } }, heart, slots, cap);

  const favs = () => getFavs(key);
  const label = f => favLabel(f, fmt, index, { ...mo, timerDefault: ctx.timerDefault });
  const matchOf = list => { const s = ctx.snap(); return list.map(f => !!f && sameFav(f, s, fmt, index, mo)); };

  function say(nodes, ms = 3200) {
    cap.replaceChildren(...[].concat(nodes));
    msgUntil = ms ? Date.now() + ms : 0;
    if (ms) setTimeout(() => { if (Date.now() >= msgUntil) defaultCap(); }, ms + 20);
  }
  function defaultCap(list = favs(), match = matchOf(list)) {
    if (msgUntil && Date.now() < msgUntil) return;
    msgUntil = 0;
    const m = match.indexOf(true);
    if (m >= 0) cap.replaceChildren('These picks are favourite ', h('b', {}, String(m + 1)), '.');
    else if (!list.some(Boolean)) cap.replaceChildren('Tap ', h('b', {}, '♥'), ' to save these picks. Numbers save more sets.');
    else cap.replaceChildren('Tap ', h('b', {}, '♥'), ' or a number to save these picks.');
  }
  function disarm() { armed = -1; clearTimeout(armTimer); }

  function draw() {
    const list = favs(), match = matchOf(list);
    quickList.replaceChildren();
    list.forEach((f, i) => {
      if (!f) return;
      const lab = label(f);
      quickList.append(h('button.fq', {
        type: 'button', class: match[i] ? 'match' : '', dataset: { slot: String(i + 1) }, title: `Favourite ${i + 1}: ${lab}`,
        'aria-label': `Use favourite ${i + 1}: ${lab}`, onclick: () => use(i),
      }, h('span.fq-n', {}, String(i + 1)), h('span.fq-t', {}, lab)));
    });
    quick.hidden = !list.some(Boolean);
    heart.classList.toggle('on', match.some(Boolean));
    slots.replaceChildren();
    for (let i = 0; i < FAV_SLOTS; i++) {
      const f = list[i];
      const b = h('button.fs-slot', {
        type: 'button', class: [f ? 'filled' : '', match[i] ? 'match' : '', armed === i ? 'armed' : ''].join(' ').trim(),
        dataset: { slot: String(i + 1) }, title: f ? `${i + 1}: ${label(f)} (hold to clear)` : `Save to ${i + 1}`,
        'aria-label': f ? `Favourite ${i + 1}: ${label(f)}. Tap to replace with these picks` : `Save these picks to favourite ${i + 1}`,
      }, armed === i ? '↻' : String(i + 1));
      b.addEventListener('click', () => { if (longPressed) { longPressed = false; return; } store(i); });
      if (f) {
        b.addEventListener('pointerdown', () => { longPressed = false; clearTimeout(pressTimer); pressTimer = setTimeout(() => { longPressed = true; clear(i); }, 600); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(pressTimer)));
        b.addEventListener('contextmenu', e => e.preventDefault());
        b.addEventListener('mouseenter', () => { if (!msgUntil || Date.now() >= msgUntil) say([h('b', {}, `${i + 1}:`), ` ${label(f)}`], 0); });
        b.addEventListener('mouseleave', () => { if (!msgUntil) defaultCap(); });
      }
      const wrap = h('span.fs-wrap', {}, b);
      if (f) wrap.append(h('button.fs-x', { type: 'button', dataset: { clear: String(i + 1) }, 'aria-label': `Clear favourite ${i + 1}`, title: 'Clear', onclick: () => clear(i) }, '×'));
      slots.append(wrap);
    }
    defaultCap(list, match);
  }

  function store(i) {
    const list = favs();
    const snap = ctx.snap();
    if (list[i] && sameFav(list[i], snap, fmt, index, mo)) {
      disarm(); draw(); flash(slots.querySelectorAll('.fs-slot')[i]);
      say(['Already saved in ', h('b', {}, String(i + 1)), '.']);
      return;
    }
    const dup = list.findIndex(f => f && sameFav(f, snap, fmt, index, mo));
    if (!list[i] && dup >= 0) {
      disarm(); draw(); flash(slots.querySelectorAll('.fs-slot')[dup]);
      say(['These picks are already in ', h('b', {}, String(dup + 1)), '.']);
      return;
    }
    if (list[i] && armed !== i) {
      disarm(); armed = i;
      armTimer = setTimeout(() => { armed = -1; draw(); }, 4000);
      draw();
      say([`Replace ${i + 1} (`, h('b', {}, label(list[i])), `)? Tap ${i === 0 ? '♥ or 1' : i + 1} again.`], 4000);
      sfx('button');
      return;
    }
    disarm();
    const { packs, ...rest } = snap;
    setFav(key, i, { packs: packs === 'all' ? 'all' : [...packs], ...rest });
    sfx('correct'); haptic('tap');
    draw();
    flash(slots.querySelectorAll('.fs-slot')[i]); flash(heart);
    say(['♥ Saved to ', h('b', {}, String(i + 1)), '.']);
  }

  function clear(i) {
    const prev = favs()[i];
    if (!prev) return;
    disarm();
    clearFav(key, i);
    haptic('tap');
    draw();
    const undo = h('button.btn.small', { type: 'button', dataset: { fav: 'undo' }, onclick: () => { setFav(key, i, prev); msgUntil = 0; draw(); } }, 'Undo');
    say([`Cleared ${i + 1}.`, undo], 5000);
  }

  function use(i) {
    const f = favs()[i];
    const c = cleanFav(f, fmt, index, mo);
    if (!c) return;
    disarm();
    ctx.apply(c);
    sfx('button'); haptic('tap');
    draw();
    const nb = quickList.querySelector(`[data-slot="${i + 1}"]`);
    if (nb) flash(nb);
    toast(c.gone ? `Favourite ${i + 1} loaded · ${c.gone} pack${c.gone === 1 ? ' is' : 's are'} gone` : `Favourite ${i + 1} loaded`, 1600);
  }

  heart.addEventListener('click', () => store(0));
  draw();
  return { quick, save, refresh: () => { disarm(); msgUntil = 0; draw(); } };
}
