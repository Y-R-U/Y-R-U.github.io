// Guidance layer: skippable step-by-step tours, optional hints, a mascot who talks,
// badges and confetti. Every part of this respects a switch in Settings.
import { el, toast } from './ui.js';
import { settings, flag } from './store.js';
import { sfx } from './sfx.js';
import { bus } from './bus.js';

const BLOCKY = '<svg viewBox="0 0 16 16" width="34" height="34" shape-rendering="crispEdges">' +
  '<rect width="16" height="16" fill="#6cc349"/><rect x="1" y="1" width="14" height="14" fill="#84d95e"/>' +
  '<rect x="3" y="5" width="3" height="3" fill="#12200c"/><rect x="10" y="5" width="3" height="3" fill="#12200c"/>' +
  '<rect x="4" y="6" width="1" height="1" fill="#fff"/><rect x="11" y="6" width="1" height="1" fill="#fff"/>' +
  '<rect x="5" y="10" width="6" height="2" fill="#12200c"/><rect x="6" y="11" width="4" height="1" fill="#c2506a"/></svg>';

// ------------------------------------------------------------------ tours ---
let active = null;

/**
 * tour('model-first-cube', [{el:'#addCube', title:'Add a cube', text:'…'}], {force:true})
 * Steps with el:null are centred "just talk" steps.
 * Returns a Promise that resolves when finished/skipped.
 */
export function tour(id, steps, opts = {}) {
  // opts.tool: only run if that tool is still the one on screen. Tools start their tour after an
  // await or a short delay, and a child who taps twice quickly would otherwise get Paint's
  // spotlight pointing at buttons that belong to Model.
  if (opts.tool && document.body.dataset.tool !== opts.tool) return Promise.resolve(false);
  if (!opts.force) {
    if (!settings.get('popups')) return Promise.resolve(false);
    if (flag.get('tour:' + id)) return Promise.resolve(false);
  }
  if (active) active.end(false);

  let i = 0, resolve;
  const done = new Promise(r => { resolve = r; });

  const back = el('div.tour-back');
  const hole = el('div.tour-hole');
  const bubble = el('div.tour-bubble');
  back.append(hole, bubble);
  document.body.appendChild(back);

  function targetOf(step) {
    if (!step.el) return null;
    const node = typeof step.el === 'string' ? document.querySelector(step.el) : step.el;
    return node && node.isConnected && node.offsetParent !== null ? node : null;
  }

  function render() {
    const step = steps[i];
    if (!step) { api.end(true); return; }
    const node = targetOf(step);
    bubble.innerHTML = '';

    const nav = el('div.tour-nav', {}, [
      el('button.tour-skip', { type: 'button', text: 'Skip', on: { click: () => api.end(false) } }),
      el('span.tour-dots', {}, steps.map((_, n) => el('i' + (n === i ? '.on' : '')))),
      el('button.tour-next', {
        type: 'button', text: i === steps.length - 1 ? 'Got it!' : 'Next →',
        on: { click: () => { sfx.play('click'); i++; render(); } }
      })
    ]);

    bubble.append(
      el('div.tour-top', {}, [
        el('span.tour-face', { html: BLOCKY }),
        el('div', {}, [el('b.tour-title', { text: step.title || '' }), el('p.tour-text', { html: step.text || '' })])
      ]),
      nav
    );

    if (node) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: settings.get('motion') ? 'smooth' : 'auto' });
      setTimeout(() => place(node), settings.get('motion') ? 260 : 0);
    } else {
      hole.style.opacity = '0';
      bubble.style.left = '50%'; bubble.style.top = '50%';
      bubble.style.transform = 'translate(-50%,-50%)';
    }
    sfx.play('pop');
  }

  function place(node) {
    const r = node.getBoundingClientRect();
    const pad = 6;
    hole.style.opacity = '1';
    hole.style.left = (r.left - pad) + 'px';
    hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px';
    hole.style.height = (r.height + pad * 2) + 'px';

    const bw = Math.min(340, window.innerWidth - 24);
    bubble.style.width = bw + 'px';
    bubble.style.transform = 'none';
    const bh = bubble.offsetHeight || 160;
    let top = r.bottom + 14, left = r.left + r.width / 2 - bw / 2;
    if (top + bh > window.innerHeight - 10) top = Math.max(10, r.top - bh - 14);
    left = Math.max(10, Math.min(left, window.innerWidth - bw - 10));
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  const onResize = () => { const n = targetOf(steps[i]); if (n) place(n); };
  window.addEventListener('resize', onResize);

  const api = {
    end(completed) {
      window.removeEventListener('resize', onResize);
      back.remove(); active = null;
      flag.set('tour:' + id, completed ? 'done' : 'skipped');
      resolve(!!completed);
    },
    // Taken off screen by something else (a tool switch). Do NOT record it as seen — the child
    // never got the chance to read it, so it should come back next time they open that tool.
    dismiss() {
      window.removeEventListener('resize', onResize);
      back.remove(); active = null;
      resolve(false);
    },
    id
  };
  active = api;
  render();
  return done;
}

/** Close whatever tour is on screen without marking it seen. Used when the tool changes under it. */
export function dismissTour() { if (active) active.dismiss(); }

export function tourSeen(id) { return !!flag.get('tour:' + id); }
export function resetTours() {
  for (const k of Object.keys(flag.all())) if (k.startsWith('tour:')) flag.del(k);
  toast('Guide popups reset — they will show again.', 'good');
}

