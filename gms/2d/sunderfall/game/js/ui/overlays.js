/* SUNDERFALL UI — the DOM half: pause, settings, loadout, spell choice, level-up, death.
 *
 * DOM rather than canvas for everything here, deliberately: it gets real text layout, wrapping,
 * scrolling, focus order and keyboard/screen-reader behaviour for free, none of which is worth
 * rebuilding on a 2D context. The canvas keeps the things DOM is bad at — the cast circles,
 * damage numbers and world-anchored bubbles.
 */

import { SCHOOL, schoolOf } from './theme.js';
import { blitIcon } from './circles.js';

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => (
  m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&quot;'));

/** `?diag` forces the corner readout on without touching the saved settings. */
const DIAG_Q = typeof location !== 'undefined' && new URLSearchParams(location.search).has('diag');

const mmss = (s) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ':' + (r < 10 ? '0' : '') + r;
};

export function createOverlays(ctx, L, st, api) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const root = el('div');
  root.id = 'sf-ui';

  /* ---- pause button ---- */
  const pauseBtn = el('button', 'sf-pausebtn');
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.appendChild(el('i'));
  pauseBtn.addEventListener('click', () => api.togglePause());
  root.appendChild(pauseBtn);

  const fps = el('div', 'sf-fps');
  fps.hidden = true;
  root.appendChild(fps);

  /* ================= level up ================= */

  const levelup = el('div', 'sf-levelup');
  levelup.hidden = true;
  root.appendChild(levelup);
  let lvTimer = 0;

  function showLevelUp(level, unlock) {
    levelup.className = 'sf-levelup';
    levelup.hidden = false;
    levelup.innerHTML =
      '<div class="word">Level ' + esc(level) + '</div>' +
      '<div class="bar"></div>' +
      '<div class="say">' + esc(pickLine(level)) + '</div>' +
      (unlock ? '<div class="unlock">' + esc(unlock) + '</div>' : '');
    clearTimeout(lvTimer);
    lvTimer = setTimeout(() => {
      levelup.classList.add('out');
      setTimeout(() => { levelup.hidden = true; }, 500);
    }, unlock ? 2600 : 1900);
  }

  // Vayne's voice, in the player's head. Short, unimpressed.
  const LINES = [
    'the stone takes hold', 'it fits you better than it should', 'you are still not ready',
    'more of it than there was', 'the wood noticed', 'hold on to it this time',
    'grow up. quickly.', 'that will do. barely.',
  ];
  const pickLine = (n) => LINES[(n * 3) % LINES.length];

  /* ================= spell choice ================= */

  const choice = el('div', 'sf-modal sf-choice');
  choice.hidden = true;
  choice.innerHTML =
    '<div class="sf-panel">' +
    '<div class="sf-choice-head"><h2 class="sf-title">The stone offers</h2>' +
    '<p class="sf-sub">Take one. It does not ask twice.</p></div>' +
    '<div class="sf-cards"></div></div>';
  root.appendChild(choice);
  const cardsWrap = choice.querySelector('.sf-cards');
  let choiceResolve = null;
  /**
   * A modal that appears *while the player is mid-fight and tapping* takes the
   * tap that was already on its way to a cast circle. Every such panel is inert
   * for ARM_MS after it opens; the CSS fade-in covers the wait.
   */
  const ARM_MS = 900;
  let choiceArmed = 0;

  function card(spell, i, known) {
    const sc = schoolOf(spell.school);
    const rankUp = known && known.rank ? known.rank : 0;
    const n = el('button', 'sf-card');
    n.style.setProperty('--sc', sc.css);
    n.setAttribute('aria-label', spell.name);
    // spells/registry.js ships `rankText[0..4]`; the fallback table ships `ranks{3,5}`
    const rt = spell.rankText;
    const ranks = rt && rt.length >= 5 ? { 3: rt[2], 5: rt[4] } : (spell.ranks || {});
    n.innerHTML =
      '<span class="key">' + (i + 1) + '</span>' +
      '<div class="school">' + esc(SCHOOL[spell.school] ? SCHOOL[spell.school].name : '—') + '</div>' +
      '<div class="orb"><canvas width="' + (76 * dpr) + '" height="' + (76 * dpr) + '"></canvas></div>' +
      '<h3>' + esc(spell.name) + '</h3>' +
      '<div class="kick">' + (rankUp ? 'Rank ' + rankUp + ' → ' + (rankUp + 1) : 'New spell') + '</div>' +
      '<p>' + esc(spell.desc || '') + '</p>' +
      '<div class="chips">' +
        '<span class="chip">Focus <b>' + (spell.cost || 0) + '</b></span>' +
        '<span class="chip">Cooldown <b>' + (spell.cooldown || 0) + 's</b></span>' +
        '<span class="chip">' + esc(spell.targeting || 'aim') + '</span>' +
      '</div>' +
      (ranks[3] || ranks[5]
        ? '<div class="ranks">' +
            (ranks[3] ? '<div><b>R3</b>' + esc(ranks[3]) + '</div>' : '') +
            (ranks[5] ? '<div><b>R5</b>' + esc(ranks[5]) + '</div>' : '') +
          '</div>'
        : '');
    const cv = n.querySelector('canvas');
    const c2 = cv.getContext('2d');
    c2.scale(dpr, dpr);
    blitIcon(c2, spell, 38, 38, 62, dpr, 1);
    n.addEventListener('click', () => pick(spell, n));
    return n;
  }

  function pick(spell, node) {
    if (!choiceResolve) return;
    if (performance.now() < choiceArmed) return;
    const r = choiceResolve; choiceResolve = null;
    for (const other of cardsWrap.children) other.classList.add(other === node ? 'taken' : 'dropped');
    setTimeout(() => { choice.hidden = true; cardsWrap.replaceChildren(); r(spell ? spell.id : null); }, 420);
  }

  /** Abandon an open offer — resolves the waiting promise so nothing hangs. */
  function cancelChoice() {
    choice.hidden = true;
    choice.classList.remove('arming');
    cardsWrap.replaceChildren();
    if (choiceResolve) { const r = choiceResolve; choiceResolve = null; r(null); }
  }

  function onChoiceKey(e) {
    if (choice.hidden || performance.now() < choiceArmed) return;
    const kids = cardsWrap.children;
    if (e.key >= '1' && e.key <= '3' && kids[+e.key - 1]) { kids[+e.key - 1].click(); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const cur = document.activeElement;
      let idx = Array.prototype.indexOf.call(kids, cur);
      idx = (idx + (e.key === 'ArrowRight' ? 1 : kids.length - 1) + kids.length) % kids.length;
      if (kids[idx]) kids[idx].focus();
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onChoiceKey);

  /**
   * offer([spellA, spellB, spellC]) -> Promise<spellId|null>
   * Each entry may carry `{known: {rank}}` so an already-learned spell shows as a rank-up.
   */
  function offer(list) {
    cardsWrap.replaceChildren();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      cardsWrap.appendChild(card(s, i, s.known || (st.ranks[s.id] ? { rank: st.ranks[s.id] } : null)));
    }
    choice.hidden = false;
    choiceArmed = performance.now() + ARM_MS;
    choice.classList.add('arming');
    setTimeout(() => choice.classList.remove('arming'), ARM_MS);
    setTimeout(() => { if (cardsWrap.firstChild) cardsWrap.firstChild.focus(); }, 40);
    return new Promise((res) => { choiceResolve = res; });
  }

  /* ================= pause / settings / loadout ================= */

  const pause = el('div', 'sf-modal sf-pause');
  pause.hidden = true;
  pause.innerHTML =
    '<div class="sf-panel">' +
      '<h2 class="sf-title">Paused</h2>' +
      '<p class="sf-sub" id="sf-pausesub">The wood waits</p>' +
      '<div class="sf-cols">' +
        '<div>' +
          '<div id="sf-pause-menu"></div>' +
          '<div class="sf-rule"></div>' +
          '<div id="sf-econ"></div>' +
          '<div class="sf-note" id="sf-econnote" hidden></div>' +
        '</div>' +
        '<div id="sf-pause-right"></div>' +
      '</div>' +
    '</div>';
  root.appendChild(pause);

  const menuWrap = pause.querySelector('#sf-pause-menu');
  const rightWrap = pause.querySelector('#sf-pause-right');
  const econWrap = pause.querySelector('#sf-econ');
  const econNote = pause.querySelector('#sf-econnote');
  let rightTab = 'loadout';

  function btn(label, hint, cls, fn) {
    const b = el('button', 'sf-btn' + (cls ? ' ' + cls : ''), esc(label) + (hint ? '<small>' + esc(hint) + '</small>' : ''));
    b.addEventListener('click', fn);
    return b;
  }

  function buildMenu() {
    menuWrap.replaceChildren(
      btn('Resume', 'Esc', '', () => api.togglePause()),
      btn('Loadout', '1–5', '', () => { rightTab = 'loadout'; buildRight(); }),
      btn('Settings', '', '', () => { rightTab = 'settings'; buildRight(); }),
      btn('Restart run', 'Ward keeps most of it', 'danger', () => api.restart()),
      btn('Start over', 'Nothing kept', 'danger', () => api.quit()),
    );
  }

  function buildEcon() {
    const drain = st.focusDrain;
    const net = st.focusRegen - drain;
    econWrap.replaceChildren();
    const row = (k, v, cls) => {
      const d = el('div', 'sf-stat' + (cls ? ' ' + cls : ''));
      d.appendChild(el('span', null, esc(k)));
      d.appendChild(el('span', null, esc(v)));
      econWrap.appendChild(d);
    };
    row('Focus regen', '+' + st.focusRegen.toFixed(0) + '/s', 'good');
    row('Auto-cast drain', '−' + drain.toFixed(1) + '/s', drain > 0 ? 'bad' : '');
    row('Net', (net >= 0 ? '+' : '−') + Math.abs(net).toFixed(1) + '/s', net < 0 ? 'bad' : 'good');
    row('Time', mmss(st.runTime));
    row('Kills / broken', st.kills + ' / ' + st.broken);
    if (net < 0) {
      econNote.hidden = false;
      econNote.textContent = 'Your circles are outspending you. Slot 1 will keep coming up empty until you drop an auto-cast or take something cheaper.';
    } else econNote.hidden = true;
  }

  /* ---- loadout / grimoire ---- */
  let selected = null;      // spell id chosen by tap on touch
  let dragGhost = null;
  let dragSpell = null;

  function tile(spell) {
    const t = el('button', 'sf-tile');
    const slotOf = st.slots.findIndex((s) => s.spellId === spell.id);
    if (slotOf >= 0) t.classList.add('equipped');
    if (selected === spell.id) t.classList.add('sel');
    t.innerHTML = '<canvas width="' + (30 * dpr) + '" height="' + (30 * dpr) + '"></canvas>' +
      '<span><b>' + esc(spell.name) + '</b><em>' + esc((SCHOOL[spell.school] || { name: '' }).name) +
      ' · r' + (st.ranks[spell.id] || 1) + (slotOf >= 0 ? ' · in ' + (slotOf + 1) : '') + '</em></span>';
    const c2 = t.querySelector('canvas').getContext('2d');
    c2.scale(dpr, dpr);
    blitIcon(c2, spell, 15, 15, 26, dpr, 1);
    t.addEventListener('pointerdown', (e) => startDrag(e, spell, t));
    return t;
  }

  function buildRight() {
    rightWrap.replaceChildren();
    if (rightTab === 'settings') {
      rightWrap.appendChild(el('div', 'sf-hintline', 'Settings'));
      const S = api.settings;
      rightWrap.appendChild(slider('Master', 'master', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
      rightWrap.appendChild(slider('Music', 'music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
      rightWrap.appendChild(slider('Effects', 'sfx', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
      rightWrap.appendChild(slider('Screen shake', 'shake', 0, 1.5, 0.05, (v) => Math.round(v * 100) + '%'));
      rightWrap.appendChild(toggle('Damage numbers', 'damageNumbers'));
      rightWrap.appendChild(toggle('Screen flashes', 'flashes'));
      rightWrap.appendChild(toggle('Left-handed', 'leftHanded'));
      rightWrap.appendChild(toggle('Show FPS', 'showFps'));
      void S;
    } else {
      rightWrap.appendChild(el('div', 'sf-hintline',
        ctx.input && ctx.input.touchActive ? 'Tap a spell, then tap a circle' : 'Drag a spell onto a circle'));
      const grim = el('div', 'sf-grim');
      const known = api.knownSpells();
      if (!known.length) grim.appendChild(el('div', 'sf-hintline', 'Nothing learned yet.'));
      for (const s of known) grim.appendChild(tile(s));
      rightWrap.appendChild(grim);
      const slots = el('div', 'sf-hintline', 'Circles');
      rightWrap.appendChild(slots);
      const list = el('div');
      for (let i = 0; i < 5; i++) {
        const sl = st.slots[i];
        const locked = st.level < sl.unlockLevel;
        const name = locked ? 'Locked — level ' + sl.unlockLevel
          : sl.spell ? sl.spell.name + '  (rank ' + sl.rank + ')' : 'Empty';
        const b = btn((i + 1) + (i === 0 ? '  Manual' : '  Auto'), name, locked ? 'danger' : '', () => {
          if (locked) return;
          if (selected) { api.assign(i, selected); selected = null; buildRight(); }
          else if (sl.spellId) { api.assign(i, null); buildRight(); }
        });
        list.appendChild(b);
      }
      rightWrap.appendChild(list);
    }
  }

  function slider(label, key, min, max, step, fmt) {
    const row = el('div', 'sf-set');
    row.appendChild(el('label', null, esc(label)));
    const inp = el('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    inp.value = api.settings[key];
    const val = el('span', 'val', fmt(api.settings[key]));
    const paint = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%');
    paint();
    inp.addEventListener('input', () => {
      api.setSetting(key, +inp.value);
      val.textContent = fmt(+inp.value);
      paint();
    });
    row.appendChild(inp);
    row.appendChild(val);
    return row;
  }

  function toggle(label, key) {
    const row = el('div', 'sf-set');
    row.appendChild(el('label', null, esc(label)));
    const b = el('button', 'sf-toggle');
    b.setAttribute('aria-pressed', String(!!api.settings[key]));
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      const v = !api.settings[key];
      api.setSetting(key, v);
      b.setAttribute('aria-pressed', String(v));
    });
    row.appendChild(b);
    return row;
  }

  /* ---- drag to assign ---- */

  function startDrag(e, spell, tileEl) {
    e.preventDefault();
    dragSpell = spell;
    selected = spell.id;
    for (const n of tileEl.parentNode.children) n.classList.toggle('sel', n === tileEl);
    api.setAssignMode(spell.id);

    dragGhost = el('div', 'sf-drag');
    const cv = el('canvas');
    cv.width = cv.height = 40 * dpr;
    cv.style.width = cv.style.height = '40px';
    const c2 = cv.getContext('2d');
    c2.scale(dpr, dpr);
    blitIcon(c2, spell, 20, 20, 34, dpr, 1);
    dragGhost.appendChild(cv);
    document.body.appendChild(dragGhost);
    moveGhost(e.clientX, e.clientY);

    const mv = (ev) => moveGhost(ev.clientX, ev.clientY);
    const up = (ev) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (dragGhost) { dragGhost.remove(); dragGhost = null; }
      const r = (ctx.R && ctx.R.canvas ? ctx.R.canvas : document.body).getBoundingClientRect();
      const i = L.circleAt(ev.clientX - r.left, ev.clientY - r.top);
      // A tap that never moved leaves the spell "picked up" so touch users can tap a circle next.
      const moved = Math.abs(ev.clientX - e.clientX) > 8 || Math.abs(ev.clientY - e.clientY) > 8;
      if (i >= 0) { api.assign(i, dragSpell.id); selected = null; api.setAssignMode(null); buildRight(); }
      else if (moved) { selected = null; api.setAssignMode(null); buildRight(); }
      dragSpell = null;
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  function moveGhost(x, y) {
    if (!dragGhost) return;
    dragGhost.style.left = x + 'px';
    dragGhost.style.top = y + 'px';
  }

  /* While the loadout is open the scrim must forward taps to the cast circles underneath. */
  pause.addEventListener('pointerup', (e) => {
    if (!selected || e.target !== pause) return;
    const r = (ctx.R && ctx.R.canvas ? ctx.R.canvas : document.body).getBoundingClientRect();
    const i = L.circleAt(e.clientX - r.left, e.clientY - r.top);
    if (i >= 0) { api.assign(i, selected); selected = null; api.setAssignMode(null); buildRight(); }
  });

  /* ================= death ================= */

  const death = el('div', 'sf-modal sf-death');
  death.hidden = true;
  root.appendChild(death);

  function showDeath(s) {
    // Dying with the offer open used to leave it stacked underneath the death
    // screen: still unresolved, still full-screen, still eating every touch —
    // so the restarted run began under an invisible-to-the-player modal.
    cancelChoice();
    death.innerHTML =
      '<div class="sf-panel">' +
        '<h2 class="sf-title">You fell</h2>' +
        '<p class="quote">“The wood keeps what it takes.”</p>' +
        '<div class="grid">' +
          '<div><b>' + s.level + '</b><span>Level</span></div>' +
          '<div><b>' + mmss(s.runTime) + '</b><span>Survived</span></div>' +
          '<div><b>' + s.kills + '</b><span>Slain</span></div>' +
          '<div><b>' + s.broken + '</b><span>Broken</span></div>' +
        '</div>' +
        '<p class="sf-sub">Vayne bound a ward to your life. It replays the day and gives back what it ' +
          'can — every spell at the rank you took it to, and all but a third of what you had become. ' +
          'Never below level 3.</p>' +
        '<div class="row"></div>' +
      '</div>';
    const row = death.querySelector('.row');
    const armed = performance.now() + ARM_MS;
    const guard = (fn) => () => { if (performance.now() < armed) return; death.hidden = true; fn(); };
    // These two did visibly identical things for a long time — one soft-reset,
    // one reloaded the page — so say what each one costs, on the button.
    row.appendChild(btn('Again', 'Ward keeps most of it', '', guard(() => api.restart())));
    row.appendChild(btn('Start over', 'Nothing kept', 'danger', guard(() => api.quit())));
    death.hidden = false;
    death.classList.add('arming');
    setTimeout(() => death.classList.remove('arming'), ARM_MS);
    setTimeout(() => { const b = row.querySelector('button'); if (b) b.focus(); }, 60);
  }

  /* ================= victory ================= */

  /* Not a death screen with green text.
   *
   * The death screen is a slab: full scrim, blur, a blood-red title centred in
   * the void, and the frame behind it is irrelevant because the frame behind it
   * is where you died. This one is the opposite posture. The arena has just come
   * down — it is the best the game ever looks — so the panel sits low, the scrim
   * is a vignette rather than a curtain, there is no blur, and the last frame is
   * the thing you are looking at. `ui.blocked` stops the sim for us, so it really
   * is held, not paused-looking.
   *
   * The stylesheet is `ui/ui.css`, which this agent does not own (ACT-TWO-CONTRACT
   * §2), so the handful of rules that differ from `.sf-death` are injected here.
   * Fold them into ui.css whenever that file is next opened by its owner.
   */
  const VICTORY_CSS = `
#sf-ui .sf-victory {
  background: radial-gradient(130% 110% at 50% 25%, rgba(6,6,12,0) 0%, rgba(4,4,9,.55) 55%, rgba(2,2,5,.88) 100%);
  backdrop-filter: none; -webkit-backdrop-filter: none;
  place-items: end center;
}
#sf-ui .sf-victory .sf-panel {
  width: min(620px, 100%); text-align: center;
  background: linear-gradient(180deg, rgba(11,10,18,.82), rgba(4,4,9,.95));
  box-shadow: 0 0 0 1px rgba(183,138,74,.30), 0 -18px 60px rgba(0,0,0,.6);
}
#sf-ui .sf-victory .sf-title {
  color: var(--goldL); text-shadow: 0 0 46px rgba(255,194,77,.35);
  font-size: clamp(26px, 6vw, 46px);
}
#sf-ui .sf-victory .quote {
  font-family: var(--dsp); font-style: italic; font-size: 15px; color: var(--bone);
  margin: 6px 0 16px; opacity: .92;
}
#sf-ui .sf-victory .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
#sf-ui .sf-victory .grid div { padding: 9px 4px; background: rgba(255,255,255,.03); box-shadow: inset 0 0 0 1px rgba(255,255,255,.05); }
#sf-ui .sf-victory .grid b { display: block; font-family: var(--dsp); font-size: 21px; color: var(--goldL); }
#sf-ui .sf-victory .grid span { font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
#sf-ui .sf-victory .row { display: flex; gap: 10px; }
#sf-ui .sf-victory .row .sf-btn { justify-content: center; text-align: center; flex: 1; }
#sf-ui .sf-victory .row .sf-btn::before { display: none; }
@media (max-width: 560px) {
  #sf-ui .sf-victory .grid { grid-template-columns: repeat(4, 1fr); gap: 6px; }
  #sf-ui .sf-victory .grid b { font-size: 17px; }
  #sf-ui .sf-victory .sf-sub { font-size: 12px; }
}
`;
  if (!document.getElementById('sf-victory-css')) {
    const s = el('style');
    s.id = 'sf-victory-css';
    s.textContent = VICTORY_CSS;
    document.head.appendChild(s);
  }

  const victory = el('div', 'sf-modal sf-victory');
  victory.hidden = true;
  root.appendChild(victory);

  /**
   * showVictory(stats, { onStay })
   *
   * Two buttons and no third. `ui:restart` / `ui:quit` are the only two exits
   * main.js listens for, and a "Continue" that emitted a third name would sit
   * there doing nothing for months exactly like those two did — so **Again** is
   * `api.quit()` (the existing total wipe, save included) and **Stay** is purely
   * local: hide the panel, hand the controls back, walk around the wreckage.
   */
  function showVictory(s, opts) {
    cancelChoice();
    death.hidden = true;
    victory.innerHTML =
      '<div class="sf-panel">' +
        '<h2 class="sf-title">The seam is closed</h2>' +
        '<p class="quote">“Keep the fire lit,” he said, and left.</p>' +
        '<div class="grid">' +
          '<div><b>' + s.level + '</b><span>Level</span></div>' +
          '<div><b>' + mmss(s.runTime) + '</b><span>Took</span></div>' +
          '<div><b>' + s.kills + '</b><span>Slain</span></div>' +
          '<div><b>' + s.broken + '</b><span>Broken</span></div>' +
        '</div>' +
        '<p class="sf-sub">You put it out the way Vayne did — by spending what you had. You are still ' +
          'standing because the old man had already paid for it. The elders came when it was over ' +
          'and had nothing to say.</p>' +
        '<div class="row"></div>' +
      '</div>';
    const row = victory.querySelector('.row');
    // longer than the death screen's: the boy just killed it, the thumb is still
    // hammering the cast circle, and one of these buttons throws the run away
    const armed = performance.now() + ARM_MS * 1.6;
    const guard = (fn) => () => { if (performance.now() < armed) return; victory.hidden = true; fn(); };
    row.appendChild(btn('Again', 'A clean run — nothing kept', 'danger', guard(() => api.quit())));
    const stay = btn('Stay', 'Walk the wreckage', '', guard(() => { if (opts && opts.onStay) opts.onStay(); }));
    row.appendChild(stay);
    victory.hidden = false;
    victory.classList.add('arming');
    setTimeout(() => victory.classList.remove('arming'), ARM_MS * 1.6);
    // focus the one that cannot destroy anything — Enter must never wipe a save
    setTimeout(() => stay.focus(), 60);
  }

  /* ================= public ================= */

  const o = {
    root,
    get modal() { return !pause.hidden || !choice.hidden || !death.hidden || !victory.hidden; },
    get blocking() { return !pause.hidden || !choice.hidden || !death.hidden || !victory.hidden; },
    get choiceOpen() { return !choice.hidden; },
    get pauseOpen() { return !pause.hidden; },

    openPause() {
      buildMenu(); buildEcon(); buildRight();
      pause.hidden = false;
      pauseBtn.hidden = true;
      setTimeout(() => { const b = menuWrap.querySelector('button'); if (b) b.focus(); }, 40);
    },
    closePause() {
      pause.hidden = true;
      pauseBtn.hidden = false;
      selected = null;
      api.setAssignMode(null);
    },
    openLoadout() { rightTab = 'loadout'; o.openPause(); },
    refreshPause() { if (!pause.hidden) { buildEcon(); buildRight(); } },
    offer,
    cancelChoice,
    showLevelUp,
    showDeath,
    hideDeath() { death.hidden = true; },
    showVictory,
    hideVictory() { victory.hidden = true; },
    get victoryOpen() { return !victory.hidden; },
    setFps(v) {
      // `?diag` forces it on without touching the saved setting
      fps.hidden = !api.settings.showFps && !DIAG_Q;
      if (!fps.hidden) fps.textContent = v;
    },
    setPauseBtnVisible(v) { pauseBtn.hidden = !v; },
    destroy() {
      window.removeEventListener('keydown', onChoiceKey);
      root.remove();
    },
  };
  return o;
}
