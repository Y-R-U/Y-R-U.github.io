import { h, sleep, pressable } from './util.js';
import * as I from './icons.js';

// Padlock-on-button helpers shared by the title and chapter screens.
export function lockBadge() {
  return h('span.lock-badge', { html: I.lock() });
}

export async function playUnlock(btn, emit) {
  const badge = btn.querySelector('.lock-badge');
  if (!badge) { btn.classList.remove('is-locked'); return; }
  btn.classList.add('unlocking');
  emit('sfx', 'rattle');
  badge.classList.add('wiggle');
  await sleep(750);
  badge.classList.remove('wiggle');
  badge.classList.add('pop');
  emit('sfx', 'unlock');
  await sleep(260);
  badge.classList.add('fly');
  btn.classList.remove('is-locked');
  sparkleBurst(btn);
  emit('sfx', 'whoosh');
  setTimeout(() => emit('sfx', 'sparkle'), 120);
  await sleep(520);
  badge.remove();
  btn.classList.remove('unlocking');
  btn.classList.add('just-unlocked');
  setTimeout(() => btn.classList.remove('just-unlocked'), 900);
}

export function sparkleBurst(el, n = 9) {
  const r = el.getBoundingClientRect();
  const host = el.closest('.ui-screen') || document.body;
  const hr = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 50 + Math.random() * 60;
    const s = h('span.sparkle', { html: I.sparkle() });
    s.style.left = (r.left - hr.left + r.width / 2) + 'px';
    s.style.top = (r.top - hr.top + r.height / 2) + 'px';
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d * 0.7 + 'px');
    s.style.setProperty('--sc', (0.6 + Math.random() * 0.8).toFixed(2));
    s.style.animationDelay = (Math.random() * 120) + 'ms';
    host.append(s);
    setTimeout(() => s.remove(), 1300);
  }
}

async function typeIn(el, text, ms = 70) {
  el.textContent = '';
  el.classList.add('typing');
  for (const ch of text) { el.textContent += ch; await sleep(ms); }
  el.classList.remove('typing');
}

export function logo() {
  return h('div.logo', {},
    h('div.logo-top', {},
      h('span.logo-cat', { html: I.peekCat() }),
      h('span.logo-word', { 'data-text': 'Garfield' }, 'Garfield'), h('span.logo-colon', {}, ':')),
    h('div.logo-bottom', { 'data-text': 'Hungry Heist' }, 'Hungry Heist'),
    h('span.logo-fork', { html: I.fork() }),
  );
}

export function createTitle(ui) {
  const chapRow = h('div.chap-row');
  const el = h('section.ui-screen.scr-title', {},
    h('div.menu-bg'),
    h('div.title-topbar', {},
      pressable(h('button.round-btn.btn-settings', { 'aria-label': 'Settings', html: I.gear() }), () => { ui.emit('sfx', 'click'); ui.settings.open(); }),
      pressable(h('button.round-btn.btn-fs', { 'aria-label': 'Fullscreen', html: I.fullscreen() }), () => { ui.emit('sfx', 'click'); ui.fullscreen.toggle(); }),
    ),
    h('div.title-center', {}, logo(), chapRow),
    h('div.footer-note', {}, 'Fan-made, non-commercial. Garfield © Paws, Inc. — not affiliated.'),
  );
  let token = 0;

  // chapters: [{id, title, subtitle, locked, justUnlocked, fromTitle?, kind?}] — fromTitle: the label shown while locked
  // (e.g. 'Coming Soon' that unlocks into 'Chapter Two'). soon:false hides the trailing locked 'Coming Soon'.
  async function show({ chapters = [{ id: 1, title: 'Chapter One', subtitle: 'Food', locked: false }], see3D = false, soon: showSoon = true } = {}) {
    const my = ++token;
    el.classList.toggle('see3d', !!see3D);
    chapRow.innerHTML = '';
    chapRow.classList.toggle('many', chapters.length + (showSoon ? 1 : 0) > 2);
    const anims = [];
    for (const c of chapters) {
      const sub = h('span.chap-sub');
      const ttl = h('span.chap-title', {}, c.title || `Chapter ${c.id}`);
      const btn = h('button.big-btn.chap-btn', { 'data-chapter': c.id }, ttl, sub);
      if (c.kind) btn.classList.add('kind-' + c.kind);
      const fullSub = c.subtitle ? ': ' + c.subtitle : '';
      if (c.locked || c.justUnlocked) {
        btn.classList.add('is-locked'); btn.append(lockBadge());
        if (c.fromTitle) ttl.textContent = c.fromTitle;
      } else sub.textContent = fullSub;
      pressable(btn, () => {
        if (btn.classList.contains('is-locked')) { btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); ui.emit('sfx', 'boing'); return; }
        ui.emit('sfx', 'click'); ui.emit('chapter', c.id);
      });
      chapRow.append(btn);
      if (c.justUnlocked) anims.push({ btn, sub, ttl, fullSub, title: c.title });
    }
    const soon = h('button.big-btn.chap-btn.soon-btn.is-locked', { 'aria-disabled': 'true' },
      h('span.chap-title', {}, 'Coming Soon'), lockBadge());
    pressable(soon, null);
    soon.addEventListener('click', () => { soon.classList.remove('nope'); void soon.offsetWidth; soon.classList.add('nope'); ui.emit('sfx', 'boing'); });

    if (!anims.length) { if (showSoon) chapRow.append(soon); return; }
    await sleep(600);
    for (const a of anims) {
      if (my !== token) return;
      await playUnlock(a.btn, ui.emit);
      if (a.ttl.textContent !== a.title && a.title) await typeIn(a.ttl, a.title, 60);
      a.btn.classList.add('grow');
      await typeIn(a.sub, a.fullSub, 85);
      a.btn.classList.remove('grow');
    }
    await sleep(350);
    if (my !== token) return;
    if (showSoon) {
      soon.classList.add('pop-in');
      chapRow.append(soon);
      ui.emit('sfx', 'pop');
    }
    ui.emit('menuUnlockDone');
  }
  return { el, show };
}

