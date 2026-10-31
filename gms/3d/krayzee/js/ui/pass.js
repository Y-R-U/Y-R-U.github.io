// br8t Pass cards (D36, docs/ACCESS.md): an inline, royal-toned card, never a modal. Two skins: 'paper' (the story
// picker's parchment) and 'navy' (the online lobby). The story picker gets its locked rows from decoratePicker().
import { access, missionNeedsPass } from '../game/access.js';
import { ACCESS } from '../../data/access.js';
import { openAccountPanel } from './account.js';

const CSS_URL = new URL('../../css/pass.css', import.meta.url).href;
export function ensurePassCss() {
  if (typeof document === 'undefined' || document.querySelector('link[data-kzp]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_URL; l.dataset.kzp = '1';
  document.head.appendChild(l);
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 38 L2 10 L18 22 L32 4 L46 22 L62 10 L58 38 Z" fill="currentColor"/></svg>';

const COPY = {
  mission: {
    k: 'By Royal Decree',
    h: 'The Crown requires a br8t Pass',
    p: `Mission ${ACCESS.freeMissions + 1} onwards takes you across the kingdom: the farm, the airbase, the Palace Lawn and the coronation. The intro, Missions 1–${ACCESS.freeMissions}, Free Flight and every airport stay free, forever.`,
  },
  online: {
    k: 'By Royal Decree',
    h: "That's today's free sorties flown",
    p: `Every royal gets ${ACCESS.onlinePerDay} online games a day. A br8t Pass lifts the limit for good, and Missions ${ACCESS.freeMissions + 1}+ come with it. Free Flight and the story's first chapter stay free.`,
  },
};

// { reason: 'mission'|'online', skin: 'paper'|'navy', onBack?, backLabel? } → { el, update(), destroy() }
export function passCard({ reason = 'mission', skin = 'paper', onBack = null, backLabel = 'Not now' } = {}) {
  ensurePassCss();
  const A = access();
  const el = document.createElement('div');
  el.className = `kzp kzp-${skin}`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'br8t Pass');
  el.dataset.reason = reason;
  let note = '', busy = false;
  const c = COPY[reason] || COPY.mission;

  async function render() {
    const inUser = await A.signedIn();
    let btns = '';
    if (!A.enforcing) btns = '<p class="kzp-soon">br8t Pass coming soon. Until then, everything is open.</p>';
    else if (A.pass) btns = '<p class="kzp-ok">Your br8t Pass is active. The Crown is satisfied.</p>';
    else if (!inUser) btns = `<div class="kzp-btns"><button type="button" data-p="signin">Sign in</button><button type="button" class="alt" data-p="back">${esc(backLabel)}</button></div>
      <p class="kzp-fine">Sign in with your br8t account to get the Pass, or to restore one you already have.</p>`;
    else {
      const offers = A.offers.length ? A.offers : [{ key: ACCESS.products[0], label: 'br8t Pass' }];
      btns = `<div class="kzp-btns">${offers.map((o, i) => `<button type="button" ${i ? 'class="alt2"' : ''} data-p="buy" data-k="${esc(o.key)}">Get the Pass <small>${esc(o.label)}</small></button>`).join('')}</div>
      <div class="kzp-btns"><button type="button" class="alt" data-p="restore">Restore</button><button type="button" class="alt" data-p="back">${esc(backLabel)}</button></div>`;
    }
    el.innerHTML = `<div class="kzp-crest">${CROWN}</div><small class="kzp-k">${esc(c.k)}</small><h4>${esc(c.h)}</h4><p>${esc(c.p)}</p>${btns}
      ${note ? `<p class="kzp-note" role="status">${esc(note)}</p>` : ''}`;
    el.dataset.state = A.tier + (inUser ? '-in' : '-out');
    if (!onBack) el.querySelectorAll('[data-p="back"]').forEach((b) => b.remove());
  }
  const say = (t) => { note = t; render(); };
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b || busy) return;
    e.stopPropagation(); e.preventDefault();
    const act = b.dataset.p;
    if (act === 'back') { onBack?.(); return; }
    if (act === 'signin') { if (!openAccountPanel()) say('Use the account button (top right) to sign in.'); return; }
    busy = true; b.setAttribute('aria-busy', 'true');
    try {
      if (act === 'restore') { const has = await A.refresh(); say(has ? 'Pass restored. Welcome back, Your Grace.' : 'No Pass on this account yet.'); }
      else if (act === 'buy') { const url = await A.checkout(b.dataset.k); location.href = url; }
    } catch (err) { say(err.message || 'The Pass shop is shut just now.'); }
    busy = false;
  });
  const off = A.on(() => render());
  render();
  return { el, update: render, destroy() { off(); el.remove(); } };
}

// Story picker hook (one `// ACCESS` line in js/story/picker.js): locks Pass rows and opens the card inline.
export function decoratePicker(root) {
  if (!root) return;
  ensurePassCss();
  const A = access();
  let card = null, cardFor = null;
  const rows = () => [...root.querySelectorAll('.krz-st-picklist button[data-id]')];
  function closeCard() { card?.destroy(); card = null; cardFor = null; }
  function openCard(id) {
    closeCard();
    const row = root.querySelector(`.krz-st-picklist button[data-id="${id}"]`);
    if (!row) return;
    cardFor = id;
    card = passCard({ reason: 'mission', skin: 'paper', onBack: closeCard });
    card.el.classList.add('kzp-inpick');
    row.after(card.el);
    requestAnimationFrame(() => card?.el.scrollIntoView?.({ block: card.el.offsetHeight < root.clientHeight * 0.8 ? 'end' : 'start', behavior: 'smooth' }));
  }
  function paint() {
    for (const b of rows()) {
      const id = +b.dataset.id;
      const locked = missionNeedsPass(id) && !A.missionOpen(id);
      b.toggleAttribute('data-pass', missionNeedsPass(id) && A.enforcing);
      b.toggleAttribute('data-pass-locked', locked);
      let tag = b.querySelector('.kzp-tag');
      if (missionNeedsPass(id) && A.enforcing) {
        if (!tag) { tag = document.createElement('span'); tag.className = 'kzp-tag'; b.querySelector('span')?.append(tag); }
        tag.innerHTML = `${CROWN}${A.pass ? 'br8t Pass' : 'br8t Pass needed'}`;
      } else tag?.remove();
    }
    if (cardFor && A.missionOpen(cardFor)) closeCard();
  }
  // Capture phase: a locked row opens the card instead of starting the mission (the picker's own handler never sees it).
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.krz-st-picklist button[data-id]');
    if (!b || !b.hasAttribute('data-pass-locked')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (b.disabled) return;
    if (cardFor === +b.dataset.id) closeCard(); else openCard(+b.dataset.id);
  }, true);
  const off = A.on(paint);
  const gone = new MutationObserver(() => { if (!root.isConnected) { off(); gone.disconnect(); closeCard(); } });
  if (root.parentNode) gone.observe(root.parentNode, { childList: true });
  A.probe().then(paint);
  paint();
  const f = A.takeFocus();
  if (f && !A.missionOpen(f)) openCard(f);
}