// ------------------------------------------------------------------ hints ---
let hintBubble = null;

export function showHint(node, text) {
  hideHint();
  hintBubble = el('div.hint-bubble', { text });
  document.body.appendChild(hintBubble);
  const r = node.getBoundingClientRect();
  const w = hintBubble.offsetWidth, h = hintBubble.offsetHeight;
  let left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
  let top = r.top - h - 10;
  if (top < 8) top = r.bottom + 10;
  hintBubble.style.left = left + 'px';
  hintBubble.style.top = top + 'px';
  requestAnimationFrame(() => hintBubble && hintBubble.classList.add('in'));
}
export function hideHint() { if (hintBubble) { hintBubble.remove(); hintBubble = null; } }

// Global delegation: anything with data-hint gets a bubble on hover / long-press.
let hintTimer = null;
document.addEventListener('mouseover', e => {
  if (!settings.get('hints')) return;
  const t = e.target && e.target.closest && e.target.closest('[data-hint]');
  if (!t) return;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => showHint(t, t.dataset.hint), 380);
});
document.addEventListener('mouseout', e => { if (e.target && e.target.closest && e.target.closest('[data-hint]')) { clearTimeout(hintTimer); hideHint(); } });
document.addEventListener('touchstart', e => {
  if (!settings.get('hints')) return;
  const t = e.target && e.target.closest && e.target.closest('[data-hint]');
  if (!t) return;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => showHint(t, t.dataset.hint), 550);
}, { passive: true });
document.addEventListener('touchend', () => { clearTimeout(hintTimer); setTimeout(hideHint, 1800); }, { passive: true });
window.addEventListener('scroll', hideHint, true);

// ----------------------------------------------------------------- mascot ---
let sayBox = null, sayTimer = null;

/** say('Nice cube!', {ms:4000, actions:[{label,onClick}]}) — respects the popups switch. */
export function say(text, opts = {}) {
  if (!settings.get('popups') && !opts.force) return;
  clearTimeout(sayTimer);
  if (sayBox) sayBox.remove();
  sayBox = el('div.blocky-say', {}, [
    el('span.blocky-face', { html: BLOCKY }),
    el('div.blocky-text', { html: text }),
    el('button.blocky-x', { type: 'button', text: '✕', on: { click: hush } }),
    opts.actions ? el('div.blocky-actions', {}, opts.actions.map(a =>
      el('button.blocky-act', { type: 'button', text: a.label, on: { click: () => { hush(); a.onClick(); } } }))) : null
  ]);
  document.body.appendChild(sayBox);
  requestAnimationFrame(() => sayBox && sayBox.classList.add('in'));
  sfx.play('pop');
  if (opts.ms !== 0) sayTimer = setTimeout(hush, opts.ms || 6000);
}
export function hush() { clearTimeout(sayTimer); if (sayBox) { sayBox.classList.remove('in'); const s = sayBox; setTimeout(() => s.remove(), 250); sayBox = null; } }

// ----------------------------------------------------------------- badges ---
export const BADGES = {
  'first-project': { icon: '📦', title: 'Pack Starter', desc: 'You made your first add-on project.' },
  'first-texture': { icon: '🎨', title: 'Pixel Painter', desc: 'You painted a texture.' },
  'first-model':   { icon: '🧱', title: 'Model Maker', desc: 'You built a 3D model.' },
  'first-anim':    { icon: '🤸', title: 'Animator', desc: 'You made something move.' },
  'first-mob':     { icon: '👾', title: 'Mob Creator', desc: 'You created a custom mob.' },
  'first-item':    { icon: '🗡️', title: 'Item Smith', desc: 'You created a custom item.' },
  'first-block':   { icon: '🟫', title: 'Block Builder', desc: 'You created a custom block.' },
  'first-test':    { icon: '🎮', title: 'Test Pilot', desc: 'You tested your add-on in the world.' },
  'first-export':  { icon: '🚀', title: 'Shipped It', desc: 'You exported a real .mcaddon file.' },
  'clean-pack':    { icon: '✅', title: 'Zero Problems', desc: 'Your whole pack passed the checker.' }
};

export function award(id) {
  const got = flag.get('badges', []);
  if (got.includes(id)) return false;
  const b = BADGES[id]; if (!b) return false;
  flag.set('badges', [...got, id]);
  celebrate();
  sfx.play('win');
  const card = el('div.badge-pop', {}, [
    el('span.badge-icon', { text: b.icon }),
    el('div', {}, [el('b', { text: 'Badge unlocked: ' + b.title }), el('small', { text: b.desc })])
  ]);
  document.body.appendChild(card);
  requestAnimationFrame(() => card.classList.add('in'));
  setTimeout(() => { card.classList.remove('in'); setTimeout(() => card.remove(), 400); }, 4200);
  bus.emit('badge', { id });
  return true;
}
export function badgesEarned() { return flag.get('badges', []); }

// --------------------------------------------------------------- confetti ---
export function celebrate(n = 90) {
  if (!settings.get('motion')) return;
  const wrap = el('div.confetti');
  document.body.appendChild(wrap);
  const colors = ['#6cc349', '#ffc83c', '#7ca8ff', '#ff4a3c', '#ff8ad8', '#fff'];
  for (let i = 0; i < n; i++) {
    const p = el('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[(Math.random() * colors.length) | 0];
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    wrap.appendChild(p);
  }
  setTimeout(() => wrap.remove(), 3600);
}