export function createChapter(ui) {
  const grid = h('div.level-grid');
  const side = h('div.level-side');
  const title = h('h2.chapter-heading', {}, 'Chapter One: ', h('span', {}, 'Food'));
  const el = h('section.ui-screen.scr-chapter', {},
    h('div.menu-bg'),
    h('div.chapter-top', {},
      pressable(h('button.round-btn.btn-back', { 'aria-label': 'Back', html: I.back() }), () => { ui.emit('sfx', 'click'); ui.emit('back'); }),
      title,
      h('div.chapter-top-right', {},
        pressable(h('button.round-btn', { 'aria-label': 'Settings', html: I.gear() }), () => { ui.emit('sfx', 'click'); ui.settings.open(); }),
        pressable(h('button.round-btn', { 'aria-label': 'Fullscreen', html: I.fullscreen() }), () => { ui.emit('sfx', 'click'); ui.fullscreen.toggle(); }),
      ),
    ),
    h('div.chapter-body', {}, grid, side),
  );
  let token = 0;
  const FOOD = { 1: 'steak', 2: 'steak', 7: 'steak', 3: 'lasagna', 5: 'lasagna', 6: 'lasagna', 10: 'lasagna', 4: 'meatloaf', 8: 'meatloaf', 9: 'meatloaf' };

  // side: {label, lockedLabel?, locked, justUnlocked, onPick} — the button right of the grid (Coming Soon / Free Play).
  // story: {onPick} adds a small '▶ Story' button (Chapter Two). icon per level: L.icon (an icons.js name) or food.
  async function show({ levels, onPick, title: t, see3D = false, side: sideDef = null, story = null } = {}) {
    const my = ++token;
    el.classList.toggle('see3d', !!see3D);
    if (t) { const [a, b] = t.split(': '); title.innerHTML = ''; title.append(a + (b ? ': ' : ''), ...(b ? [h('span', {}, b)] : [])); }
    levels = levels || Array.from({ length: 10 }, (_, i) => ({ n: i + 1, locked: i > 0 }));
    grid.innerHTML = ''; side.innerHTML = '';
    const anims = [];
    for (const L of levels) {
      const food = L.food || FOOD[L.n] || 'steak';
      const icon = L.icon && I[L.icon] ? I[L.icon]() : I.food(food);
      const btn = h('button.level-btn', { 'data-level': L.n, 'data-food': L.icon || food },
        h('span.level-num', {}, String(L.n)),
        h('span.level-food', { html: icon }),
      );
      if (L.done) btn.append(h('span.done-stamp', { html: I.paw('#e8711a') + I.check() }));
      if (L.locked || L.justUnlocked) { btn.classList.add('is-locked'); btn.append(lockBadge()); }
      pressable(btn, () => { ui.emit('sfx', 'click'); onPick?.(L.n); ui.emit('level', L.n); });
      btn.addEventListener('click', () => {
        if (!btn.classList.contains('is-locked')) return;
        btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); ui.emit('sfx', 'boing');
      });
      btn.style.animationDelay = (L.n * 35) + 'ms';
      grid.append(btn);
      if (L.justUnlocked) anims.push({ btn });
    }
    const sd = sideDef || { label: 'Coming Soon', locked: true };
    const label = (txt) => { const [a, ...b] = String(txt).split(' '); return b.length ? [a, h('br'), b.join(' ')] : [a]; };
    const sideText = h('span.soon-text', {}, ...label(sd.locked || sd.justUnlocked ? (sd.lockedLabel || sd.label) : sd.label));
    const soon = h('button.level-btn.soon-btn', {}, sideText);
    if (!sd.locked && !sd.justUnlocked) soon.classList.add('free-btn');
    if (sd.locked || sd.justUnlocked) { soon.classList.add('is-locked'); soon.append(lockBadge()); }
    soon.addEventListener('click', () => {
      if (soon.classList.contains('is-locked')) { soon.classList.remove('nope'); void soon.offsetWidth; soon.classList.add('nope'); ui.emit('sfx', 'boing'); return; }
      ui.emit('sfx', 'click'); sd.onPick?.();
    });
    side.append(soon);
    if (story) {
      const sb = h('button.round-btn.story-btn', { 'aria-label': 'Replay the story', html: I.play() + '<span>Story</span>' });
      pressable(sb, () => { ui.emit('sfx', 'click'); story.onPick?.(); });
      side.append(sb);
    }
    if (sd.justUnlocked) anims.push({ btn: soon, side: true });
    if (!anims.length) return;
    await sleep(650);
    for (const a of anims) {
      if (my !== token) return;
      await playUnlock(a.btn, ui.emit);
      if (a.side) {
        a.btn.classList.add('free-btn');
        if ((sd.lockedLabel || sd.label) !== sd.label) { sideText.innerHTML = ''; sideText.append(...label(sd.label)); }
      }
    }
  }
  return { el, show };
}
